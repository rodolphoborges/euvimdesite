> **Aviso:** site de fã, sem afiliação com o canal, o Santos FC ou o YouTube. Todo vídeo e toda fala pertencem aos seus autores. Se o titular pedir remoção, [abra uma issue](https://github.com/rodolphoborges/euvimdesite/issues/new) e o conteúdo sai na próxima atualização.

# Eu Vim de Santos — site complementar

Site estático para acompanhar o canal [@EuVimdeSantos](https://www.youtube.com/@EuVimdeSantos) fora do algoritmo: acervo completo, busca (inclusive no que foi falado nos vídeos), transcrições em pt-BR e canais indicados. Publicado no GitHub Pages em https://rodolphoborges.github.io/euvimdesite.

**Custo: zero.** Tudo roda no GitHub Actions (grátis em repositório público) e no GitHub Pages.

## Como funciona

| Peça | O que faz |
|---|---|
| `scripts/fetch.mjs` | Lê o RSS do canal e a YouTube Data API: percorre **todo** o acervo, atualiza views/curtidas/comentários/duração, detecta lives e shorts, categoriza e busca os canais indicados. Grava `data/*.json`. Zero dependências. |
| `scripts/transcribe.py` | Transcreve os vídeos em pt-BR, do mais novo ao mais antigo: usa a legenda do YouTube quando existe, senão baixa só o áudio e roda o **Whisper** (faster-whisper, CPU). Grava `data/transcripts/<id>.json`. |
| `scripts/boletim.py` | Gera **rascunhos** de boletim (resumo jornalístico) a partir da transcrição corrigida: Ollama local (grátis) ou API compatível com OpenAI. Grava `data/boletins/_revisar/<id>.json`. **Nunca publica sozinho.** |
| `src/` (Astro) | Gera o site como HTML estático puro, praticamente sem JavaScript. O player do YouTube só carrega no clique. |
| Pagefind | Índice de busca estático e fatiado, gerado no build; indexa títulos, descrições e transcrições. |
| `.github/workflows/pipeline.yml` | 3×/dia: coleta → commit dos dados → build → deploy. Também republica após cada push e após cada rodada de transcrição. |
| `.github/workflows/transcribe.yml` | A cada 6 h, até ~5 h de trabalho por rodada. |

## Configuração

1. **Settings → Pages → Source: GitHub Actions.**
2. **Chave da YouTube Data API** (grátis, necessária para o acervo completo e as estatísticas):
   1. Em https://console.cloud.google.com crie um projeto.
   2. *APIs e serviços → Biblioteca →* ative **YouTube Data API v3**.
   3. *Credenciais → Criar credenciais → Chave de API.* Restrinja a chave à YouTube Data API v3.
   4. No GitHub: *Settings → Secrets and variables → Actions → New repository secret* com o nome `YT_API_KEY`.

   O uso fica em ~100–200 unidades por dia, contra 10.000 da cota grátis. Sem a chave o site continua funcionando, só com os ~15 vídeos mais recentes do RSS.
3. Rode *Actions → pipeline → Run workflow* e *Actions → transcribe → Run workflow* pela primeira vez.

### Boletins (com revisão)

O robô gera rascunhos 1×/semana; publicar é sempre decisão sua, pela issue **Boletins aguardando revisão**:

1. **Chave de LLM** (só para o Actions): secret `BOLETIM_API_KEY` + vars `BOLETIM_API_URL` (ex.: `https://api.openai.com/v1`) e `BOLETIM_MODEL`. Local é grátis: Ollama (`ollama pull qwen2.5:7b` + `npm run boletim`) ou LM Studio/OpenAI-compatível (`BOLETIM_API_URL=http://host:1234/v1 npm run boletim -- --provider api --model <nome>`).
2. **Aprovar:** *Actions → boletim → Run workflow → modo=revisar, acao=aprovar* (ids vazios = todos). **Reprovar:** mesmo caminho com `acao=reprovar`.
3. **Regenerar:** *modo=gerar* com `ids` + `instrucao` (ex.: `mais curto`) — a tentativa nova sobrescreve o rascunho.

O site só lê `data/boletins/<id>.json`; rascunhos em `_revisar/` nunca vão ao ar.

### Personalizar

**Jeito fácil, sem código:** entre em https://app.pagescms.org com a conta do GitHub e abra este repositório. Aparece um formulário para editar patrocinadores, cupons, logos, canais indicados e categorias. Salvou, o site atualiza sozinho em cerca de 1 minuto.

- `config/patrocinadores.json`: parceiros com cupom, link (vira QR code), selo de desconto, logo, cor, validade e destaque na home. O site também **detecta sozinho** cupons e links de anúncio nas descrições dos vídeos: cada página de vídeo mostra o card do parceiro citado nela, e anunciantes ainda não cadastrados aparecem em `/parceiros/` em "Outras ofertas".
- `config/canais.json`: canais indicados (basta o `@handle` e uma nota).
- `config/overrides.json`: corrige a categoria de um vídeo específico.
- `config/glossario.json`: corrige nomes que a legenda automática deturpa (vale para a transcrição exibida e para a busca).
- `config/site.json`: textos, URL do site e regras de categoria por playlist.

## Rodar localmente

```powershell
npm install
npm run fetch                                 # opcional: $env:YT_API_KEY="..." antes
$env:SITE_URL="http://localhost:4321"; npm run build
npx astro preview
# transcrição (opcional):
pip install -r scripts/requirements.txt
python scripts/transcribe.py --limit 2
```

## Limitações conhecidas

- O YouTube às vezes bloqueia downloads vindos dos servidores do GitHub (“confirme que você não é um robô”). Quando isso acontece, o robô de transcrição para sem marcar erro e tenta de novo na próxima rodada; o resto do site não é afetado. Se o bloqueio persistir, dá para rodar `scripts/transcribe.py` em qualquer computador e dar push nos arquivos de `data/transcripts/`.
- As transcrições são automáticas e podem conter erros.

## Licença

Código sob MIT (ver `LICENSE`). O conteúdo dos vídeos não é coberto por essa licença.
