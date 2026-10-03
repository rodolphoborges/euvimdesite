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

// Locale a partir do caminho (/en/..., /es/...; raiz = pt). Rota sem prefixo = pt.
export const localeOf = (pathname = '/') => {
  const seg = String(pathname).replace(/^\/(euvimdesite\/)?/, '').split('/')[0];
  return isLocale(seg) && seg !== 'pt' ? seg : 'pt';
};

// Alternativas de idioma para a página atual (troca o prefixo, mantém o resto).
export const altLocales = (pathname = '/') => {
  const cur = localeOf(pathname);
  const base = String(pathname).replace(/^\/(euvimdesite\/)?(en|es)(?=\/|$)/, '/');
  return LOCALES.filter(l => l !== cur).map(l => ({
    locale: l,
    href: (l === 'pt' ? base : `/${l}${base === '/' ? '' : base}`).replace(/\/\//g, '/'),
  }));
};
