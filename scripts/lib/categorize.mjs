// Classificação dos vídeos em editorias. Ordem de prioridade:
// override manual → live (API) → short (duração/URL) → playlist do canal → título.
export const CATS = {
  taticas: 'Táticas',
  comentarios: 'Comentários',
  noticias: 'Notícias',
  entrevistas: 'Entrevistas',
  lives: 'Lives',
  shorts: 'Shorts',
};
export const CAT_ORDER = ['lives', 'taticas', 'noticias', 'comentarios', 'entrevistas', 'shorts'];

const TITLE_RULES = [
  ['lives', /\blive do trio\b|\bao vivo\b|corredor de fogo|^live\b|\blive:/],
  ['comentarios', /\breact\b/],
  ['entrevistas', /eu vim de entrevista|\bentrevista com\b|\bentrevistamos\b|\bbate-papo\b|\bconvidad[oa]\b|\bpodcast\b/],
  ['taticas', /\b\d+\s*x\s*\d+\b|an[áa]lise|t[áa]tic|posicionamento|scout|estreia d[eo]|escala[çc][ãa]o/],
  ['noticias', /contrata|mercado|sonhou|renova|apresentad|quer ponta|quase perdeu|not[íi]cia|vende\b|venda\b|rescis[ãa]o|se acerta|negocia|empr[ée]stimo|patroc[íi]nio|sal[áa]rio|proposta|acerto|refor[çc]o|sa[íi]da\b/],
];

export function categorize(v, { overrides = {}, playlistCat = {} } = {}) {
  if (overrides[v.id]) return overrides[v.id];
  if (v.live) return 'lives';
  if (v.short === true || /\/shorts\//.test(v.url || '')) return 'shorts';
  if (playlistCat[v.id]) return playlistCat[v.id];
  const t = String(v.title || '').toLowerCase();
  for (const [cat, re] of TITLE_RULES) if (re.test(t)) return cat;
  return 'comentarios';
}
