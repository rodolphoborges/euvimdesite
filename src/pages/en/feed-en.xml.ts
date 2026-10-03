import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { longs, site, tv } from '../../lib/data.mjs';
import { href } from '../../lib/format.mjs';
import { t } from '../../lib/i18n.mjs';

const locale = 'en';

export function GET(ctx: APIContext) {
  return rss({
    title: site.name,
    description: t(locale, 'site_tagline'),
    site: new URL(href('', locale), ctx.site).href,
    items: longs.slice(0, 40).map(v => {
      const x = tv(locale, v);
      return {
        title: x.title,
        link: href(`v/${v.id}/`, locale),
        pubDate: new Date(v.published),
        description: (x.desc || '').split('\n')[0].slice(0, 300),
      };
    }),
    customData: '<language>en-us</language>',
  });
}
