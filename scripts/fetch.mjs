// Coleta de dados: RSS + YouTube Data API → data/*.json. Zero dependências.
//
// - Acervo completo: percorre a playlist de uploads até o fim (BACKFILL_PAGES por execução)
//   e depois só confere a 1ª página. Sem teto de vídeos.
// - Enriquece TODOS os vídeos (views, curtidas, comentários, duração, live) em lotes de 50.
// - Canais indicados (config/canais.json) com os últimos vídeos de cada um.
// Sem YT_API_KEY roda em modo RSS (15 vídeos mais recentes) e nunca quebra.
import { readJson, writeIfChanged } from './lib/util.mjs';
import { fetchRss, uploadsPage, videoDetails, isShort, channelByHandle, channelIdFromPage, playlistMembership } from './lib/yt.mjs';
import { categorize } from './lib/categorize.mjs';

const site = readJson('config/site.json');
const KEY = process.env.YT_API_KEY || '';
const BACKFILL_PAGES = Math.max(0, parseInt(process.env.BACKFILL_PAGES ?? '20', 10) || 0);
const PLAYLIST_EVERY_DAYS = 7;
const log = (...a) => console.log('[fetch]', ...a);

const state = readJson('data/state.json', {});
state.backfill ||= { token: null, done: false, indexed: 0 };

const prev = readJson('data/videos.json', { videos: [] });
const map = new Map();
for (const v of prev.videos || []) {
  // migração do formato antigo (views como string, cat 'shorts' derivada da URL, thumb)
  const { thumb, duration, ...rest } = v;
  if (typeof rest.views === 'string') rest.views = +rest.views || 0;
  if (typeof rest.likes === 'string') rest.likes = +rest.likes || 0;
  if (typeof rest.comments === 'string') rest.comments = +rest.comments || 0;
  if (rest.short === undefined && /\/shorts\//.test(rest.url || '')) rest.short = true;
  map.set(v.id, rest);
}

function merge(list) {
  let added = 0;
  for (const v of list) {
    const old = map.get(v.id);
    if (!old) { map.set(v.id, v); added++; continue; }
    const m = { ...old, ...v };
    for (const k of ['desc', 'views']) if (!v[k]) m[k] = old[k];
    if (old.short && v.short === undefined) m.short = true;
    map.set(v.id, m);
  }
  return added;
}

// 1) backfill pela Data API
if (!KEY) {
  log('sem YT_API_KEY → modo RSS (só os ~15 vídeos mais recentes, sem curtidas/duração).');
} else if (BACKFILL_PAGES > 0) {
  const bf = state.backfill;
  let token = bf.done ? null : bf.token;
  const pages = bf.done ? 1 : BACKFILL_PAGES;
  let got = 0;
  try {
    for (let p = 0; p < pages; p++) {
      const { items, next } = await uploadsPage(site.channelId, token, KEY);
      got += merge(items);
      token = next;
      if (!next) { bf.done = true; break; }
      if (bf.done) break;
    }
    if (!bf.done) bf.token = token; else bf.token = null;
    bf.indexed = (bf.indexed || 0) + got;
    log(`backfill: +${got} novos, concluído=${bf.done}`);
  } catch (e) { log('backfill falhou:', e.message); }
}

// 2) RSS por cima (rápido, sem cota)
try { log(`rss: +${merge(await fetchRss(site.channelId))} novos`); }
catch (e) { log('rss falhou:', e.message); }

// 3) enriquecimento de todos os vídeos
if (KEY) {
  try {
    const det = await videoDetails([...map.keys()], KEY);
    for (const [id, d] of det) {
      const v = map.get(id);
      Object.assign(v, { views: d.views, likes: d.likes, comments: d.comments, secs: d.secs, live: d.live || undefined });
      if (d.title) v.title = d.title.slice(0, 160);
      if (d.desc) v.desc = d.desc.slice(0, 600);
      if (d.upcoming) v.upcoming = true; else delete v.upcoming;
    }
    // vídeos removidos/privados somem da API: tira do acervo
    for (const id of [...map.keys()]) if (!det.has(id)) { map.delete(id); log('removido (privado/apagado):', id); }
    log(`enriquecidos: ${det.size}`);
  } catch (e) { log('enriquecimento falhou:', e.message); }
}

// 4) shorts: confirma via /shorts/<id> só quando a duração indica (≤ 3 min) e ainda não sabemos
let checked = 0;
for (const v of map.values()) {
  if (v.short !== undefined || !v.secs || v.secs > 180 || v.live) continue;
  const s = await isShort(v.id);
  if (s !== null) { v.short = s; checked++; }
}
if (checked) log(`shorts verificados: ${checked}`);

// 5) playlists do canal (1×/semana) para categorizar melhor
let playlists = readJson('data/playlists.json', { member: {} });
if (KEY && (!state.playlistsAt || Date.now() - new Date(state.playlistsAt) > PLAYLIST_EVERY_DAYS * 864e5)) {
  try {
    const { lists, member } = await playlistMembership(site.channelId, KEY);
    playlists = { lists, member };
    writeIfChanged('data/playlists.json', JSON.stringify(playlists));
    state.playlistsAt = new Date().toISOString();
    log(`playlists: ${lists.length}`);
  } catch (e) { log('playlists falhou:', e.message); }
}
const rules = Object.entries(site.playlistCats || {}).map(([re, cat]) => [new RegExp(re, 'i'), cat]);
const playlistCat = {};
for (const [id, titles] of Object.entries(playlists.member || {})) {
  for (const t of titles) {
    const hit = rules.find(([re]) => re.test(t));
    if (hit) { playlistCat[id] = hit[1]; break; }
  }
}
const overrides = readJson('config/overrides.json', {}).categorias || {};
for (const v of map.values()) v.cat = categorize(v, { overrides, playlistCat });

// 6) grava o acervo (ordem: mais novo → mais antigo). Mantém `updated` se nada mudou.
const videos = [...map.values()].sort((a, b) => new Date(b.published) - new Date(a.published));
const same = JSON.stringify(prev.videos) === JSON.stringify(videos);
const out = { channelId: site.channelId, updated: same && prev.updated ? prev.updated : new Date().toISOString(), videos };
writeIfChanged('data/videos.json', JSON.stringify(out));

// 7) canais indicados
const cfg = readJson('config/canais.json', { canais: [] });
const cache = readJson('data/canais.json', { canais: [] });
const canais = [];
for (const c of cfg.canais) {
  const old = cache.canais.find(x => x.handle.toLowerCase() === c.handle.toLowerCase()) || {};
  let info = null;
  try { info = KEY ? await channelByHandle(c.handle, KEY) : (old.id ? null : await channelIdFromPage(c.handle)); }
  catch (e) { log(`canal ${c.handle}:`, e.message); }
  const ch = { ...old, ...(info || {}), handle: c.handle, nota: c.nota || '' };
  if (ch.id) {
    try { ch.latest = (await fetchRss(ch.id)).slice(0, 12).map(({ id, title, published, views, short }) => ({ id, title, published, views, ...(short ? { short } : {}) })); }
    catch (e) { log(`rss ${c.handle}:`, e.message); }
  }
  canais.push(ch);
}
writeIfChanged('data/canais.json', JSON.stringify({ canais }));

writeIfChanged('data/state.json', JSON.stringify(state, null, 1));

const byCat = videos.reduce((a, v) => (a[v.cat] = (a[v.cat] || 0) + 1, a), {});
log(`OK: ${videos.length} vídeos`, byCat, `mudou=${!same}`);
