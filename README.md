# Investment Hub v2.4.1

نسخة كاملة مبنية على v2.3.1 المستقرة.

## الجديد
- إصلاح عرض الربح/الخسارة: المبلغ والنسبة معًا مثل OKX، مثال `-$254.55 (-9.35%)`.
- إصلاح إشارة إجمالي PnL وعدم فقدان علامة السالب.
- استيراد تقرير XTB بصيغة XLSX مباشرة من ورقة `Open Positions`.
- قارئ XTB مضبوط على التنسيق الفعلي لتقرير xStation:
  `Instrument/Position`, `Ticker`, `Category`, `Type`, `Volume`, `Value`,
  `Current price`, `Open price`, `Net Profit %`, `Net Profit`.
- يمنع تكرار مركز XTB الناتج عن صف الملخص وصف Position ID.
- يحتفظ باسم الشركة من صف الملخص ويقرأ السعر/الكمية من صف المركز التفصيلي.
- يستخدم PnL الرسمي الموجود في تقرير XTB لحظة الاستيراد.
- بعد الاستيراد، Twelve Data يحدّث سعر السهم ويعيد حساب PnL للسهم بناءً على سعر الفتح ونوع BUY/SELL.
- لا توجد أي أسهم تجريبية أو مراكز وهمية.
- الترقية لا تمسح أسهم XTB الموجودة من التخزين المحلي.
- Service Worker cache مرفوع إلى v2.4.1 لإجبار التطبيق على استلام النسخة الجديدة.

## Cloudflare Secrets المطلوبة
- `DASHBOARD_ACCESS_TOKEN`
- `OKX_API_KEY`
- `OKX_API_SECRET`
- `OKX_PASSPHRASE`
- `TWELVE_DATA_KEY`

## XTB
من xStation Web:
Account History → Orders → Export

ارفع ملف XLSX مباشرة من قسم XTB داخل التطبيق.
