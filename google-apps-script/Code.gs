/**
 * منصة منهج - نسخة Google Apps Script (مجانية بالكامل، لا تحتاج أي استضافة).
 *
 * التركيب (مرة واحدة):
 * 1. افتح https://script.google.com ← "مشروع جديد"، احذف ما في المحرر والصق هذا الملف كاملاً.
 * 2. ضع مفتاح Gemini في CONFIG بالأسفل (من https://aistudio.google.com/apikey) ثم احفظ.
 * 3. من القائمة أعلى المحرر اختر الدالة setup واضغط "تشغيل" (Run) ووافق على الصلاحيات
 *    (Advanced ← Go to project ← Allow).
 * 4. "نشر" (Deploy) ← "نشر جديد" ← النوع "تطبيق ويب" (Web app):
 *    تنفيذ باسم: أنا (Me)، ومن لديه حق الوصول: أي شخص (Anyone) ← نشر.
 * 5. رابط "تطبيق الويب" هو رابط منصتك، أرسله للطلبة.
 *
 * الطلبات تُحفظ في جدول Google Sheets اسمه «منصة منهج - الطلبات» في Drive (هو لوحة التحكم)،
 * والبحوث تُحفظ في مجلد «منصة منهج» في Drive.
 */

// ===================== الإعدادات: عدّل هذه القيم فقط =====================
const CONFIG = {
  GEMINI_API_KEY: '',        // مطلوب: https://aistudio.google.com/apikey
  GROQ_API_KEY: '',          // اختياري (احتياطي ومراجِع): https://console.groq.com/keys
  OPENROUTER_API_KEY: '',    // اختياري: https://openrouter.ai/keys
  ADMIN_EMAIL: '',           // فارغ = إيميل حسابك في Google
  // حصة Gemini المجانية نحو 20 طلباً يومياً لكل نموذج، فنجرب عدة نماذج بالترتيب
  GEMINI_MODELS: ['gemini-flash-latest', 'gemini-3.7-flash', 'gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-3-flash-preview'],
  GROQ_MODEL: 'llama-3.3-70b-versatile',
  OPENROUTER_MODEL: 'deepseek/deepseek-chat-v3.1:free',
  REVIEW: false,             // مراجعة كل جزء بمحرك ثانٍ (تضاعف استهلاك الحصص المجانية)
  MIN_PAGES: 5,
  MAX_PAGES: 20,
};
// ===========================================================================

const WORDS_PER_PAGE = 155;  // مقيس فعلياً بخط Amiri 14 وتباعد 1.5 على صفحة A4
const STEP_BUDGET_MS = 4 * 60 * 1000;   // حد التنفيذ في Apps Script 6 دقائق؛ نترك هامشاً
const MAX_ATTEMPTS = 6;
const COLS = ['id', 'created', 'status', 'student_name', 'email', 'university', 'college', 'department',
              'specialization', 'supervisor', 'title', 'details', 'language', 'pages', 'engines', 'error', 'doc_url'];
const STATUS = { pending: 'بانتظار المراجعة', approved: 'تمت الموافقة', generating: 'جارٍ الإنشاء',
                 sent: 'أُرسل للطالب', rejected: 'مرفوض', failed: 'فشل' };
const FIELDS = {
  student_name: ['الاسم', 120], email: ['البريد الإلكتروني', 200], university: ['الجامعة', 150],
  college: ['الكلية', 150], department: ['القسم', 150], specialization: ['التخصص', 150],
  supervisor: ['المشرف', 120], title: ['عنوان البحث', 300], details: ['تفاصيل البحث', 2000],
};

// ----------------------------- الإعداد والتخزين -----------------------------
function setup() {
  sheet_();
  folder_();
  secret_();
  const url = ScriptApp.getService().getUrl();
  Logger.log('تم الإعداد ✓ الجدول: ' + SpreadsheetApp.openById(props_().getProperty('SHEET_ID')).getUrl());
  Logger.log('رابط المنصة (بعد النشر): ' + (url || 'انشر المشروع كتطبيق ويب أولاً'));
  if (!CONFIG.GEMINI_API_KEY && !CONFIG.GROQ_API_KEY && !CONFIG.OPENROUTER_API_KEY) {
    Logger.log('⚠ لم تضع أي مفتاح ذكاء اصطناعي في CONFIG');
  }
}

function props_() { return PropertiesService.getScriptProperties(); }
function adminEmail_() { return CONFIG.ADMIN_EMAIL || Session.getEffectiveUser().getEmail(); }

function sheet_() {
  const p = props_();
  let id = p.getProperty('SHEET_ID');
  if (id) return SpreadsheetApp.openById(id).getSheets()[0];
  const ss = SpreadsheetApp.create('منصة منهج - الطلبات');
  const sh = ss.getSheets()[0];
  sh.setName('الطلبات');
  sh.appendRow(COLS);
  sh.setFrozenRows(1);
  sh.setRightToLeft(true);
  p.setProperty('SHEET_ID', ss.getId());
  try { DriveApp.getFileById(ss.getId()).moveTo(folder_()); } catch (e) { /* ليس ضرورياً */ }
  return sh;
}

function folder_() {
  const p = props_();
  const id = p.getProperty('FOLDER_ID');
  if (id) return DriveApp.getFolderById(id);
  const f = DriveApp.createFolder('منصة منهج');
  p.setProperty('FOLDER_ID', f.getId());
  return f;
}

function secret_() {
  const p = props_();
  let s = p.getProperty('SECRET');
  if (!s) { s = Utilities.getUuid() + Utilities.getUuid(); p.setProperty('SECRET', s); }
  return s;
}

