// Acesso ao YouTube: RSS público (sem chave) e Data API v3 (com YT_API_KEY).
import { unesc, isoToSecs } from './util.mjs';

const UA = { 'user-agent': 'Mozilla/5.0 (compatible; EVS-site/2.0; +https://github.com/rodolphoborges/euvimdesite)' };
const RSS_UA = { 'user-agent': 'EVS-site/1.0' };
const API = 'https://www.googleapis.com/youtube/v3/';

function pick(xml, tag) {
  const m = xml.match(new RegExp(`<${tag}>([\s\S]*?)</${tag}>`));
  return m ? m[1].trim() : '';
}

// RSS traz só os ~15 uploads mais recentes, mas não precisa de chave.
export async function fetchRss(channelId) {
  // O feed às vezes devolve 404/5xx temporários: tenta algumas vezes.
  let r;
  for (let i = 0; i < 4; i++) {
    r = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`, { headers: RSS_UA, signal: AbortSignal.timeout(30000) });
    if (r.ok) break;
    await new Promise(res => setTimeout(res, 2000 * (i + 1)));
  }
  if (!r.ok) throw new Error('rss ' + r.status);
  const xml = await r.text();
  return xml.split('<entry>').slice(1).map(e => {
    const id = pick(e, 'yt:videoId');
    const title = unesc(pick(e, 'title') || pick(e, 'media:title'));
    const url = (e.match(/<link[^>]*href="([^"]+)"/) || [])[1] || `https://www.youtube.com/watch?v=${id}`;
    const descM = e.match(/<media:description>([\s\S]*?)<\/media:description>/);
    const v = {
      id,
      title: title.slice(0, 160),
      url,
      published: pick(e, 'published') || new Date().toISOString(),
      desc: descM ? unesc(descM[1]).slice(0, 600) : '',
      views: +(e.match(/<media:statistics[^>]*views="(\d+)"/) || [])[1] || 0,
    };
    if (/\/shorts\//.test(url)) v.short = true;
    return v;
  }).filter(v => v.id);
}

export async function api(path, params, key) {
  const q = new URLSearchParams({ ...params, key });
  const r = await fetch(API + path + '?' + q, { headers: UA, signal: AbortSignal.timeout(30000) });
  if (!r.ok) {
    let msg = '';
    try { msg = (await r.json()).error?.message || ''; } catch {}
    throw new Error(`api ${path} ${r.status} ${msg}`.trim());
  }
  return r.json();
}

export function snippetToVideo(id, sn) {
  return {
    id,
    title: String(sn.title || '').slice(0, 160),
    url: `https://www.youtube.com/watch?v=${id}`,
    published: sn.publishedAt || new Date().toISOString(),
    desc: String(sn.description || '').slice(0, 600),
  };
}

// Uma página (50 itens) da playlist de uploads. Devolve vídeos + próximo token.
export async function uploadsPage(channelId, pageToken, key) {
  const j = await api('playlistItems', {
    part: 'snippet,contentDetails', maxResults: 50,
    playlistId: 'UU' + channelId.slice(2),
    ...(pageToken ? { pageToken } : {}),
  }, key);
  const items = [];
  for (const it of j.items || []) {
    const id = it.contentDetails?.videoId || it.snippet?.resourceId?.videoId;
    const t = it.snippet?.title;
    if (!id || !t || t === 'Deleted video' || t === 'Private video') continue;
    items.push(snippetToVideo(id, { ...it.snippet, publishedAt: it.contentDetails?.videoPublishedAt || it.snippet.publishedAt }));
  }
  return { items, next: j.nextPageToken || null };
}

// Estatísticas, duração e se foi live — 1 unidade de cota por lote de 50.
export async function videoDetails(ids, key) {
  const out = new Map();
  for (let i = 0; i < ids.length; i += 50) {
    const j = await api('videos', {
      part: 'statistics,contentDetails,liveStreamingDetails,snippet',
      id: ids.slice(i, i + 50).join(','),
    }, key);
    for (const it of j.items || []) {
      const st = it.statistics || {};
      out.set(it.id, {
        views: +st.viewCount || 0,
        likes: +st.likeCount || 0,
        comments: +st.commentCount || 0,
        secs: isoToSecs(it.contentDetails?.duration),
        live: !!it.liveStreamingDetails,
        upcoming: it.snippet?.liveBroadcastContent === 'upcoming' || it.snippet?.liveBroadcastContent === 'live',
        title: it.snippet?.title,
        desc: it.snippet?.description,
        tags: (it.snippet?.tags || []).slice(0, 12),
      });
    }
  }
  return out;
}

// Truque gratuito: /shorts/<id> responde 200 para Shorts e redireciona para os demais.
export async function isShort(id) {
  try {
    const r = await fetch(`https://www.youtube.com/shorts/${id}`, { method: 'HEAD', redirect: 'manual', headers: UA, signal: AbortSignal.timeout(15000) });
    if (r.status === 200) return true;
    if (r.status >= 300 && r.status < 400) return false;
  } catch {}
  return null;
}

export async function channelByHandle(handle, key) {
  const j = await api('channels', { part: 'snippet,statistics', forHandle: handle.replace(/^@/, '') }, key);
  const c = j.items?.[0];
  if (!c) return null;
  const th = c.snippet.thumbnails || {};
  return {
    id: c.id,
    title: c.snippet.title,
    desc: String(c.snippet.description || '').slice(0, 300),
    avatar: (th.medium || th.high || th.default || {}).url || '',
    subs: c.statistics?.hiddenSubscriberCount ? 0 : (+c.statistics?.subscriberCount || 0),
    videos: +c.statistics?.videoCount || 0,
  };
}

// Sem chave: descobre o channelId lendo a página do handle.
export async function channelIdFromPage(handle) {
  try {
    const r = await fetch(`https://www.youtube.com/${handle}`, { headers: UA, signal: AbortSignal.timeout(30000) });
    const html = await r.text();
    const id = (html.match(/"channelId":"(UC[\w-]{22})"/) || html.match(/channel\/(UC[\w-]{22})/) || [])[1];
    const title = unesc((html.match(/<meta property="og:title" content="([^"]+)"/) || [])[1] || handle);
    const avatar = ((html.match(/<meta property="og:image" content="([^"]+)"/) || [])[1] || '').replace(/=s\d+-/, '=s176-');
    return id ? { id, title, desc: '', avatar, subs: 0, videos: 0 } : null;
  } catch { return null; }
}

// Playlists do canal → mapa videoId → título da playlist (para categorizar).
export async function playlistMembership(channelId, key, maxPlaylists = 60) {
  const lists = [];
  let token = null;
  do {
    const j = await api('playlists', { part: 'snippet', channelId, maxResults: 50, ...(token ? { pageToken: token } : {}) }, key);
    for (const p of j.items || []) lists.push({ id: p.id, title: p.snippet.title });
    token = j.nextPageToken;
  } while (token && lists.length < maxPlaylists);
  const member = {};
  for (const p of lists.slice(0, maxPlaylists)) {
    let t = null, pages = 0;
    do {
      const j = await api('playlistItems', { part: 'contentDetails', playlistId: p.id, maxResults: 50, ...(t ? { pageToken: t } : {}) }, key);
      for (const it of j.items || []) (member[it.contentDetails.videoId] ||= []).push(p.title);
      t = j.nextPageToken; pages++;
    } while (t && pages < 40);
  }
  return { lists, member };
}
