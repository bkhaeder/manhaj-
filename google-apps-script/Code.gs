/**
 * منصة منهج - نسخة Google Apps Script (مجانية بالكامل، لا تحتاج أي استضافة).
 *
 * التركيب (مرة واحدة):
 * 1. افتح https://script.google.com ← "مشروع جديد"، احذف ما في المحرر والصق هذا الملف كاملاً.
 * 2. ضع مفتاح Gemini في «إعدادات المشروع ⚙️ ← خصائص النص البرمجي (Script properties)» باسم GEMINI_API_KEY
 *    (أو في CONFIG بالأسفل إن كنت لا تستخدم النشر التلقائي من GitHub) ثم احفظ.
 * 3. من القائمة أعلى المحرر اختر الدالة setup واضغط "تشغيل" (Run) ووافق على الصلاحيات
 *    (Advanced ← Go to project ← Allow).
 * 4. "نشر" (Deploy) ← "نشر جديد" ← النوع "تطبيق ويب" (Web app):
 *    تنفيذ باسم: أنا (Me)، ومن لديه حق الوصول: أي شخص (Anyone) ← نشر.
 * 5. رابط "تطبيق الويب" هو رابط منصتك، أرسله للطلبة.
 *
 * الطلبات تُحفظ في جدول Google Sheets اسمه «منصة منهج - الطلبات» في Drive (هو لوحة التحكم)،
 * والبحوث تُحفظ في مجلد «منصة منهج» في Drive.
 */

// ===================== الإعدادات =====================
// أي قيمة هنا يمكن تجاوزها من «إعدادات المشروع ← خصائص النص البرمجي» بالاسم نفسه (مثل GEMINI_API_KEY أو PUBLIC_URL).
// هذا ضروري مع النشر التلقائي من GitHub: الكود يُستبدل عند كل تحديث، أما خصائص المشروع فتبقى، والمفاتيح لا تُرفع إلى GitHub.
const CONFIG = {
  // ----- محركات الذكاء الاصطناعي (كلها مجانية). تُجرَّب بالترتيب، وإذا نفدت حصة محرك يُنتقل للتالي -----
  GEMINI_API_KEY: '',        // مطلوب: https://aistudio.google.com/apikey (يشغّل نماذج Gemini وGemma كلها)
  // لكل نموذج حصة مجانية يومية منفصلة. الأقوى أولاً، ثم Gemma (حصتها كبيرة)، ثم النماذج الخفيفة احتياطاً أخيراً
  GEMINI_MODELS: ['gemini-flash-latest', 'gemini-3.7-flash', 'gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-3-flash-preview'],
  GEMMA_MODELS: ['gemma-4-31b-it', 'gemma-4-26b-a4b-it'],
  LITE_MODELS: ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-flash-lite-latest'],
  // محركات اختيارية من شركات أخرى: ضع مفتاح أي منها في «خصائص النص البرمجي» فيُضاف تلقائياً
  GROQ_API_KEY: '',          // https://console.groq.com/keys
  GROQ_MODEL: 'llama-3.3-70b-versatile',
  CEREBRAS_API_KEY: '',      // https://cloud.cerebras.ai (API Keys)
  CEREBRAS_MODEL: 'gpt-oss-120b',
  GITHUB_MODELS_TOKEN: '',   // رمز GitHub بصلاحية Models: https://github.com/settings/personal-access-tokens
  GITHUB_MODEL: 'openai/gpt-4.1-mini',
  MISTRAL_API_KEY: '',       // https://console.mistral.ai/api-keys
  MISTRAL_MODEL: 'mistral-large-latest',
  OPENROUTER_API_KEY: '',    // https://openrouter.ai/keys
  OPENROUTER_MODEL: 'deepseek/deepseek-chat-v3.1:free',
  ADMIN_EMAIL: '',           // فارغ = إيميل حسابك في Google
  NOTIFY_ADMIN_DONE: false,  // إيميل لك عند إرسال كل بحث (معطّل لتوفير حصة Gmail اليومية)
  REVIEW: false,             // مراجعة كل جزء بمحرك ثانٍ (تضاعف استهلاك الحصص المجانية)
  MIN_PAGES: 5,
  MAX_PAGES: 20,
  PRICE_IQD: 10000,          // سعر البحث بالدينار العراقي (يظهر في الواجهة والإيميلات)
  PAYMENT_METHOD: 'كي كارد',
  PAYMENT_ACCOUNT: '3001941925',
  VERSE_PAGE: true,          // صفحة «بسم الله الرحمن الرحيم» والآية بعد الغلاف (في البحوث العربية)
  PUBLIC_URL: 'https://bkhaeder.github.io/manhaj-/',  // واجهة الطالب على GitHub Pages (مجلد docs في المستودع)
  DELIVERY_TEXT: 'خلال 24 ساعة من تأكيد التحويل',  // مدة التسليم كما تظهر للطالب
};

/** يطبّق «خصائص النص البرمجي» على CONFIG؛ يعمل تلقائياً في بداية كل تنفيذ. */
function loadConfig_() {
  const p = PropertiesService.getScriptProperties().getProperties();
  Object.keys(CONFIG).forEach(function (k) {
    if (p[k] === undefined || p[k] === '') return;
    const cur = CONFIG[k];
    CONFIG[k] = typeof cur === 'number' ? Number(p[k])
      : typeof cur === 'boolean' ? /^(true|1|نعم)$/i.test(p[k])
      : Array.isArray(cur) ? p[k].split(',').map(function (x) { return x.trim(); }).filter(Boolean)
      : String(p[k]).trim();
  });
}
try { loadConfig_(); } catch (e) { /* قبل منح الصلاحيات أول مرة */ }

const GOVERNORATES = {
  'بغداد': 'Baghdad', 'البصرة': 'Basra', 'نينوى': 'Nineveh', 'أربيل': 'Erbil', 'السليمانية': 'Sulaymaniyah',
  'دهوك': 'Duhok', 'حلبجة': 'Halabja', 'كركوك': 'Kirkuk', 'ديالى': 'Diyala', 'الأنبار': 'Anbar',
  'صلاح الدين': 'Salah al-Din', 'بابل': 'Babylon', 'كربلاء': 'Karbala', 'النجف': 'Najaf', 'واسط': 'Wasit',
  'القادسية': 'Al-Qadisiyah', 'ذي قار': 'Dhi Qar', 'ميسان': 'Maysan', 'المثنى': 'Al-Muthanna',
};
// ===========================================================================

const WORDS_PER_PAGE = 155;  // مقيس فعلياً بخط Amiri 14 وتباعد 1.5 على صفحة A4
const STEP_BUDGET_MS = 4 * 60 * 1000;   // حد التنفيذ في Apps Script 6 دقائق؛ نترك هامشاً
const MAX_ATTEMPTS = 8;
const COLS = ['id', 'created', 'status', 'student_name', 'email', 'university', 'college', 'department',
              'specialization', 'supervisor', 'title', 'details', 'language', 'pages', 'engines', 'error', 'doc_url',
              'governorate'];  // عمود specialization قديم ويبقى فارغاً حتى لا تتغير أعمدة الجداول الموجودة
const STATUS = { pending: 'بانتظار المراجعة', approved: 'تمت الموافقة', generating: 'جارٍ الإنشاء',
                 sent: 'أُرسل للطالب', rejected: 'مرفوض', failed: 'فشل' };
const FIELDS = {
  student_name: ['الاسم', 120], email: ['البريد الإلكتروني', 200], university: ['الجامعة', 150],
  college: ['الكلية', 150], department: ['القسم', 150], governorate: ['المحافظة', 40],
  supervisor: ['المشرف', 120], title: ['عنوان البحث', 300], details: ['تفاصيل البحث', 2000],
};

