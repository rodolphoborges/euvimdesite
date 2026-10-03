"""Robo de boletins com revisao humana.

Gera RASCUNHOS (data/boletins/_revisar/<id>.json) a partir da transcricao
corrigida (segments_fix quando houver). NADA publica sozinho: publicar e
mover o arquivo para data/boletins/<id>.json via o workflow de revisao
(Actions -> boletim -> revisar). O site so le arquivos publicados.

Providers (--provider, ou env BOLETIM_PROVIDER):
  ollama - local e gratis. Exige Ollama em http://localhost:11434.
           Modelo via BOLETIM_MODEL (padrao: qwen2.5:7b).
  api    - endpoint compativel com OpenAI. Exige BOLETIM_API_URL
           (ex.: https://api.openai.com/v1) e BOLETIM_API_KEY.
           Modelo via BOLETIM_MODEL. E o que roda no GitHub Actions.

Sem dependencias: so biblioteca padrao.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
VIDEOS = ROOT / "data" / "videos.json"
TRANSCRIPTS = ROOT / "data" / "transcripts"
OUT = ROOT / "data" / "boletins"
DRAFTS = OUT / "_revisar"
STATE = ROOT / "data" / "boletim-state.json"

MAX_FAILS = 3
MAX_CHARS = 12000  # teto do trecho enviado ao modelo (avisa quando corta)
TIMEOUT = int(os.environ.get("BOLETIM_TIMEOUT", "300"))


def now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def load_json(path: Path, default):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default


def save_json(path: Path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")


# ---------------------------------------------------------------- prompt

SISTEMA = """Voce e um jornalista esportivo santista escrevendo o boletim do video.
Regras duras:
- Use SOMENTE fatos presentes na transcricao. Nunca invente placar, numeros,
  datas, escalacoes ou contratacoes. O que for opiniao do apresentador, apresente como opiniao.