function getReq_(id) {
  const sh = sheet_();
  const row = Number(id) + 1;
  if (!(row >= 2 && row <= sh.getLastRow())) return null;
  const vals = sh.getRange(row, 1, 1, COLS.length).getValues()[0];
  const r = {};
  COLS.forEach(function (c, i) { r[c] = vals[i]; });
  r.pages = Number(r.pages);
  return r;
}

function setReq_(id, fields) {
  const sh = sheet_();
  Object.keys(fields).forEach(function (k) {
    sh.getRange(Number(id) + 1, COLS.indexOf(k) + 1).setValue(fields[k]);
  });
}

function jobFile_(id) {
  const it = folder_().getFilesByName('job-' + id + '.json');
  return it.hasNext() ? it.next() : null;
}
function loadJob_(id) {
  const f = jobFile_(id);
  return f ? JSON.parse(f.getBlob().getDataAsString()) : null;
}
function saveJob_(id, job) {
  const f = jobFile_(id);
  const data = JSON.stringify(job);
  if (f) f.setContent(data); else folder_().createFile('job-' + id + '.json', data, 'application/json');
}

// ----------------------------- واجهة الويب -----------------------------
function doGet(e) {
  const p = (e && e.parameter) || {};
  const html = (p.id && p.a && p.sig) ? reviewPage_(p) : formPage_();
  return HtmlService.createHtmlOutput(html)
    .setTitle('منصة منهج')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function sign_(id, action) {
  const raw = Utilities.computeHmacSha256Signature(id + ':' + action, secret_());
  return Utilities.base64EncodeWebSafe(raw).replace(/=+$/, '');
}

function reviewUrl_(id, action) {
  return ScriptApp.getService().getUrl() + '?id=' + id + '&a=' + action + '&sig=' + sign_(id, action);
}

/** يُستدعى من نموذج الطالب. */
function submitRequest(d) {
  const errors = [];
  const r = {};
  Object.keys(FIELDS).forEach(function (k) {
    const v = String(d[k] || '').trim();
    if (!v) errors.push('حقل «' + FIELDS[k][0] + '» مطلوب.');
    else if (v.length > FIELDS[k][1]) errors.push('حقل «' + FIELDS[k][0] + '» أطول من المسموح.');
    r[k] = v;
  });
  if (r.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(r.email)) errors.push('البريد الإلكتروني غير صحيح.');
  r.language = d.language === 'en' ? 'en' : 'ar';
  r.pages = parseInt(d.pages, 10);
  if (!(r.pages >= CONFIG.MIN_PAGES && r.pages <= CONFIG.MAX_PAGES)) {
    errors.push('عدد الصفحات يجب أن يكون بين ' + CONFIG.MIN_PAGES + ' و' + CONFIG.MAX_PAGES + '.');
  }
  if (errors.length) return { ok: false, errors: errors };

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  let id;
  try {
    const sh = sheet_();
    id = sh.getLastRow();  // الصف الأول للعناوين
    r.id = id;
    r.created = new Date();
    r.status = 'pending';
    sh.appendRow(COLS.map(function (c) { return r[c] === undefined ? '' : r[c]; }));
  } finally {
    lock.releaseLock();
  }
  try {
    mailAdminNew_(r);
    mail_(r.email, 'استلمنا طلبك - منصة منهج',
      '<p>مرحباً ' + esc_(r.student_name) + '،</p><p>استلمنا طلبك لبحث بعنوان <b>«' + esc_(r.title) +
      '»</b> (رقم الطلب #' + id + '). سيُراجَع الطلب، وسيصلك إيميل بالنتيجة.</p>');
  } catch (e) {
    console.error('تعذر إرسال الإيميل: ' + e);
  }
  return { ok: true, id: id, email: r.email };
}

/** يُستدعى من صفحة المراجعة (رابط الإيميل). */
function reviewAction(id, action, sig, reason) {
  if (sig !== sign_(id, action)) return 'رابط غير صالح.';
  const r = getReq_(id);
  if (!r) return 'الطلب غير موجود.';
  if (r.status !== 'pending' && r.status !== 'failed') return 'تمت معالجة هذا الطلب مسبقاً (' + STATUS[r.status] + ').';
  if (action === 'approve') {
    setReq_(id, { status: 'approved', error: '' });
    saveJob_(id, { step: 0, attempts: 0, parts: {}, engines: [] });
    scheduleNext_(1);
    return 'تمت الموافقة ✓ يجري الآن إنشاء البحث (عدة دقائق)، وسيُرسل للطالب تلقائياً وتصلك رسالة عند الانتهاء.';
  }
  if (action === 'reject') {
    setReq_(id, { status: 'rejected' });
    const why = String(reason || '').trim();
    mail_(r.email, 'بخصوص طلبك - منصة منهج',
      '<p>مرحباً ' + esc_(r.student_name) + '،</p><p>نعتذر، لم تتم الموافقة على طلبك رقم #' + id +
      ' بعنوان «' + esc_(r.title) + '».</p>' + (why ? '<p><b>السبب:</b> ' + esc_(why) + '</p>' : ''));
    return 'تم رفض الطلب وإبلاغ الطالب ✓';
  }
  return 'إجراء غير معروف.';
}

// ----------------------------- معالجة الطلبات في الخلفية -----------------------------
function scheduleNext_(seconds) {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'processJobs') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('processJobs').timeBased().after(Math.max(1, seconds) * 1000).create();
}

function nextJobId_() {
  const sh = sheet_();
  const n = sh.getLastRow() - 1;
  if (n < 1) return null;
  const statuses = sh.getRange(2, COLS.indexOf('status') + 1, n, 1).getValues();
  for (let i = 0; i < n; i++) {
    if (statuses[i][0] === 'approved' || statuses[i][0] === 'generating') return i + 1;
  }
  return null;
}

