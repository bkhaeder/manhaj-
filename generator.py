"""كتابة البحث الأكاديمي باستخدام عدة محركات ذكاء اصطناعي.

المراحل: خطة البحث (JSON)، الملخص والمقدمة، كل فصل على حدة، الخاتمة والمراجع.
محرك يكتب، ومحرك آخر (إن وُجد) يراجع ويحسّن كل جزء رئيسي. عند فشل محرك يتولى التالي.
"""
import json
import os
import re

import providers

WORDS_PER_PAGE = 250  # تقريباً: خط 14، تباعد 1.5
REVIEW = os.environ.get("AI_REVIEW", "1") == "1"


class GenerationError(Exception):
    pass


def _lang_name(r):
    return "العربية الفصحى" if r["language"] == "ar" else "English (academic)"


def _system_prompt(r) -> str:
    return f"""أنت باحث أكاديمي خبير تكتب بحثاً جامعياً أصيلاً ومتكاملاً.

بيانات البحث:
- الجامعة: {r['university']} / الكلية: {r['college']} / القسم: {r['department']}
- التخصص: {r['specialization']}
- عنوان البحث المقترح: {r['title']}
- ما يريده الطالب في البحث:
{r['details']}

قواعد الكتابة:
- لغة البحث: {_lang_name(r)}. اكتب كل المحتوى بهذه اللغة فقط.
- أسلوب أكاديمي رصين، فقرات متماسكة ومترابطة، تحليل ونقاش ومقارنة لا مجرد سرد.
- الأصالة: اكتب كل جملة بصياغتك الخاصة. لا تنسخ أي نص حرفياً من كتب أو مواقع أو أبحاث، ولا تستخدم
  العبارات الجاهزة المتداولة. عند عرض تعريف أو فكرة لباحث آخر أعد صياغتها كلياً بأسلوبك ثم وثّقها.
  الاقتباس الحرفي نادر جداً، وإن وُجد فبين علامات تنصيص مع التوثيق.
- التوثيق داخل النص بأسلوب APA مثل (المؤلف، السنة).
- لا تخترع إحصائيات أو اقتباسات أو مصادر. استشهد فقط بمصادر حقيقية معروفة أنت واثق من وجودها.
- استخدم Markdown بسيطاً فقط: "### " لعناوين المباحث، و"- " للنقاط، و**نص** للتأكيد.
  لا جداول ولا أكواد ولا عنوان رئيسي بـ "#".
- اكتب المحتوى مباشرة دون أي تمهيد أو تعليق موجّه للقارئ مثل "إليك..." أو "بالتأكيد".
"""


def _write(r, prompt, used, **kw) -> str:
    text, engine = providers.complete(_system_prompt(r), prompt, **kw)
    used.append(engine)
    return text


def _review(r, text: str, what: str, used) -> str:
    """محرك ثانٍ يراجع النص ويحسّنه. إن جاء الرد أقصر بكثير من الأصل يُحتفظ بالأصل."""
    if not REVIEW:
        return text
    prompt = (f"فيما يلي {what} من البحث. راجعه مراجعة أكاديمية ولغوية دقيقة:\n"
              "- صحّح الأخطاء اللغوية والنحوية والإملائية، وحسّن الترابط بين الفقرات.\n"
              "- احذف التكرار والحشو والعبارات الإنشائية الجاهزة، وأعد صياغة أي جملة تبدو منقولة أو نمطية بأسلوب أصيل.\n"
              "- حافظ على كل الأفكار والعناوين (###) والتوثيقات كما هي، ولا تختصر المحتوى ولا تضف مصادر جديدة.\n"
              "أعد النص الكامل بعد التحسين فقط، دون أي تعليق.\n\n---\n" + text)

    def long_enough(out):
        if len(out) < 0.85 * len(text):
            raise ValueError("المراجعة اختصرت النص")

    try:
        out, engine = providers.complete(_system_prompt(r), prompt, start=1, validate=long_enough)
        used.append(engine)
        return out
    except providers.AllProvidersFailed:
        return text  # المراجعة تحسين اختياري؛ لا نُفشل البحث بسببها


def _parse_outline(text: str) -> dict:
    m = re.search(r"\{.*\}", text, re.S)
    data = json.loads(m.group(0) if m else text)
    chapters = data.get("chapters") or []
    if not data.get("title") or not chapters or not all(c.get("title") and c.get("sections") for c in chapters):
        raise ValueError("خطة البحث غير مكتملة")
    return data


