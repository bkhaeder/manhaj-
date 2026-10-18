import logging
import os
import re
import threading
from functools import wraps

from flask import Flask, Response, abort, flash, redirect, render_template, request, url_for
from itsdangerous import BadSignature, URLSafeSerializer

import config
import db
import mailer

app = Flask(__name__)
app.secret_key = config.SECRET_KEY
signer = URLSafeSerializer(config.SECRET_KEY, salt="review")
log = logging.getLogger("manhaj")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
TEXT_FIELDS = {  # الحقل: (الاسم المعروض، أقصى طول)
    "student_name": ("الاسم", 120), "university": ("الجامعة", 150), "college": ("الكلية", 150),
    "department": ("القسم", 150), "specialization": ("التخصص", 150), "supervisor": ("المشرف", 120),
    "title": ("عنوان البحث", 300), "details": ("تفاصيل البحث", 2000), "email": ("البريد الإلكتروني", 200),
}

db.init()


# ---------------- واجهة الطالب ----------------
@app.get("/")
def index():
    return render_template("index.html", form={}, min_pages=config.MIN_PAGES, max_pages=config.MAX_PAGES)


@app.post("/submit")
def submit():
    form = {k: (request.form.get(k) or "").strip() for k in (*TEXT_FIELDS, "language", "pages")}
    errors = []
    for key, (label, max_len) in TEXT_FIELDS.items():
        if not form[key]:
            errors.append(f"حقل «{label}» مطلوب.")
        elif len(form[key]) > max_len:
            errors.append(f"حقل «{label}» أطول من المسموح.")
    if form["email"] and not EMAIL_RE.match(form["email"]):
        errors.append("البريد الإلكتروني غير صحيح.")
    if form["language"] not in ("ar", "en"):
        errors.append("اختر لغة البحث.")
    try:
        pages = int(form["pages"])
        if not config.MIN_PAGES <= pages <= config.MAX_PAGES:
            raise ValueError
    except ValueError:
        errors.append(f"عدد الصفحات يجب أن يكون بين {config.MIN_PAGES} و{config.MAX_PAGES}.")
    if errors:
        return render_template("index.html", form=form, errors=errors,
                               min_pages=config.MIN_PAGES, max_pages=config.MAX_PAGES), 400

    form["pages"] = pages
    req_id = db.create(form)
    r = db.get(req_id)
    try:
        mailer.notify_admin_new_request(r, review_url(req_id, "approve"), review_url(req_id, "reject"))
        mailer.notify_student_received(r)
    except Exception:
        log.exception("تعذر إرسال إيميل الطلب #%s", req_id)
    return render_template("message.html", title="تم استلام طلبك ✓",
                           body=f"رقم طلبك #{req_id}. سيصلك إيميل على {r['email']} بعد مراجعة الطلب.")


# ---------------- مراجعة المدير (من رابط الإيميل) ----------------
def review_url(req_id, action):
    # الرابط يحمل بيانات الطلب موقّعة، فيعمل حتى لو مُسحت قاعدة البيانات (الاستضافة المجانية لا تحفظ الملفات)
    r = db.get(req_id)
    token = signer.dumps({"id": req_id, "a": action, "d": {f: r[f] for f in db.FIELDS}})
    return f"{config.BASE_URL}{url_for('review', token=token)}"


def _load_request(data):
    r = db.get(data["id"])
    if r is None or any(r[f] != v for f, v in data["d"].items()):
        # قاعدة البيانات أُعيد إنشاؤها: نسترجع الطلب من الرابط
        r = db.find_same(data["d"]) or db.get(db.create(data["d"]))
    return r


@app.route("/review/<token>", methods=["GET", "POST"])
def review(token):
    try:
        data = signer.loads(token)
    except BadSignature:
        abort(404)
    r = _load_request(data)
    action = data["a"]
    # GET يعرض صفحة تأكيد فقط، حتى لا تُنفَّذ العملية إذا فتح برنامج البريد الرابط تلقائياً
    if request.method == "GET":
        return render_template("review.html", r=r, action=action, status=db.STATUS_LABELS[r["status"]])
    if _apply(r, action):
        return render_template("message.html", title="تم ✓", body=_done_text(action))
    return redirect(url_for("review", token=token))


def _done_text(action):
    return ("تمت الموافقة. يجري الآن إنشاء البحث، وسيُرسل للطالب تلقائياً وتصلك رسالة عند الانتهاء."
            if action == "approve" else "تم رفض الطلب وإبلاغ الطالب.")