function processJobs() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return;
  const start = Date.now();
  let waitSeconds = 0;
  try {
    let id;
    while ((id = nextJobId_()) !== null && Date.now() - start < STEP_BUDGET_MS) {
      const r = getReq_(id);
      const job = loadJob_(id) || { step: 0, attempts: 0, parts: {}, engines: [] };
      if (r.status === 'approved') setReq_(id, { status: 'generating' });
      try {
        const finished = runStep_(r, job);
        job.attempts = 0;
        saveJob_(id, job);
        if (finished) {
          setReq_(id, { status: 'sent', engines: job.engines.join('، '), doc_url: job.docUrl });
          safeMail_(adminEmail_(), 'تم الإرسال: طلب #' + id,
            '<p>✓ تم إنشاء البحث #' + id + ' «' + esc_(r.title) + '» وإرساله إلى ' + esc_(r.email) + '.</p>' +
            '<p>المحركات المستخدمة: ' + esc_(job.engines.join('، ')) + '</p><p><a href="' + job.docUrl + '">فتح البحث</a></p>');
          const f = jobFile_(id);
          if (f) f.setTrashed(true);
        }
      } catch (e) {
        job.attempts = (job.attempts || 0) + 1;
        saveJob_(id, job);
        console.warn('طلب #' + id + ' الخطوة ' + job.step + ' محاولة ' + job.attempts + ': ' + e);
        if (job.attempts >= MAX_ATTEMPTS) {
          setReq_(id, { status: 'failed', error: String(e).slice(0, 1500) });
          safeMail_(adminEmail_(), 'فشل: طلب #' + id,
            '<p>✗ فشل إنشاء البحث #' + id + ' «' + esc_(r.title) + '».</p><pre dir="ltr">' + esc_(String(e)) + '</pre>' +
            '<p>لإعادة المحاولة افتح رابط الموافقة من إيميل الطلب مرة أخرى.</p>');
        } else {
          waitSeconds = 90;  // غالباً تجاوز الحد المجاني مؤقتاً
          break;
        }
      }
    }
  } finally {
    lock.releaseLock();
  }
  if (nextJobId_() !== null) scheduleNext_(waitSeconds || 5);
}

// ----------------------------- كتابة البحث -----------------------------
/** يوزّع عدد الكلمات بحيث يقارب عدد صفحات الملف النهائي ما طلبه الطالب. */
function sizes_(r) {
  const chapters = r.pages <= 12 ? 2 : 3;
  const refs = Math.max(5, Math.min(15, r.pages));
  // الغلاف والمحتويات صفحتان، وكل فصل والمراجع تبدأ بصفحة جديدة، وكل 8 مراجع تشغل صفحة تقريباً
  const contentPages = Math.max(r.pages - 2 - 0.4 * (chapters + 1) - refs / 8, 1.5);
  const total = Math.round(contentPages * WORDS_PER_PAGE);
  const s = { chapters: chapters, refs: refs, abstract: Math.max(60, Math.round(total * 0.08)),
              intro: Math.round(total * 0.15), conc: Math.round(total * 0.12) };
  s.body = total - s.abstract - s.intro - s.conc;
  return s;
}

function plan_(job) {
  const lines = ['العنوان: ' + job.outline.title];
  job.outline.chapters.forEach(function (ch, i) {
    lines.push('الفصل ' + (i + 1) + ': ' + ch.title);
    ch.sections.forEach(function (s) { lines.push('   - ' + s); });
  });
  return lines.join('\n');
}

function steps_(job) {
  const list = ['outline', 'abstract', 'intro'];
  if (CONFIG.REVIEW) list.push('review:intro');
  if (job.outline) {
    job.outline.chapters.forEach(function (ch, i) {
      ch.sections.forEach(function (_, j) {
        list.push('sec:' + i + ':' + j);
        if (CONFIG.REVIEW) list.push('review:sec:' + i + ':' + j);
      });
    });
  }
  return list.concat(['conclusion', 'references', 'build']);
}

