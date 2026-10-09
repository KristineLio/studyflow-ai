"""PDF/DOCX/TXT extraction; refuse unreadable/scanned documents honestly."""
from __future__ import annotations

from io import BytesIO
from pathlib import Path

from fastapi import HTTPException

MAX_FILE_BYTES = 12 * 1024 * 1024
MAX_TEXT_CHARS = 110_000
ALLOWED_SUFFIXES = {".pdf", ".docx", ".txt"}


def extract_text(filename: str, data: bytes) -> str:
    suffix = Path(filename).suffix.lower()
    if suffix not in ALLOWED_SUFFIXES:
        raise HTTPException(415, "Only PDF, DOCX, and TXT files are supported")
    if not data:
        raise HTTPException(400, "The file is empty")
    if len(data) > MAX_FILE_BYTES:
        raise HTTPException(413, "Maximum file size is 12 MB")
    try:
        if suffix == ".txt":
            text = data.decode("utf-8-sig")
        elif suffix == ".docx":
            from docx import Document
            doc = Document(BytesIO(data))
            paragraphs = [p.text for p in doc.paragraphs]
            for table in doc.tables:
                for row in table.rows:
                    paragraphs.append(" | ".join(cell.text for cell in row.cells))
            text = "\n".join(paragraphs)
        else:
            import fitz
            with fitz.open(stream=data, filetype="pdf") as pdf:
                if pdf.page_count > 120:
                    raise HTTPException(413, "Maximum PDF length is 120 pages")
                text = "\n\n".join(
                    f"[Page {i+1}]\n{page.get_text(sort=True)}"
                    for i, page in enumerate(pdf)
                )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(422, f"Unable to extract this document: {type(e).__name__}") from e
    text = text.strip()
    if len(text) < 40:
        raise HTTPException(422, "Not enough selectable text. Scanned/image PDFs need OCR first.")
    return text[:MAX_TEXT_CHARS]