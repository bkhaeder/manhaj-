"""محركات الذكاء الاصطناعي المتعددة.

كل محرك يُفعَّل تلقائياً عند وضع مفتاحه في .env. عند فشل محرك (تجاوز الحد المجاني، عطل، رد فارغ)
ينتقل الطلب للمحرك التالي، ويُستبعد المحرك الذي تجاوز حده لفترة قصيرة.
المحركات المجانية تستخدم واجهة متوافقة مع OpenAI؛ Claude (مدفوع واختياري) يستخدم Anthropic SDK.
"""
import logging
import os
import threading
import time
from dataclasses import dataclass, field, replace

import requests

log = logging.getLogger("manhaj.providers")


@dataclass
class Provider:
    name: str
    key_env: str
    base_url: str = ""
    model_env: str = ""
    default_model: str = ""
    max_tokens: int = 16000
    extra: dict = field(default_factory=dict)
    headers: dict = field(default_factory=dict)
    fixed_model: str = ""

    @property
    def key(self):
        return os.environ.get(self.key_env, "").strip()

    @property
    def model(self):
        return self.fixed_model or os.environ.get(self.model_env, "").strip() or self.default_model

    @property
    def id(self):
        return f"{self.name}:{self.model}"


PROVIDERS = {
    "gemini": Provider(
        "gemini", "GEMINI_API_KEY", "https://generativelanguage.googleapis.com/v1beta/openai",
        "GEMINI_MODEL", "gemini-flash-latest", extra={"reasoning_effort": "low"}),
    "groq": Provider(
        "groq", "GROQ_API_KEY", "https://api.groq.com/openai/v1",
        "GROQ_MODEL", "llama-3.3-70b-versatile", max_tokens=8000),
    "openrouter": Provider(
        "openrouter", "OPENROUTER_API_KEY", "https://openrouter.ai/api/v1",
        "OPENROUTER_MODEL", "deepseek/deepseek-chat-v3.1:free",
        headers={"X-Title": "Manhaj"}),
    "mistral": Provider(
        "mistral", "MISTRAL_API_KEY", "https://api.mistral.ai/v1",
        "MISTRAL_MODEL", "mistral-large-latest"),
    "claude": Provider("claude", "ANTHROPIC_API_KEY", model_env="CLAUDE_MODEL",
                       default_model="claude-opus-5-5", max_tokens=32000),
}

# حصة Gemini المجانية منفصلة لكل نموذج (نحو 20 طلباً يومياً لكل نموذج)، لذلك نجرب عدة نماذج بالترتيب
GEMINI_MODELS = "gemini-flash-latest,gemini-3.7-flash,gemini-3.6-flash,gemini-3.5-flash,gemini-3-flash-preview"

COOLDOWN_SECONDS = 90
MAX_COOLDOWN = 6 * 3600
_cooldown: dict[str, float] = {}
_lock = threading.Lock()


class AllProvidersFailed(Exception):
    pass


class Refusal(Exception):
    pass


def enabled() -> list[Provider]:
    order = os.environ.get("AI_ENGINES", "gemini,groq,openrouter,mistral,claude")
    result = []
    for n in (x.strip() for x in order.split(",")):
        p = PROVIDERS.get(n)
        if not p or not p.key:
            continue
        if n == "gemini" and not os.environ.get("GEMINI_MODEL"):
            models = os.environ.get("GEMINI_MODELS", GEMINI_MODELS)
            result += [replace(p, fixed_model=m.strip()) for m in models.split(",") if m.strip()]
        else:
            result.append(p)
    return result


