# Investment Hub v2.2.1

إصلاح OKX 1015 / non-JSON response.

- استخدام `https://openapi.okx.com` كـ REST base الافتراضي وفق توصية OKX الحديثة.
- fallback تلقائي إلى `https://www.okx.com`.
- عدم محاولة JSON.parse على صفحات HTML/رسائل الحماية.
- معالجة واضحة لخطأ 1015 / rate-limit وإعادة محاولة تلقائية.
- تقليل مزامنة التطبيق من كل 10 ثوان إلى كل 30 ثانية.
- فصل طلبات Trading / Funding / Savings بفواصل قصيرة لتجنب burst.
- بقية وظائف v2.2.0 محفوظة.

Cloudflare Secrets:
DASHBOARD_ACCESS_TOKEN
OKX_API_KEY
OKX_API_SECRET
OKX_PASSPHRASE
TWELVE_DATA_KEY
