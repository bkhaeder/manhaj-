import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone

import config

SCHEMA = """
CREATE TABLE IF NOT EXISTS requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL,
    student_name TEXT NOT NULL,
    email TEXT NOT NULL,
    university TEXT NOT NULL,
    college TEXT NOT NULL,
    department TEXT NOT NULL,
    specialization TEXT NOT NULL,
    supervisor TEXT NOT NULL,
    title TEXT NOT NULL,
    details TEXT NOT NULL,
    language TEXT NOT NULL,
    pages INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    -- pending | approved | generating | sent | rejected | failed
    error TEXT,
    file_path TEXT,
    engines TEXT,
    updated_at TEXT
);
"""

STATUS_LABELS = {
    "pending": "بانتظار المراجعة",
    "approved": "تمت الموافقة",
    "generating": "جارٍ الإنشاء",
    "sent": "أُرسل للطالب",
    "rejected": "مرفوض",
    "failed": "فشل",
}


def _now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


@contextmanager
def connect():
    conn = sqlite3.connect(config.DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init():
    with connect() as c:
        c.executescript(SCHEMA)
        try:  # ترقية قواعد بيانات النسخة الأولى
            c.execute("ALTER TABLE requests ADD COLUMN engines TEXT")
        except sqlite3.OperationalError:
            pass
        # الطلبات التي انقطع إنشاؤها بسبب إعادة تشغيل الخادم
        c.execute(
            "UPDATE requests SET status='failed', error='توقف الخادم أثناء الإنشاء', updated_at=? "
            "WHERE status IN ('approved','generating')",
            (_now(),),
        )


FIELDS = ("student_name", "email", "university", "college", "department",
          "specialization", "supervisor", "title", "details", "language", "pages")


def create(data: dict) -> int:
    with connect() as c:
        cur = c.execute(
            f"INSERT INTO requests (created_at, {', '.join(FIELDS)}) "
            f"VALUES (?, {', '.join('?' * len(FIELDS))})",
            (_now(), *(data[f] for f in FIELDS)),
        )
        return cur.lastrowid


def find_same(data: dict):
    with connect() as c:
        return c.execute(
            f"SELECT * FROM requests WHERE {' AND '.join(f'{f}=?' for f in FIELDS)} ORDER BY id DESC LIMIT 1",
            tuple(data[f] for f in FIELDS),
        ).fetchone()


def get(req_id: int):
    with connect() as c:
        return c.execute("SELECT * FROM requests WHERE id=?", (req_id,)).fetchone()


def all_requests():
    with connect() as c:
        return c.execute("SELECT * FROM requests ORDER BY id DESC").fetchall()


def set_status(req_id: int, status: str, **extra):
    cols = {"status": status, "updated_at": _now(), **extra}
    with connect() as c:
        c.execute(
            f"UPDATE requests SET {', '.join(f'{k}=?' for k in cols)} WHERE id=?",
            (*cols.values(), req_id),
        )


def transition(req_id: int, from_statuses: tuple, to_status: str) -> bool:
    """تغيير الحالة فقط إذا كانت الحالة الحالية ضمن from_statuses (يمنع التكرار)."""
    with connect() as c:
        cur = c.execute(
            f"UPDATE requests SET status=?, updated_at=?, error=NULL WHERE id=? "
            f"AND status IN ({', '.join('?' * len(from_statuses))})",
            (to_status, _now(), req_id, *from_statuses),
        )
        return cur.rowcount == 1
