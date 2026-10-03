"""Tradutor incremental pt -> en/es via LM Studio local (OpenAI-compativel).

Cobre: titulos+descricoes (data/i18n/<lang>/videos.json {id:{t,d}}),
boletins publicados, notas de canais e marketing dos patrocinadores.
Transcricoes (sidecars data/i18n/<lang>/transcripts/<id>.json) sao
opt-in via --jobs por serem longas. So traduz o que mudou (hash md5) e
retoma de onde parou (data/i18n-state.json). Sem dependencias.

Uso:  TRADUTOR_URL=http://100.109.136.12:1234/v1 TRADUTOR_MODEL=qwen/qwen3-8b
      python scripts/traduzir.py --lang en --limit 50 [--jobs videos,boletins] [--dry-run]
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
VIDEOS = ROOT / "data" / "videos.json"
TRANSCRIPTS = ROOT / "data" / "transcripts"
BOLETINS = ROOT / "data" / "boletins"
CONFIG = ROOT / "config"
OUT = ROOT / "data" / "i18n"
STATE = ROOT / "data" / "i18n-state.json"

URL = os.environ.get("TRADUTOR_URL", "http://100.109.136.12:1234/v1")
MODEL = os.environ.get("TRADUTOR_MODEL", "qwen/qwen3-8b")
TIMEOUT = int(os.environ.get("TRADUTOR_TIMEOUT", "300"))
LANGNOME = {"en": "English", "es": "español"}
MAX_FAILS = 3


def load_json(path: Path, default):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default


def save_json(path: Path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")


def h(*parts: str) -> str:
    return hashlib.md5("\n".join(parts).encode("utf-8")).hexdigest()[:12]


def chat(system: str, user: str) -> str:
    import re as _re

    payload = {"model": MODEL, "temperature": 0.2,
               "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}]}
    req = urllib.request.Request(f"{URL}/chat/completions", data=json.dumps(payload).encode(),
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
        raw = json.loads(r.read())["choices"][0]["message"]["content"]
    t = _re.sub(r"<think>.*?</think>", "", raw, flags=_re.S | _re.I).strip()
    if t.startswith("```"):
        t = t.split("\n", 1)[1].rsplit("```", 1)[0]
    return t.strip()


BASE_SYS = ("You translate Brazilian football content (Santos FC, channel 'Eu Vim de Santos') "
            "from Portuguese to {lang}. Keep proper nouns (Santos FC, Felipe Noronha, Eu Vim de Santos, "
            "player names, Morumbi, Vila Belmiro), @handles, URLs, emojis, #hashtags and "
            "{{placeholders}} untouched. Never invent facts. Return ONLY valid JSON.")


def tr_video(v: dict, lang: str) -> dict:
    d = json.loads(chat(BASE_SYS.format(lang=LANGNOME[lang]) + ' JSON exato: {"t": titulo, "d": descricao}.',
                        json.dumps({"t": v["title"], "d": (v.get("desc") or "")[:600]}, ensure_ascii=False)))
    if not isinstance(d.get("t"), str) or not d["t"].strip():
        raise ValueError("titulo vazio")
    return {"t": d["t"], "d": d.get("d", "")}


def tr_boletim(b: dict, lang: str) -> dict:
    d = json.loads(chat(BASE_SYS.format(lang=LANGNOME[lang]) + ' JSON exato: {"titulo": str, "lead": str, "pontos": [str]}.',
                        json.dumps({"titulo": b["titulo"], "lead": b["lead"], "pontos": b["pontos"]}, ensure_ascii=False)))
    if not (isinstance(d.get("pontos"), list) and len(d["pontos"]) == len(b["pontos"])):
        raise ValueError("pontos divergentes")
    return {"titulo": d["titulo"], "lead": d["lead"], "pontos": d["pontos"]}


def tr_chunks(segs: list, lang: str, n: int = 30) -> list:
    out = []
    for i in range(0, len(segs), n):
        bloco = [{"t": s[0], "x": s[1]} for s in segs[i:i + n]]
        d = json.loads(chat(BASE_SYS.format(lang=LANGNOME[lang]) + ' Traduza os "x" mantendo os "t". JSON exato: {"segs": [{"t": num, "x": str}]}.',
                            json.dumps({"segs": bloco}, ensure_ascii=False)))
        conv = [[s["t"], s["x"]] for s in d["segs"]]
        if len(conv) != len(bloco):
            raise ValueError(f"bloco {i}: {len(conv)} != {len(bloco)}")
        out.extend(conv)
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--lang", required=True, choices=["en", "es"])
    ap.add_argument("--limit", type=int, default=50)
    ap.add_argument("--jobs", default="videos,boletins,canais,sponsors",
                    help="videos,transcripts,boletins,canais,sponsors")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    lang, jobs = args.lang, set(args.jobs.split(","))
    state = load_json(STATE, {})
    st = state.setdefault(lang, {"videos": {}, "tx": [], "bol": [], "fails": {}})
    st.setdefault("fails", {})

    def fail(key: str, e: Exception):
        f = st["fails"].setdefault(key, {"n": 0})
        f["n"] += 1
        f["err"] = str(e)[:160]
        print(f"  falhou ({f['n']}/{MAX_FAILS}): {str(e)[:140]}")

    videos = load_json(VIDEOS, {"videos": []})["videos"]
    ok = {"videos": 0, "transcripts": 0, "boletins": 0}

    if "videos" in jobs:
        dest = load_json(OUT / lang / "videos.json", {})
        for v in videos:
            if args.limit and ok["videos"] >= args.limit:
                break
            key = f"v:{v['id']}"
            if st["videos"].get(v["id"]) == h(v["title"], v.get("desc") or "") or st["fails"].get(key, {}).get("n", 0) >= MAX_FAILS:
                continue
            if args.dry_run:
                print(f"  traduziria {v['id']} {v['title'][:60]}")
                ok["videos"] += 1
                continue
            print(f"-> {v['id']} {v['title'][:60]}")
            try:
                t = tr_video(v, lang)
            except Exception as e:  # noqa: BLE001
                fail(key, e)
                continue
            dest[v["id"]] = {**t, "h": h(v["title"], v.get("desc") or "")}
            st["videos"][v["id"]] = dest[v["id"]]["h"]
            st["fails"].pop(key, None)
            ok["videos"] += 1
        if not args.dry_run and ok["videos"]:
            save_json(OUT / lang / "videos.json", dest)

    if "transcripts" in jobs:
        for p in sorted(TRANSCRIPTS.glob("*.json")):
            if args.limit and ok["transcripts"] >= args.limit:
                break
            d = load_json(p, None)
            if not d or not d.get("segments") or p.stem in st["tx"]:
                continue
            if args.dry_run:
                print(f"  traduziria transcricao {p.stem} ({len(d['segments'])} trechos)")
                ok["transcripts"] += 1
                continue
            print(f"-> transcricao {p.stem} ({len(d['segments'])} trechos)")
            try:
                segs = tr_chunks(d.get("segments_fix") or d["segments"], lang)
            except Exception as e:  # noqa: BLE001
                fail(f"t:{p.stem}", e)
                continue
            save_json(OUT / lang / "transcripts" / f"{p.stem}.json", {"segments": segs})
            st["tx"].append(p.stem)
            ok["transcripts"] += 1

    if "boletins" in jobs:
        for p in sorted(BOLETINS.glob("*.json")):
            if args.limit and ok["boletins"] >= args.limit:
                break
            if p.stem in st["bol"]:
                continue
            b = load_json(p, None)
            if not b or not b.get("titulo"):
                continue
            if args.dry_run:
                print(f"  traduziria boletim {p.stem}")
                ok["boletins"] += 1
                continue
            print(f"-> boletim {p.stem}")
            try:
                t = tr_boletim(b, lang)
            except Exception as e:  # noqa: BLE001
                fail(f"b:{p.stem}", e)
                continue
            save_json(OUT / lang / "boletins" / f"{p.stem}.json", t)
            st["bol"].append(p.stem)
            ok["boletins"] += 1

    if "canais" in jobs:
        canais = load_json(CONFIG / "canais.json", {"canais": []})["canais"]
        com_nota = {c["handle"]: c["nota"] for c in canais if c.get("nota")}
        hh = h(json.dumps(com_nota, sort_keys=True))
        if com_nota and st.get("canais_done") != hh and not args.dry_run:
            d = json.loads(chat(BASE_SYS.format(lang=LANGNOME[lang]) + " JSON exato: {\"notas\": {handle: texto}}.",
                                json.dumps({"notas": com_nota}, ensure_ascii=False)))
            save_json(OUT / lang / "canais.json", d.get("notas", {}))
            st["canais_done"] = hh
            print(f"canais: {len(com_nota)} notas")
        elif args.dry_run:
            print(f"  traduziria {len(com_nota)} notas de canais")

    if "sponsors" in jobs:
        cfg = load_json(CONFIG / "patrocinadores.json", {"patrocinadores": []})["patrocinadores"]
        campos = {p["nome"]: {k: p.get(k, "") for k in ("chamada", "descricao", "botao")} for p in cfg if p.get("nome")}
        hh = h(json.dumps(campos, sort_keys=True))
        if campos and st.get("sponsors_done") != hh and not args.dry_run:
            d = json.loads(chat(BASE_SYS.format(lang=LANGNOME[lang]) + " JSON exato: {\"itens\": {nome: {chamada, descricao, botao}}}. Mantenha cupons e nomes de marca.",
                                json.dumps({"itens": campos}, ensure_ascii=False)))
            save_json(OUT / lang / "patrocinadores.json", d.get("itens", {}))
            st["sponsors_done"] = hh
            print(f"sponsors: {len(campos)} itens")
        elif args.dry_run:
            print(f"  traduziria {len(campos)} patrocinadores")

    save_json(STATE, state)
    print(f"concluído videos={ok['videos']} tx={ok['transcripts']} bol={ok['boletins']}")


if __name__ == "__main__":
    sys.exit(main())
