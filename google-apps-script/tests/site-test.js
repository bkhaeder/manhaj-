// يختبر واجهة الطالب (docs/index.html) في Chromium مع خادم وهمي يقلّد الخلفية.
// الاستخدام: node site-test.js <مجلد لحفظ الصور>
const fs = require('fs'), http = require('http'), path = require('path');
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const OUT = process.argv[2] || '.';
const page = fs.readFileSync(path.join(__dirname, '..', '..', 'docs', 'index.html'), 'utf8');
let lastSubmit = null;
const srv = http.createServer((req, res) => {
  if (req.url === '/' || req.url.startsWith('/?')) { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(page.replace('__API_URL__', 'http://localhost:' + srv.address().port + '/api')); }
  if (req.url.startsWith('/api?api=config')) { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ price: 12000, method: 'كي كارد', account: '3001941925', minPages: 5, maxPages: 20, delivery: 'خلال 24 ساعة من تأكيد التحويل' })); }
  if (req.url === '/api' && req.method === 'POST') {
    let b = ''; req.on('data', c => b += c); req.on('end', () => {
      const { fn, args } = JSON.parse(b);
      const out = fn === 'submitRequest' ? (lastSubmit = args[0], { ok: true, id: 23, email: args[0].email })
        : { ok: true, id: 23, title: 'أثر التعلم الإلكتروني', stage: 2, progress: 40, created: '2026/10/18' };
      setTimeout(() => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(out)); }, 300);
    }); return;
  }
  res.writeHead(404); res.end();
}).listen(0, async () => {
  const url = 'http://localhost:' + srv.address().port + '/';
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const p = await b.newPage({ viewport: { width: 390, height: 860 } });
  const errors = []; p.on('pageerror', e => errors.push(e.message));
  const t0 = Date.now(); await p.goto(url, { waitUntil: 'domcontentloaded' }); console.log('domcontentloaded ms', Date.now() - t0);
  await p.waitForTimeout(1500);
  console.log('price updated from server:', await p.locator('.price b').textContent());
  await p.screenshot({ path: OUT + '/site-top.png' });
  await p.fill('#student_name', 'أحمد علي'); await p.fill('#email', 'ahmed@gmail.com'); await p.click('#next');
  await p.selectOption('#governorate', 'بغداد');
  for (const [k, v] of [['university', 'جامعة بغداد'], ['college', 'كلية التربية'], ['department', 'قسم الحاسبات'], ['supervisor', 'د. سارة']]) await p.fill('#' + k, v);
  await p.click('#next'); await p.fill('#title', 'أثر التعلم الإلكتروني'); await p.fill('#details', 'فصل نظري وفصل تطبيقي');
  await p.click('.chip[data-v="20"]'); console.log('plus disabled at max:', await p.isDisabled('.pgbtn[data-d="1"]'));
  await p.click('.pgbtn[data-d="-1"]'); await p.click('.pgbtn[data-d="-1"]'); console.log('pages now:', await p.textContent('#pv'));
  await p.locator('.f:has(.pgpick)').screenshot({ path: OUT + '/site-pages.png' });
  await p.click('#next'); await p.click('#next'); await p.waitForSelector('#done:not([hidden])', { timeout: 5000 });
  console.log('submitted:', JSON.stringify(lastSubmit).slice(0, 80), '| order shown:', await p.textContent('#oid'));
  await p.goto(url + '?track=23'); await p.waitForTimeout(500);
  await p.fill('#tem', 'ahmed@gmail.com'); await p.click('#tbtn'); await p.waitForSelector('.tl', { timeout: 5000 });
  console.log('track stage now:', await p.textContent('.tl li.now'));
  await p.locator('#track').screenshot({ path: OUT + '/site-track.png' });
  console.log('page errors:', errors.length ? errors : 'none', '| h-overflow:', await p.evaluate(() => document.documentElement.scrollWidth > innerWidth));
  await b.close(); srv.close();
});
