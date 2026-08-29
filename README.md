# Investment Hub v2.2.0

## ما تم إصلاحه
- لا تُعرض أي أسهم قديمة/تجريبية عند الترقية. يتم مسح كل مراكز الأسهم السابقة مرة واحدة.
- أسهم XTB لا تظهر إلا بعد استيراد تقرير Open Positions الحقيقي من حسابك.
- XTB لا يوفّر API رسميًا منذ 14 مارس 2025، لذلك الربط المستقر هو الاستيراد من تقرير XTB Web.
- OKX يجمع الآن Trading + Funding + Savings/Earn (إذا كان endpoint متاحًا للحساب).
- تقييم Trading يستفيد من قيمة OKX بالدولار حين تكون موجودة، بينما Funding/Savings تُقيّم بسعر OKX الحالي.
- Twelve Data هو المصدر المطلوب للأسهم؛ لا يوجد fallback وهمي أو مصدر بديل.
- الرسوم التاريخية للأسهم تأتي من Twelve Data.
- Crypto والأسعار التاريخية للعملات تأتي من OKX.

## Cloudflare Secrets
المطلوبة:
- DASHBOARD_ACCESS_TOKEN
- OKX_API_KEY
- OKX_API_SECRET
- OKX_PASSPHRASE
- TWELVE_DATA_KEY

لا تضع أي Secret في GitHub.

## XTB
من XTB Web:
Account History → Orders → Open Positions → Export
ثم ارفع الملف من تبويب الربط داخل Investment Hub.
