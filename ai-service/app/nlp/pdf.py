"""Safe PDF text extraction (selectable text only - no OCR)."""

from __future__ import annotations

import io
import logging
from dataclasses import dataclass, field

from pypdf import PdfReader
from pypdf.errors import DependencyError, FileNotDecryptedError, PdfReadError, PdfStreamError

from app.errors import DocumentTooLargeError, InvalidDocumentError, UnsupportedDocumentError
from app.nlp.text import normalize_text

log = logging.getLogger(__name__)

PDF_MAGIC = b"%PDF-"
MIN_TEXT_CHARS = 80
MIN_CHARS_PER_PAGE = 25


@dataclass
class PdfExtraction:
    text: str
    page_count: int
    warnings: list[str] = field(default_factory=list)


def _page_has_images(page) -> bool:  # type: ignore[no-untyped-def]
    try:
        resources = page.get("/Resources") or {}
        xobjects = resources.get("/XObject") if hasattr(resources, "get") else None
        if not xobjects:
            return False
        for obj in xobjects.get_object().values():
            if obj.get_object().get("/Subtype") == "/Image":
                return True
    except Exception:  # noqa: BLE001 - image detection is best-effort only
        return False
    return False


def extract_pdf_text(data: bytes, *, filename: str | None, max_bytes: int, max_pages: int, max_chars: int) -> PdfExtraction:
    """Validate and extract text from a PDF.

    Raises domain errors with user-facing messages for every rejection reason.
    """
    if filename is not None and not filename.lower().endswith(".pdf"):
        raise UnsupportedDocumentError("Only PDF files (.pdf) are supported. You can also paste your resume text instead.")
    if not data:
        raise InvalidDocumentError("The uploaded file is empty.", code="EMPTY_DOCUMENT")
    if len(data) > max_bytes:
        raise DocumentTooLargeError(f"The PDF exceeds the {max_bytes // (1024 * 1024)} MB upload limit.")
    if not data.lstrip()[:1024].startswith(PDF_MAGIC) and PDF_MAGIC not in data[:1024]:
        raise UnsupportedDocumentError(
            "The file is not a valid PDF (its content does not match the PDF format).", code="NOT_A_PDF"
        )

    try:
        reader = PdfReader(io.BytesIO(data), strict=False)
        if reader.is_encrypted:
            try:
                if reader.decrypt("") == 0:
                    raise FileNotDecryptedError("password required")
            except (FileNotDecryptedError, DependencyError, NotImplementedError) as exc:
                raise InvalidDocumentError(
                    "This PDF is password-protected or encrypted. Remove the protection and upload it again, "
                    "or paste the resume text manually.",
                    code="ENCRYPTED_DOCUMENT",
                ) from exc
        page_count = len(reader.pages)
    except InvalidDocumentError:
        raise
    except (PdfReadError, PdfStreamError, ValueError, KeyError, TypeError, OSError) as exc:
        log.info("pdf_rejected reason=malformed error_type=%s", type(exc).__name__)
        raise InvalidDocumentError(
            "The PDF could not be read. It may be damaged or malformed. Try re-exporting it, or paste the text manually.",
            code="MALFORMED_DOCUMENT",
        ) from exc

    if page_count == 0:
        raise InvalidDocumentError("The PDF does not contain any pages.", code="EMPTY_DOCUMENT")
    if page_count > max_pages:
        raise DocumentTooLargeError(
            f"The PDF has {page_count} pages; resumes longer than {max_pages} pages are not supported.",
            code="TOO_MANY_PAGES",
        )

    warnings: list[str] = []
    page_texts: list[str] = []
    empty_pages = 0
    image_pages = 0
    total_chars = 0
    for idx, page in enumerate(reader.pages):
        try:
            txt = page.extract_text() or ""
        except Exception as exc:  # noqa: BLE001 - pypdf raises many internal error types
            log.info("pdf_page_extraction_failed page=%d error_type=%s", idx + 1, type(exc).__name__)
            txt = ""
            warnings.append(f"Text on page {idx + 1} could not be extracted.")
        txt = normalize_text(txt)
        if len(txt) < MIN_CHARS_PER_PAGE:
            empty_pages += 1
            if _page_has_images(page):
                image_pages += 1
        page_texts.append(txt)
        total_chars += len(txt)
        if total_chars > max_chars:
            warnings.append(f"The extracted text was truncated to {max_chars:,} characters.")
            break

    text = normalize_text("\n\n".join(t for t in page_texts if t))
    if len(text) > max_chars:
        text = text[:max_chars]

    if len(text) < MIN_TEXT_CHARS:
        if image_pages:
            raise InvalidDocumentError(
                "This PDF appears to be scanned or image-only, so it has no selectable text. OCR is not available in "
                "CareerLens; please upload a text-based PDF (exported from Word/Google Docs/LaTeX) or paste the text.",
                code="IMAGE_ONLY_DOCUMENT",
            )
        raise InvalidDocumentError(
            "No readable text was found in this PDF. Upload a text-based PDF or paste the resume text manually.",
            code="NO_TEXT_FOUND",
        )
    if empty_pages:
        warnings.append(
            f"{empty_pages} page(s) contained little or no selectable text"
            + (" (likely images; OCR is not available)." if image_pages else ".")
        )
    return PdfExtraction(text=text, page_count=page_count, warnings=warnings)