/** ينفذ خطوة واحدة؛ يعيد true عند انتهاء البحث وإرساله. */
function runStep_(r, job) {
  const name = steps_(job)[job.step];
  const sz = sizes_(r);
  const P = job.outline ? 'خطة البحث:\n' + plan_(job) + '\n\n' : '';
  const write = function (prompt, opts) {
    const out = callEngine_(system_(r), prompt, opts || {});
    if (job.engines.indexOf(out.engine) < 0) job.engines.push(out.engine);
    return out.text;
  };

  if (name === 'outline') {
    const n = sz.chapters;
    const text = write('ضع خطة البحث: عنواناً نهائياً دقيقاً (حسّن العنوان المقترح إن لزم)، و' + n +
      ' فصول، لكل فصل 2 إلى 3 مباحث. لا تُدرج المقدمة أو الخاتمة أو المراجع ضمن الفصول.\n' +
      'أجب بكائن JSON فقط بهذا الشكل: {"title": "...", "chapters": [{"title": "...", "sections": ["...", "..."]}]}',
      { json: true, validate: parseOutline_ });
    job.outline = parseOutline_(text);
  } else if (name === 'abstract') {
    job.parts.abstract = write(P + 'اكتب ملخص البحث (Abstract) في نحو ' + sz.abstract + ' كلمة، فقرة أو فقرتين، دون عنوان.');
  } else if (name === 'intro') {
    job.parts.intro = write(P + 'اكتب مقدمة البحث في نحو ' + sz.intro + ' كلمة، تشمل: تمهيداً للموضوع، مشكلة البحث وأسئلته، ' +
      'أهمية البحث، أهدافه، منهج البحث، وهيكل البحث. استخدم ### لكل عنصر منها.');
  } else if (name.indexOf('sec:') === 0) {
    const ij = name.split(':').slice(1).map(Number);
    const ch = job.outline.chapters[ij[0]];
    const nSec = job.outline.chapters.reduce(function (a, c) { return a + c.sections.length; }, 0);
    const words = Math.round(sz.body / nSec);
    const opening = ij[1] === 0 ? 'ابدأ بفقرة تمهيدية قصيرة للفصل، ثم ' : '';
    job.parts[name] = write(P + 'نكتب الآن الفصل ' + (ij[0] + 1) + ': «' + ch.title + '». ' + opening +
      'اكتب المبحث «' + ch.sections[ij[1]] + '» في نحو ' + words + ' كلمة. ابدأ بسطر عنوانه: ### ' +
      ch.sections[ij[1]] + '\nلا تكتب عنوان الفصل، ولا تكتب مباحث أخرى.');
  } else if (name.indexOf('review:') === 0) {
    const key = name.slice(7);
    job.parts[key] = review_(r, job.parts[key], job);
  } else if (name === 'conclusion') {
    job.parts.conclusion = write(P + 'اكتب خاتمة البحث في نحو ' + sz.conc + ' كلمة، تحت عنوانين ### النتائج و### التوصيات، ' +
      'بنقاط واضحة مستخلصة من الفصول.');
  } else if (name === 'references') {
    job.parts.references = write(P + 'اكتب قائمة المراجع للبحث بأسلوب APA (' + sz.refs + ' مراجع تقريباً) مرتبة أبجدياً، كل مرجع في سطر ' +
      'يبدأ بـ "- ". أدرج فقط مراجع حقيقية منشورة أنت واثق من وجودها وبياناتها، ولا تضع أرقام DOI أو روابط إلا إذا كنت ' +
      'متأكداً منها تماماً. اكتب القائمة فقط دون أي تعليق.');
  } else if (name === 'build') {
    const files = buildDocs_(r, job);
    job.docUrl = files.url;
    mail_(r.email, 'بحثك جاهز: ' + r.title,
      '<p>مرحباً ' + esc_(r.student_name) + '،</p><p>نرفق لك بحثك بعنوان <b>«' + esc_(r.title) + '»</b> بنسختين: ' +
      '<b>Word</b> (قابلة للتعديل) و<b>PDF</b> (جاهزة للطباعة).</p><p>ننصحك بمراجعته جيداً، والتحقق من المصادر والمراجع ' +
      'قبل التسليم، وتعديله بما يناسب متطلبات قسمك ومشرفك.</p><p>بالتوفيق!</p>', [files.docx, files.pdf]);
    job.step++;
    return true;
  }
  job.step++;
  return false;
}

function review_(r, text, job) {
  if (!text) return text;
  const prompt = 'فيما يلي جزء من البحث. راجعه مراجعة أكاديمية ولغوية دقيقة:\n' +
    '- صحّح الأخطاء اللغوية والنحوية والإملائية، وحسّن الترابط بين الفقرات.\n' +
    '- احذف التكرار والحشو والعبارات الإنشائية الجاهزة، وأعد صياغة أي جملة تبدو منقولة أو نمطية بأسلوب أصيل.\n' +
    '- حافظ على كل الأفكار والعناوين (###) والتوثيقات كما هي، ولا تختصر المحتوى ولا تضف مصادر جديدة.\n' +
    'أعد النص الكامل بعد التحسين فقط، دون أي تعليق.\n\n---\n' + text;
  try {
    const out = callEngine_(system_(r), prompt, {
      start: 1,
      validate: function (t) { if (t.length < 0.85 * text.length) throw new Error('المراجعة اختصرت النص'); },
    });
    if (job.engines.indexOf(out.engine) < 0) job.engines.push(out.engine);
    return out.text;
  } catch (e) {
    return text;  // المراجعة تحسين اختياري
  }
}

function parseOutline_(text) {
  const m = String(text).match(/\{[\s\S]*\}/);
  const d = JSON.parse(m ? m[0] : text);
  const ok = d.title && d.chapters && d.chapters.length &&
    d.chapters.every(function (c) { return c.title && c.sections && c.sections.length; });
  if (!ok) throw new Error('خطة البحث غير مكتملة');
  // نحذف «الفصل الأول:» و«المبحث الأول:» من العناوين لأن المستند يضيف الترقيم بنفسه
  const strip = function (t) { return String(t).replace(/^\s*(الفصل|المبحث|Chapter|Section)\s+[^:：\-–]{1,20}[:：\-–]\s*/i, '').trim(); };
  d.chapters = d.chapters.slice(0, 4).map(function (c) {
    return { title: strip(c.title), sections: c.sections.slice(0, 4).map(strip) };
  });
  return d;
}

function system_(r) {
  const lang = r.language === 'ar' ? 'العربية الفصحى' : 'English (academic)';
  return 'أنت باحث أكاديمي خبير تكتب بحثاً جامعياً أصيلاً ومتكاملاً.\n\nبيانات البحث:\n' +
    '- الجامعة: ' + r.university + ' / الكلية: ' + r.college + ' / القسم: ' + r.department + '\n' +
    '- التخصص: ' + r.specialization + '\n- عنوان البحث المقترح: ' + r.title + '\n' +
    '- ما يريده الطالب في البحث:\n' + r.details + '\n\nقواعد الكتابة:\n' +
    '- لغة البحث: ' + lang + '. اكتب كل المحتوى بهذه اللغة فقط.\n' +
    '- أسلوب أكاديمي رصين، فقرات متماسكة ومترابطة، تحليل ونقاش ومقارنة لا مجرد سرد.\n' +
    '- الأصالة: اكتب كل جملة بصياغتك الخاصة. لا تنسخ أي نص حرفياً من كتب أو مواقع أو أبحاث، ولا تستخدم العبارات ' +
    'الجاهزة المتداولة. عند عرض تعريف أو فكرة لباحث آخر أعد صياغتها كلياً بأسلوبك ثم وثّقها. الاقتباس الحرفي نادر جداً، ' +
    'وإن وُجد فبين علامات تنصيص مع التوثيق.\n' +
    '- التوثيق داخل النص بأسلوب APA مثل (المؤلف، السنة).\n' +
    '- لا تخترع إحصائيات أو اقتباسات أو مصادر. استشهد فقط بمصادر حقيقية معروفة أنت واثق من وجودها.\n' +
    '- استخدم Markdown بسيطاً فقط: "### " لعناوين المباحث، و"- " للنقاط، و**نص** للتأكيد. لا جداول ولا أكواد.\n' +
    '- التزم بعدد الكلمات المطلوب في كل جزء تقريباً ولا تتجاوزه.\n' +
    '- اكتب المحتوى مباشرة دون أي تمهيد أو تعليق موجّه للقارئ مثل "إليك..." أو "بالتأكيد".';
}

