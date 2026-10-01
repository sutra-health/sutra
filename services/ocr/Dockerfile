FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 libglib2.0-0 libgomp1 \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app.py .
RUN mkdir -p /models/huggingface /work && chown -R 65532:65532 /models /work
ENV HF_HOME=/models/huggingface \
    PADDLE_PDX_MODEL_SOURCE=huggingface \
    OCR_MODEL_ID=PaddlePaddle/PaddleOCR-VL-1.6 \
    OCR_PIPELINE_VERSION=v1.6 \
    OCR_DEVICE=cpu
USER 65532:65532
EXPOSE 8001
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8001"]
