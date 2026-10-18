import base64
import mimetypes
import os
import smtplib
from email.message import EmailMessage
from email.utils import formataddr
from html import escape
from pathlib import Path

import config

import requests

mimetypes.add_type("application/vnd.openxmlformats-officedocument.wordprocessingml.document", ".docx")


def send(to: str, subject: str, html: str, attachments: list[str] = ()):
    if config.MAIL_BACKEND == "brevo":
        _send_brevo(to, subject, _wrap(html), attachments)
    else:
        _send_smtp(to, subject, _wrap(html), attachments)


def _send_brevo(to, subject, html, attachments):
    body = {
        "sender": {"name": config.MAIL_FROM_NAME, "email": config.MAIL_FROM},
        "to": [{"email": to}],
        "subject": subject,
        "htmlContent": html,
    }
    if attachments:
        body["attachment"] = [{"name": os.path.basename(p), "content": base64.b64encode(Path(p).read_bytes()).decode()}
                              for p in attachments]
    resp = requests.post("https://api.brevo.com/v3/smtp/email", json=body, timeout=60,
                         headers={"api-key": config.BREVO_API_KEY, "accept": "application/json"})
    if resp.status_code >= 300:
        raise RuntimeError(f"Brevo {resp.status_code}: {resp.text[:300]}")


def _send_smtp(to, subject, html, attachments):
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = formataddr((config.MAIL_FROM_NAME, config.MAIL_FROM))
    msg["To"] = to
    msg.set_content("يرجى فتح هذه الرسالة في برنامج يدعم HTML.")
    msg.add_alternative(html, subtype="html")
    for path in attachments:
        maintype, subtype = (mimetypes.guess_type(path)[0] or "application/octet-stream").split("/")
        with open(path, "rb") as f:
            msg.add_attachment(f.read(), maintype=maintype, subtype=subtype, filename=os.path.basename(path))
    with smtplib.SMTP(config.SMTP_HOST, config.SMTP_PORT, timeout=60) as s:
        s.starttls()
        s.login(config.SMTP_USER, config.SMTP_PASSWORD)
        s.send_message(msg)


def _wrap(body: str) -> str:
    return f"""<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;background:#f4f1ea;padding:24px">
  <div style="max-width:620px;margin:auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e3ddd0">
    <div style="background:#1f3d36;color:#fff;padding:18px 24px;font-size:20px;font-weight:bold">منصة منهج</div>
    <div style="padding:24px;color:#222;line-height:1.9;font-size:15px">{body}</div>
  </div></div>"""


def _row(label, value):
    return (f'<tr><td style="padding:6px 10px;color:#666;white-space:nowrap">{label}</td>'
            f'<td style="padding:6px 10px">{escape(str(value))}</td></tr>')


def request_summary(r) -> str:
    lang = "العربية" if r["language"] == "ar" else "الإنجليزية"
    return ('<table style="border-collapse:collapse;width:100%;background:#faf8f3;border-radius:8px">'
            + _row("الطالب", r["student_name"]) + _row("البريد", r["email"])
            + _row("الجامعة", r["university"]) + _row("الكلية", r["college"])
            + _row("القسم", r["department"]) + _row("التخصص", r["specialization"])
            + _row("المشرف", r["supervisor"]) + _row("العنوان", r["title"])
            + _row("اللغة", lang) + _row("عدد الصفحات", r["pages"])
            + "</table>"
            + f'<p style="margin-top:14px"><b>تفاصيل الطالب:</b><br>{escape(r["details"]).replace(chr(10), "<br>")}</p>')


def _button(href, text, color):
    return (f'<a href="{href}" style="display:inline-block;background:{color};color:#fff;'
            f'text-decoration:none;padding:10px 26px;border-radius:8px;margin:4px;font-weight:bold">{text}</a>')


def notify_admin_new_request(r, approve_url, reject_url):
    body = (f"<p>وصل طلب بحث جديد رقم <b>#{r['id']}</b>:</p>" + request_summary(r)
            + '<p style="text-align:center;margin-top:22px">'
            + _button(approve_url, "موافقة ✓", "#2e7d4f") + _button(reject_url, "رفض ✗", "#b23b3b")
            + "</p>")
    send(config.ADMIN_EMAIL, f"طلب بحث جديد #{r['id']}: {r['title']}", body)


def notify_student_received(r):
    send(r["email"], "استلمنا طلبك - منصة منهج",
         f"<p>مرحباً {escape(r['student_name'])}،</p>"
         f"<p>استلمنا طلبك لبحث بعنوان <b>«{escape(r['title'])}»</b> (رقم الطلب #{r['id']}). "
         "سيُراجَع الطلب، وسيصلك إيميل بالنتيجة.</p>")


def send_research_to_student(r, paths: list[str]):
    send(r["email"], f"بحثك جاهز: {r['title']}",
         f"<p>مرحباً {escape(r['student_name'])}،</p>"
         f"<p>نرفق لك بحثك بعنوان <b>«{escape(r['title'])}»</b> بنسختين: "
         "<b>Word</b> (قابلة للتعديل) و<b>PDF</b> (جاهزة للطباعة).</p>"
         "<p>ننصحك بمراجعته جيداً، والتحقق من المصادر والمراجع قبل التسليم، "
         "وتعديله بما يناسب متطلبات قسمك ومشرفك.</p><p>بالتوفيق!</p>",
         attachments=paths)


def notify_student_rejected(r, reason: str):
    extra = f"<p><b>السبب:</b> {escape(reason)}</p>" if reason else ""
    send(r["email"], "بخصوص طلبك - منصة منهج",
         f"<p>مرحباً {escape(r['student_name'])}،</p>"
         f"<p>نعتذر، لم تتم الموافقة على طلبك رقم #{r['id']} بعنوان «{escape(r['title'])}».</p>{extra}")


def notify_admin_status(r, ok: bool, error: str = "", engines=()):
    if ok:
        body = (f"<p>✓ تم إنشاء البحث #{r['id']} «{escape(r['title'])}» وإرساله إلى {escape(r['email'])}.</p>"
                f"<p>المحركات المستخدمة: {escape('، '.join(engines))}</p>")
    else:
        body = (f"<p>✗ فشل إنشاء البحث #{r['id']} «{escape(r['title'])}».</p>"
                f"<pre dir='ltr' style='white-space:pre-wrap;background:#f6f6f6;padding:10px'>{escape(error)}</pre>"
                f"<p>يمكنك إعادة المحاولة من <a href='{config.BASE_URL}/admin'>لوحة التحكم</a>.</p>")
    send(config.ADMIN_EMAIL, f"{'تم الإرسال' if ok else 'فشل'}: طلب #{r['id']}", body)
