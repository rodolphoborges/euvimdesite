import { site } from '../lib/data.mjs';
import { href } from '../lib/format.mjs';

export function GET() {
  return new Response(JSON.stringify({
    name: site.name,
    short_name: 'EVS',
    lang: 'pt-BR',
    start_url: href(),
    scope: href(),
    display: 'standalone',
    background_color: '#0b0b0f',
    theme_color: '#0b0b0f',
    icons: [
      { src: href('icon-192.png'), sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: href('icon-512.png'), sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: href('icon-512.png'), sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }), { headers: { 'content-type': 'application/manifest+json' } });
}