// ----------------------------- محركات الذكاء الاصطناعي -----------------------------
function engines_() {
  const all = CONFIG.GEMINI_MODELS.map(function (m) {
    return { name: 'gemini:' + m, key: CONFIG.GEMINI_API_KEY, model: m,
             url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', extra: { reasoning_effort: 'low' } };
  }).concat([
    { name: 'groq', key: CONFIG.GROQ_API_KEY, model: CONFIG.GROQ_MODEL,
      url: 'https://api.groq.com/openai/v1/chat/completions', extra: {} },
    { name: 'openrouter', key: CONFIG.OPENROUTER_API_KEY, model: CONFIG.OPENROUTER_MODEL,
      url: 'https://openrouter.ai/api/v1/chat/completions', extra: {} },
  ]);
  return all.filter(function (e) { return e.key; });
}

/** يجرب المحركات بالترتيب (بدءاً من opts.start) ويعيد {text, engine}. */
function callEngine_(system, prompt, opts) {
  let list = engines_();
  if (!list.length) throw new Error('لا يوجد أي مفتاح ذكاء اصطناعي في CONFIG');
  const s = (opts.start || 0) % list.length;
  list = list.slice(s).concat(list.slice(0, s));
  const cache = CacheService.getScriptCache();
  const errors = [];
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (cache.get('cool_' + e.name)) { errors.push(e.name + ': في فترة تهدئة'); continue; }
    try {
      const body = Object.assign({
        model: e.model, max_tokens: 8000, temperature: 0.7,
        messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }],
      }, e.extra);
      if (opts.json) body.response_format = { type: 'json_object' };
      const resp = UrlFetchApp.fetch(e.url, {
        method: 'post', contentType: 'application/json', muteHttpExceptions: true,
        headers: { Authorization: 'Bearer ' + e.key }, payload: JSON.stringify(body),
      });
      const code = resp.getResponseCode();
      if (code === 429 || code === 503) {
        // ننتظر المدة التي يطلبها المزوّد (قد تكون حتى تجدد الحصة اليومية)، بحد أقصى 6 ساعات
        let wait = 90;
        try {
          let d = JSON.parse(resp.getContentText());
          d = Array.isArray(d) ? d[0] : d;
          (d.error.details || []).forEach(function (x) { if (x.retryDelay) wait = parseFloat(x.retryDelay); });
        } catch (ignore) { /* نستخدم الافتراضي */ }
        cache.put('cool_' + e.name, '1', Math.max(30, Math.min(21600, Math.round(wait))));
        throw new Error('HTTP ' + code + ' (تجاوز الحد المجاني مؤقتاً)');
      }
      if (code !== 200) throw new Error('HTTP ' + code + ': ' + resp.getContentText().slice(0, 200));
      const choice = JSON.parse(resp.getContentText()).choices[0];
      if (choice.finish_reason === 'length') throw new Error('انقطع الرد لتجاوز الطول');
      const text = String((choice.message && choice.message.content) || '').trim();
      if (!text) throw new Error('رد فارغ');
      if (opts.validate) opts.validate(text);
      return { text: text, engine: e.name };
    } catch (err) {
      errors.push(e.name + ': ' + err.message);
    }
  }
  throw new Error('فشلت كل المحركات: ' + errors.join(' | '));
}

