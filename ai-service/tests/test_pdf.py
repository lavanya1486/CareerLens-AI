import pytest

from app.errors import DocumentTooLargeError, InvalidDocumentError, UnsupportedDocumentError
from app.nlp.pdf import extract_pdf_text
from tests.conftest import make_encrypted_pdf, make_image_only_pdf, make_text_pdf

LIMITS = {"max_bytes": 5 * 1024 * 1024, "max_pages": 5, "max_chars": 40000}


def test_extracts_selectable_text_and_sections(resume_text):
    res = extract_pdf_text(make_text_pdf(resume_text), filename="cv.pdf", **LIMITS)
    assert res.page_count >= 1
    assert "Campus Library Management System" in res.text
    assert "EXPERIENCE" in res.text and "PROJECTS" in res.text


@pytest.mark.parametrize(
    ("data", "filename", "exc", "code"),
    [
        (b"", "a.pdf", InvalidDocumentError, "EMPTY_DOCUMENT"),
        (b"hello world, not a pdf at all", "a.pdf", UnsupportedDocumentError, "NOT_A_PDF"),
        (b"%PDF-1.7\n garbage garbage", "a.pdf", InvalidDocumentError, None),
        (b"%PDF-1.4 whatever", "resume.docx", UnsupportedDocumentError, None),
    ],
)
def test_rejects_invalid_documents(data, filename, exc, code):
    with pytest.raises(exc) as e:
        extract_pdf_text(data, filename=filename, **LIMITS)
    if code:
        assert e.value.code == code


def test_rejects_encrypted_pdf(resume_text):
    with pytest.raises(InvalidDocumentError) as e:
        extract_pdf_text(make_encrypted_pdf(resume_text), filename="a.pdf", **LIMITS)
    assert e.value.code == "ENCRYPTED_DOCUMENT"


def test_detects_image_only_pdf():
    with pytest.raises(InvalidDocumentError) as e:
        extract_pdf_text(make_image_only_pdf(), filename="scan.pdf", **LIMITS)
    assert e.value.code == "IMAGE_ONLY_DOCUMENT"
    assert "OCR" in e.value.message


def test_rejects_too_many_pages():
    with pytest.raises(DocumentTooLargeError) as e:
        extract_pdf_text(make_text_pdf("Some text line for page content", pages=8), filename="a.pdf", **LIMITS)
    assert e.value.code == "TOO_MANY_PAGES"


def test_rejects_oversized_file():
    with pytest.raises(DocumentTooLargeError):
        extract_pdf_text(b"%PDF-" + b"0" * 2048, filename="a.pdf", max_bytes=1024, max_pages=5, max_chars=1000)


def test_truncates_extremely_long_text(resume_text):
    res = extract_pdf_text(make_text_pdf(resume_text, pages=3), filename="a.pdf", max_bytes=LIMITS["max_bytes"],
                           max_pages=10, max_chars=1500)
    assert len(res.text) <= 1500
    assert any("truncated" in w for w in res.warnings)
