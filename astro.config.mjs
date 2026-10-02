import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { readFileSync } from 'node:fs';

const site = JSON.parse(readFileSync('./config/site.json', 'utf8'));
// SITE_URL permite testar localmente (ex.: http://localhost:4321) sem o subcaminho.
const url = new URL(process.env.SITE_URL || site.siteUrl);

export default defineConfig({
  site: url.origin,
  base: url.pathname.replace(/\/$/, '') || '/',
  trailingSlash: 'ignore',
  build: { format: 'directory', inlineStylesheets: 'auto' },
  compressHTML: true,
  prefetch: { prefetchAll: false, defaultStrategy: 'hover' },
  integrations: [
    sitemap({ filter: p => !/\/(busca|404)\/?$/.test(p) && !/\.html$/.test(p) }),
  ],
});
