# فيديو منصة منهج التسويقي

- `manhaj-promo.mp4`: الفيديو النهائي (43 ثانية، عمودي 1080×1920، مناسب لإنستغرام وتيك توك وريلز فيسبوك).
- **التعليق الصوتي:** بالعربية الفصحى، مولّد بنموذج `gemini-2.5-flash-preview-tts` بصوت Charon. النصوص في `lines.json`، والمقاطع في `voice/v0..v5.wav`.
- **الموسيقى والمؤثرات:** مولّدة برمجياً (`voice/music.wav` و`voice/sfx.wav`)، فلا حقوق نشر عليها.
- **الرسوم:** صفحة HTML تحرّكها GSAP (`build/index.html`)، ومواعيد المشاهد في `build/timing.json` مبنية على مدد مقاطع الصوت.

## إعادة الإنتاج
```bash
cd promo/build
node render.js preview ../prev      # صور معاينة لكل مشهد
node render.js full ../frames 30    # كل الإطارات
# ثم: ضم الإطارات مع الصوت المدموج بـ ffmpeg (libx264، ‏crf 18، ‏aac 192k)
```