def _apply(r, action) -> bool:
    if action == "approve":
        if not db.transition(r["id"], ("pending", "failed"), "approved"):
            flash("لا يمكن تنفيذ العملية: حالة الطلب الحالية " + db.STATUS_LABELS[r["status"]])
            return False
        threading.Thread(target=run_job, args=(r["id"],), daemon=True).start()
        return True
    if action == "reject":
        if not db.transition(r["id"], ("pending", "failed"), "rejected"):
            flash("لا يمكن تنفيذ العملية: حالة الطلب الحالية " + db.STATUS_LABELS[r["status"]])
            return False
        try:
            mailer.notify_student_rejected(r, request.form.get("reason", "").strip())
        except Exception:
            log.exception("تعذر إرسال إيميل الرفض #%s", r["id"])
        return True
    abort(400)


# ---------------- المهمة الخلفية: كتابة البحث وإرساله ----------------
def run_job(req_id: int):
    import docx_builder
    import generator
    import pdf

    r = db.get(req_id)
    db.set_status(req_id, "generating")
    try:
        research = generator.generate(r, progress=lambda m: log.info("#%s: %s", req_id, m))
        safe = re.sub(r"[^\w؀-ۿ -]", "", research["title"])[:80].strip() or "research"
        path = os.path.join(config.OUTPUT_DIR, f"{req_id}-{safe}.docx")
        docx_builder.build_docx(r, research, path)
        pdf_path = pdf.docx_to_pdf(path)
        mailer.send_research_to_student(r, [path, pdf_path])
        db.set_status(req_id, "sent", file_path=path, engines="، ".join(research["engines"]))
        log.info("#%s: أُرسل البحث إلى %s (المحركات: %s)", req_id, r["email"], research["engines"])
        _safe_notify(r, True, engines=research["engines"])
    except Exception as e:
        log.exception("#%s: فشل", req_id)
        db.set_status(req_id, "failed", error=f"{type(e).__name__}: {e}"[:2000])
        _safe_notify(r, False, f"{type(e).__name__}: {e}")


def _safe_notify(r, ok, error="", engines=()):
    try:
        mailer.notify_admin_status(r, ok, error, engines)
    except Exception:
        log.exception("تعذر إرسال إشعار المدير")


# ---------------- لوحة التحكم ----------------
def admin_required(f):
    @wraps(f)
    def wrapper(*a, **kw):
        auth = request.authorization
        if not config.ADMIN_PASSWORD or not auth or auth.password != config.ADMIN_PASSWORD:
            return Response("تسجيل الدخول مطلوب", 401, {"WWW-Authenticate": 'Basic realm="manhaj"'})
        return f(*a, **kw)
    return wrapper


@app.get("/admin")
@admin_required
def admin():
    import providers
    setup = {
        "engines": [(p.name, p.model) for p in providers.enabled()],
        "mail": config.MAIL_BACKEND,
        "mail_ok": bool(config.BREVO_API_KEY and config.MAIL_FROM) if config.MAIL_BACKEND == "brevo"
                   else bool(config.SMTP_USER and config.SMTP_PASSWORD),
        "admin_email": config.ADMIN_EMAIL,
        "base_url": config.BASE_URL,
    }
    return render_template("admin.html", rows=db.all_requests(), labels=db.STATUS_LABELS, setup=setup)


@app.post("/admin/test-engines")
@admin_required
def admin_test_engines():
    import providers
    results = providers.ping_all()
    if not results:
        flash("✗ لا يوجد أي محرك مفعّل. أضف مفتاحاً واحداً على الأقل (مثل GEMINI_API_KEY).")
    for name, model, ok, info in results:
        flash(f"{'✓' if ok else '✗'} {name} ({model}): {info}")
    return redirect(url_for("admin"))


@app.post("/admin/test-email")
@admin_required
def admin_test_email():
    try:
        mailer.send(config.ADMIN_EMAIL, "اختبار - منصة منهج", "<p>✓ إعدادات الإيميل تعمل بشكل صحيح.</p>")
        flash(f"✓ أُرسل إيميل تجريبي إلى {config.ADMIN_EMAIL}")
    except Exception as e:
        flash(f"✗ فشل إرسال الإيميل: {type(e).__name__}: {str(e)[:300]}")
    return redirect(url_for("admin"))


@app.post("/admin/<int:req_id>/<action>")
@admin_required
def admin_action(req_id, action):
    r = db.get(req_id) or abort(404)
    if _apply(r, action):
        flash(f"طلب #{req_id}: " + _done_text(action))
    return redirect(url_for("admin"))


if __name__ == "__main__":
    app.run(debug=False, port=int(os.environ.get("PORT", 5000)))
