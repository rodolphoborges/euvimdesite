// Carrega os dados gerados pelo robô (data/*.json) uma única vez por build.
import { readFileSync, readdirSync } from 'node:fs';
import { CATS, CAT_ORDER } from '../../scripts/lib/categorize.mjs';

const read = (f, fb) => { try { return JSON.parse(readFileSync(f, 'utf8')); } catch { return fb; } };

export const site = read('config/site.json', {});
const db = read('data/videos.json', { videos: [] });

export const videos = db.videos;
export const updated = db.updated;
export const longs = videos.filter(v => v.cat !== 'shorts' && !v.upcoming);
export const shorts = videos.filter(v => v.cat === 'shorts');
export const canais = (read('data/canais.json', { canais: [] }).canais || [])
  .map(c => ({ ...c, avatar: (c.avatar || '').replace(/=s\d+-/, '=s176-') }));
export const catList = CAT_ORDER.filter(c => videos.some(v => v.cat === c));
export { CATS };

let files = [];
try { files = readdirSync('data/transcripts').filter(f => f.endsWith('.json')); } catch {}
export const transcribed = new Set(files.map(f => f.slice(0, -5)));
export const transcript = id => transcribed.has(id) ? read(`data/transcripts/${id}.json`, null) : null;
// Boletins: lê SOMENTE publicados. Rascunhos vivem em data/boletins/_revisar/ e nunca chegam aqui.
export const boletim = id => read(`data/boletins/${id}.json`, null);
// ---- i18n: conteúdo traduzido (data/i18n/<locale>/...), com fallback para pt ----
const _i18n = {};
const i18nFile = (locale, name) => {
  const k = `${locale}/${name}`;
  if (!(k in _i18n)) _i18n[k] = locale === 'pt' ? null : read(`data/i18n/${locale}/${name}.json`, null);
  return _i18n[k];
};
// Vídeo com título/descrição traduzidos (fallback: original).
export const tv = (locale, v) => {
  const d = locale === 'pt' ? null : (i18nFile(locale, 'videos') || {})[v.id];
  return d ? { ...v, title: d.t || v.title, desc: d.d ?? v.desc } : v;
};
// Boletim traduzido (fallback: publicado em pt).
export const boletimT = (locale, id) => {
  if (locale === 'pt') return boletim(id);
  return read(`data/i18n/${locale}/boletins/${id}.json`, null) || boletim(id);
};
// Transcrição traduzida (fallback: original com/sem glossário).
export const transcriptT = (locale, id) => {
  const tr = transcript(id);
  if (!tr || locale === 'pt') return tr;
  const s = read(`data/i18n/${locale}/transcripts/${id}.json`, null);
  return s?.segments?.length ? { ...tr, segments: s.segments, segments_fix: s.segments } : tr;
};
// Nota de canal indicado traduzida (fallback: original).
export const canalNota = (locale, handle) => {
  if (locale === 'pt') return null;
  return (i18nFile(locale, 'canais') || {})[handle] || null;
};
// Índice de boletins (mais novos primeiro), com dados do vídeo para capa e data.
let bolFiles = [];
try { bolFiles = readdirSync('data/boletins').filter(f => f.endsWith('.json')); } catch {}
const _vById = new Map(videos.map(v => [v.id, v]));
export const boletins = bolFiles.map(f => {
  const b = read(`data/boletins/${f}`, null);
  const v = _vById.get(f.slice(0, -5));
  return b?.titulo && v ? { id: v.id, titulo: b.titulo, lead: b.lead, video: v.title, published: v.published } : null;
}).filter(Boolean).sort((a, b) => b.published.localeCompare(a.published));

export const now = Date.now();
export const PAGE = site.pageSize || 48;
