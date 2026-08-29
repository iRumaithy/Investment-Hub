# Investment Hub v2.3.0

## إصلاحات OKX والرسوم
- إجمالي قيمة OKX يأتي من `/api/v5/asset/asset-valuation?ccy=USD` ويشمل Trading + Funding + Earn.
- لكل أصل نستخدم حقول OKX الرسمية `totalPnl` و`totalPnlRatio` بدل تغير السعر 24 ساعة.
- `spotUpl`, `spotUplRatio`, `openAvgPx`, `accAvgPx` محفوظة أيضًا عند توفرها.
- إجمالي العائد يحسب من PnL الفعلي المتاح من OKX فقط، ولا يختلق cost basis.
- الرسم الرئيسي يحتوي 1D / 1W / 1M / 3M / 1Y / ALL.
- الرسم الرئيسي يعيد بناء القيمة التاريخية للمراكز الحالية من شموع OKX؛ القيمة الحالية وPnL تأتي من الحساب الفعلي.
- الرسوم الفردية تستخدم OKX history-candles مع معالجة آمنة لخطأ 1015.
- Public WebSocket من OKX يحدث الأسعار الحية أثناء فتح التطبيق.
- تم إخفاء أي asset بقيمة أقل من 0.01 USD أو كمية صفرية.
- XTB يبقى عبر تقرير Open Positions وTwelve Data.

## Secrets
DASHBOARD_ACCESS_TOKEN
OKX_API_KEY
OKX_API_SECRET
OKX_PASSPHRASE
TWELVE_DATA_KEY
