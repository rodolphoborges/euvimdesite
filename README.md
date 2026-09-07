# Eu Vim de Santos — site complementar

Site estático vanilla (HTML+CSS+JS puro) para consumir o canal https://www.youtube.com/@EuVimdeSantos sem depender do algoritmo. Hospedado no **GitHub Pages** (`usuario.github.io/euvimdesite`).

## Como funciona o auto-feed
- Fonte: RSS público `https://www.youtube.com/feeds/videos.xml?channel_id=UC2yJDeDFcv1cAHA0BgfJ9ww` (sem API key, sem custo, sem segredo).
- `.github/workflows/update.yml` roda 3x/dia (12:17, 18:17, 01:17 UTC) + manual (`workflow_dispatch`) e executa `node scripts/build-feed.mjs`.
- Script gera: `data/videos.json` (merge, máx 100), `v/[id].html` (SEO por vídeo), `sitemap.xml`, `feed.xml`. Commita só se mudou.
- Site lê `data/videos.json` e renderiza com busca/filtro client-side. Nenhum vídeo hospedado aqui.

## Estatísticas (views, curtidas, comentários, duração)
- Sem chave: o build usa só o RSS (traz views) e a ficha mostra o que houver. Nada quebra.
- Com chave: crie uma API key do **YouTube Data API v3** (Google Cloud, gratuita; o consumo aqui é ~3 chamadas/dia) e cadastre como secret `YT_API_KEY` em Settings > Secrets > Actions. Os workflows já repassam como env e o script enriquece `data/videos.json` + páginas em build-time. A chave nunca vai para o navegador.

## Rodar local
```powershell
python -m http.server 8000
# abrir http://localhost:8000/
node scripts/build-feed.mjs
```

## Publicar no Pages
1. Criar repo `euvimdesite`, push na branch `main`.
2. Settings > Pages > Source: **GitHub Actions**.
3. Ajustar `SITE_URL` nos workflows para `https://<usuario>.github.io/euvimdesite`.
4. Deploy automático via `deploy.yml`.

## Identidade
Azul-marinho `#000066`, dourado `#D9A419`, branco, ciano `#29B6F6`. Logo em SVG próprio (`assets/img/logo.svg`), sem copiar PNG do canal.
