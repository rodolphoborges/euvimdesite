// Formatação e URLs usadas nos componentes.
import { compact as _compact, fmtSecs, fmtDate as _fmtDate, ago as _ago } from '../../scripts/lib/util.mjs';
export { fmtSecs };
export const compact = (n, locale = 'pt') => _compact(n, locale);
export const fmtDate = (d, opts, locale = 'pt') => _fmtDate(d, opts, locale);
export const ago = (d, now, locale = 'pt') => _ago(d, now, locale);
import { catName } from './i18n.mjs';
import { existsSync } from 'node:fs';
import { slugify } from '../../scripts/lib/util.mjs';

const BASE = import.meta.env.BASE_URL.replace(/\/?$/, '/');
// locale: 'pt' sem prefixo; 'en'/'es' com prefixo (rotas /en/, /es/).
export const href = (p = '', locale = 'pt') => BASE + (locale === 'pt' ? '' : locale + '/') + p.replace(/^\//, '');

// Imagens servidas pelo próprio site (baixadas por scripts/thumbs.mjs).
// Sem arquivo local, usa uma imagem neutra em vez de chamar o Google.
const local = (file, fallback = 'img/neutro.svg') => href(existsSync(`public/${file}`) ? file : fallback);
export const thumb = id => local(`img/v/${id}.webp`);
export const thumbHq = id => local(`img/v/${id}-hq.jpg`, existsSync(`public/img/v/${id}.webp`) ? `img/v/${id}.webp` : 'img/neutro.svg');
export const avatar = handle => existsSync(`public/img/c/${slugify(handle)}.jpg`) ? href(`img/c/${slugify(handle)}.jpg`) : '';

export const ytUrl = v => v.short || v.cat === 'shorts' ? `https://www.youtube.com/shorts/${v.id}` : `https://www.youtube.com/watch?v=${v.id}`;
export const videoHref = (v, locale = 'pt') => v.cat === 'shorts' ? ytUrl(v) : href(`v/${v.id}/`, locale);
export const kicker = (v, now, locale = 'pt') => `${catName(locale, v.cat) || v.cat} · ${ago(v.published, now, locale)}`;
export const absUrl = (site, p = '') => new URL(href(p), site).href;
