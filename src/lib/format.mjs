// Formatação e URLs usadas nos componentes.
export { compact, fmtSecs, fmtDate, ago } from '../../scripts/lib/util.mjs';
import { CATS } from '../../scripts/lib/categorize.mjs';
import { ago } from '../../scripts/lib/util.mjs';

const BASE = import.meta.env.BASE_URL.replace(/\/?$/, '/');
export const href = (p = '') => BASE + p.replace(/^\//, '');

export const thumb = id => `https://i.ytimg.com/vi_webp/${id}/mqdefault.webp`;
export const thumbHq = id => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
export const ytUrl = v => v.short || v.cat === 'shorts' ? `https://www.youtube.com/shorts/${v.id}` : `https://www.youtube.com/watch?v=${v.id}`;
export const videoHref = v => v.cat === 'shorts' ? ytUrl(v) : href(`v/${v.id}/`);
export const kicker = (v, now) => `${CATS[v.cat] || v.cat} · ${ago(v.published, now)}`;
export const absUrl = (site, p = '') => new URL(href(p), site).href;
