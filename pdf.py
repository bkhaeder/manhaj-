"""تحويل ملف Word إلى PDF باستخدام LibreOffice (مثبّت في صورة Docker)."""
import os
import shutil
import subprocess
import tempfile


def docx_to_pdf(docx_path: str) -> str:
    soffice = shutil.which("soffice") or shutil.which("libreoffice")
    if not soffice:
        raise RuntimeError("LibreOffice غير مثبت؛ لا يمكن إنشاء PDF")
    out_dir = os.path.dirname(os.path.abspath(docx_path))
    # ملف تعريف مؤقت حتى لا تتعارض عمليات تحويل متزامنة
    with tempfile.TemporaryDirectory() as profile:
        subprocess.run(
            [soffice, f"-env:UserInstallation=file://{profile}", "--headless", "--norestore",
             "--convert-to", "pdf", "--outdir", out_dir, docx_path],
            check=True, timeout=300, capture_output=True,
        )
    pdf_path = os.path.splitext(docx_path)[0] + ".pdf"
    if not os.path.exists(pdf_path):
        raise RuntimeError("فشل تحويل الملف إلى PDF")
    return pdf_path
