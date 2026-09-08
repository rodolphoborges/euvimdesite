// Gera data/videos.json + v/*.html + sitemap.xml + feed.xml a partir do RSS do
// YouTube + backfill incremental do acervo via Data API. Zero deps.
// O RSS só traz os ~15 mais recentes; o backfill percorre a playlist de uploads
// (50 itens/página) poucas páginas por execução, persistindo o pageToken em
// data/backfill.json — o acervo cresce pouco a pouco até cobrir o canal inteiro.
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';

const CHANNEL_ID = 'UC2yJDeDFcv1cAHA0BgfJ9ww';
const CHANNEL_URL = 'https://www.youtube.com/@EuVimdeSantos';
const SITE = process.env.SITE_URL || 'https://rodolphoborges.github.io/euvimdesite';
const RSS = `https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`;
const UPLOADS_PLAYLIST = 'UU' + CHANNEL_ID.slice(2);
const BACKFILL_STATE = 'data/backfill.json';
// Páginas de 50 itens por execução (1 unidade de cota cada). 3 execuções/dia
// indexam até ~1500 vídeos/dia; zera com BACKFILL_PAGES=0 (ex.: deploy).
const BACKFILL_PAGES = Math.max(0, parseInt(process.env.BACKFILL_PAGES || '10', 10) || 0);

