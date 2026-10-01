from __future__ import annotations

import os
import subprocess
import tempfile
from pathlib import Path
from typing import Any

from fastapi import FastAPI, File, Form, HTTPException, UploadFile

app = FastAPI(title="SUTRA doctor dictation STT", version="0.1.0")
MODEL_PATH = os.getenv("INDIC_CONFORMER_MODEL_PATH", "/models/indicconformer.nemo")
_model = None


def model():
    global _model
    if _model is None:
        if not Path(MODEL_PATH).is_file():
            raise RuntimeError("IndicConformer model is not mounted")
        from nemo.collections.asr.models import ASRModel

        _model = ASRModel.restore_from(MODEL_PATH, map_location="cpu")
        _model.eval()
    return _model


@app.get("/health")
def health() -> dict[str, Any]:
    return {"ok": Path(MODEL_PATH).is_file(), "engine": "AI4Bharat IndicConformer", "modelMounted": Path(MODEL_PATH).is_file()}


@app.post("/v1/transcribe")
async def transcribe(file: UploadFile = File(...), language: str = Form("hi")) -> dict[str, Any]:
    data = await file.read()
    if not data or len(data) > 25 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Audio is empty or exceeds 25 MiB")
    try:
        with tempfile.TemporaryDirectory(dir="/work") as directory:
            source = Path(directory) / "source"
            wav = Path(directory) / "audio.wav"
            source.write_bytes(data)
            subprocess.run(
                ["ffmpeg", "-nostdin", "-loglevel", "error", "-i", str(source), "-ac", "1", "-ar", "16000", str(wav)],
                check=True,
                timeout=60,
            )
            output = model().transcribe([str(wav)], batch_size=1)
            first = output[0]
            text = first.text if hasattr(first, "text") else str(first)
    except Exception as exc:
        raise HTTPException(status_code=503, detail="Local speech model is unavailable or transcription failed") from exc
    return {
        "engine": "AI4Bharat IndicConformer",
        "engineVersion": Path(MODEL_PATH).name,
        "language": language,
        "text": text,
        "segments": [],
        "draft": True,
    }
