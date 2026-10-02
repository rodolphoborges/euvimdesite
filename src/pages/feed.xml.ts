import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { longs, site } from '../lib/data.mjs';
import { href } from '../lib/format.mjs';

export function GET(ctx: APIContext) {
  return rss({
    title: site.name,
    description: site.tagline,
    site: new URL(href(), ctx.site).href,
    items: longs.slice(0, 40).map(v => ({
      title: v.title,
      link: href(`v/${v.id}/`),
      pubDate: new Date(v.published),
      description: (v.desc || '').split('\n')[0].slice(0, 300),
    })),
    customData: '<language>pt-br</language>',
  });
}
