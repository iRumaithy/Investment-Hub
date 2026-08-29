# Investment Hub v2.4.2

## أهم تغيير
تم إزالة OKX Public REST من مسار مزامنة الحساب والرسوم التاريخية لتجنب خطأ Cloudflare/OKX 1015.

### المصادر
- بيانات حساب OKX الخاصة: OKX Signed API عبر Cloudflare Worker.
- PnL والقيمة الحالية للحساب: حقول OKX الخاصة والحساب الرسمي.
- أسعار الكريبتو اللحظية أثناء فتح التطبيق: OKX Public WebSocket.
- تاريخ أسعار الكريبتو والرسوم: Twelve Data.
- أسعار وتاريخ أسهم XTB: Twelve Data.
- استيراد XTB: XLSX/CSV الحقيقي فقط، بدون بيانات وهمية.

## إصلاح مهم
زر «مزامنة OKX» لم يعد ينتظر تحميل الرسم التاريخي. نجاح الحساب يبقى نجاحًا حتى لو تعذر مصدر الرسم مؤقتًا.

## Cloudflare Secrets المطلوبة
- DASHBOARD_ACCESS_TOKEN
- OKX_API_KEY
- OKX_API_SECRET
- OKX_PASSPHRASE
- TWELVE_DATA_KEY

لا تضع أي Secret داخل GitHub أو app.js.