// ----------------------------- بناء ملف Word و PDF -----------------------------
function buildDocs_(r, job) {
  const rtl = r.language === 'ar';
  const L = rtl
    ? { by: 'إعداد الطالب', sup: 'إشراف', spec: 'التخصص', toc: 'المحتويات', abstract: 'الملخص', intro: 'المقدمة',
        chapter: 'الفصل', conc: 'الخاتمة', refs: 'المصادر والمراجع', year: 'العام الدراسي',
        ord: ['الأول', 'الثاني', 'الثالث', 'الرابع'] }
    : { by: 'Prepared by', sup: 'Supervised by', spec: 'Specialization', toc: 'Contents', abstract: 'Abstract',
        intro: 'Introduction', chapter: 'Chapter', conc: 'Conclusion', refs: 'References', year: 'Academic Year',
        ord: ['One', 'Two', 'Three', 'Four'] };
  const font = rtl ? 'Amiri' : 'Times New Roman';
  const base = rtl ? 14 : 12;
  const title = job.outline.title;
  const doc = DocumentApp.create(r.id + '- ' + title);
  const body = doc.getBody();
  body.setMarginTop(72).setMarginBottom(72).setMarginLeft(72).setMarginRight(72);
  const A = DocumentApp.Attribute, H = DocumentApp.HorizontalAlignment, PH = DocumentApp.ParagraphHeading;

  function style(p, size, color, align, dirRtl) {
    const s = {};
    s[A.FONT_FAMILY] = font;
    s[A.FONT_SIZE] = size;
    s[A.FOREGROUND_COLOR] = color || '#000000';
    s[A.LINE_SPACING] = 1.5;
    s[A.SPACING_AFTER] = 6;
    p.setAttributes(s);
    p.setLeftToRight(!(dirRtl === undefined ? rtl : dirRtl));
    p.setAlignment(align || H.JUSTIFY);
    return p;
  }
  function addText(p, text, bold) {
    String(text).split(/\*\*(.+?)\*\*/).forEach(function (part, i) {
      part = part.replace(/\*(.+?)\*/g, '$1').replace(/\*/g, '');  // مائل Markdown نحذف علاماته
      if (part) p.appendText(part).setBold(!!bold || i % 2 === 1);
    });
    return p;
  }
  // في البحث العربي، السطر المكتوب بالإنجليزية فقط (مثل المراجع الأجنبية) يُكتب من اليسار لليمين
  function isRtl(text) { return rtl && (/[\u0600-\u06FF]/.test(text) || !String(text).trim()); }
  function para(text, opts) {
    opts = opts || {};
    const p = addText(body.appendParagraph(''), text, opts.bold);
    if (opts.heading) p.setHeading(opts.heading);
    return style(p, opts.size || base, opts.color, opts.align, isRtl(text));
  }
  function heading(text, level) {
    return para(text, { heading: level === 1 ? PH.HEADING1 : level === 2 ? PH.HEADING2 : PH.HEADING3,
                        size: base + (level === 1 ? 6 : level === 2 ? 3 : 1), bold: true, color: '#1f3d36',
                        align: level === 1 ? H.CENTER : H.JUSTIFY });
  }
  function markdown(md) {
    String(md || '').split('\n').forEach(function (raw) {
      const line = raw.trim();
      if (!line || line === '---' || line === '***') return;
      let m;
      if ((m = line.match(/^(#{1,6})\s+(.*)$/))) heading(m[2].replace(/^\*+|\*+$/g, ''), Math.min(Math.max(m[1].length, 2), 3));
      else if ((m = line.match(/^[-*•]\s+(.*)$/))) {
        const li = addText(body.appendListItem(''), m[1]).setGlyphType(DocumentApp.GlyphType.BULLET);
        style(li, base);
      } else para(line);
    });
  }
  function chapterLabel(i) { return L.chapter + ' ' + (L.ord[i] || (i + 1)) + ': '; }

  // الغلاف
  [r.university, r.college, r.department].forEach(function (t) { para(t, { align: H.CENTER, bold: true, size: 16 }); });
  for (let i = 0; i < 5; i++) para('', { align: H.CENTER });
  para(title, { align: H.CENTER, bold: true, size: 24, color: '#1f3d36' });
  for (let i = 0; i < 4; i++) para('', { align: H.CENTER });
  para(L.by + ': ' + r.student_name, { align: H.CENTER, bold: true, size: 15 });
  para(L.spec + ': ' + r.specialization, { align: H.CENTER });
  para(L.sup + ': ' + r.supervisor, { align: H.CENTER, bold: true, size: 15 });
  for (let i = 0; i < 3; i++) para('', { align: H.CENTER });
  const now = new Date(), y = now.getFullYear();
  para(L.year + ' ' + (now.getMonth() < 8 ? (y - 1) + '–' + y : y + '–' + (y + 1)), { align: H.CENTER });
  body.appendPageBreak();

  // المحتويات
  heading(L.toc, 1);
  const toc = [L.abstract, L.intro].concat(job.outline.chapters.map(function (c, i) { return chapterLabel(i) + c.title; }), [L.conc, L.refs]);
  toc.forEach(function (t, i) { para((i + 1) + '. ' + t); });
  body.appendPageBreak();

  heading(L.abstract, 1); markdown(job.parts.abstract);
  heading(L.intro, 1); markdown(job.parts.intro);
  job.outline.chapters.forEach(function (c, i) {
    body.appendPageBreak();
    heading(chapterLabel(i) + c.title, 1);
    c.sections.forEach(function (_, j) { markdown(job.parts['sec:' + i + ':' + j]); });
  });
  heading(L.conc, 1); markdown(job.parts.conclusion);
  body.appendPageBreak(); heading(L.refs, 1);
  String(job.parts.references || '').split('\n').forEach(function (line) {
    line = line.trim().replace(/^([-*•]|\d+[.)])\s+/, '');
    if (line) para(line).setIndentFirstLine(0).setIndentStart(36);
  });

  // حذف الفقرة الفارغة الأولى التي ينشئها Google Docs
  const first = body.getChild(0);
  if (first.getType() === DocumentApp.ElementType.PARAGRAPH && !first.asParagraph().getText()) first.removeFromParent();
  doc.saveAndClose();

  const file = DriveApp.getFileById(doc.getId());
  file.moveTo(folder_());
  const safe = String(title).replace(/[\\/:*?"<>|]/g, '').slice(0, 80);
  const pdf = file.getAs('application/pdf').setName(r.id + '-' + safe + '.pdf');
  const docx = UrlFetchApp.fetch('https://docs.google.com/document/d/' + doc.getId() + '/export?format=docx', {
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
  }).getBlob().setName(r.id + '-' + safe + '.docx');
  return { url: doc.getUrl(), docx: docx, pdf: pdf };
}

// ----------------------------- الإيميل -----------------------------
function wrap_(body) {
  return '<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;background:#f4f1ea;padding:24px">' +
    '<div style="max-width:620px;margin:auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e3ddd0">' +
    '<div style="background:#1f3d36;color:#fff;padding:18px 24px;font-size:20px;font-weight:bold">منصة منهج</div>' +
    '<div style="padding:24px;color:#222;line-height:1.9;font-size:15px">' + body + '</div></div></div>';
}

function mail_(to, subject, html, attachments) {
  MailApp.sendEmail({ to: to, subject: subject, htmlBody: wrap_(html), name: 'منصة منهج', attachments: attachments || [] });
}

function safeMail_(to, subject, html) {
  try { mail_(to, subject, html); } catch (e) { console.error('تعذر إرسال الإيميل: ' + e); }
}

function mailAdminNew_(r) {
  const row = function (k, v) {
    return '<tr><td style="padding:6px 10px;color:#666;white-space:nowrap">' + k + '</td><td style="padding:6px 10px">' + esc_(v) + '</td></tr>';
  };
  const btn = function (href, text, color) {
    return '<a href="' + href + '" style="display:inline-block;background:' + color + ';color:#fff;text-decoration:none;' +
      'padding:10px 26px;border-radius:8px;margin:4px;font-weight:bold">' + text + '</a>';
  };
  mail_(adminEmail_(), 'طلب بحث جديد #' + r.id + ': ' + r.title,
    '<p>وصل طلب بحث جديد رقم <b>#' + r.id + '</b>:</p>' +
    '<table style="border-collapse:collapse;width:100%;background:#faf8f3">' +
    row('الطالب', r.student_name) + row('البريد', r.email) + row('الجامعة', r.university) + row('الكلية', r.college) +
    row('القسم', r.department) + row('التخصص', r.specialization) + row('المشرف', r.supervisor) + row('العنوان', r.title) +
    row('اللغة', r.language === 'ar' ? 'العربية' : 'الإنجليزية') + row('عدد الصفحات', r.pages) + '</table>' +
    '<p><b>تفاصيل الطالب:</b><br>' + esc_(r.details).replace(/\n/g, '<br>') + '</p>' +
    '<p style="text-align:center;margin-top:22px">' + btn(reviewUrl_(r.id, 'approve'), 'موافقة ✓', '#2e7d4f') +
    btn(reviewUrl_(r.id, 'reject'), 'رفض ✗', '#b23b3b') + '</p>');
}

function esc_(s) {
  return String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

// ----------------------------- صفحات HTML -----------------------------
const CSS = '<link href="https://fonts.googleapis.com/css2?family=Amiri:wght@700&family=IBM+Plex+Sans+Arabic:wght@400;500;600&display=swap" rel="stylesheet">' +
  '<style>:root{--bg:#f4f1ea;--card:#fffdf8;--ink:#1d2422;--muted:#6b716e;--line:#e3ddd0;--brand:#1f3d36;--brand2:#2f5a4f;--gold:#b68a3a}' +
  '@media (prefers-color-scheme:dark){:root{--bg:#141917;--card:#1c2321;--ink:#ece8df;--muted:#9aa29e;--line:#2d3633;--brand:#7fb8a6;--brand2:#9fcfbf;--gold:#d6ad5e}}' +
  '*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font-family:"IBM Plex Sans Arabic",Tahoma,sans-serif;line-height:1.8}' +
  '.top{padding:14px 16px;border-bottom:1px solid var(--line);font-family:Amiri,serif;font-size:1.5rem;color:var(--brand);font-weight:700}' +
  '.mark{display:inline-grid;place-items:center;width:38px;height:38px;border-radius:10px;background:var(--brand);color:var(--bg);margin-left:6px}' +
  '.wrap{max-width:760px;margin:0 auto;padding:24px 16px 40px}h1,h2{font-family:Amiri,serif;color:var(--brand);line-height:1.4}' +
  'h1{font-size:2rem;margin:0 0 8px}h2{font-size:1.35rem;margin:26px 0 10px;padding-bottom:6px;border-bottom:2px solid var(--gold);display:inline-block}' +
  '.sub{color:var(--muted);margin:0 0 20px}.card{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:24px}' +
  '.grid{display:grid;grid-template-columns:1fr 1fr;gap:0 16px}.full{grid-column:1/-1}@media(max-width:600px){.grid{grid-template-columns:1fr}.card{padding:18px}}' +
  'label{display:block;margin-bottom:14px;font-weight:500}input,textarea{display:block;width:100%;margin-top:6px;padding:10px 12px;font:inherit;color:var(--ink);background:var(--bg);border:1px solid var(--line);border-radius:10px}' +
  'small{color:var(--muted);font-weight:400}.seg{display:flex;gap:8px;margin-top:6px}.seg label{flex:1;margin:0}.seg input{display:none}' +
  '.seg span{display:block;text-align:center;padding:10px;border:1px solid var(--line);border-radius:10px;cursor:pointer;background:var(--bg)}' +
  '.seg input:checked+span{background:var(--brand);color:var(--bg);border-color:var(--brand)}' +
  'button{font:inherit;font-weight:600;border:0;border-radius:10px;padding:12px 28px;background:var(--brand);color:var(--bg);cursor:pointer;width:100%;margin-top:6px}' +
  'button:disabled{opacity:.6}.ok{background:#2e7d4f;color:#fff}.danger{background:#b23b3b;color:#fff}' +
  '.note{font-size:.9rem;color:var(--muted);border-right:3px solid var(--gold);padding-right:10px}' +
  '.msg{border-radius:10px;padding:12px 16px;margin-bottom:16px}.err{background:#fbe9e7;color:#8a2a1f}.good{background:#e8f3ec;color:#1f5a3a}' +
  'dl{display:grid;grid-template-columns:max-content 1fr;gap:6px 16px}dt{color:var(--muted)}dd{margin:0;white-space:pre-wrap}</style>';

function shell_(content) {
  return '<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">' + CSS + '</head><body>' +
    '<div class="top"><span class="mark">م</span> منصة منهج</div><div class="wrap">' + content + '</div></body></html>';
}

function formPage_() {
  const f = function (name, label, extra) {
    return '<label' + (extra && extra.full ? ' class="full"' : '') + '>' + label + '<input name="' + name + '" required' +
      (extra && extra.type ? ' type="' + extra.type + '" dir="ltr"' : '') + '></label>';
  };
  return shell_(
    '<h1>اطلب بحثك الأكاديمي</h1><p class="sub">املأ بياناتك وصف ما تريده في البحث، وسيصلك البحث كاملاً بنسختين Word وPDF على بريدك الإلكتروني بعد مراجعة الطلب.</p>' +
    '<div id="msg"></div><form id="f" class="card" onsubmit="send(event)">' +
    '<h2>بيانات الطالب</h2><div class="grid">' + f('student_name', 'الاسم الكامل') + f('email', 'البريد الإلكتروني', { type: 'email' }) +
    f('university', 'الجامعة') + f('college', 'الكلية') + f('department', 'القسم') + f('specialization', 'التخصص') +
    f('supervisor', 'اسم المشرف', { full: true }) + '</div>' +
    '<h2>تفاصيل البحث</h2>' + f('title', 'عنوان البحث') +
    '<label>ماذا تريد داخل البحث؟<textarea name="details" rows="6" required maxlength="2000" placeholder="مثال: أريد التركيز على الجانب التطبيقي، مع دراسة حالة عن ...، وأن يتضمن فصلاً عن الدراسات السابقة..."></textarea></label>' +
    '<div class="grid"><div><label style="margin:0">لغة البحث</label><div class="seg">' +
    '<label><input type="radio" name="language" value="ar" checked><span>العربية</span></label>' +
    '<label><input type="radio" name="language" value="en"><span>English</span></label></div></div>' +
    '<label>عدد الصفحات<input name="pages" type="number" min="' + CONFIG.MIN_PAGES + '" max="' + CONFIG.MAX_PAGES + '" value="15" required>' +
    '<small>من ' + CONFIG.MIN_PAGES + ' إلى ' + CONFIG.MAX_PAGES + ' صفحة</small></label></div>' +
    '<p class="note">البحث المُرسل نموذج مساعد للطالب؛ يُنصح بمراجعته والتحقق من مصادره وتعديله وفق تعليمات القسم والمشرف قبل التسليم.</p>' +
    '<button id="b">إرسال الطلب</button></form>' +
    '<script>function send(e){e.preventDefault();var fm=document.getElementById("f"),b=document.getElementById("b"),m=document.getElementById("msg");' +
    'var d={};new FormData(fm).forEach(function(v,k){d[k]=v});b.disabled=true;b.textContent="جارٍ الإرسال...";' +
    'google.script.run.withSuccessHandler(function(r){b.disabled=false;b.textContent="إرسال الطلب";' +
    'if(r.ok){fm.style.display="none";m.className="msg good";m.innerHTML="<b>تم استلام طلبك ✓</b><br>رقم طلبك #"+r.id+". سيصلك إيميل على "+r.email.replace(/</g,"")+" بعد مراجعة الطلب.";}' +
    'else{m.className="msg err";m.innerHTML=r.errors.map(function(x){return "• "+x}).join("<br>");}scrollTo(0,0);})' +
    '.withFailureHandler(function(err){b.disabled=false;b.textContent="إرسال الطلب";m.className="msg err";m.textContent="حدث خطأ، حاول مرة أخرى.";scrollTo(0,0);})' +
    '.submitRequest(d);}</script>');
}

function reviewPage_(p) {
  const id = Number(p.id), a = p.a === 'reject' ? 'reject' : 'approve';
  const r = getReq_(id);
  if (!r || p.sig !== sign_(id, a)) return shell_('<div class="card"><h1>رابط غير صالح</h1></div>');
  const done = r.status !== 'pending' && r.status !== 'failed';
  const args = JSON.stringify([id, a, String(p.sig)]).slice(1, -1);
  return shell_(
    '<div class="card"><h1>' + (a === 'approve' ? 'الموافقة على' : 'رفض') + ' الطلب #' + id + '</h1>' +
    '<p>الحالة الحالية: <b>' + esc_(STATUS[r.status] || r.status) + '</b></p><dl>' +
    '<dt>الطالب</dt><dd>' + esc_(r.student_name) + ' — ' + esc_(r.email) + '</dd>' +
    '<dt>الجامعة</dt><dd>' + esc_(r.university + ' / ' + r.college + ' / ' + r.department) + '</dd>' +
    '<dt>التخصص</dt><dd>' + esc_(r.specialization) + '</dd><dt>المشرف</dt><dd>' + esc_(r.supervisor) + '</dd>' +
    '<dt>العنوان</dt><dd>' + esc_(r.title) + '</dd><dt>اللغة / الصفحات</dt><dd>' +
    (r.language === 'ar' ? 'العربية' : 'English') + ' — ' + r.pages + ' صفحة</dd><dt>التفاصيل</dt><dd>' + esc_(r.details) + '</dd></dl>' +
    '<div id="msg"></div>' +
    (done ? '<p class="note">تمت معالجة هذا الطلب مسبقاً.</p>' :
      (a === 'reject' ? '<label>سبب الرفض (اختياري، يُرسل للطالب)<textarea id="reason" rows="3"></textarea></label>' +
        '<button id="b" class="danger" onclick="go()">تأكيد الرفض</button>' :
        '<button id="b" class="ok" onclick="go()">تأكيد الموافقة وبدء إنشاء البحث</button>')) +
    '</div><script>function go(){var b=document.getElementById("b"),m=document.getElementById("msg"),r=document.getElementById("reason");' +
    'b.disabled=true;google.script.run.withSuccessHandler(function(t){m.className="msg good";m.textContent=t;b.style.display="none";' +
    'if(r)r.parentNode.style.display="none";}).withFailureHandler(function(e){b.disabled=false;m.className="msg err";m.textContent="حدث خطأ: "+e.message;})' +
    '.reviewAction(' + args + ',r?r.value:"");}</script>');
}
