# محفظتي | Investment Hub

PWA عربية لإدارة استثمارات الأسهم والعملات الرقمية في لوحة واحدة، مهيأة أساسًا لـ:

- **OKX**: مزامنة API بصلاحية Read Only عبر Cloudflare Worker.
- **XTB**: استيراد تقرير XLSX/CSV ثم تحديث أسعار السوق من مزود مستقل.
- **AED / USD**: تبديل العملة الأساسية.
- **Watchlist + Analytics + Backup**.
- تعمل في **Demo Mode** فورًا بدون أي إعداد.

## الملفات

- `index.html` الواجهة.
- `styles.css` التصميم.
- `app.js` منطق التطبيق والتخزين والاستيراد.
- `manifest.json` و`sw.js` لدعم PWA والتثبيت على الجوال.
- `worker/` Cloudflare Worker الآمن.
- `sample-xtb.csv` ملف تجريبي لاختبار الاستيراد.

## 1) النشر على GitHub + Cloudflare Pages

أنشئ مستودع GitHub جديد وارفع محتويات هذا المجلد. في Cloudflare Pages اربط المستودع واختر نشر Static Site بدون build command، واجعل مجلد الإخراج هو `/` أو اترك الإعدادات الافتراضية حسب واجهة Pages الحالية.

> لا تضع أي OKX API Secret داخل GitHub أو `app.js`.

## 2) نشر Cloudflare Worker

من داخل مجلد `worker` استخدم Wrangler أو أنشئ Worker من لوحة Cloudflare والصق `index.js`.

أضف Secrets التالية في إعدادات Worker:

- `DASHBOARD_ACCESS_TOKEN` — رمز عشوائي طويل لحماية API الداشبورد.
- `OKX_API_KEY`
- `OKX_API_SECRET`
- `OKX_PASSPHRASE`
- `TWELVE_DATA_KEY`

Variables غير السرية:

- `ALLOWED_ORIGIN`: رابط Cloudflare Pages النهائي.
- `OKX_API_BASE`: افتراضيًا `https://www.okx.com`. إذا كان حسابك يتطلب نطاق OKX إقليميًا استخدم النطاق الرسمي المناسب لحسابك.

أنشئ مفتاح OKX **Read فقط**. لا تمنحه Trade أو Withdraw.

## 3) ربط الواجهة بالـ Worker

بعد نشر Worker انسخ رابطه، ثم داخل التطبيق:

`الإعدادات → رابط Cloudflare Worker + رمز دخول الـ API → حفظ`

يجب أن يطابق رمز الدخول قيمة `DASHBOARD_ACCESS_TOKEN` في Secrets. لا يتم تضمينه في النسخة الاحتياطية المصدرة.

بعدها استخدم:

- `الربط → مزامنة OKX`
- `الربط → تحديث أسعار السوق`

## 4) XTB

صدّر تقرير المراكز من XTB كـ XLSX أو CSV ثم:

`الربط → استيراد ملف XTB`

المستورد يبحث بشكل مرن عن أعمدة شبيهة بـ Symbol / Instrument، Volume / Quantity، وOpen Price / Average Price. يوجد `sample-xtb.csv` للاختبار.

## 5) Supabase

الإصدار 1.0 يعمل محليًا باستخدام `localStorage` وهو مناسب لجهاز واحد. إذا أردت تسجيل دخول ومزامنة نفس المحفظة بين iPhone والكمبيوتر، أضف **Supabase Auth + Database** في المرحلة التالية. لا تخزن أسرار OKX في Supabase client-side؛ تبقى في Cloudflare Worker Secrets.

## الأمان

- مفاتيح OKX لا تصل إلى المتصفح.
- مسارات API محمية أيضًا بـ `DASHBOARD_ACCESS_TOKEN` حتى لا تصبح بيانات المحفظة متاحة لمجرد معرفة رابط Worker.
- GitHub يمكن أن يكون Public لأن الأسرار مخزنة في Cloudflare Secrets فقط.
- يوصى باستخدام OKX API Read Only وربط المفتاح بقيود IP إذا كانت بنية النشر لديك تتيح عنوان خروج ثابتًا؛ وإلا اعتمد صلاحية القراءة فقط وقيود الحساب المدعومة من OKX.
- التطبيق لا ينفذ شراء أو بيع أو سحب.

## ملاحظات

- أسعار العملات الرقمية تعتمد على CoinGecko عبر Worker.
- أسعار الأسهم تعتمد على Twelve Data وتتطلب API key وخطة مناسبة لحجم التحديث الذي تحتاجه.
- XTB لا يعتمد على API مباشر في هذا الإصدار؛ الاستيراد هو مصدر الكميات وسعر التكلفة، والأسعار تأتي من السوق.
