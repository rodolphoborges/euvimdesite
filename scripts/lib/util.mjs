// Utilidades compartilhadas (sem dependências).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export function readJson(file, fallback) {
  try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return fallback; }
}

// Escreve só se o conteúdo mudou; devolve true quando gravou.
export function writeIfChanged(file, content) {
  let prev = null;
  try { prev = readFileSync(file, 'utf8'); } catch {}
  if (prev === content) return false;
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
  return true;
}

export function writeFile(file, content) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
}

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function unesc(s) {
  return String(s).replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

const LOCALE_TAG = { pt: 'pt-BR', en: 'en-US', es: 'es' };
const tag = l => LOCALE_TAG[l] || LOCALE_TAG.pt;

export function compact(n, locale = 'pt') {
  try { return new Intl.NumberFormat(tag(locale), { notation: 'compact', maximumFractionDigits: 1 }).format(Number(n)); } catch { return String(n); }
}

// ISO 8601 (PT1H2M3S) → segundos
export function isoToSecs(iso) {
  const m = String(iso || '').match(/P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  return (+m[1] || 0) * 86400 + (+m[2] || 0) * 3600 + (+m[3] || 0) * 60 + (+m[4] || 0);
}

export function fmtSecs(s) {
  s = Math.max(0, Math.floor(s || 0));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  const p = n => String(n).padStart(2, '0');
  return h ? `${h}:${p(m)}:${p(x)}` : `${m}:${p(x)}`;
}

const TZ = 'America/Sao_Paulo';
export function fmtDate(d, opts = { day: '2-digit', month: 'short', year: 'numeric' }, locale = 'pt') {
  try { return new Date(d).toLocaleDateString(tag(locale), { timeZone: TZ, ...opts }).replace(/\./g, ''); } catch { return ''; }
}

const AGO = {
  pt: { min: n => `há ${n} min`, h: n => `há ${n} h`, day1: 'ontem', days: n => `há ${n} dias` },
  en: { min: n => `${n} min ago`, h: n => `${n} h ago`, day1: 'yesterday', days: n => `${n} days ago` },
  es: { min: n => `hace ${n} min`, h: n => `hace ${n} h`, day1: 'ayer', days: n => `hace ${n} días` },
};
export function ago(d, now = Date.now(), locale = 'pt') {
  const T = AGO[locale] || AGO.pt;
  const s = Math.round((now - new Date(d)) / 1000);
  if (s < 3600) return T.min(Math.max(1, Math.round(s / 60)));
  if (s < 86400) return T.h(Math.round(s / 3600));
  const days = Math.round(s / 86400);
  if (days === 1) return T.day1;
  if (days < 7) return T.days(days);
  return fmtDate(d, undefined, locale);
}

export function slugify(s) {
  return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
