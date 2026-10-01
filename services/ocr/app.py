from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path
from threading import Lock
from typing import Any

from fastapi import FastAPI, File, HTTPException, UploadFile

app = FastAPI(title="SUTRA source-preserving OCR", version="0.2.0")
MODEL_ID = os.getenv("OCR_MODEL_ID", "PaddlePaddle/PaddleOCR-VL-1.6")
PIPELINE_VERSION = os.getenv("OCR_PIPELINE_VERSION", "v1.6")
DEVICE = os.getenv("OCR_DEVICE", "cpu")
_pipeline = None
_pipeline_lock = Lock()


def pipeline():
    global _pipeline
    if _pipeline is None:
        with _pipeline_lock:
            if _pipeline is None:
                from paddleocr import PaddleOCRVL

                _pipeline = PaddleOCRVL(
                    pipeline_version=PIPELINE_VERSION,
                    device=DEVICE,
                    use_doc_orientation_classify=True,
                    use_doc_unwarping=True,
                    use_layout_detection=True,
                )
    return _pipeline


def json_default(value: Any):
    if hasattr(value, "tolist"):
        return value.tolist()
    if hasattr(value, "item"):
        return value.item()
    return str(value)


def result_payload(result: Any) -> dict[str, Any]:
    raw = getattr(result, "json", None)
    if callable(raw):
        raw = raw()
    if isinstance(raw, str):
        raw = json.loads(raw)
    if raw is None:
        raw = {"unparsed": str(result)}
    return json.loads(json.dumps(raw, default=json_default))


def page_view(raw: dict[str, Any], index: int) -> dict[str, Any]:
    result = raw.get("res", raw)
    layout = result.get("layout_det_res") or {}
    boxes = layout.get("boxes") or []
    parsing = result.get("parsing_res_list") or result.get("blocks") or []
    markdown = result.get("markdown") or result.get("markdown_text") or ""
    return {
        "page": (result.get("page_index") if result.get("page_index") is not None else index) + 1,
        "boxes": boxes,
        "blocks": parsing,
        "markdown": markdown,
        "structured": result,
    }


@app.get("/health")
def health() -> dict[str, Any]:
    return {
        "ok": True,
        "engine": "PaddleOCR-VL full document pipeline",
        "model": MODEL_ID,
        "pipelineVersion": PIPELINE_VERSION,
        "device": DEVICE,
        "modelLoaded": _pipeline is not None,
        "modelSource": os.getenv("PADDLE_PDX_MODEL_SOURCE", "huggingface"),
    }


@app.post("/v1/extract")
async def extract(file: UploadFile = File(...)) -> dict[str, Any]:
    data = await file.read()
    if not data or len(data) > 25 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="File is empty or exceeds 25 MiB")
    suffix = Path(file.filename or "document").suffix.lower()
    if suffix not in {".pdf", ".png", ".jpg", ".jpeg", ".webp", ".tif", ".tiff"}:
        raise HTTPException(status_code=415, detail="Supported types: PDF, PNG, JPEG, WEBP and TIFF")
    try:
        with tempfile.TemporaryDirectory(dir="/work") as directory:
            source = Path(directory) / f"input{suffix}"
            source.write_bytes(data)
            pages = [page_view(result_payload(item), index) for index, item in enumerate(pipeline().predict(str(source)))]
    except Exception as exc:
        raise HTTPException(status_code=503, detail="PaddleOCR-VL extraction failed; original remains preserved for retry") from exc
    return {
        "engine": "PaddleOCR-VL full document pipeline",
        "engineVersion": PIPELINE_VERSION,
        "model": MODEL_ID,
        "language": "multilingual",
        "pages": pages,
        "draft": True,
    }