// ----------------------------- الإعداد والتخزين -----------------------------
function setup() {
  ensureWatchdog_();
  sheet_().getRange(1, 1, 1, COLS.length).setValues([COLS]);
  folder_();
  secret_();
  const url = ScriptApp.getService().getUrl();
  Logger.log('تم الإعداد ✓ الجدول: ' + SpreadsheetApp.openById(props_().getProperty('SHEET_ID')).getUrl());
  Logger.log('رابط المنصة (بعد النشر): ' + (url || 'انشر المشروع كتطبيق ويب أولاً'));
  if (!engines_().length) {
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
  if (p.api === 'config') { kick_(); return json_(publicConfig_()); }
  if (p.api === 'health') return json_(health_());
  const html = (p.id && p.a && p.sig) ? reviewPage_(p) : movedPage_();
  return HtmlService.createHtmlOutput(html)
    .setTitle('منصة منهج')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * واجهة برمجية لصفحة الطالب على GitHub Pages.
 * الصفحة ترسل {fn, args} بنوع text/plain (فلا يحتاج المتصفح طلب CORS مسبقاً) وتستقبل JSON.
 */
const API_FUNCTIONS = { submitRequest: submitRequest, trackRequest: trackRequest };

function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const fn = API_FUNCTIONS[body.fn];
    if (!fn) return json_({ serverError: 'طلب غير معروف' });
    return json_(fn.apply(null, Array.isArray(body.args) ? body.args : []));
  } catch (err) {
    console.error('API: ' + err);
    return json_({ serverError: 'حدث خطأ في الخادم، حاول مرة أخرى.' });
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/** حالة المنصة للتشخيص: أعداد الطلبات، والبحوث الجارية، وآخر الأخطاء، والمحركات المتاحة. بلا أسماء أو إيميلات. */
function health_() {
  const sh = sheet_(), n = sh.getLastRow() - 1, out = { time: new Date().toISOString(), counts: {}, active: [], errors: [] };
  const rows = n > 0 ? sh.getRange(2, 1, n, COLS.length).getValues() : [];
  const cache = CacheService.getScriptCache();
  rows.forEach(function (row) {
    const r = {}; COLS.forEach(function (c, i) { r[c] = row[i]; });
    out.counts[r.status] = (out.counts[r.status] || 0) + 1;
    if (r.status === 'approved' || r.status === 'generating') {
      const job = loadJob_(r.id) || {};
      out.active.push({ id: r.id, status: r.status, pages: r.pages, step: job.step, total: job.outline ? steps_(job).length : null,
                        waits: job.waits || 0, attempts: job.attempts || 0, v: job.v || 1, lastError: job.lastError || '' });
    }
    if (r.error) out.errors.push({ id: r.id, status: r.status, error: String(r.error).slice(0, 300) });
  });
  out.errors = out.errors.slice(-5);
  out.engines = engines_().map(function (e) { return e.name + (cache.get('cool_' + e.name) ? ' (انتظار)' : ''); });
  out.triggers = ScriptApp.getProjectTriggers().map(function (t) { return t.getHandlerFunction(); });
  return out;
}

function publicConfig_() {
  return { price: CONFIG.PRICE_IQD, method: CONFIG.PAYMENT_METHOD, account: CONFIG.PAYMENT_ACCOUNT,
           minPages: CONFIG.MIN_PAGES, maxPages: CONFIG.MAX_PAGES, delivery: CONFIG.DELIVERY_TEXT };
}

/** الرابط القديم (رابط Apps Script) يدل الطالب على الواجهة الجديدة. */
function movedPage_() {
  return shell_('<section class="card" style="margin-top:22px;text-align:center"><div class="stepname" style="justify-content:center">' +
    '<h2>انتقلت منصة منهج إلى رابط جديد أسرع</h2></div><p style="margin:0 0 18px;color:var(--muted)">اضغط الزر للمتابعة، واحفظ الرابط الجديد.</p>' +
    '<div class="nav"><a class="primary" style="display:block;text-decoration:none;padding:14px;border-radius:12px;font-weight:600" target="_top" href="' +
    esc_(publicUrl_()) + '">افتح منصة منهج</a></div><p class="note" style="margin-top:14px" dir="ltr">' + esc_(publicUrl_()) + '</p></section>');
}

function publicUrl_() { return CONFIG.PUBLIC_URL || ScriptApp.getService().getUrl(); }

/** يُستدعى من صفحة «تابع طلبك»: يعيد مرحلة الطلب إذا تطابق رقمه مع البريد. */
function trackRequest(id, email) {
  const r = getReq_(parseInt(String(id).replace(/[^0-9٠-٩]/g, '').replace(/[٠-٩]/g, function (c) { return '٠١٢٣٤٥٦٧٨٩'.indexOf(c); }), 10));
  if (!r || String(r.email).trim().toLowerCase() !== String(email || '').trim().toLowerCase()) {
    return { ok: false, error: 'لم نجد طلباً بهذا الرقم والبريد. تأكد منهما كما وصلا في إيميل التأكيد.' };
  }
  const stage = { pending: 1, approved: 2, generating: 2, failed: 2, sent: 4, rejected: -1 }[r.status];
  let progress = 0;
  if (r.status === 'generating' || r.status === 'approved') {
    const job = loadJob_(r.id);
    if (job && job.outline) progress = Math.round(100 * job.step / steps_(job).length);
  }
  return { ok: true, id: r.id, title: r.title, stage: stage, progress: progress, rejected: r.status === 'rejected',
           delayed: r.status === 'failed', created: Utilities.formatDate(new Date(r.created), 'Asia/Baghdad', 'yyyy/MM/dd') };
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
  if (r.governorate && !GOVERNORATES[r.governorate]) errors.push('اختر المحافظة من القائمة.');
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
      '»</b> (رقم الطلب #' + id + '). سيُراجَع الطلب، وسيصلك إيميل بالنتيجة.</p>' +
      paymentHtml_(r) + '<p style="margin-top:14px">تابع حالة طلبك في أي وقت من <a href="' + publicUrl_() +
      '?track=' + id + '">صفحة المنصة</a> بالضغط على «تابع طلبك» وكتابة رقم الطلب <b>#' + id + '</b> وبريدك.</p>');
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
    saveJob_(id, { v: 2, step: 0, attempts: 0, waits: 0, parts: {}, engines: [] });
    scheduleNext_(1);
    ensureWatchdog_();
    safeMail_(r.email, 'بدأنا كتابة بحثك - منصة منهج',
      '<p>مرحباً ' + esc_(r.student_name) + '،</p><p>تأكدنا من طلبك رقم <b>#' + id + '</b>، وبدأنا الآن كتابة بحثك بعنوان <b>«' +
      esc_(r.title) + '»</b>.</p><p>يصلك البحث عادةً خلال ساعة على هذا البريد بملفي Word وPDF. يمكنك متابعة تقدّم الكتابة من ' +
      '<a href="' + publicUrl_() + '?track=' + id + '">صفحة متابعة الطلب</a>.</p>');
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
/** مشغّل احتياطي كل 10 دقائق: إذا وُجد بحث عالق يستأنف كتابته. */
function ensureWatchdog_() {
  const exists = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'watchdog'; });
  if (!exists) ScriptApp.newTrigger('watchdog').timeBased().everyMinutes(10).create();
}

/**
 * يوقظ البحوث العالقة: يُستدعى عند فتح أي طالب للمنصة (مرة كل 5 دقائق على الأكثر).
 * إذا وُجد بحث قيد الكتابة بلا مشغّل، يعيد جدولته ويثبّت المراقب الاحتياطي.
 */
function kick_() {
  try {
    const cache = CacheService.getScriptCache();
    if (cache.get('kicked')) return;
    cache.put('kicked', '1', 300);
    if (nextJobId_() === null) return;
    ensureWatchdog_();
    const pending = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'processJobs'; });
    if (!pending) scheduleNext_(1);
  } catch (e) {
    console.warn('kick: ' + e);
  }
}

function watchdog() {
  if (nextJobId_() !== null) processJobs();
}

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

