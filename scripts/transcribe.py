"""Robô de transcrição pt-BR.

Percorre o acervo (data/videos.json) do mais novo ao mais antigo e grava
data/transcripts/<id>.json no formato:
    {"id", "source", "lang", "created", "segments": [[inicio_em_segundos, "texto"], ...]}

Para cada vídeo:
  1. legendas do YouTube em português (manuais ou automáticas) — segundos, sem custo;
  2. sem legenda: baixa só o áudio e transcreve com faster-whisper (CPU, int8).

Respeita um orçamento de tempo (--max-minutes) para terminar antes do limite do
GitHub Actions. Se o YouTube bloquear (verificação anti-robô / 429), para sem
marcar falha no vídeo e tenta de novo na próxima execução.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import tempfile
import time
from datetime import datetime, timezone, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
VIDEOS = ROOT / "data" / "videos.json"
OUT = ROOT / "data" / "transcripts"
STATE = ROOT / "data" / "transcribe-state.json"

MAX_FAILS = 3
RETRY_AFTER = timedelta(days=7)
BLOCK_PATTERNS = re.compile(r"sign in to confirm|not a bot|http error 429|too many requests|rate.?limit", re.I)
PT_MANUAL = ("pt-BR", "pt", "pt-PT")
PT_AUTO = ("pt-orig", "pt", "pt-BR")


def now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def load_json(path: Path, default):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default


def save_json(path: Path, data, compact=True):
    path.parent.mkdir(parents=True, exist_ok=True)
    txt = json.dumps(data, ensure_ascii=False, separators=(",", ":")) if compact else json.dumps(data, ensure_ascii=False, indent=1)
    path.write_text(txt + "\n", encoding="utf-8")


class Blocked(Exception):
    pass


# ---------------------------------------------------------------- legendas

def words_from_json3(data: dict) -> list[tuple[float, str]]:
    """Extrai (tempo, trecho) do formato json3 do YouTube."""
    out = []
    for ev in data.get("events", []):
        segs = ev.get("segs")
        if not segs:
            continue
        t0 = ev.get("tStartMs", 0)
        for s in segs:
            txt = s.get("utf8", "")
            if not txt or txt == "\n":
                continue
            out.append(((t0 + s.get("tOffsetMs", 0)) / 1000.0, txt))
    return out


def group_segments(words: list[tuple[float, str]], max_secs=12.0, max_words=32, gap=1.6) -> list[list]:
    """Junta trechos curtos em frases legíveis com o horário de início."""
    segs, cur, start, last = [], [], None, None
    for t, w in words:
        w = re.sub(r"\s+", " ", w.replace("\n", " "))
        if not w.strip():
            continue
        n = sum(len(x.split()) for x in cur)
        if cur and (t - start >= max_secs or n >= max_words or (last is not None and t - last > gap)):
            segs.append([round(start, 1), clean("".join(cur))])
            cur, start = [], None
        if start is None:
            start = t
        # Legendas automáticas mandam " palavra" com espaço inicial (exceto a 1ª de cada
        # evento); manuais mandam linhas inteiras. Garante um espaço entre trechos.
        if cur and not cur[-1].endswith(" ") and not w.startswith(" "):
            w = " " + w
        cur.append(w)
        last = t
    if cur:
        segs.append([round(start, 1), clean("".join(cur))])
    return [s for s in segs if s[1]]


def clean(s: str) -> str:
    s = re.sub(r"\[(música|musica|aplausos|risos|music|applause|laughter)\]", "", s, flags=re.I)
    s = re.sub(r"\s+", " ", s).strip()
    s = re.sub(r"\s+([,.!?;:])", r"\1", s)
    return s


def pick_track(info: dict):
    subs = info.get("subtitles") or {}
    autos = info.get("automatic_captions") or {}
    for lang in PT_MANUAL:
        for f in subs.get(lang, []):
            if f.get("ext") == "json3":
                return "youtube-manual", f["url"]
    for lang in PT_AUTO:
        for f in autos.get(lang, []):
            if f.get("ext") == "json3":
                return "youtube-auto", f["url"]
    return None, None


# ---------------------------------------------------------------- whisper

_model = None


def whisper_transcribe(audio: Path, model_name: str) -> list[list]:
    global _model
    from faster_whisper import WhisperModel

    if _model is None:
        threads = os.cpu_count() or 4
        _model = WhisperModel(model_name, device="cpu", compute_type="int8", cpu_threads=threads)
    segments, _ = _model.transcribe(
        str(audio), language="pt", vad_filter=True, beam_size=1,
        condition_on_previous_text=False, vad_parameters={"min_silence_duration_ms": 700},
    )
    return [[round(s.start, 1), clean(s.text)] for s in segments if clean(s.text)]


# ---------------------------------------------------------------- principal

def ydl_opts(extra=None):
    o = {"quiet": True, "no_warnings": True, "noprogress": True, "retries": 3, "socket_timeout": 30,
         "extractor_args": {"youtube": {"lang": ["pt"]}}}
    if os.environ.get("YT_COOKIES_FILE"):
        o["cookiefile"] = os.environ["YT_COOKIES_FILE"]
    o.update(extra or {})
    return o


def transcribe_one(v: dict, args, deadline: float) -> dict | None:
    import yt_dlp
    from yt_dlp.utils import DownloadError

    url = f"https://www.youtube.com/watch?v={v['id']}"
    try:
        with yt_dlp.YoutubeDL(ydl_opts()) as ydl:
            info = ydl.extract_info(url, download=False)
            source, sub_url = (None, None) if args.force_whisper else pick_track(info)
            if sub_url:
                data = json.loads(ydl.urlopen(sub_url).read().decode("utf-8"))
                segs = group_segments(words_from_json3(data))
                if segs:
                    return {"id": v["id"], "source": source, "lang": "pt-BR", "created": now_iso(), "segments": segs}
        if args.no_whisper:
            return None
        dur = info.get("duration") or v.get("secs") or 0
        # estimativa conservadora: Whisper small/int8 em 4 vCPUs ≈ 3x tempo real
        if dur and time.time() + dur / 3 + 120 > deadline:
            print(f"  adiado: {dur // 60} min de áudio não cabem no tempo restante")
            return "defer"
        with tempfile.TemporaryDirectory() as tmp:
            with yt_dlp.YoutubeDL(ydl_opts({"format": "bestaudio[ext=m4a]/bestaudio/best",
                                            "outtmpl": os.path.join(tmp, "%(id)s.%(ext)s")})) as ydl:
                ydl.download([url])
            files = list(Path(tmp).iterdir())
            if not files:
                raise RuntimeError("áudio não baixado")
            segs = whisper_transcribe(files[0], args.model)
        if not segs:
            raise RuntimeError("whisper não reconheceu fala")
        return {"id": v["id"], "source": f"whisper-{args.model}", "lang": "pt-BR", "created": now_iso(), "segments": segs}
    except DownloadError as e:
        msg = str(e)
        if BLOCK_PATTERNS.search(msg):
            raise Blocked(msg) from e
        raise


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--limit", type=int, default=0, help="máximo de vídeos nesta execução (0 = sem limite)")
    ap.add_argument("--max-minutes", type=float, default=300, help="orçamento de tempo da execução")
    ap.add_argument("--model", default=os.environ.get("WHISPER_MODEL", "small"))
    ap.add_argument("--force-whisper", action="store_true", help="ignora legendas do YouTube")
    ap.add_argument("--no-whisper", action="store_true", help="usa só legendas do YouTube")
    ap.add_argument("--ids", nargs="*", help="transcreve só estes ids")
    args = ap.parse_args()

    deadline = time.time() + args.max_minutes * 60
    videos = load_json(VIDEOS, {"videos": []})["videos"]
    state = load_json(STATE, {"fails": {}})
    state.setdefault("fails", {})
    OUT.mkdir(parents=True, exist_ok=True)
    done = {p.stem for p in OUT.glob("*.json")}

    def eligible(v):
        if args.ids:
            return v["id"] in args.ids
        if v["id"] in done or v.get("cat") == "shorts" or v.get("upcoming"):
            return False
        f = state["fails"].get(v["id"])
        if f and f["n"] >= MAX_FAILS and datetime.now(timezone.utc) - datetime.fromisoformat(f["last"].replace("Z", "+00:00")) < RETRY_AFTER:
            return False
        return True

    queue = [v for v in videos if eligible(v)]
    print(f"fila: {len(queue)} vídeos sem transcrição · já transcritos: {len(done)}")
    ok = 0
    for v in queue:
        if args.limit and ok >= args.limit:
            break
        if time.time() > deadline - 60:
            print("orçamento de tempo esgotado")
            break
        print(f"→ {v['id']} {v['title'][:70]}")
        t0 = time.time()
        try:
            res = transcribe_one(v, args, deadline)
        except Blocked as e:
            print(f"  YouTube bloqueou o acesso, encerrando: {str(e)[:160]}")
            state["blockedAt"] = now_iso()
            break
        except Exception as e:  # noqa: BLE001
            f = state["fails"].setdefault(v["id"], {"n": 0})
            f["n"] += 1
            f["last"] = now_iso()
            f["err"] = str(e)[:200]
            print(f"  falhou ({f['n']}/{MAX_FAILS}): {str(e)[:160]}")
            continue
        if res == "defer" or res is None:
            continue
        save_json(OUT / f"{v['id']}.json", res)
        state["fails"].pop(v["id"], None)
        state.pop("blockedAt", None)
        ok += 1
        print(f"  ok: {res['source']}, {len(res['segments'])} trechos em {time.time() - t0:.0f}s")

    state["lastRun"] = now_iso()
    state["transcribed"] = len(done) + ok
    save_json(STATE, state, compact=False)
    print(f"concluído: +{ok} transcrições")


if __name__ == "__main__":
    sys.exit(main())
