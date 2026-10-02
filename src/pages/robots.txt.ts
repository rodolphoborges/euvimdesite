import type { APIContext } from 'astro';
import { href } from '../lib/format.mjs';

export function GET(ctx: APIContext) {
  return new Response(`User-agent: *\nAllow: /\nSitemap: ${new URL(href('sitemap-index.xml'), ctx.site).href}\n`);
}
