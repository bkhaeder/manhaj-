/**
 * منصة منهج - إرسال الإيميلات من حسابك في Gmail مجاناً.
 *
 * طريقة التركيب:
 * 1. افتح https://script.google.com واضغط "مشروع جديد" (New project).
 * 2. احذف ما في المحرر والصق هذا الملف كاملاً.
 * 3. غيّر قيمة SECRET بالأسفل إلى كلمة سرية من اختيارك (وضع نفسها في GMAIL_SCRIPT_SECRET في Render).
 * 4. اضغط "نشر" (Deploy) ← "نشر جديد" (New deployment) ← اختر النوع "تطبيق ويب" (Web app):
 *      - تنفيذ باسم (Execute as): أنا (Me)
 *      - من لديه حق الوصول (Who has access): أي شخص (Anyone)
 * 5. اضغط "نشر" ووافق على الصلاحيات (Advanced ← Go to project ← Allow).
 * 6. انسخ "رابط تطبيق الويب" (Web app URL) الذي ينتهي بـ /exec وضعه في GMAIL_SCRIPT_URL في Render.
 */
const SECRET = 'ضع-هنا-كلمة-سرية';

function doPost(e) {
  try {
    const d = JSON.parse(e.postData.contents);
    if (d.secret !== SECRET) return reply({ ok: false, error: 'كلمة السر غير صحيحة' });
    const attachments = (d.attachments || []).map(function (a) {
      return Utilities.newBlob(Utilities.base64Decode(a.content), a.mimeType, a.name);
    });
    MailApp.sendEmail({
      to: d.to,
      subject: d.subject,
      htmlBody: d.html,
      name: d.fromName || 'منصة منهج',
      attachments: attachments,
    });
    return reply({ ok: true, remaining: MailApp.getRemainingDailyQuota() });
  } catch (err) {
    return reply({ ok: false, error: String(err) });
  }
}

function reply(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