def complete(system: str, prompt: str, json_mode: bool = False, start: int = 0,
             validate=None) -> tuple[str, str]:
    """يرسل الطلب لأول محرك متاح؛ يعيد (النص، اسم المحرك).

    start: يبدأ التدوير من محرك معين (لتوزيع الأحمال على الحدود المجانية).
    validate: دالة تتحقق من النص وترمي استثناء إن كان غير صالح، فيُجرَّب المحرك التالي.
    """
    engines = enabled()
    if not engines:
        raise AllProvidersFailed("لا يوجد أي محرك مفعّل. ضع مفتاح محرك واحد على الأقل في .env")
    engines = engines[start % len(engines):] + engines[:start % len(engines)]
    errors = []
    for _pass in range(2):  # جولة ثانية بعد انتظار، إذا كانت كل المحركات في فترة التهدئة
        for p in engines:
            if _cooldown.get(p.id, 0) > time.time():
                continue
            try:
                text = call_one(p, system, prompt, json_mode)
                if not text.strip():
                    raise ValueError("رد فارغ")
                if validate:
                    validate(text)
                return text.strip(), p.id
            except Exception as e:
                msg = f"{p.id}: {type(e).__name__}: {str(e)[:300]}"
                log.warning("فشل المحرك %s", msg)
                errors.append(msg)
                if _is_rate_limit(e):
                    with _lock:
                        _cooldown[p.id] = time.time() + _retry_after(e)
        soonest = min((_cooldown.get(p.id, 0) for p in engines), default=0) - time.time()
        if 0 < soonest <= COOLDOWN_SECONDS:
            time.sleep(soonest + 1)
        else:
            break
    raise AllProvidersFailed("فشلت كل المحركات:\n" + "\n".join(errors[-8:]))


def call_one(p: Provider, system: str, prompt: str, json_mode: bool = False) -> str:
    return (_claude if p.name == "claude" else _openai_compatible)(p, system, prompt, json_mode)


def ping_all() -> list[tuple[str, str, bool, str]]:
    """اختبار سريع لكل محرك مفعّل: (الاسم، النموذج، نجح؟، الرد أو الخطأ)."""
    results = []
    for p in enabled():
        try:
            out = call_one(p, "أجب بكلمة واحدة.", "قل: جاهز")
            results.append((p.name, p.model, True, " ".join(out.split())[:60]))
        except Exception as e:
            results.append((p.name, p.model, False, f"{type(e).__name__}: {str(e)[:200]}"))
    return results


def _retry_after(e) -> float:
    """مدة الانتظار التي يطلبها المزوّد (مثلاً حتى تجدد الحصة اليومية)."""
    try:
        data = e.response.json()
        data = data[0] if isinstance(data, list) else data
        for d in data["error"].get("details", []):
            if "retryDelay" in d:
                return min(float(d["retryDelay"].rstrip("s")), MAX_COOLDOWN)
    except Exception:
        pass
    return COOLDOWN_SECONDS


def _is_rate_limit(e) -> bool:
    status = getattr(getattr(e, "response", None), "status_code", None) or getattr(e, "status_code", None)
    return status in (429, 503, 529)


def _openai_compatible(p: Provider, system: str, prompt: str, json_mode: bool) -> str:
    body = {
        "model": p.model,
        "max_tokens": p.max_tokens,
        "temperature": 0.7,
        "messages": [{"role": "system", "content": system}, {"role": "user", "content": prompt}],
        **p.extra,
    }
    if json_mode:
        body["response_format"] = {"type": "json_object"}
    resp = requests.post(f"{p.base_url}/chat/completions", json=body, timeout=600,
                         headers={"Authorization": f"Bearer {p.key}", **p.headers})
    resp.raise_for_status()
    data = resp.json()
    choice = data["choices"][0]
    if choice.get("finish_reason") == "content_filter":
        raise Refusal("رُفض المحتوى من المحرك")
    if choice.get("finish_reason") == "length":
        raise ValueError("انقطع الرد لتجاوز الحد الأقصى للطول")
    return choice["message"].get("content") or ""


def _claude(p: Provider, system: str, prompt: str, json_mode: bool) -> str:
    import anthropic

    client = anthropic.Anthropic(api_key=p.key)
    with client.beta.messages.stream(
        model=p.model,
        max_tokens=p.max_tokens,
        system=system,
        messages=[{"role": "user", "content": prompt}],
        thinking={"type": "adaptive"},
        output_config={"effort": os.environ.get("CLAUDE_EFFORT", "high")},
        betas=["server-side-fallback-2026-07-01"],
        fallbacks="default",
    ) as stream:
        msg = stream.get_final_message()
    if msg.stop_reason == "refusal":
        raise Refusal("رفض Claude كتابة هذا الجزء")
    if msg.stop_reason == "max_tokens":
        raise ValueError("انقطع الرد لتجاوز الحد الأقصى للطول")
    return "".join(b.text for b in msg.content if b.type == "text")