def _outline(r, body_words: int, used) -> dict:
    n_chapters = 2 if r["pages"] <= 12 else 3
    prompt = (f"ضع خطة البحث: عنواناً نهائياً دقيقاً (حسّن العنوان المقترح إن لزم)، "
              f"و{n_chapters} فصول، لكل فصل 2 إلى 3 مباحث. حجم متن البحث نحو {body_words} كلمة. "
              "لا تُدرج المقدمة أو الخاتمة أو المراجع ضمن الفصول.\n"
              'أجب بكائن JSON فقط بهذا الشكل: {"title": "...", "chapters": [{"title": "...", "sections": ["...", "..."]}]}')
    return _parse_outline(_write(r, prompt, used, json_mode=True, validate=_parse_outline))


def _outline_text(outline) -> str:
    lines = [f"العنوان: {outline['title']}"]
    for i, ch in enumerate(outline["chapters"], 1):
        lines.append(f"الفصل {i}: {ch['title']}")
        lines += [f"   - {s}" for s in ch["sections"]]
    return "\n".join(lines)


def generate(r, progress=lambda msg: None) -> dict:
    """يعيد قاموساً: title, abstract, introduction, chapters[{title, body}], conclusion, references, engines."""
    used: list[str] = []
    # نخصم صفحتين تقريباً للغلاف والفهرس
    total_words = max(r["pages"] - 2, 3) * WORDS_PER_PAGE
    intro_w = conc_w = int(total_words * 0.10)
    abstract_w = min(250, int(total_words * 0.05))
    refs_w = int(total_words * 0.07)
    body_words = total_words - intro_w - conc_w - abstract_w - refs_w

    try:
        progress("إعداد خطة البحث")
        outline = _outline(r, body_words, used)
        plan = _outline_text(outline)
        per_chapter = body_words // len(outline["chapters"])

        progress("كتابة الملخص والمقدمة")
        abstract = _write(r, f"خطة البحث:\n{plan}\n\nاكتب ملخص البحث (Abstract) في نحو {abstract_w} كلمة، "
                             "فقرة أو فقرتين، دون عنوان.", used)
        introduction = _write(r, f"خطة البحث:\n{plan}\n\nاكتب مقدمة البحث في نحو {intro_w} كلمة، تشمل: "
                                 "تمهيداً للموضوع، مشكلة البحث وأسئلته، أهمية البحث، أهدافه، منهج البحث، "
                                 "وهيكل البحث. استخدم ### لكل عنصر منها.", used)
        introduction = _review(r, introduction, "مقدمة", used)

        chapters = []
        for i, ch in enumerate(outline["chapters"], 1):
            progress(f"كتابة الفصل {i} من {len(outline['chapters'])}")
            sections = "\n".join(f"- {s}" for s in ch["sections"])
            body = _write(r, f"خطة البحث:\n{plan}\n\nاكتب الآن الفصل {i}: «{ch['title']}» كاملاً في نحو "
                             f"{per_chapter} كلمة. ابدأ بفقرة تمهيدية قصيرة للفصل، ثم اكتب كل مبحث تحت "
                             f"عنوان ### باسمه:\n{sections}\n\nلا تكتب عنوان الفصل نفسه، ولا تكرر المقدمة.", used)
            chapters.append({"title": ch["title"], "body": _review(r, body, f"الفصل {i}", used)})

        progress("كتابة الخاتمة والمراجع")
        conclusion = _write(r, f"خطة البحث:\n{plan}\n\nاكتب خاتمة البحث في نحو {conc_w} كلمة، تحت عنوانين "
                               "### النتائج و### التوصيات، بنقاط واضحة مستخلصة من الفصول.", used)
        references = _write(r, f"خطة البحث:\n{plan}\n\nاكتب قائمة المراجع للبحث بأسلوب APA (من 10 إلى 15 مرجعاً) "
                               "مرتبة أبجدياً، كل مرجع في سطر يبدأ بـ \"- \". أدرج فقط مراجع حقيقية منشورة أنت "
                               "واثق من وجودها وبياناتها، ولا تضع أرقام DOI أو روابط إلا إذا كنت متأكداً منها تماماً. "
                               "اكتب القائمة فقط دون أي تعليق.", used)
    except (providers.AllProvidersFailed, providers.Refusal) as e:
        raise GenerationError(str(e)) from e

    return {"title": outline["title"], "abstract": abstract, "introduction": introduction,
            "chapters": chapters, "conclusion": conclusion, "references": references,
            "engines": sorted(set(used))}
