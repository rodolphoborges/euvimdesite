// Mantém vivos os links antigos v/<id>.html → v/<id>/
import type { APIRoute } from 'astro';
import { videos } from '../../lib/data.mjs';
import { href } from '../../lib/format.mjs';

export function getStaticPaths() {
  return videos.filter(v => v.cat !== 'shorts').map(v => ({ params: { id: v.id } }));
}

export const GET: APIRoute = ({ params, site }) => {
  const to = new URL(href(`v/${params.id}/`), site).href;
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Redirecionando…</title>` +
    `<link rel="canonical" href="${to}"><meta name="robots" content="noindex"><meta http-equiv="refresh" content="0; url=${to}">` +
    `</head><body><a href="${to}">Continuar</a></body></html>`;
  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } });
};
