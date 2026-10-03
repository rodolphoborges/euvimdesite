// Internacionalização: dicionários em src/i18n/{pt,en,es}.json.
// t(locale, chave, vars) com fallback para pt e depois para a própria chave.
import pt from '../i18n/pt.json';
import en from '../i18n/en.json';
import es from '../i18n/es.json';

export const LOCALES = ['pt', 'en', 'es'];
export const DEFAULT_LOCALE = 'pt';
export const isLocale = l => LOCALES.includes(l);

const D = { pt, en, es };

export const t = (locale, key, vars) => {
  let s = D[locale]?.[key] ?? D.pt[key] ?? key;
  if (vars) for (const k in vars) s = String(s).replaceAll(`{${k}}`, vars[k]);
  return s;
};

export const catName = (locale, cat) => t(locale, 'cat_' + cat);
export const catIntro = (locale, cat) => t(locale, 'intro_' + cat);

// Locale a partir do caminho (com ou sem base). Rota sem prefixo = pt.
export const localeOf = (pathname = '/') => {
  const segs = String(pathname).split('/');
  const hit = segs.find(s => s === 'en' || s === 'es');
  return hit || 'pt';
};

// Caminho sem o prefixo de idioma (para o x-default/canonical PT).
export const unprefix = (pathname = '/') => String(pathname).replace(/\/(en|es)(?=\/|$)/, '');

// Alternativas de idioma para a página atual (troca o prefixo, mantém o resto e a base).
export const altLocales = (pathname = '/') => {
  const cur = localeOf(pathname);
  const base = unprefix(pathname);
  const withPrefix = l => base.replace(/^(\/[^/]+)(\/|$)/, `$1/${l}$2`);
  return LOCALES.filter(l => l !== cur).map(l => ({
    locale: l,
    href: l === 'pt' ? base : withPrefix(l),
  }));
};
