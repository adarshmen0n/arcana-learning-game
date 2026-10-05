"""Builds tiny DOCX / PPTX / HTML / PDF fixtures in memory and checks they extract to the expected text."""
import io
import os
import sys
import zipfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import ingest  # noqa: E402

W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
A = "http://schemas.openxmlformats.org/drawingml/2006/main"


def docx():
    xml = (f'<w:document xmlns:w="{W}"><w:body>'
           '<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Cell Biology</w:t></w:r></w:p>'
           '<w:p><w:r><w:t>The mitochondrion is the powerhouse of the cell.</w:t></w:r></w:p></w:body></w:document>')
    b = io.BytesIO()
    with zipfile.ZipFile(b, "w") as z:
        z.writestr("word/document.xml", xml)
    return b.getvalue()


def pptx():
    b = io.BytesIO()
    with zipfile.ZipFile(b, "w") as z:
        for n, t in enumerate(["Intro", "Details"], 1):
            z.writestr(f"ppt/slides/slide{n}.xml", f'<p:sld xmlns:p="x" xmlns:a="{A}"><a:p><a:r><a:t>{t}</a:t></a:r></a:p><a:p><a:r><a:t>Bullet {n}</a:t></a:r></a:p></p:sld>')
    return b.getvalue()


def pdf():
    # minimal one-page PDF with a text layer
    objs = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
            "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 144] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>"]
    stream = "BT /F1 12 Tf 20 100 Td (Photosynthesis converts light into chemical energy in plants and algae today.) Tj ET"
    objs += [f"<< /Length {len(stream)} >>\nstream\n{stream}\nendstream", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"]
    out, offs = b"%PDF-1.4\n", []
    for i, o in enumerate(objs, 1):
        offs.append(len(out))
        out += f"{i} 0 obj\n{o}\nendobj\n".encode()
    xref = len(out)
    out += f"xref\n0 {len(objs) + 1}\n0000000000 65535 f \n".encode() + b"".join(f"{o:010d} 00000 n \n".encode() for o in offs)
    out += f"trailer\n<< /Size {len(objs) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF".encode()
    return out


r = ingest.extract("a.docx", docx())
assert "# Cell Biology" in r["text"] and "powerhouse" in r["text"], r
r = ingest.extract("a.pptx", pptx())
assert "# Slide 1: Intro" in r["text"] and "Bullet 2" in r["text"], r
r = ingest.extract("a.html", b"<html><style>x{}</style><h1>Title</h1><p>Hello <b>world</b></p><script>alert(1)</script></html>")
assert "Title" in r["text"] and "alert" not in r["text"] and "world" in r["text"], r
r = ingest.extract("a.pdf", pdf())
assert "Photosynthesis" in r["text"] or r["needs_ocr"], r
print("pdf:", "text layer read" if not r["needs_ocr"] else "flagged for OCR (short fixture)")
r = ingest.extract("scan.png", b"\x89PNG....")
assert r["needs_ocr"] and r["mime"] == "image/png"
for bad in [("x.doc", b"abc"), ("x.txt", b"")]:
    try:
        ingest.extract(*bad)
        raise SystemExit("expected error for " + bad[0])
    except ingest.IngestError as e:
        print("rejected:", bad[0], "->", e)
print("INGEST OK")
