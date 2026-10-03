// Baixa miniaturas e avatares para public/img/ antes do build.
// Assim o visitante não faz nenhuma requisição ao Google só por navegar (LGPD:
// minimização e nenhum compartilhamento de IP com terceiros sem ação do usuário).
// Arquivos já baixados são reaproveitados (cache do GitHub Actions).
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { readJson, slugify } from './lib/util.mjs';

const videos = readJson('data/videos.json', { videos: [] }).videos;
const canais = readJson('data/canais.json', { canais: [] }).canais;
mkdirSync('public/img/v', { recursive: true });
mkdirSync('public/img/c', { recursive: true });

const jobs = [];
// Tenta os candidatos em ordem e grava no arquivo de mesma posição.
// Arquivos já baixados (qualquer extensão) são reaproveitados.
const want = (urls, files) => { if (!files.some(f => existsSync(f))) jobs.push([urls, files]); };
for (const v of videos) {
  want(
    [`https://i.ytimg.com/vi_webp/${v.id}/mqdefault.webp`, `https://i.ytimg.com/vi/${v.id}/mqdefault.jpg`],
    [`public/img/v/${v.id}.webp`, `public/img/v/${v.id}.jpg`],
  );
  want([`https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`], [`public/img/v/${v.id}-hq.jpg`]);
}
for (const c of canais) {
  if (c.avatar) want([c.avatar.replace(/=s\d+-/, '=s176-')], [`public/img/c/${slugify(c.handle)}.jpg`]);
  for (const x of c.latest || []) {
    want(
      [`https://i.ytimg.com/vi_webp/${x.id}/mqdefault.webp`, `https://i.ytimg.com/vi/${x.id}/mqdefault.jpg`],
      [`public/img/v/${x.id}.webp`, `public/img/v/${x.id}.jpg`],
    );
  }
}

let ok = 0, fail = 0;
async function worker() {
  while (jobs.length) {
    const [urls, files] = jobs.shift();
    let done = false;
    for (let i = 0; i < urls.length && !done; i++) {
      try {
        const r = await fetch(urls[i], { signal: AbortSignal.timeout(20000) });
        if (!r.ok) continue;
        writeFileSync(files[i], Buffer.from(await r.arrayBuffer()));
        ok++;
        done = true;
      } catch { /* tenta o próximo candidato */ }
    }
    if (!done) fail++;
  }
}
const total = jobs.length;
await Promise.all(Array.from({ length: 8 }, worker));
console.log(`[thumbs] ${total} novos: ${ok} baixados, ${fail} falharam (usam imagem neutra)`);
