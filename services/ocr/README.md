# OCR service

This service runs the complete PaddleOCR-VL 1.6 document pipeline locally. Its models are pulled from Hugging Face by default (`PADDLE_PDX_MODEL_SOURCE=huggingface`), and the configured model identity is `PaddlePaddle/PaddleOCR-VL-1.6` (Apache-2.0).

The full pipeline is intentional: layout detection, orientation/unwarping and VLM recognition are required for photographed slips, reports, tables and mixed Hindi/English pages. Directly calling only the VLM weights is not equivalent.

Model output is always stored as a derived draft. The original page remains authoritative and must appear beside extracted blocks in the review UI. SUTRA does not infer diagnosis, treatment readiness or abnormal laboratory values from OCR.

For an offline hospital, pre-warm the `ocr-models` volume on a connected staging host, export it, scan it and import it inside the boundary. Pin the image digest and model revision before a pilot.
