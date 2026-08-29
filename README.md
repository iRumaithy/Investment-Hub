# Investment Hub v2.0.0

## التثبيت
هذه حزمة كاملة جاهزة. ارفع **كل محتويات المجلد** إلى جذر مستودع `Investment-Hub` واستبدل الملفات القديمة.

لا ترفع أي API Key أو Secret إلى GitHub.

## Cloudflare
المشروع يستخدم `wrangler.jsonc` في الجذر لتشغيل الواجهة والـWorker على نفس الرابط.
تم تفعيل `keep_vars: true` حتى لا تستبدل عمليات Wrangler المتغيرات التي أدخلتها من لوحة Cloudflare.

Secrets المطلوبة:
- `DASHBOARD_ACCESS_TOKEN`
- `OKX_API_KEY`
- `OKX_API_SECRET`
- `OKX_PASSPHRASE`

اختياري لأسعار الأسهم:
- `TWELVE_DATA_KEY`

## v2.0.0
- تصميم أبيض وذهبي ورمادي رخامي فاخر.
- أيقونة Dashboard استثمارية معتمدة.
- حفظ الإعدادات والبيانات على الجهاز عبر localStorage.
- تحديث OKX والأسعار تلقائيًا عند فتح التطبيق إذا كان الاتصال مضبوطًا.
- `/api/diagnostics` لفحص وصول Secrets بدون كشف قيمها.
- PWA cache v2 مع عدم تخزين طلبات API.
