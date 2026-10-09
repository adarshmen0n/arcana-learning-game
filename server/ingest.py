"""Turn an uploaded file into plain study text. PDF, DOCX, PPTX, TXT/MD/HTML/CSV; images and scanned PDFs are flagged for AI transcription."""
import io
import re
import zipfile
import xml.etree.ElementTree as ET
from html.parser import HTMLParser

MAX_CHARS = 600_000          # ~150k tokens; longer files are cut and the user is told
MAX_BYTES = 25 * 1024 * 1024
IMAGE_EXT = {"png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg", "webp": "image/webp", "gif": "image/gif"}


class IngestError(Exception):
    pass


class _Strip(HTMLParser):
    def __init__(self):
        super().__init__()
        self.out, self.skip = [], 0

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style"):
            self.skip += 1
        if tag in ("h1", "h2", "h3"):
            self.out.append("\n\n# ")
        elif tag in ("p", "div", "br", "li", "tr"):
            self.out.append("\n")

    def handle_endtag(self, tag):
        if tag in ("script", "style") and self.skip:
            self.skip -= 1

    def handle_data(self, data):
        if not self.skip:
            self.out.append(data)


def _clean(text: str) -> str:
    text = text.replace("\r\n", "\n").replace("\r", "\n").replace("\x00", "")
    text = re.sub(r"[ \t ]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def _docx(data: bytes) -> str:
    ns = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        root = ET.fromstring(z.read("word/document.xml"))
    out = []
    for p in root.iter("{%s}p" % ns["w"]):
        style = p.find("w:pPr/w:pStyle", ns)
        txt = "".join(t.text or "" for t in p.iter("{%s}t" % ns["w"]))
        if not txt.strip():
            continue
        if style is not None and str(style.get("{%s}val" % ns["w"], "")).lower().startswith(("heading", "title")):
            out.append("\n# " + txt)
        else:
            out.append(txt)
    return "\n".join(out)


def _pptx(data: bytes) -> str:
    a = "{http://schemas.openxmlformats.org/drawingml/2006/main}"
    out = []
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        slides = sorted((n for n in z.namelist() if re.match(r"ppt/slides/slide\d+\.xml$", n)), key=lambda n: int(re.findall(r"\d+", n)[-1]))
        for i, name in enumerate(slides, 1):
            root = ET.fromstring(z.read(name))
            lines = ["".join(t.text or "" for t in p.iter(a + "t")) for p in root.iter(a + "p")]
            lines = [l for l in lines if l.strip()]
            if lines:
                out.append(f"\n# Slide {i}: {lines[0]}\n" + "\n".join(lines[1:]))
    return "\n".join(out)


def _pdf(data: bytes) -> tuple[str, int]:
    try:
        from pypdf import PdfReader
    except ImportError as e:  # pragma: no cover
        raise IngestError("PDF support needs the 'pypdf' package (pip install pypdf).") from e
    try:
        reader = PdfReader(io.BytesIO(data))
        if reader.is_encrypted:
            try:
                reader.decrypt("")
            except Exception:
                raise IngestError("This PDF is password protected. Remove the password and upload again.")
        pages = [(p.extract_text() or "") for p in reader.pages]
    except IngestError:
        raise
    except Exception as e:
        raise IngestError(f"Could not read this PDF ({type(e).__name__}).") from e
    return "\n\n".join(pages), len(pages)


def extract(filename: str, data: bytes) -> dict:
    """Return {text, kind, pages, needs_ocr, truncated, mime}. Raises IngestError with a user-readable message."""
    if len(data) > MAX_BYTES:
        raise IngestError("File is larger than 25 MB.")
    if not data:
        raise IngestError("The file is empty.")
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    info = {"kind": ext or "text", "pages": None, "needs_ocr": False, "truncated": False, "mime": None}
    if ext in IMAGE_EXT:
        info.update(text="", needs_ocr=True, mime=IMAGE_EXT[ext], kind="image")
        return info
    if ext == "pdf":
        text, pages = _pdf(data)
        info["pages"] = pages
        if len(text.split()) < 120 and len(text.strip()) < 40 * max(1, pages):   # almost no text layer: scanned PDF (slides with some text still count as text)
            info.update(text="", needs_ocr=True, mime="application/pdf")
            return info
    elif ext == "docx":
        try:
            text = _docx(data)
        except Exception as e:
            raise IngestError("Could not read this .docx file.") from e
    elif ext == "pptx":
        try:
            text = _pptx(data)
        except Exception as e:
            raise IngestError("Could not read this .pptx file.") from e
    elif ext in ("doc", "ppt", "xls", "xlsx", "odt", "rtf"):
        raise IngestError(f".{ext} is not supported yet. Save it as PDF, DOCX or TXT and upload again.")
    else:
        raw = data.decode("utf-8", errors="ignore")
        if ext in ("html", "htm"):
            p = _Strip()
            p.feed(raw)
            raw = "".join(p.out)
        text = raw
    text = _clean(text)
    if len(text) > MAX_CHARS:
        text, info["truncated"] = text[:MAX_CHARS], True
    info["text"] = text
    return info
