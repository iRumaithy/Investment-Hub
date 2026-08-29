# Investment Hub - Cloudflare Fix

أضف الملفين التاليين إلى جذر مستودع GitHub الخاص بالمشروع:
- wrangler.jsonc
- .assetsignore

لا تضعهما داخل مجلد worker.

بعد رفعهما إلى GitHub:
1. انتظر Cloudflare حتى يعمل Deploy جديد.
2. افتح Cloudflare > investment-hub > Settings > Variables and Secrets.
3. يجب أن تظهر إمكانية إضافة Secrets بدل رسالة static assets only.

لا تضف أسرار OKX داخل GitHub.