- Se algo estiver incerto ou truncado, diga ("segundo o canal", "trecho parcial").
- Portugues do Brasil, tom direto de quem acompanha o Santos todo dia, sem clichê.
- Responda com UM objeto JSON exato: {"titulo": str, "lead": str, "pontos": [str, ...]}.
- titulo: manchete curta (15 a 100 caracteres). lead: 1 paragrafo (60 a 800).
  pontos: 3 a 6 bullets de 20 a 400 caracteres cada. Total: 150 a 220 palavras."""


def build_prompt(video: dict, texto: str, parcial: bool, instrucao: str = ""):
    user = (
        f"Titulo do video: {video['title']}\n"
        f"Publicado em: {video.get('published', '')[:10]}\n"
        f"Transcricao{' (trecho inicial, video mais longo)' if parcial else ''}:\n{texto}"
    )
    if instrucao.strip():
        user += f"\nPedido da revisao: {instrucao.strip()}"
    return SISTEMA, user


# ---------------------------------------------------------------- providers

def _post(url: str, payload: dict, headers: dict | None = None) -> dict:
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json", **(headers or {})},
    )
    with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
        return json.loads(r.read().decode("utf-8"))


def call_ollama(system: str, user: str, model: str) -> str:
    try:
        j = _post("http://localhost:11434/api/chat", {
            "model": model, "format": "json", "stream": False,
            "options": {"temperature": 0.2, "num_ctx": 8192},
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
        })
    except Exception as e:
        raise RuntimeError(f"ollama fora do ar? rode `ollama serve` ({e})") from e
    try:
        return j["message"]["content"]
    except KeyError as e:
        raise RuntimeError(f"resposta inesperada do ollama (modelo '{model}' existe? `ollama pull {model}`)") from e


def call_api(system: str, user: str, model: str) -> str:
    import urllib.error

    base = os.environ.get("BOLETIM_API_URL", "").rstrip("/")
    key = os.environ.get("BOLETIM_API_KEY", "")
    if not base:
        raise RuntimeError("defina BOLETIM_API_URL (BOLETIM_API_KEY só se o servidor exigir)")
    headers = {"Authorization": f"Bearer {key}"} if key else {}
    msgs = [
        {"role": "system", "content": system},
        {"role": "user", "content": user},
    ]
    for strict in (True, False):
        payload = {"model": model, "temperature": 0.2, "messages": msgs}
        if strict:
            payload["response_format"] = {"type": "json_object"}
        try:
            j = _post(f"{base}/chat/completions", payload, headers=headers)
        except urllib.error.HTTPError as e:
            if strict and e.code == 400:
                print("  api sem response_format, tentando sem travar JSON")
                continue
            raise
        try:
            return j["choices"][0]["message"]["content"]
        except (KeyError, IndexError) as e:
            raise RuntimeError(f"resposta inesperada da API: {str(j)[:160]}") from e
    raise RuntimeError("API rejeitou o pedido com e sem response_format")


# ---------------------------------------------------------------- validacao

def parse_json(raw: str) -> dict:
    import re as _re

    t = _re.sub(r"<think>.*?</think>", "", raw, flags=_re.S | _re.I).strip()
    if t.startswith("```"):
        t = t.split("\n", 1)[1] if "\n" in t else ""
        t = t.rsplit("```", 1)[0]
    d = json.loads(t.strip())
    if not isinstance(d, dict):
        raise ValueError("topo nao e objeto")
    return d


def validate(d: dict) -> list[str]:
    errs = []
    t, lead, pts = d.get("titulo"), d.get("lead"), d.get("pontos")
    if not isinstance(t, str) or not 15 <= len(t) <= 100:
        errs.append("titulo fora de 15-100 caracteres")
    if not isinstance(lead, str) or not 60 <= len(lead) <= 800:
        errs.append("lead fora de 60-800 caracteres")
    if not isinstance(pts, list) or not 3 <= len(pts) <= 6 or any(not isinstance(p, str) or not 20 <= len(p) <= 400 for p in pts):
        errs.append("pontos: 3-6 itens de 20-400 caracteres")
    total = len(t or "") + len(lead or "") + sum(len(p) for p in pts if isinstance(p, str))
    if total and not 800 <= total <= 2200:
        errs.append("total fora de ~150-220 palavras")
    return errs


# ---------------------------------------------------------------- principal

def transcript_text(vid: str) -> tuple[str, str, bool] | None:
    d = load_json(TRANSCRIPTS / f"{vid}.json", None)
    if not d or not d.get("segments"):
        return None
    segs = d.get("segments_fix") or d["segments"]
    texto = " ".join(t for _, t in segs)
    parcial = len(texto) > MAX_CHARS
    return " ".join(texto[:MAX_CHARS].split()), d.get("source", "?"), parcial


def gerar_one(v: dict, args, provider: str, model: str) -> dict | None:
    got = transcript_text(v["id"])
    if not got:
        return None
    texto, fonte, parcial = got
    system, user = build_prompt(v, texto, parcial, args.instrucao)
    if provider == "api":
        raw = call_api(system, user, model)
    else:
        raw = call_ollama(system, user, model)
    d = parse_json(raw)
    if (errs := validate(d)):
        raise ValueError("rascunho invalido: " + "; ".join(errs))
    prev = load_json(DRAFTS / f"{v['id']}.json", {})
    return {
        "id": v["id"], "titulo": d["titulo"], "lead": d["lead"], "pontos": d["pontos"],
        "fonte_transcricao": fonte, "parcial": parcial,
        "modelo": model, "tentativa": (prev.get("tentativa") or 0) + 1,
        **({"instrucao": args.instrucao} if args.instrucao.strip() else {}),
        "gerado_em": now_iso(),
    }


def previa(vid: str):
    for p in (OUT / f"{vid}.json", DRAFTS / f"{vid}.json"):
        d = load_json(p, None)
        if d and d.get("titulo"):
            print(f"== {p.relative_to(ROOT)} (tentativa {d.get('tentativa', 1)}) ==")
            print(f"# {d['titulo']}\n\n{d['lead']}\n")
            for pt in d["pontos"]:
                print(f"- {pt}")
            return
    print("sem rascunho nem publicado para " + vid)


def revisar(acao: str, ids: list[str]):
    """Aprova (move ao ar) ou reprova (apaga) rascunhos. So o que passa aqui publica."""
    ids = ids or sorted(p.stem for p in DRAFTS.glob("*.json"))
    OUT.mkdir(parents=True, exist_ok=True)
    ok = []
    for vid in ids:
        src = DRAFTS / f"{vid}.json"
        if not src.exists():
            print(f"pula {vid}: sem rascunho")
            continue
        if acao == "aprovar":
            d = load_json(src, None)
            if not (d and isinstance(d.get("titulo"), str) and isinstance(d.get("lead"), str) and isinstance(d.get("pontos"), list)):
                print(f"pula {vid}: fora do esquema")
                continue
            (OUT / f"{vid}.json").write_text(json.dumps(d, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
            src.unlink()
            ok.append(vid)
        else:
            src.unlink()
            ok.append(vid)
    print("OK=" + " ".join(ok))


def fila(repo: str, dry: bool = False):
    """Sincroniza a issue 'Boletins aguardando revisão' com a fila real."""
    import subprocess

    pend = []
    for p in sorted(DRAFTS.glob("*.json")):
        d = load_json(p, None)
        if d and d.get("titulo"):
            pend.append((p.stem, d["titulo"], d.get("tentativa", 1)))
    body = ["O robô preparou resumos dos vídeos abaixo. Eles ainda NÃO estão no ar — só aparecem no site depois que você aprovar.", ""]
    if pend:
        body += ["| Vídeo | Versão | Ler antes de decidir |", "|---|---|---|"]
        body += [f"| {t} | {n}ª | [ler rascunho](https://github.com/{repo}/blob/main/data/boletins/_revisar/{v}.json) |" for v, t, n in pend]
        body += ["",
                 "Para colocar no ar: aba Actions → workflow boletim → Run workflow, com modo=revisar e acao=aprovar. No campo dos vídeos, deixe vazio para aprovar todos ou escreva os códigos (ex.: `4BNSnJhLBXI`).",
                 "Se não gostou e quer descartar: mesmo caminho, com acao=reprovar. O rascunho é apagado e nada vai ao ar.",
                 "Para pedir outra versão: modo=gerar, escreva o código do vídeo e diga o que mudar no campo de instrução (ex.: `mais curto`)."]
    text = "\n".join(body)
    if dry:
        print(text)
        return

    def gh(*a):
        return subprocess.run(["gh", *a], capture_output=True, text=True).stdout

    found = json.loads(gh("issue", "list", "--repo", repo, "--state", "open",
                           "--search", "Boletins aguardando revisão in:title", "--json", "number") or "[]")
    if pend:
        if found:
            subprocess.run(["gh", "issue", "edit", str(found[0]["number"]), "--repo", repo, "--body", text], check=True)
        else:
            subprocess.run(["gh", "issue", "create", "--repo", repo, "--title", "Boletins aguardando revisão", "--body", text], check=True)
    else:
        for i in found:
            subprocess.run(["gh", "issue", "close", str(i["number"]), "--repo", repo, "--comment", "Fila zerada: tudo revisado. Até a próxima leva!"], check=True)
    print(f"pendentes: {len(pend)}")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--limit", type=int, default=3, help="maximo de rascunhos por execucao")
    ap.add_argument("--ids", nargs="*", help="gera/regenera so estes ids")
    ap.add_argument("--instrucao", default="", help="pedido livre anexado ao prompt (ex.: 'mais curto')")
    ap.add_argument("--provider", default=os.environ.get("BOLETIM_PROVIDER", "ollama"), choices=["ollama", "api"])
    ap.add_argument("--model", default=os.environ.get("BOLETIM_MODEL", "qwen2.5:7b"))
    ap.add_argument("--dry-run", action="store_true", help="lista o que seria gerado, sem chamar LLM")
    ap.add_argument("--previa", metavar="ID", help="imprime rascunho/publicado formatado e sai")
    ap.add_argument("--revisar", choices=["aprovar", "reprovar"], help="aplica a decisão humana aos rascunhos e sai")
    ap.add_argument("--fila", metavar="REPO", nargs="?", const="rodolphoborges/euvimdesite", help="sincroniza a issue de revisão e sai")
    args = ap.parse_args()

    if args.previa:
        previa(args.previa)
        return
    if args.revisar:
        revisar(args.revisar, args.ids or [])
        return
    if args.fila:
        fila(args.fila, dry=args.dry_run)
        return

    videos = {v["id"]: v for v in load_json(VIDEOS, {"videos": []})["videos"]}
    state = load_json(STATE, {"fails": {}})
    state.setdefault("fails", {})
    published = {p.stem for p in OUT.glob("*.json")}
    drafted = {p.stem for p in DRAFTS.glob("*.json")}
    done = {p.stem for p in TRANSCRIPTS.glob("*.json")}

    def eligible(v):
        if args.ids:
            return v["id"] in args.ids
        if v["id"] in published or v["id"] in drafted or v["id"] not in done:
            return False
        if v.get("cat") == "shorts" or v.get("upcoming"):
            return False
        f = state["fails"].get(v["id"])
        return not (f and f["n"] >= MAX_FAILS)

    queue = [videos[i] for i in videos if eligible(videos[i])]
    print(f"fila: {len(queue)} com transcricao e sem boletim")
    if args.dry_run:
        for v in queue[: args.limit or len(queue)]:
            got = transcript_text(v["id"])
            print(f"  {v['id']} chars={len(got[0]) if got else 0}{' PARCIAL' if got and got[2] else ''} {v['title'][:60]}")
        return

    ok = 0
    for v in queue:
        if args.limit and ok >= args.limit:
            break
        print(f"-> {v['id']} {v['title'][:70]}")
        try:
            res = gerar_one(v, args, args.provider, args.model)
        except Exception as e:  # noqa: BLE001
            f = state["fails"].setdefault(v["id"], {"n": 0})
            f["n"] += 1
            f["err"] = str(e)[:200]
            print(f"  falhou ({f['n']}/{MAX_FAILS}): {str(e)[:160]}")
            continue
        if res is None:
            continue
        save_json(DRAFTS / f"{v['id']}.json", res)
        state["fails"].pop(v["id"], None)
        ok += 1
        print(f"  rascunho ok (tentativa {res['tentativa']})")
    state["lastRun"] = now_iso()
    save_json(STATE, state)
    print(f"concluido: +{ok} rascunhos em data/boletins/_revisar/ (nada publicado)")


if __name__ == "__main__":
    sys.exit(main())
