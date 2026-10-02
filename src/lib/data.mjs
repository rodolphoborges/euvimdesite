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

export const now = Date.now();
export const PAGE = site.pageSize || 48;