/** هل فشلت كل المحركات بسبب الحصة المجانية فقط (وليس لخطأ آخر)؟ */
function isQuotaError_(e) {
  const msg = String(e && e.message || e);
  if (msg.indexOf('فشلت كل المحركات') < 0) return false;
  return msg.split(': ').slice(1).join(': ').split(' | ').every(function (part) {
    return /تجاوز الحد|تهدئة/.test(part);
  });
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
      let job = loadJob_(id);
      if (!job || job.v !== 2) job = { v: 2, step: 0, attempts: 0, waits: 0, parts: {}, engines: [] };
      if (r.status === 'approved') setReq_(id, { status: 'generating' });
      try {
        const finished = runStep_(r, job);
        job.attempts = 0;
        saveJob_(id, job);
        if (finished) {
          setReq_(id, { status: 'sent', engines: job.engines.join('، '), doc_url: job.docUrl });
          if (CONFIG.NOTIFY_ADMIN_DONE) safeMail_(adminEmail_(), 'تم الإرسال: طلب #' + id,
            '<p>✓ تم إنشاء البحث #' + id + ' «' + esc_(r.title) + '» وإرساله إلى ' + esc_(r.email) + '.</p>' +
            '<p>المحركات المستخدمة: ' + esc_(job.engines.join('، ')) + '</p><p><a href="' + job.docUrl + '">فتح البحث</a></p>');
          const f = jobFile_(id);
          if (f) f.setTrashed(true);
        }
      } catch (e) {
        // نفاد الحصة المجانية ليس فشلاً: ننتظر تجددها (حتى نحو 24 ساعة) بدل إلغاء البحث
        const quota = isQuotaError_(e);
        if (quota) job.waits = (job.waits || 0) + 1; else job.attempts = (job.attempts || 0) + 1;
        job.lastError = String(e).slice(0, 400);
        saveJob_(id, job);
        console.warn('طلب #' + id + ' الخطوة ' + job.step + (quota ? ' انتظار الحصة ' + job.waits : ' محاولة ' + job.attempts) + ': ' + e);
        if (quota && job.waits === 2) {
          safeMail_(adminEmail_(), 'تأخير: طلب #' + id,
            '<p>نفدت حصة الذكاء الاصطناعي المجانية مؤقتاً أثناء كتابة البحث #' + id + ' «' + esc_(r.title) + '».</p>' +
            '<p>ستُكمل المنصة الكتابة تلقائياً عند تجدد الحصة، ولا تحتاج لفعل شيء.</p>');
        }
        if (job.attempts >= MAX_ATTEMPTS || job.waits >= 150) {
          setReq_(id, { status: 'failed', error: String(e).slice(0, 1500) });
          safeMail_(adminEmail_(), 'فشل: طلب #' + id,
            '<p>✗ فشل إنشاء البحث #' + id + ' «' + esc_(r.title) + '».</p><pre dir="ltr">' + esc_(String(e)) + '</pre>' +
            '<p>لإعادة المحاولة افتح رابط الموافقة من إيميل الطلب مرة أخرى.</p>');
        } else {
          waitSeconds = quota ? Math.min(90 * job.waits, 600) : 90;
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
  const s = { chapters: chapters, refs: refs, abstract: Math.max(80, Math.round(total * 0.08)),
              intro: Math.max(150, Math.round(total * 0.18)), conc: Math.max(100, Math.round(total * 0.12)) };
  // البحوث القصيرة: لا يقل متن كل مبحث عن 90 كلمة (فصلان × مبحثان على الأقل)، حتى لو زاد عدد الصفحات قليلاً
  s.body = Math.max(total - s.abstract - s.intro - s.conc, 90 * chapters * 2);
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
      list.push('ch:' + i);
      if (CONFIG.REVIEW) ch.sections.forEach(function (_, j) { list.push('review:sec:' + i + ':' + j); });
    });
  }
  return list.concat(['conclusion', 'references', 'build']);
}

