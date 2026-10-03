// Patrocinadores: os cadastrados em config/patrocinadores.json + os detectados
// automaticamente nas descrições dos vídeos dos últimos N dias.
import { readFileSync } from 'node:fs';
import QRCode from 'qrcode';
import { videos, now } from './data.mjs';

const cfg = (() => { try { return JSON.parse(readFileSync('config/patrocinadores.json', 'utf8')); } catch { return { patrocinadores: [] }; } })();
export const janelaDias = cfg.janelaDias || 5;

// Tradução de campos de marketing (chamada/descrição/botão) por nome. Fallback: PT.
const _spT = {};
export const sponsorT = (locale, p) => {
  if (locale === 'pt' || !p?.nome) return p;
  _spT[locale] ??= (() => { try { return JSON.parse(readFileSync(`data/i18n/${locale}/patrocinadores.json`, 'utf8')); } catch { return {}; } })();
  const o = _spT[locale][p.nome];
  return o ? { ...p, chamada: o.chamada ?? p.chamada, descricao: o.descricao ?? p.descricao, botao: o.botao ?? p.botao } : p;
};

const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };
const IGNORE = /(^|\.)(youtube\.com|youtu\.be|instagram\.com|twitter\.com|x\.com|tiktok\.com|facebook\.com|threads\.net|twitch\.tv|kick\.com|linktr\.ee|whatsapp\.com|wa\.me|t\.me|spotify\.com|apple\.com)$/;
const AD_HINT = /cupom|c[óo]digo|#publi|patrocinad|desconto|parceiro=|\bref=|\baff/i;

// Lê blocos (parágrafos) das descrições que parecem anúncio: link + cupom.
function detect(v) {
  const out = [];
  for (const block of String(v.desc || '').split(/\n\s*\n/)) {
    if (!AD_HINT.test(block)) continue;
    const urls = (block.match(/https?:\/\/[^\s)]+/g) || []).filter(u => !IGNORE.test(hostOf(u)));
    const cupom = (block.match(/cupom\s+(?:de\s+desconto\s+)?["“]?([A-Z0-9][A-Z0-9_-]{2,})/i) || [])[1] || '';
    if (!urls.length && !cupom) continue;
    out.push({ host: hostOf(urls[0] || ''), link: urls[0] || '', cupom: cupom.toUpperCase(), texto: block.replace(/\s+/g, ' ').trim().slice(0, 220) });
  }
  return out;
}

const limite = now - janelaDias * 864e5;
const recentes = videos.filter(v => +new Date(v.published) >= limite);
const valid = (p) => p.ativo !== false && (!p.validoAte || new Date(p.validoAte + 'T23:59:59-03:00') >= now);
const cadastrados = (cfg.patrocinadores || []).filter(valid).map(p => ({ ...p, dominios: p.dominios?.length ? p.dominios : [hostOf(p.link)].filter(Boolean), videos: [], manual: true }));

const matchSponsor = (d) => cadastrados.find(p => (d.host && p.dominios.some(h => d.host === h || d.host.endsWith('.' + h))) || (d.cupom && p.cupom && d.cupom === p.cupom.toUpperCase()));

// Mapa vídeo → patrocinadores citados (vale para todo o acervo, não só a janela)
export const sponsorsOfVideo = new Map();
const novos = new Map();
for (const v of videos) {
  for (const d of detect(v)) {
    const p = matchSponsor(d);
    const recent = +new Date(v.published) >= limite;
    if (p) {
      if (!sponsorsOfVideo.has(v.id)) sponsorsOfVideo.set(v.id, new Set());
      sponsorsOfVideo.get(v.id).add(p);
      if (recent && !p.videos.includes(v)) p.videos.push(v);
    } else if (recent && d.host) {
      const key = d.host;
      const n = novos.get(key) || { nome: key.split('.').slice(-3, -2)[0] || key, chamada: '', descricao: d.texto, cupom: d.cupom, link: d.link, botao: 'Ver oferta', dominios: [key], videos: [], manual: false };
      if (!n.cupom && d.cupom) n.cupom = d.cupom;
      if (!n.videos.includes(v)) n.videos.push(v);
      novos.set(key, n);
    }
  }
}

// Ordem: destaque primeiro, depois quem mais apareceu nos vídeos recentes.
export const patrocinadores = [...cadastrados, ...novos.values()]
  .sort((a, b) => (b.destaque === true) - (a.destaque === true) || b.videos.length - a.videos.length);
export const destaques = patrocinadores.filter(p => p.manual && (p.destaque || p.videos.length));
export const vistosRecentes = patrocinadores.filter(p => p.videos.length);
export const totalRecentes = recentes.length;

const qrCache = new Map();
export async function qr(url) {
  if (!url) return '';
  if (!qrCache.has(url)) {
    qrCache.set(url, await QRCode.toString(url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#0b0b0f', light: '#ffffff' } }));
  }
  return qrCache.get(url);
}
