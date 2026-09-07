// Gera data/videos.json + v/*.html + sitemap.xml + feed.xml a partir do RSS do YouTube. Zero deps.
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';

const CHANNEL_ID = 'UC2yJDeDFcv1cAHA0BgfJ9ww';
const CHANNEL_URL = 'https://www.youtube.com/@EuVimdeSantos';
const SITE = process.env.SITE_URL || 'https://rodolphoborges.github.io/euvimdesite';
const RSS = `https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`;

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
const map = new Map(prev.videos.map(v=>[v.id,v]));
for (const v of fresh) map.set(v.id, {...(map.get(v.id)||{}), ...v});
const videos = [...map.values()].sort((a,b)=> new Date(b.published)-new Date(a.published)).slice(0,100);
const updated = new Date().toISOString();
writeFileSync('data/videos.json', JSON.stringify({channelId:CHANNEL_ID, channelUrl:CHANNEL_URL, updated, videos}, null, 0));

// páginas v/[id].html
mkdirSync('v',{recursive:true});
const tpl = readFileSync('templates/video.html','utf8');
for (const v of videos.slice(0,50)) {
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
    .replaceAll('__NEXT__', rel.map(r=>`<article class="card"><a class="thumb" href="../v/${r.id}.html"><img loading="lazy" src="${r.thumb}" alt=""></a><div class="corpo"><h3><a href="../v/${r.id}.html">${escH(r.title)}</a></h3></div></article>`).join(''));
  writeFileSync(`v/${v.id}.html`, html);
}

// sitemap
const urls = ['', 'videos/', 'sobre/', ...videos.filter(v=>v.cat!=='shorts').slice(0,50).map(v=>`v/${v.id}.html`)];
writeFileSync('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map(u=>`<url><loc>${SITE}/${u}</loc></url>`).join('')}</urlset>`);
// feed espelho
writeFileSync('feed.xml', `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Eu Vim de Santos — site</title><link>${SITE}/</link><description>Espelho leve dos vídeos do canal.</description>${videos.slice(0,20).map(v=>`<item><title>${escH(v.title)}</title><link>${SITE}/v/${v.id}.html</link><pubDate>${new Date(v.published).toUTCString()}</pubDate><guid>${SITE}/v/${v.id}.html</guid></item>`).join('')}</channel></rss>`);
console.log(`OK: ${videos.length} vídeos, updated ${updated}`);