function catOf(title, url) {
  const t = title.toLowerCase();
  if (url.includes('/shorts/')) return 'shorts';
  if (/eu vim de entrevista/.test(t)) return 'entrevistas';
  if (/live do trio|ao vivo|corredor de fogo|^live\b|live:/.test(t)) return 'lives';
  if (/an[áa]lise|t[áa]tica|posicionamento|scout|estreia de/.test(t)) return 'taticas';
  if (/contrata|mercado|sonhou|renovar|apresentado|quer ponta|quase perdeu|not[íi]cia/.test(t)) return 'noticias';
  if (/react|coment[áa]rio|sufoco|pior do que/.test(t)) return 'comentarios';
  return 'comentarios';
}
function pick(feed, tag) {
  const m = feed.match(new RegExp(`<${tag}>([\\s\\S]*?)<\/${tag}>`));
  return m ? m[1].trim() : '';
}
function unesc(s){ return s.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'"); }
function escH(s){ return String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
const YT_KEY = process.env.YT_API_KEY || '';
function fmtCompact(n){ try { return new Intl.NumberFormat('pt-BR',{notation:'compact',maximumFractionDigits:1}).format(Number(n)); } catch { return String(n); } }
function fmtDur(iso){
  const m = String(iso||'').match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if(!m || (!m[1] && !m[2] && !m[3])) return '';
  const p = n => String(n).padStart(2,'0');
  const h = +m[1]||0, mi = +m[2]||0, s = +m[3]||0;
  return h ? `${h}:${p(mi)}:${p(s)}` : `${mi}:${p(s)}`;
}
// Enriquece views/likes/comments/duração via YouTube Data API (build-time, chave no Secrets).
// Sem chave, mantém só views do RSS — nunca quebra o build.
async function enrich(videos){
  if(!YT_KEY) return false;
  try {
    const ids = videos.map(v=>v.id);
    for(let i=0;i<ids.length;i+=50){
      const u = `https://www.googleapis.com/youtube/v3/videos?part=statistics,contentDetails&id=${ids.slice(i,i+50).join(',')}&key=${YT_KEY}`;
      const r = await fetch(u);
      if(!r.ok) throw new Error('yt api ' + r.status);
      const j = await r.json();
      const byId = new Map((j.items||[]).map(it=>[it.id,it]));
      for(const v of videos){
        const it = byId.get(v.id); if(!it) continue;
        const st = it.statistics || {};
        if(st.viewCount) v.views = st.viewCount;
        if(st.likeCount) v.likes = st.likeCount;
        if(st.commentCount) v.comments = st.commentCount;
        const d = fmtDur(it.contentDetails && it.contentDetails.duration);
        if(d) v.duration = d;
      }
    }
    return true;
  } catch(e){ console.log('enrich skip:', e.message); return false; }
}
function loadBackfillState(){
  try {
    const s = JSON.parse(readFileSync(BACKFILL_STATE,'utf8'));
    if (s && typeof s === 'object') return { nextPageToken: s.nextPageToken || null, done: !!s.done, indexed: s.indexed || 0 };
  } catch {}
  return { nextPageToken: null, done: false, indexed: 0 };
}
// Varre a playlist de uploads rumo ao passado. Quando concluído, confere só a
// cabeça (1 página) para captar vídeos novos. Sem chave ou com BACKFILL_PAGES=0, pula.
async function backfill(){
  const state = loadBackfillState();
  if(!YT_KEY || BACKFILL_PAGES<=0) return { items: [], state, ran: false };
  const pages = state.done ? 1 : BACKFILL_PAGES;
  const items = [];
  let token = state.done ? null : state.nextPageToken;
  try {
    for(let p=0;p<pages;p++){
      const u = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&maxResults=50&playlistId=${UPLOADS_PLAYLIST}${token?`&pageToken=${token}`:''}&key=${YT_KEY}`;
      const r = await fetch(u);
      if(!r.ok) throw new Error('playlist api ' + r.status);
      const j = await r.json();
      for(const it of (j.items||[])){
        const id = (it.contentDetails && it.contentDetails.videoId) || (it.snippet && it.snippet.resourceId && it.snippet.resourceId.videoId);
        if(!id) continue;
        const title = String((it.snippet && it.snippet.title) || '').slice(0,120);
        if(!title || title==='Deleted video' || title==='Private video') continue;
        const url = `https://www.youtube.com/watch?v=${id}`;
        const published = (it.snippet && it.snippet.publishedAt) || new Date().toISOString();
        const th = it.snippet && it.snippet.thumbnails;
        const best = th && (th.medium || th.high || th.default);
        const thumb = (best && best.url) || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
        const desc = String((it.snippet && it.snippet.description) || '').slice(0,500);
        items.push({ id, title, url, published, thumb, views: '', cat: catOf(title, url), desc });
      }
      token = j.nextPageToken || null;
      if(!token){ state.done = true; break; }
      if(state.done) break;
    }
  } catch(e){ console.log('backfill skip:', e.message); return { items, state, ran: items.length>0 }; }
  state.nextPageToken = state.done ? null : token;
  state.indexed += items.length;
  try { writeFileSync(BACKFILL_STATE, JSON.stringify({ nextPageToken: state.nextPageToken, done: state.done, indexed: state.indexed, updatedAt: new Date().toISOString() })); } catch {}
  return { items, state, ran: true };
}
function mergeInto(map, list){
  for(const v of list){
    const old = map.get(v.id);
    if(!old){ map.set(v.id, v); continue; }
    const merged = { ...old, ...v };
    if(!v.views) merged.views = old.views || '';
    if(!v.desc) merged.desc = old.desc || '';
    map.set(v.id, merged);
  }
}
function statsHtml(v){
  const items = [];
  if(v.views) items.push(`<div><b>${fmtCompact(v.views)}</b><span>visualizações</span></div>`);
  if(v.likes) items.push(`<div><b>${fmtCompact(v.likes)}</b><span>curtidas</span></div>`);
  if(v.comments) items.push(`<div><b>${fmtCompact(v.comments)}</b><span>comentários</span></div>`);
  if(v.duration) items.push(`<div><b>${v.duration}</b><span>duração</span></div>`);
  if(!items.length) return '';
  return `<div class="stats" data-dyn="stats">${items.join('')}</div>`;
}

const xml = await (await fetch(RSS, {headers:{'user-agent':'EVS-site/1.0'}})).text();
const entries = xml.split('<entry>').slice(1);
const fresh = entries.map(e => {
  const id = pick(e,'yt:videoId');
  const title = unesc(pick(e,'title').split('</title>')[0] || pick(e,'media:title'));
  const linkM = e.match(/<link[^>]*href="([^"]+)"/);
  const url = linkM ? linkM[1] : `https://www.youtube.com/watch?v=${id}`;
  const published = pick(e,'published') || new Date().toISOString();
  const thumbM = e.match(/<media:thumbnail[^>]*url="([^"]+)"/);
  const thumb = thumbM ? thumbM[1] : `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
  const descM = e.match(/<media:description>([\s\S]*?)<\/media:description>/);
  const desc = descM ? unesc(descM[1]).slice(0,500) : '';
  const viewM = e.match(/<media:statistics[^>]*views="([^"]+)"/);
  return { id, title: title.slice(0,120), url, published, thumb, views: viewM?.[1] || '', cat: catOf(title, url), desc };
}).filter(v => v.id);

let prev = { videos: [] };
try { prev = JSON.parse(readFileSync('data/videos.json','utf8')); } catch {}
if (!Array.isArray(prev.videos)) prev.videos = [];
const map = new Map(prev.videos.map(v=>[v.id,v]));
// 1) backfill do acervo (poucas páginas/execução); 2) RSS por cima (traz os
// mais recentes com views e corrige URL/cat de shorts recentes).
const bf = await backfill();
mergeInto(map, bf.items);
mergeInto(map, fresh);
// Sem teto: o acervo completo vive em videos.json, ordenado do novo ao antigo.
const videos = [...map.values()].sort((a,b)=> new Date(b.published)-new Date(a.published));
// Enriquecimento com cota limitada: 50 mais recentes + nunca-enriquecidos
// (views de arquivo ficam levemente defasadas — aceitável para o acervo).
const recentIds = new Set(videos.slice(0,50).map(v=>v.id));
const toEnrich = videos.filter(v=>recentIds.has(v.id) || !v.likes || !v.duration);
const enriched = await enrich(toEnrich);
// Evita commit vazio: se a lista de vídeos não mudou, mantém o `updated`
// anterior para que o arquivo fique byte-idêntico e `git diff --quiet` funcione.
const prevVideosJson = JSON.stringify(prev.videos || []);
const nextVideosJson = JSON.stringify(videos);
let updated;
let changed = prevVideosJson !== nextVideosJson;
if (!changed && prev.updated) {
  updated = prev.updated;
} else {
  updated = new Date().toISOString();
}
writeFileSync('data/videos.json', JSON.stringify({channelId:CHANNEL_ID, channelUrl:CHANNEL_URL, updated, videos}, null, 0));

// páginas v/[id].html — uma por vídeo não-short do acervo
mkdirSync('v',{recursive:true});
const tpl = readFileSync('templates/video.html','utf8');
for (const v of videos) {
  if (v.cat==='shorts') continue;
  const rel = videos.filter(x=>x.cat!=='shorts' && x.id!==v.id).slice(0,6);
  const html = tpl
    .replaceAll('__TITLE__', escH(v.title))
    .replaceAll('__ID__', v.id)
    .replaceAll('__DESC__', escH(v.desc||v.title))
    .replaceAll('__DATE__', v.published)
    .replaceAll('__DATE_BR__', new Date(v.published).toLocaleDateString('pt-BR'))
    .replaceAll('__THUMB__', v.thumb)
    .replaceAll('__URL__', v.url)
    .replaceAll('__CAT__', v.cat)
    .replaceAll('__STATS__', statsHtml(v))
    .replaceAll('__NEXT__', rel.map((r,i)=>`<li><a class="linha" href="../v/${r.id}.html"><span class="num">${String(i+1).padStart(2,'0')}</span><span class="linha-corpo"><span class="linha-kicker">${escH(r.cat)} · ${new Date(r.published).toLocaleDateString('pt-BR')}${r.views ? ' · ' + fmtCompact(r.views) + ' views' : ''}</span><span class="linha-titulo">${escH(r.title)}</span></span><img class="mini" loading="lazy" src="${r.thumb}" alt=""><span class="seta" aria-hidden="true">→</span></a></li>`).join(''));
  writeFileSync(`v/${v.id}.html`, html);
}

// sitemap — acervo completo (não-shorts)
const urls = ['', 'videos/', 'sobre/', ...videos.filter(v=>v.cat!=='shorts').map(v=>`v/${v.id}.html`)];
writeFileSync('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map(u=>`<url><loc>${SITE}/${u}</loc></url>`).join('')}</urlset>`);
// feed espelho
writeFileSync('feed.xml', `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Eu Vim de Santos — site</title><link>${SITE}/</link><description>Espelho leve dos vídeos do canal.</description>${videos.slice(0,20).map(v=>`<item><title>${escH(v.title)}</title><link>${SITE}/v/${v.id}.html</link><pubDate>${new Date(v.published).toUTCString()}</pubDate><guid>${SITE}/v/${v.id}.html</guid></item>`).join('')}</channel></rss>`);
console.log(`OK: ${videos.length} vídeos (+${bf.items.length} backfill, done=${bf.state.done}), enriched=${enriched}, changed=${changed}, updated ${updated}`);
