import os
from dotenv import load_dotenv

load_dotenv()

ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "")
SECRET_KEY = os.environ.get("SECRET_KEY", "dev-secret-change-me")
# على Render يُضبط RENDER_EXTERNAL_URL تلقائياً
BASE_URL = (os.environ.get("BASE_URL") or os.environ.get("RENDER_EXTERNAL_URL")
            or "http://localhost:5000").rstrip("/")

SMTP_HOST = os.environ.get("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.environ.get("SMTP_PORT", "587"))
SMTP_USER = os.environ.get("SMTP_USER", "")
SMTP_PASSWORD = os.environ.get("SMTP_PASSWORD", "")
MAIL_FROM_NAME = os.environ.get("MAIL_FROM_NAME", "منصة منهج")
# brevo: إرسال عبر HTTPS (مجاني ويعمل على الاستضافات المجانية التي تحجب SMTP) | smtp
MAIL_BACKEND = os.environ.get("MAIL_BACKEND", "brevo" if os.environ.get("BREVO_API_KEY") else "smtp")
BREVO_API_KEY = os.environ.get("BREVO_API_KEY", "")
MAIL_FROM = os.environ.get("MAIL_FROM", "") or SMTP_USER

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.environ.get("DB_PATH", os.path.join(BASE_DIR, "manhaj.db"))
OUTPUT_DIR = os.environ.get("OUTPUT_DIR", os.path.join(BASE_DIR, "output"))

MIN_PAGES, MAX_PAGES = 5, 20