// ----------------------------- فحص جودة كل جزء -----------------------------
// إذا خالف النموذج المطلوب (مثلاً كتب فصلاً بدل قائمة المراجع) يُرفض الرد ويُطلب من نموذج آخر.
function words_(t) { return String(t).split(/\s+/).filter(Boolean).length; }
function checkLength_(t, target) {
  // الإطالة المعقولة مقبولة (تزيد الصفحات قليلاً فقط)؛ نرفض فقط الردود الشاذة جداً كأن يكتب النموذج البحث كله في جزء واحد
  if (words_(t) > Math.max(5 * target, target + 700)) throw new Error('الرد أطول بكثير من المطلوب');
  if (words_(t) < 0.3 * target) throw new Error('الرد أقصر بكثير من المطلوب');
}
function checkHeadings_(min) {
  return function (t) { if ((t.match(/^#{2,6}\s/gm) || []).length < min) throw new Error('الرد لا يتبع العناوين المطلوبة'); };
}
function cleanAbstract_(t) {
  // نكتفي بما قبل سطر الكلمات المفتاحية وسطرها، ونحذف أي إضافات بعده
  const lines = String(t).split('\n'), out = [];
  for (let i = 0; i < lines.length; i++) {
    out.push(lines[i]);
    if (/الكلمات المفتاحية|Keywords/i.test(lines[i])) break;
  }
  return out.join('\n').trim();
}
function checkAbstract_(target) {
  return function (t) {
    const a = cleanAbstract_(t);
    if (/^#/m.test(a)) throw new Error('المستخلص يحتوي عناوين');
    checkLength_(a, target);
  };
}
function cleanReferences_(t) {
  // نُبقي عناوين المصادر والمراجع والبنود المرقمة فقط، ونحذف أي فقرات أخرى أقحمها النموذج
  return String(t).split('\n').filter(function (l) {
    const x = l.trim();
    if (/^([-*•]|\d+[.)-])\s+/.test(x)) return /(19|20)\d\d|[١٢][٩٠][٠-٩][٠-٩]|n\.d\.|د\.ت/.test(x);
    return /^#{1,6}\s/.test(x) && /المصادر|المراجع|References|Sources|Bibliography/i.test(x);
  }).join('\n');
}
/** يقسم نص الفصل إلى مباحث حسب عناوين «## »؛ الفقرة التمهيدية تُضم إلى المبحث الأول. */
function splitChapter_(t, n) {
  const parts = String(t).split(/^##(?!#)[ \t]*.*$/m);
  if (parts.length - 1 !== n) throw new Error('الفصل لا يحتوي المباحث المطلوبة (' + (parts.length - 1) + ' من ' + n + ')');
  const intro = parts.shift().trim();
  return parts.map(function (p, j) { return ((j === 0 && intro ? intro + '\n\n' : '') + p.trim()).trim(); });
}

function checkReferences_(t) {
  t = cleanReferences_(t);
  const items = String(t).split('\n').filter(function (l) { return /^\s*([-*•]|\d+[.)-])\s+/.test(l); });
  const dated = items.filter(function (l) { return /(19|20)\d\d|[١٢][٩٠][٠-٩][٠-٩]/.test(l); });
  if (items.length < 4 || dated.length < 0.7 * items.length) throw new Error('قائمة المراجع غير صحيحة');
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
    const secs = r.pages <= 8 ? 'مبحثان' : '2 إلى 3 مباحث';
    const text = write('ضع خطة البحث: عنواناً نهائياً دقيقاً (حسّن العنوان المقترح إن لزم)، و' + n +
      ' فصول، لكل فصل ' + secs + '. يكون الفصل الأول إطاراً نظرياً ومفاهيمياً، وتتدرج الفصول التالية نحو التحليل ' +
      'والتطبيق أو الدراسات السابقة بحسب طلب الطالب. اجعل العناوين دقيقة وأكاديمية وقصيرة ومن دون ترقيم. ' +
      'لا تُدرج المقدمة أو الخاتمة أو المراجع ضمن الفصول.\n' +
      'أجب بكائن JSON فقط بهذا الشكل: {"title": "...", "chapters": [{"title": "...", "sections": ["...", "..."]}]}',
      { json: true, validate: parseOutline_ });
    job.outline = parseOutline_(text);
  } else if (name === 'abstract') {
    job.parts.abstract = write(P + 'اكتب مستخلص البحث في نحو ' + sz.abstract + ' كلمة في فقرة واحدة متماسكة دون عنوان: ' +
      'موضوع البحث وأهميته، ثم هدفه، ثم منهجه، ثم أبرز ما توصل إليه. ثم اكتب في سطر مستقل: ' +
      (r.language === 'ar' ? '**الكلمات المفتاحية:** ' : '**Keywords:** ') + 'تليها 4 إلى 6 كلمات مفتاحية مفصولة بفواصل.',
      { validate: checkAbstract_(sz.abstract) });
    job.parts.abstract = cleanAbstract_(job.parts.abstract);
  } else if (name === 'intro') {
    const parts = r.pages <= 10
      ? 'مشكلة البحث، أهمية البحث، أهداف البحث، منهج البحث'
      : 'مشكلة البحث (مع صياغة تساؤلاته)، أهمية البحث (النظرية والتطبيقية)، أهداف البحث، حدود البحث (الموضوعية، ' +
        'والمكانية: ' + r.governorate + '، والزمانية: العام الدراسي الحالي)، منهج البحث، تحديد المصطلحات (مصطلحان أو ثلاثة لغةً واصطلاحاً)';
    job.parts.intro = write(P + 'اكتب مقدمة البحث في نحو ' + sz.intro + ' كلمة: فقرة تمهيدية تعرض الموضوع وسياقه، ثم العناصر ' +
      'الآتية بالترتيب، كل عنصر تحت عنوان فرعي ### مسبوق بالترتيب الوصفي (' +
      (r.language === 'ar' ? 'أولاً: ، ثانياً: ، ...' : 'First: , Second: , ...') + '): ' + parts + '.',
      { validate: function (t) { checkHeadings_(3)(t); checkLength_(t, sz.intro); } });
  } else if (name.indexOf('ch:') === 0) {
    const i = Number(name.split(':')[1]);
    const ch = job.outline.chapters[i];
    const nSec = job.outline.chapters.reduce(function (a, c) { return a + c.sections.length; }, 0);
    const per = Math.max(80, Math.round(sz.body / nSec));
    const text = write(P + 'اكتب الآن متن الفصل ' + (i + 1) + ': «' + ch.title + '» كاملاً. ابدأ بفقرة تمهيدية قصيرة للفصل، ' +
      'ثم اكتب كل مبحث تحت سطر عنوان يبدأ بعلامتي ## متبوعتين باسم المبحث كما هو بالضبط، بهذا الترتيب:\n' +
      ch.sections.map(function (sec) { return '## ' + sec; }).join('\n') + '\n' +
      'في نحو ' + per + ' كلمة لكل مبحث. داخل المبحث يمكنك استخدام عناوين فرعية ### مسبوقة بالترتيب الوصفي (أولاً، ثانياً...). ' +
      'لا تكتب عنوان الفصل، ولا مباحث غير المذكورة، ولا خلاصة عامة للبحث.',
      { validate: function (t) { splitChapter_(t, ch.sections.length); checkLength_(t, per * ch.sections.length); } });
    splitChapter_(text, ch.sections.length).forEach(function (part, j) { job.parts['sec:' + i + ':' + j] = part; });
  } else if (name.indexOf('sec:') === 0) {
    const ij = name.split(':').slice(1).map(Number);
    const ch = job.outline.chapters[ij[0]];
    const nSec = job.outline.chapters.reduce(function (a, c) { return a + c.sections.length; }, 0);
    const words = Math.round(sz.body / nSec);
    const opening = ij[1] === 0 ? 'ابدأ بفقرة تمهيدية قصيرة للفصل، ثم ' : '';
    job.parts[name] = write(P + 'نكتب الآن الفصل ' + (ij[0] + 1) + ': «' + ch.title + '». ' + opening +
      'اكتب متن المبحث «' + ch.sections[ij[1]] + '» في نحو ' + words + ' كلمة. لا تكتب عنوان المبحث ولا عنوان الفصل ' +
      '(سيُضافان تلقائياً)، وابدأ بالمتن مباشرة. يمكنك تقسيم المبحث إلى عناوين فرعية ### مسبوقة بالترتيب الوصفي ' +
      '(أولاً، ثانياً...) إن احتاج ذلك. لا تكتب مباحث أخرى ولا خلاصة عامة للبحث.',
      { validate: function (t) { checkLength_(t, words); } });
  } else if (name.indexOf('review:') === 0) {
    const key = name.slice(7);
    job.parts[key] = review_(r, job.parts[key], job);
  } else if (name === 'conclusion') {
    const ar = r.language === 'ar';
    const heads = ar ? ['### أولاً: الاستنتاجات', '### ثانياً: التوصيات', '### ثالثاً: المقترحات']
                     : ['### First: Conclusions', '### Second: Recommendations', '### Third: Suggestions for Future Research'];
    job.parts.conclusion = write(P + 'اكتب خاتمة البحث في نحو ' + sz.conc + ' كلمة تحت العناوين الآتية بالترتيب: ' +
      (r.pages <= 10 ? heads.slice(0, 2) : heads).join(' ، ') + '. اكتب تحت كل عنوان نقاطاً مرقمة (1- ، 2- ...)، ' +
      'كل نقطة جملة أو جملتان دقيقتان مستخلصتان مما ورد في الفصول، والتوصيات موجهة إلى جهات محددة.',
      { validate: function (t) { checkHeadings_(2)(t); checkLength_(t, sz.conc); } });
  } else if (name === 'references') {
    job.parts.references = write(P + 'اكتب قائمة المصادر والمراجع بأسلوب APA (' + sz.refs + ' مراجع تقريباً)، ' +
      (r.language === 'ar'
        ? 'تحت عنوانين: ### أولاً: المصادر العربية ثم ### ثانياً: المصادر الأجنبية، كل قسم مرتب أبجدياً، '
        : 'in one list ordered alphabetically by author, ') +
      'كل مرجع في سطر يبدأ بـ "- ". تشمل المراجع التي وثّقتها في متن البحث. أدرج فقط مراجع حقيقية منشورة أنت واثق ' +
      'من وجودها وبياناتها، ولا تضع أرقام DOI أو روابط إلا إذا كنت متأكداً منها تماماً. اكتب القائمة فقط دون أي تعليق.',
      { validate: checkReferences_ });
    job.parts.references = cleanReferences_(job.parts.references);
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
  const ar = r.language === 'ar';
  return 'أنت أستاذ جامعي وباحث أكاديمي متمرس في الجامعات العراقية، تكتب بحثاً جامعياً رصيناً وأصيلاً وفق الأعراف ' +
    'المعتمدة في وزارة التعليم العالي والبحث العلمي العراقية.\n\nبيانات البحث:\n' +
    '- الجامعة: ' + r.university + ' / الكلية: ' + r.college + ' / القسم: ' + r.department + '\n' +
    '- المحافظة: ' + r.governorate + '\n- عنوان البحث المقترح: ' + r.title + '\n' +
    '- ما يريده الطالب في البحث:\n' + r.details + '\n\nقواعد الكتابة:\n' +
    '- لغة البحث: ' + (ar ? 'العربية الفصحى' : 'English (formal academic)') + '. اكتب كل المحتوى بهذه اللغة فقط.\n' +
    '- الرصانة: لغة علمية محكمة وموضوعية، بصيغة الغائب أو «يرى الباحث»، دون عبارات إنشائية أو مبالغات أو أحكام بلا دليل. ' +
    'كل فقرة تبدأ بفكرة محورية ثم تدعمها بالتحليل والشواهد والتوثيق، وتربطها بما قبلها وما بعدها.\n' +
    '- العمق: حلّل وقارن وانقد ووازن بين الآراء، واربط المفاهيم بواقع التخصص، ولا تكتفِ بالسرد أو التعداد.\n' +
    '- الأصالة: اكتب كل جملة بصياغتك الخاصة. لا تنسخ أي نص حرفياً من كتب أو مواقع أو أبحاث، ولا تستخدم العبارات ' +
    'الجاهزة المتداولة. عند عرض تعريف أو فكرة لباحث آخر أعد صياغتها كلياً بأسلوبك ثم وثّقها. الاقتباس الحرفي نادر جداً، ' +
    'وإن وُجد فبين علامات تنصيص مع التوثيق.\n' +
    '- التوثيق داخل النص بأسلوب APA مثل (المؤلف، السنة) أو (Author, Year)، بمعدل توثيق واحد على الأقل في كل فقرة نظرية.\n' +
    '- لا تخترع إحصائيات أو اقتباسات أو مصادر. استشهد فقط بمصادر حقيقية معروفة أنت واثق من وجودها.\n' +
    '- استخدم Markdown بسيطاً فقط: "### " للعناوين الفرعية، و"- " للنقاط، و**نص** للتأكيد. لا جداول ولا أكواد ولا عنوان رئيسي بـ "#".\n' +
    '- التزم بعدد الكلمات المطلوب في كل جزء تقريباً ولا تتجاوزه.\n' +
    '- اكتب المحتوى مباشرة دون أي تمهيد أو تعليق موجّه للقارئ مثل "إليك..." أو "بالتأكيد".';
}

// ----------------------------- محركات الذكاء الاصطناعي -----------------------------
function engines_() {
  const G = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
  const google = function (models, extra, maxTokens) {
    return models.map(function (m) {
      return { name: 'google:' + m, key: CONFIG.GEMINI_API_KEY, model: m, url: G, extra: extra, maxTokens: maxTokens };
    });
  };
  const all = [].concat(
    google(CONFIG.GEMINI_MODELS, { reasoning_effort: 'medium' }, 8000),
    // Gemma يكتب تفكيره داخل الرد، فنعطيه مساحة أكبر ونحذف التفكير لاحقاً
    google(CONFIG.GEMMA_MODELS, {}, 16000),
    [
      { name: 'groq', key: CONFIG.GROQ_API_KEY, model: CONFIG.GROQ_MODEL, url: 'https://api.groq.com/openai/v1/chat/completions' },
      { name: 'cerebras', key: CONFIG.CEREBRAS_API_KEY, model: CONFIG.CEREBRAS_MODEL, url: 'https://api.cerebras.ai/v1/chat/completions' },
      { name: 'github', key: CONFIG.GITHUB_MODELS_TOKEN, model: CONFIG.GITHUB_MODEL, url: 'https://models.github.ai/inference/chat/completions' },
      { name: 'mistral', key: CONFIG.MISTRAL_API_KEY, model: CONFIG.MISTRAL_MODEL, url: 'https://api.mistral.ai/v1/chat/completions' },
      { name: 'openrouter', key: CONFIG.OPENROUTER_API_KEY, model: CONFIG.OPENROUTER_MODEL, url: 'https://openrouter.ai/api/v1/chat/completions' },
    ],
    google(CONFIG.LITE_MODELS, { reasoning_effort: 'low' }, 8000)
  );
  return all.filter(function (e) { return e.key && e.model; });
}

/** يحذف «التفكير» الذي تكتبه بعض النماذج (مثل Gemma) داخل الرد. */
function stripThoughts_(t) {
  return String(t).replace(/<(thought|think|thinking)>[\s\S]*?<\/\1>/gi, '').replace(/^[\s\S]*<\/(thought|think|thinking)>/i, '').trim();
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
        model: e.model, max_tokens: e.maxTokens || 8000, temperature: 0.7,
        messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }],
      }, e.extra || {});
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
      if (code === 401 || code === 403) {
        cache.put('cool_' + e.name, '1', 3600);  // مفتاح خاطئ أو بلا صلاحية: لا نكرر المحاولة لساعة
        throw new Error('HTTP ' + code + ': المفتاح غير صالح');
      }
      if (code !== 200) throw new Error('HTTP ' + code + ': ' + resp.getContentText().slice(0, 200));
      const choice = JSON.parse(resp.getContentText()).choices[0];
      if (choice.finish_reason === 'length') throw new Error('انقطع الرد لتجاوز الطول');
      const text = stripThoughts_((choice.message && choice.message.content) || '');
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
function hijriYear_(d) {
  // تقريب كافٍ للسنة الهجرية (السنة الهجرية أقصر بنحو 11 يوماً)
  const g = d.getFullYear() + (d.getMonth() + d.getDate() / 31) / 12;
  return Math.floor((g - 622.54) * 365.2422 / 354.367) + 1;
}
function arDigits_(s) { return String(s).replace(/\d/g, function (c) { return '٠١٢٣٤٥٦٧٨٩'[c]; }); }

function buildDocs_(r, job) {
  const rtl = r.language === 'ar';
  const L = rtl
    ? { rep: 'جمهورية العراق', min: 'وزارة التعليم العالي والبحث العلمي', titled: 'بحث بعنوان',
        submitted: 'بحث مقدَّم إلى ' + r.department + ' – ' + r.college + '، وهو جزء من متطلبات الدراسة',
        by: 'إعداد الطالب', sup: 'بإشراف', toc: 'المحتويات', n: 'ت', topic: 'الموضوع', abstract: 'المستخلص',
        intro: 'المقدمة', chapter: 'الفصل', section: 'المبحث', conc: 'الخاتمة', refs: 'المصادر والمراجع',
        ord: ['الأول', 'الثاني', 'الثالث', 'الرابع', 'الخامس'] }
    : { rep: 'Republic of Iraq', min: 'Ministry of Higher Education and Scientific Research', titled: 'A Research Paper Entitled',
        submitted: 'Submitted to the ' + r.department + ', ' + r.college + ', as part of the study requirements',
        by: 'Prepared by', sup: 'Supervised by', toc: 'Table of Contents', n: 'No.', topic: 'Subject', abstract: 'Abstract',
        intro: 'Introduction', chapter: 'Chapter', section: 'Section', conc: 'Conclusion', refs: 'References',
        ord: ['One', 'Two', 'Three', 'Four', 'Five'] };
  const font = rtl ? 'Amiri' : 'Times New Roman';
  const base = rtl ? 14 : 12;
  const title = job.outline.title;
  const doc = DocumentApp.create(r.id + '- ' + title);
  const body = doc.getBody();
  // هوامش 2.5 سم، و3 سم لجهة التجليد (اليمين في البحث العربي)
  body.setMarginTop(71).setMarginBottom(71).setMarginLeft(rtl ? 71 : 85).setMarginRight(rtl ? 85 : 71);
  const A = DocumentApp.Attribute, H = DocumentApp.HorizontalAlignment, PH = DocumentApp.ParagraphHeading;

  function style(p, size, align, dirRtl, spacing) {
    const s = {};
    s[A.FONT_FAMILY] = font;
    s[A.FONT_SIZE] = size;
    s[A.FOREGROUND_COLOR] = '#000000';
    s[A.LINE_SPACING] = spacing || 1.5;
    s[A.SPACING_BEFORE] = 0;
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
  function isRtl(text) { return rtl && (/[؀-ۿ]/.test(text) || !String(text).trim()); }
  function para(text, opts) {
    opts = opts || {};
    const p = addText(body.appendParagraph(''), text, opts.bold);
    if (opts.heading) p.setHeading(opts.heading);
    style(p, opts.size || base, opts.align, isRtl(text), opts.spacing);
    if (opts.before) p.setSpacingBefore(opts.before);
    return p;
  }
  function heading(text, level) {
    return para(text, { heading: level === 1 ? PH.HEADING1 : level === 2 ? PH.HEADING2 : PH.HEADING3,
                        size: base + (level === 1 ? 4 : level === 2 ? 2 : 0), bold: true,
                        align: level === 1 ? H.CENTER : H.JUSTIFY, before: level === 1 ? 0 : 10 });
  }
  function blank(n, size) { for (let i = 0; i < n; i++) para('', { align: H.CENTER, size: size || 10, spacing: 1 }); }
  function markdown(md, skipFirstHeading) {
    String(md || '').split('\n').forEach(function (raw, idx) {
      const line = raw.trim();
      if (!line || line === '---' || line === '***') return;
      let m;
      if ((m = line.match(/^(#{1,6})\s+(.*)$/))) {
        if (skipFirstHeading && idx === 0) return;
        heading(m[2].replace(/^\*+|\*+$/g, ''), 3);
      } else if ((m = line.match(/^[-*•]\s+(.*)$/))) {
        const li = addText(body.appendListItem(''), m[1]).setGlyphType(DocumentApp.GlyphType.BULLET);
        style(li, base, H.JUSTIFY, isRtl(m[1]));
      } else para(line);
    });
  }
  function chapterName(i) { return L.chapter + ' ' + (L.ord[i] || (i + 1)); }
  function sectionName(i, j) { return rtl ? L.section + ' ' + (L.ord[j] || (j + 1)) : (i + 1) + '.' + (j + 1); }

  // ---------- الغلاف ----------
  [L.rep, L.min, r.university, r.college, r.department].forEach(function (t, i) {
    para(t, { align: H.CENTER, bold: true, size: i < 2 ? 15 : 14, spacing: 1 }).setSpacingAfter(2);
  });
  blank(3);
  para(L.titled, { align: H.CENTER, size: base });
  para(title, { align: H.CENTER, bold: true, size: rtl ? 22 : 20, spacing: 1.15 });
  blank(1);
  para(L.submitted, { align: H.CENTER, size: base - 1, spacing: 1.15 });
  blank(2);
  para(L.by, { align: H.CENTER, bold: true, size: base + 1, spacing: 1.15 });
  para(r.student_name, { align: H.CENTER, size: base + 1, spacing: 1.15 });
  blank(1);
  para(L.sup, { align: H.CENTER, bold: true, size: base + 1, spacing: 1.15 });
  para(r.supervisor, { align: H.CENTER, size: base + 1, spacing: 1.15 });
  blank(2);
  const now = new Date();
  para(rtl ? r.governorate + '   ' + arDigits_(hijriYear_(now)) + 'هـ  –  ' + arDigits_(now.getFullYear()) + 'م'
           : (GOVERNORATES[r.governorate] || r.governorate) + ' – ' + now.getFullYear(),
       { align: H.CENTER, bold: true, size: base });

  // ---------- صفحة البسملة والآية ----------
  if (rtl && CONFIG.VERSE_PAGE) {
    body.appendPageBreak();
    blank(8);
    para('بسم الله الرحمن الرحيم', { align: H.CENTER, bold: true, size: 20 });
    blank(1);
    para('﴿ وَقُل رَّبِّ زِدْنِي عِلْمًا ﴾', { align: H.CENTER, bold: true, size: 30 });
    blank(1);
    para('صدق الله العظيم', { align: H.CENTER, bold: true, size: 16 });
    para('سورة طه: الآية ١١٤', { align: H.CENTER, size: 13 });
  }

  // ---------- المحتويات (جدول) ----------
  body.appendPageBreak();
  heading(L.toc, 1);
  const rows = [[L.abstract, false], [L.intro, false]];
  job.outline.chapters.forEach(function (c, i) {
    rows.push([chapterName(i) + ': ' + c.title, false]);
    c.sections.forEach(function (sec, j) { rows.push([sectionName(i, j) + ': ' + sec, true]); });
  });
  rows.push([L.conc, false], [L.refs, false]);
  // في البحث العربي نعكس ترتيب الأعمدة ليظهر عمود التسلسل على اليمين
  const cells = [[L.n, L.topic]].concat(rows.map(function (x, i) { return [rtl ? arDigits_(i + 1) : String(i + 1), x[0]]; }));
  const table = body.appendTable(cells.map(function (c) { return rtl ? [c[1], c[0]] : c; }));
  table.setBorderColor('#000000').setBorderWidth(0.75);
  for (let i = 0; i < table.getNumRows(); i++) {
    const row = table.getRow(i);
    for (let j = 0; j < row.getNumCells(); j++) {
      const cell = row.getCell(j).setPaddingTop(3).setPaddingBottom(3);
      const isNum = (rtl ? j === 1 : j === 0);
      if (i === 0) cell.setBackgroundColor('#e8ebf2');
      const p = cell.getChild(0).asParagraph();
      style(p, base - 1, isNum || i === 0 ? H.CENTER : H.JUSTIFY, rtl, 1.15);
      p.setSpacingAfter(0);
      if (i === 0 || (!isNum && !rows[i - 1][1])) p.editAsText().setBold(true);
      if (!isNum && i > 0 && rows[i - 1][1]) p.setIndentStart(18);
    }
  }
  table.setColumnWidth(rtl ? 1 : 0, 40);

  // ---------- المستخلص والمقدمة ----------
  body.appendPageBreak();
  heading(L.abstract, 1);
  markdown(job.parts.abstract);
  body.appendPageBreak();
  heading(L.intro, 1);
  markdown(job.parts.intro);

  // ---------- الفصول ----------
  job.outline.chapters.forEach(function (c, i) {
    body.appendPageBreak();
    heading(chapterName(i), 1);
    para(c.title, { align: H.CENTER, bold: true, size: base + 3, spacing: 1.3 });
    c.sections.forEach(function (sec, j) {
      heading(sectionName(i, j) + ': ' + sec, 2);
      markdown(job.parts['sec:' + i + ':' + j], /^\s*#/.test(job.parts['sec:' + i + ':' + j] || '') &&
        String(job.parts['sec:' + i + ':' + j]).split('\n')[0].indexOf(String(sec).slice(0, 12)) > -1);
    });
  });

  // ---------- الخاتمة والمراجع ----------
  body.appendPageBreak();
  heading(L.conc, 1);
  markdown(job.parts.conclusion);
  body.appendPageBreak();
  heading(L.refs, 1);
  String(job.parts.references || '').split('\n').forEach(function (line) {
    line = line.trim();
    if (!line) return;
    const h = line.match(/^#{1,6}\s+(.*)$/);
    if (h) { heading(h[1], 3); return; }
    line = line.replace(/^([-*•]|\d+[.)-])\s+/, '');
    const p = para(line);
    p.setIndentFirstLine(0).setIndentStart(28);  // تعليق بارز
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
  return '<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;background:#f5f7fb;padding:24px">' +
    '<div style="max-width:620px;margin:auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #dfe3ec">' +
    '<div style="background:#1d3a8a;color:#fff;padding:18px 24px;font-size:20px;font-weight:bold;border-bottom:4px solid #17a398">✦ منصة منهج</div>' +
    '<div style="padding:24px;color:#222;line-height:1.9;font-size:15px">' + body + '</div></div></div>';
}

function mail_(to, subject, html, attachments) {
  MailApp.sendEmail({ to: to, subject: subject, htmlBody: wrap_(html), name: 'منصة منهج', attachments: attachments || [] });
}

function safeMail_(to, subject, html) {
  try { mail_(to, subject, html); } catch (e) { console.error('تعذر إرسال الإيميل: ' + e); }
}

function paymentHtml_(r) {
  return '<div style="background:#f5f7fb;border:1px solid #dfe3ec;border-radius:12px;padding:14px 16px;margin-top:14px">' +
    '<b>طريقة الدفع</b><br>سعر البحث: <b>' + CONFIG.PRICE_IQD.toLocaleString('en-US') + ' دينار عراقي</b><br>' +
    'حوّل المبلغ عبر <b>' + CONFIG.PAYMENT_METHOD + '</b> إلى الحساب رقم:<br>' +
    '<span style="display:inline-block;font-size:22px;font-weight:bold;letter-spacing:2px;direction:ltr;margin:6px 0">' +
    CONFIG.PAYMENT_ACCOUNT + '</span><br><b style="color:#c2412d">مهم:</b> اكتب اسمك (' + esc_(r.student_name) +
    ') في ملاحظات التحويل حتى نتعرف على دفعتك.</div>';
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
    row('القسم', r.department) + row('المحافظة', r.governorate) + row('المشرف', r.supervisor) + row('العنوان', r.title) +
    row('اللغة', r.language === 'ar' ? 'العربية' : 'الإنجليزية') + row('عدد الصفحات', r.pages) + '</table>' +
    '<p><b>تفاصيل الطالب:</b><br>' + esc_(r.details).replace(/\n/g, '<br>') + '</p>' +
    '<p style="background:#fff8e6;border-radius:10px;padding:10px 14px">تحقق من وصول تحويل ' + CONFIG.PAYMENT_METHOD +
    ' بمبلغ ' + CONFIG.PRICE_IQD.toLocaleString('en-US') + ' دينار باسم «' + esc_(r.student_name) + '» قبل الموافقة.</p>' +
    '<p style="text-align:center;margin-top:22px">' + btn(reviewUrl_(r.id, 'approve'), 'موافقة ✓', '#2e7d4f') +
    btn(reviewUrl_(r.id, 'reject'), 'رفض ✗', '#b23b3b') + '</p>');
}

function esc_(s) {
  return String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

// ----------------------------- صفحات HTML -----------------------------
// الهوية: لازوردي بغدادي عميق + فيروزي، مع نجمة ثمانية من الزخرفة الإسلامية كعلامة ونقش خلفية خفيف.
const STAR_PATH = 'M50 4 63 21 84 16 79 37 96 50 79 63 84 84 63 79 50 96 37 79 16 84 21 63 4 50 21 37 16 16 37 21Z';
const LOGO = '<svg class="logo" viewBox="0 0 100 100" aria-hidden="true"><path d="' + STAR_PATH + '" fill="var(--lapis)"/>' +
  '<path d="' + STAR_PATH + '" fill="none" stroke="var(--turq)" stroke-width="3" transform="translate(50 50) scale(.78) translate(-50 -50)"/>' +
  '<circle cx="50" cy="50" r="9" fill="var(--turq)"/></svg>';
const PATTERN = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='56' height='56' viewBox='0 0 100 100'%3E%3Cpath d='" +
  STAR_PATH.replace(/ /g, '%20') + "' fill='none' stroke='black' stroke-width='2.5'/%3E%3C/svg%3E\")";

const CSS = '<link rel="preconnect" href="https://fonts.googleapis.com">' +
  '<link href="https://fonts.googleapis.com/css2?family=Reem+Kufi:wght@500;700&family=Readex+Pro:wght@300;400;500;600&family=Amiri:wght@400;700&display=swap" rel="stylesheet">' +
  '<style>' +
  ':root{--lapis:#1d3a8a;--lapis-deep:#13275e;--turq:#17a398;--ink:#141b2d;--muted:#5b6478;--line:#dfe3ec;--bg:#f5f7fb;' +
  '--card:#ffffff;--field:#f8f9fc;--on-lapis:#ffffff;--gold:#d9a521;--ok:#16825d;--err:#c2412d;--err-bg:#fdeeea;--pattern:#1d3a8a;' +
  '--display:"Reem Kufi",Tahoma,sans-serif;--body:"Readex Pro",Tahoma,sans-serif}' +
  '@media (prefers-color-scheme:dark){:root{--lapis:#5b7fe0;--lapis-deep:#0d1630;--turq:#3cc8bc;--ink:#e8ecf6;--muted:#9aa3b8;' +
  '--line:#273152;--bg:#0b1122;--card:#121a33;--field:#0f1630;--on-lapis:#0b1122;--gold:#e9bb45;--ok:#45c48e;--err:#f08a74;' +
  '--err-bg:#3a1c17;--pattern:#7f9cff;color-scheme:dark}}' +
  '[hidden]{display:none!important}*{box-sizing:border-box}html{scroll-behavior:smooth}@media (prefers-reduced-motion:reduce){html{scroll-behavior:auto}*{transition:none!important;animation:none!important}}' +
  'body{margin:0;background:var(--bg);color:var(--ink);font-family:var(--body);font-size:16px;line-height:1.75;-webkit-font-smoothing:antialiased}' +
  'a{color:var(--lapis)}' +
  '.wrap{max-width:720px;margin:0 auto;padding-inline:max(16px,env(safe-area-inset-left,0px))}' +
  /* البطاقة العلوية */
  '.hero{position:relative;overflow:hidden;background:linear-gradient(160deg,var(--lapis) 0%,var(--lapis-deep) 100%);color:#fff;padding-block:22px 64px}' +
  '.hero::before{content:"";position:absolute;inset:0;background:#fff;opacity:.07;-webkit-mask:' + PATTERN + ';mask:' + PATTERN + '}' +
  '.hero>*{position:relative}' +
  '.brand{display:flex;align-items:center;gap:10px;font-family:var(--display);font-size:1.45rem;font-weight:700}' +
  '.brand .logo{width:42px;height:42px;--lapis:#fff;--on-lapis:#13275e}' +
  '.hero h1{font-family:var(--display);font-weight:700;font-size:clamp(1.8rem,6vw,2.6rem);line-height:1.35;margin:30px 0 10px;text-wrap:balance}' +
  '.hero h1 em{font-style:normal;color:#7fe3d8}' +
  '.hero p{margin:0;max-width:34em;color:#d6def5}' +
  '.price{display:inline-flex;align-items:baseline;gap:8px;margin-top:22px;background:#fff;color:#13275e;border-radius:14px;padding:10px 18px;box-shadow:0 10px 30px rgba(0,0,0,.25)}' +
  '.price b{font-family:var(--display);font-size:1.7rem;font-variant-numeric:tabular-nums;line-height:1}' +
  '.price span{font-size:.95rem;font-weight:500}.price small{color:#5b6478;font-size:.82rem;margin-inline-start:4px}' +
  '.perks{display:flex;flex-wrap:wrap;gap:8px;margin-top:18px;padding:0;list-style:none}' +
  '.perks li{background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.18);border-radius:99px;padding:4px 14px;font-size:.88rem}' +
  /* خطوات العمل */
  '.how{position:relative;z-index:1;display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:-38px 0 22px;padding:0;list-style:none;counter-reset:s}' +
  '.how li{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:14px;font-size:.88rem;color:var(--muted);counter-increment:s;min-width:0}' +
  '.how li::before{content:counter(s);display:grid;place-items:center;width:28px;height:28px;border-radius:50%;background:var(--turq);color:#fff;font-weight:600;margin-bottom:6px;font-variant-numeric:tabular-nums}' +
  '.how b{display:block;color:var(--ink);font-weight:600;font-size:.95rem}' +
  '@media(max-width:520px){.how{grid-template-columns:1fr}.how li{display:flex;gap:12px;align-items:center}.how li::before{margin:0;flex:none}}' +
  /* المعالج */
  '.card{background:var(--card);border:1px solid var(--line);border-radius:20px;padding:22px;box-shadow:0 12px 40px rgba(20,27,45,.06)}' +
  '.prog{display:flex;gap:6px;margin-bottom:6px}.prog i{flex:1;height:6px;border-radius:9px;background:var(--line);transition:background .3s}' +
  '.prog i.on{background:var(--turq)}' +
  '.stepname{display:flex;justify-content:space-between;align-items:baseline;gap:10px;margin-bottom:14px}' +
  '.stepname h2{font-family:var(--display);font-size:1.35rem;margin:0;color:var(--lapis)}.stepname span{color:var(--muted);font-size:.85rem;font-variant-numeric:tabular-nums}' +
  '.step{display:none;animation:in .35s ease}.step.active{display:block}@keyframes in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}' +
  '.grid{display:grid;grid-template-columns:1fr 1fr;gap:0 14px}.full{grid-column:1/-1}@media(max-width:560px){.grid{grid-template-columns:1fr}}' +
  '.f{display:block;margin-bottom:14px}.f>span{display:block;font-weight:500;font-size:.92rem;margin-bottom:6px}' +
  'input,textarea,select{display:block;width:100%;font:inherit;font-size:16px;color:var(--ink);background:var(--field);border:1.5px solid var(--line);border-radius:12px;padding:12px 14px;transition:border-color .2s,box-shadow .2s}' +
  'textarea{resize:vertical;min-height:130px}input::placeholder,textarea::placeholder{color:var(--muted);opacity:.7}' +
  'select{appearance:auto;padding-block:11px}input:focus,textarea:focus,select:focus{outline:none;border-color:var(--lapis);box-shadow:0 0 0 4px color-mix(in srgb,var(--lapis) 18%,transparent)}' +
  '.f.bad input,.f.bad textarea,.f.bad select{border-color:var(--err)}.f .msg{display:none;color:var(--err);font-size:.83rem;margin-top:4px}.f.bad .msg{display:block}' +
  '.hint{display:flex;justify-content:space-between;color:var(--muted);font-size:.8rem;margin-top:4px;font-variant-numeric:tabular-nums}' +
  '.seg{display:grid;grid-template-columns:1fr 1fr;gap:8px}.seg input{position:absolute;opacity:0;pointer-events:none}' +
  '.seg label span{display:block;text-align:center;padding:12px;border:1.5px solid var(--line);border-radius:12px;cursor:pointer;background:var(--field);font-weight:500;transition:all .2s}' +
  '.seg input:checked+span{background:var(--lapis);border-color:var(--lapis);color:var(--on-lapis)}.seg input:focus-visible+span{box-shadow:0 0 0 4px color-mix(in srgb,var(--lapis) 25%,transparent)}' +
  '.pages{display:flex;align-items:center;gap:14px}.pages output{font-family:var(--display);font-size:1.9rem;color:var(--lapis);min-width:2.4ch;text-align:center;font-variant-numeric:tabular-nums}' +
  'input[type=range]{padding:0;border:0;background:none;accent-color:var(--turq);height:28px;box-shadow:none}' +
  '.nav{display:flex;gap:10px;margin-top:8px}' +
  'button{font:inherit;font-weight:600;border:0;border-radius:12px;padding:14px 22px;cursor:pointer;transition:transform .1s,filter .2s}' +
  'button:active{transform:scale(.98)}button:focus-visible{outline:3px solid var(--turq);outline-offset:2px}' +
  '.primary{flex:1;background:var(--lapis);color:var(--on-lapis)}.primary:hover{filter:brightness(1.08)}.ghost{background:transparent;color:var(--muted);border:1.5px solid var(--line)}' +
  '.go{background:linear-gradient(135deg,var(--turq),var(--lapis));color:#fff;font-size:1.05rem}' +
  'button[disabled]{opacity:.65;cursor:progress}' +
  '.welcome{display:none;background:color-mix(in srgb,var(--turq) 12%,var(--card));border-radius:12px;padding:10px 14px;margin-bottom:14px;font-size:.9rem}' +
  /* المراجعة */
  '.sum{display:grid;grid-template-columns:max-content 1fr;gap:8px 16px;margin:0 0 16px;font-size:.93rem}.sum dt{color:var(--muted)}.sum dd{margin:0;min-width:0;overflow-wrap:anywhere;white-space:pre-wrap}' +
  '.total{display:flex;justify-content:space-between;align-items:center;gap:10px;border-top:1.5px dashed var(--line);padding-top:14px;margin-bottom:14px}' +
  '.total b{font-family:var(--display);font-size:1.5rem;color:var(--lapis);font-variant-numeric:tabular-nums}' +
  '.note{font-size:.83rem;color:var(--muted);margin:0 0 14px}' +
  '.alert{background:var(--err-bg);color:var(--err);border-radius:12px;padding:10px 14px;margin-bottom:14px;display:none}' +
  /* النجاح */
  '.done{text-align:center;padding-block:10px}.done .logo{width:84px;height:84px;animation:pop .6s cubic-bezier(.2,1.6,.4,1)}@keyframes pop{from{transform:scale(.4) rotate(-45deg)}to{transform:none}}' +
  '.done h2{font-family:var(--display);color:var(--lapis);font-size:1.6rem;margin:12px 0 4px}.order{display:inline-block;font-family:var(--display);font-size:1.25rem;background:var(--field);border:1.5px solid var(--line);border-radius:12px;padding:6px 16px;margin:10px 0;font-variant-numeric:tabular-nums}' +
  '.next{list-style:none;padding:0;margin:16px auto 0;max-width:30em;text-align:start;display:grid;gap:8px}.next li{background:var(--field);border-radius:12px;padding:10px 14px;font-size:.92rem}' +
  'footer{text-align:center;color:var(--muted);font-size:.82rem;padding-block:26px 34px}' +
  /* صفحة المراجعة للمدير */
  '.pay{border:1.5px solid var(--line);border-radius:14px;padding:14px 16px;margin-bottom:14px;background:var(--field);text-align:start}' +
  '.pay h3{font-family:var(--display);font-size:1.05rem;margin:0 0 6px;color:var(--lapis)}.pay p{margin:0 0 8px;font-size:.92rem}' +
  '.acct{display:flex;align-items:center;justify-content:space-between;gap:10px;background:var(--card);border:1.5px dashed var(--turq);border-radius:12px;padding:8px 10px 8px 14px;margin-bottom:10px}' +
  '.acct b{font-family:var(--display);font-size:1.5rem;letter-spacing:.12em;direction:ltr;font-variant-numeric:tabular-nums;user-select:all;min-width:0}' +
  '.acct button{padding:8px 14px;font-size:.88rem;background:var(--turq);color:#fff;white-space:nowrap;flex:none}' +
  '.must{background:color-mix(in srgb,var(--gold) 18%,var(--card));border-radius:10px;padding:8px 12px;font-size:.88rem;margin:0}' +
  /* الشريط العلوي وزر التتبع */
  '.topbar{display:flex;align-items:center;justify-content:space-between;gap:10px}' +
  '.topbtn{background:rgba(255,255,255,.14);color:#fff;border:1px solid rgba(255,255,255,.28);padding:8px 16px;font-size:.9rem;border-radius:99px}' +
  '.topbtn:hover{background:rgba(255,255,255,.22)}' +
  '.herolinks{display:flex;flex-wrap:wrap;gap:14px;margin-top:16px;font-size:.92rem}.herolinks a{color:#bfe9e4;text-decoration:none;border-bottom:1px solid rgba(191,233,228,.4)}' +
  /* تتبع الطلب */
  '#track{margin-bottom:22px}.track-form{display:grid;grid-template-columns:1fr 1.6fr auto;gap:10px;align-items:end}' +
  '@media(max-width:560px){.track-form{grid-template-columns:1fr}}.track-form .f{margin:0}.track-form button{background:var(--lapis);color:var(--on-lapis)}' +
  '.tl{list-style:none;margin:18px 0 0;padding:0;display:grid;gap:0}' +
  '.tl li{position:relative;padding:0 34px 18px 0;color:var(--muted)}.tl li:last-child{padding-bottom:0}' +
  '.tl li::before{content:"";position:absolute;right:7px;top:8px;width:14px;height:14px;border-radius:50%;background:var(--card);border:2px solid var(--line)}' +
  '.tl li::after{content:"";position:absolute;right:13px;top:24px;bottom:-6px;width:2px;background:var(--line)}.tl li:last-child::after{display:none}' +
  '.tl li.done{color:var(--ink)}.tl li.done::before{background:var(--turq);border-color:var(--turq)}.tl li.done::after{background:var(--turq)}' +
  '.tl li.now{color:var(--ink);font-weight:600}.tl li.now::before{border-color:var(--lapis);box-shadow:0 0 0 5px color-mix(in srgb,var(--lapis) 18%,transparent)}' +
  '.tl small{display:block;font-weight:400;color:var(--muted)}' +
  '.bar{height:8px;border-radius:9px;background:var(--line);overflow:hidden;margin-top:6px;max-width:260px}.bar i{display:block;height:100%;background:linear-gradient(90deg,var(--turq),var(--lapis));border-radius:9px;transition:width .6s}' +
  '.trk-head{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-top:16px;padding-top:14px;border-top:1.5px dashed var(--line)}' +
  '.trk-head b{font-family:var(--display);color:var(--lapis)}' +
  /* نموذج البحث */
  '.sec-title{font-family:var(--display);color:var(--lapis);font-size:1.35rem;margin:34px 0 4px;text-align:center}.sec-sub{text-align:center;color:var(--muted);margin:0 0 16px;font-size:.92rem}' +
  '.pages3{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}' +
  '.pg{min-width:0}.pg figcaption{text-align:center;font-size:.85rem;color:var(--muted);margin-top:8px}' +
  '.paper{aspect-ratio:210/297;background:#fff;color:#111;border-radius:6px;box-shadow:0 10px 30px rgba(20,27,45,.16),0 0 0 1px rgba(20,27,45,.06);' +
  'padding:9% 8%;font-family:Amiri,serif;font-size:clamp(4.6px,1.25vw,8.4px);line-height:1.7;display:flex;flex-direction:column;overflow:hidden;direction:rtl}' +
  '.paper .c{text-align:center}.paper .b{font-weight:700}.paper .t{font-size:1.9em;font-weight:700;line-height:1.35;margin:1.6em 0 .4em}' +
  '.paper .sp{flex:1}.paper h5{font-size:1.5em;text-align:center;margin:.2em 0 .6em}.paper h6{font-size:1.2em;margin:.8em 0 .3em}' +
  '.paper table{width:100%;border-collapse:collapse;font-size:.95em}.paper td{border:.5px solid #333;padding:.25em .5em}.paper td:first-child{width:12%;text-align:center}' +
  '.paper tr:first-child td{background:#e8ebf2;font-weight:700}.paper p{margin:0 0 .5em;text-align:justify}' +
  '@media(max-width:560px){.pages3{grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}}' +
  /* الأسئلة الشائعة */
  '.faq{display:grid;gap:8px}.faq details{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:4px 16px}' +
  '.faq summary{cursor:pointer;font-weight:600;padding:10px 0;list-style:none;display:flex;justify-content:space-between;gap:10px}' +
  '.faq summary::-webkit-details-marker{display:none}.faq summary::after{content:"+";color:var(--turq);font-size:1.3rem;line-height:1}' +
  '.faq details[open] summary::after{content:"–"}.faq details p{margin:0 0 12px;color:var(--muted);font-size:.93rem}' +
  '.admin-top{background:var(--lapis-deep);color:#fff;padding-block:14px}' +
  '.ok{background:var(--ok);color:#fff;flex:1}.danger{background:var(--err);color:#fff;flex:1}' +
  '</style>';

function shell_(content, hero) {
  return '<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">' + CSS + '</head><body>' +
    (hero || '<header class="admin-top"><div class="wrap brand">' + LOGO + ' منصة منهج</div></header>') +
    '<main class="wrap">' + content + '</main><footer>منصة منهج · بحوث أكاديمية منظمة وفق المنهج العلمي</footer></body></html>';
}

// واجهة الطالب نفسها في docs/index.html (GitHub Pages)، وتتصل بالخلفية عبر doPost.

function reviewPage_(p) {
  const id = Number(p.id), a = p.a === 'reject' ? 'reject' : 'approve';
  const r = getReq_(id);
  if (!r || p.sig !== sign_(id, a)) return shell_('<section class="card" style="margin-top:22px"><h2>رابط غير صالح</h2></section>');
  const done = r.status !== 'pending' && r.status !== 'failed';
  const args = JSON.stringify([id, a, String(p.sig)]).slice(1, -1);
  return shell_(
    '<section class="card" style="margin-top:22px"><div class="stepname"><h2>' + (a === 'approve' ? 'الموافقة على' : 'رفض') +
    ' الطلب #' + id + '</h2><span>' + esc_(STATUS[r.status] || r.status) + '</span></div><dl class="sum">' +
    '<dt>الطالب</dt><dd>' + esc_(r.student_name) + '</dd><dt>البريد</dt><dd dir="ltr" style="text-align:right">' + esc_(r.email) + '</dd>' +
    '<dt>الجامعة</dt><dd>' + esc_(r.university + ' / ' + r.college + ' / ' + r.department) + '</dd>' +
    '<dt>المحافظة</dt><dd>' + esc_(r.governorate) + '</dd><dt>المشرف</dt><dd>' + esc_(r.supervisor) + '</dd>' +
    '<dt>العنوان</dt><dd>' + esc_(r.title) + '</dd><dt>اللغة</dt><dd>' + (r.language === 'ar' ? 'العربية' : 'English') + '</dd>' +
    '<dt>الصفحات</dt><dd>' + r.pages + '</dd><dt>التفاصيل</dt><dd>' + esc_(r.details) + '</dd></dl>' +
    '<p class="must" style="margin-bottom:14px">تحقق من وصول تحويل ' + CONFIG.PAYMENT_METHOD + ' بمبلغ ' +
    CONFIG.PRICE_IQD.toLocaleString('en-US') + ' دينار باسم «' + esc_(r.student_name) + '» قبل الموافقة.</p>' +
    '<div class="alert" id="msg"></div>' +
    (done ? '<p class="note">تمت معالجة هذا الطلب مسبقاً.</p>' :
      (a === 'reject' ? '<label class="f"><span>سبب الرفض (اختياري، يُرسل للطالب)</span><textarea id="reason" rows="3"></textarea></label>' +
        '<div class="nav"><button id="b" class="danger" onclick="go()">تأكيد الرفض</button></div>' :
        '<div class="nav"><button id="b" class="ok" onclick="go()">تأكيد الموافقة وبدء كتابة البحث</button></div>')) +
    '</section><script>function go(){var b=document.getElementById("b"),m=document.getElementById("msg"),r=document.getElementById("reason");' +
    'b.disabled=true;b.textContent="جارٍ التنفيذ…";google.script.run.withSuccessHandler(function(t){m.style.display="block";m.style.background="transparent";' +
    'm.style.color="var(--ok)";m.textContent=t;b.parentNode.style.display="none";if(r)r.parentNode.style.display="none";})' +
    '.withFailureHandler(function(e){b.disabled=false;m.style.display="block";m.textContent="حدث خطأ: "+e.message;})' +
    '.reviewAction(' + args + ',r?r.value:"");}</script>');
}
