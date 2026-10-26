# OrderSawa — مراجعة تنفيذ تصميم السلة ومعاينة WhatsApp (تنفيذ جزئي آمن)

التاريخ: 26 أكتوبر 2026. الفرع: `feature/product-configuration-network`. نقطة البداية: `cebd20f35a75c7e47d481619a9d7413f700f7282`. هذا التقرير يميز المنفذ عن الجزأين اللذين يتطلبان موافقة إضافية بموجب نص التكليف؛ **رسوم التوصيل ومعاينة Legacy-only لم تنفذا**.

## ما نُفّذ

- كاردات «تفقد السلة»: أظهرت الصورة أو الـPlaceholder الحالي لأسطر Legacy وNetwork بنسبة مربعة `1:1` مع `object-fit: cover`، والاسم والسعر قربها، والكمية في الأزرار الجانبية فقط. لم تتغير صورة المصدر أو ProductQuickViewModal.
- شبكة الخيارات: نقلت ملخص الاختيارات المختصر وزر التعديل إلى شريط بعرض الكارد. التفاصيل الكاملة قابلة للفتح دون أسعار إضافات فردية؛ زر التعديل يفتح محرر السلة الحالي مع اختيار السطر المحفوظ. المنتج ذو الحجم فقط يحتفظ بإمكان تعديل الحجم دون سهم تفاصيل فارغ.
- الملاحظة: حقل مباشر لكل سطر مع أيقونة، مربوط بـ`lineId` وآلية الحفظ المحلية الحالية؛ وصلت ملاحظة Legacy إلى حقل `note` المدعوم أصلًا في API القديم بدل أن تضيع عند الإرسال. لا يتغير تكوين Network أو هويته.
- ملخص الفاتورة السفلي: قائمة نصية فقط، افتراضيًا سطران بحد أقصى، وباقي الأسطر تظهر عند التوسيع بالضغط أو السحب على المقبض. منطقة التفاصيل تتمرر داخل اللوحة، مع Safe Area. بقي زر «التالي» الأصلي وفئته وأسلوب الثيم.
- معاينة Network/Mixed: زر في خطوة التحقق يستدعي `POST /public/menus/:slug/checkout/whatsapp/prepare` الموجود مسبقًا. يعرض `messagePreview` نفسها التي يولدها Formatter الموثوق، مع نسخ النص. لا يستدعي `confirm` أو إنشاء Legacy Order أو يفتح WhatsApp. إذا تغير السعر، تُعرض المعاينة على أنها للسعر الحالي فقط ولا تمنح قبولًا جديدًا.

## مقارنة بصرية وحدودها

الصورة المرجعية من المؤسس تعرض صورًا فعلية وكاردات أوسع نسبيًا؛ Demo المختبرة لا تحتوي صورًا لهذه الأصناف، فظهرت الـPlaceholders الحالية. مواضع الصورة المربعة، الكمية، الاسم، السعر، شريط الاختيارات، حقل الملاحظة والملخص السفلي تقارب المرجع. زر «التالي» احتفظ بتصميم Legacy ولم يُنسخ من المرجع. صورة «قبل» من حزمة commit `cebd20f` وصورة «بعد» من Demo الحالية؛ بيانات الأصناف والأسعار مختلفة، لذلك المقارنة تخطيطية وليست Pixel Diff أو إثبات تطابق واجهة Production.

- قبل: `docs/qa/checkout-approved/before-mixed-cart-390.png`
- بعد: `docs/qa/network-cart/mixed-cart-390.png`
- اللوحة الموسعة مع ثلاثة أسطر: `docs/qa/network-cart/mixed-invoice-expanded-390.png`
- معاينة الرسالة: `docs/qa/network-cart/mixed-whatsapp-message-preview-390.png`
- نص الرسالة الفعلي: `docs/qa/network-cart/mixed-whatsapp-message-preview.txt`

## لماذا توقفت رسوم التوصيل؟

القيمة الموثوقة غير موجودة في Restaurant أو Dashboard Settings اليوم. `public-menu-client.tsx` يعرض `deliveryFee = "0"` كتعليق Legacy قديم، وليس إعدادًا محفوظًا. Trusted Draft الحالي يحتوي `totalAmount` = مجموع الأسطر فقط؛ وLegacy `createWhatsappOrder` يحفظ هذا المجموع في Order ويولد Analytics/رقم الطلب والرسالة مباشرة. دعم `null / 0 / موجب` مع إعادة قبول تغيير الرسوم يتطلب توسيع عقود إعدادات المطعم وTrusted Prepare/Confirm، وتحديد كيفية حفظ رسوم Legacy ضمن Order/Snapshot دون الخلط بين «مجموع الأصناف» و«الإجمالي النهائي غير المعروف». يمكن دراسة تخزين الإعداد ضمن `RestaurantThemeSettings.settings` JSON الحالي دون Migration، لكن **لا يجوز اعتماد ذلك أو تغيير حساب Legacy الحساس ضمنيًا**. لم أغيّر Backend أو Prisma أو DTO أو المجموع المعروض. يلزم إذن مستقل محدد لهذا العقد قبل إكمال الرسوم؛ قد يلزم قرار إضافي بشأن دلالة `Order.totalAmount` عند `deliveryFee=null`.

## لماذا لم تُنفذ معاينة Legacy-only؟

مسار Legacy الحالي `POST /public/menus/:slug/orders/whatsapp` ينشئ Order وAnalytics ورقم طلب قبل إرجاع الرسالة. استدعاؤه لمجرد المعاينة يخالف شرط عدم الآثار الجانبية. لا يوجد عقد معاينة Legacy مستقل. كما لا يمكن إنتاج **نفس** الرسالة النهائية حرفيًا مع رقم الطلب والوقت قبل إنشاء Order دون حسم سياسة حجز الرقم/وسم المعاينة. لم أضف Formatter ثانيًا أو Endpoint جديدًا؛ يلزم موافقة على عقد Preview آمن وتحديد كيفية عرض رقم الطلب فيه.

## اختبارات فعلية

| الفحص | النتيجة |
|---|---|
| Web Vitest | 65/65 نجاح، 12 ملفات |
| Shared Vitest | 25/25 نجاح، ملفان |
| API WhatsApp formatter unit | 5/5 نجاح |
| Root Typecheck | نجاح |
| Root Build ثم Web Build بعد آخر تعديل | نجاح |
| Chrome LAN Browser `scripts/network-cart-ux-browser-regression.mjs` | نجاح: 1:1 Placeholder، ملخص/توسيع/سحب، حفظ ملاحظة Legacy/Network، محرر Network، إعادة التحقق، سلة مختلطة، Reload، 360/390/430 وDesktop، LTR، معاينة Mixed من طلب `prepare` واحد فقط |
| HTTP/PostgreSQL لتكاليف التوصيل | لم تُشغّل؛ الميزة متوقفة قبل تغيير Backend/DB |
| معاينة Legacy-only، رسوم null/zero/fixed، 10/20 سطرًا، صورة منتج فعلية، لمس هاتف مادي | لم تُثبت؛ لا تُعد نجاحًا |

لم تستخدم الاختبارات قاعدة Production؛ Browser استعمل Demo محلية عبر LAN. لم يُرسل WhatsApp. لم تُعد Seed، ولم تُعدل بيانات Demo المحفوظة. الاختبار أثبت عدم وجود طلب `orders/whatsapp` أو `confirm` عند فتح معاينة Mixed؛ لم أجرِ عدًا مستقلًا لصفوف DB قبلها وبعدها.

## الملفات المتغيرة

- `apps/web/src/components/public/public-menu-client.tsx`: كاردات، ملاحظات، ملخص السحب، واجهة المعاينة، تمرير ملاحظة Legacy المدعومة.
- `apps/web/src/components/public/trusted-whatsapp-checkout.tsx`: استدعاء Preview منفصل يستخدم Prepare الموجود، مع إبطال النص عند تغير السلة أو التفاصيل.
- `apps/web/src/app/globals.css`: تخطيط محدود للسلة/اللوحة/المعاينة عبر Theme Tokens.
- `apps/web/src/components/public/cart-presentation.test.ts`: تحديث توقع الاسم لعدم تكرار الكمية.
- `scripts/network-cart-ux-browser-regression.mjs`: سيناريوهات متصفح وسكرينشوت ونص Formatter الفعلي.
- `docs/qa/network-cart/*` و`docs/qa/checkout-approved/before-mixed-cart-390.png`: أدلة بصرية من Demo وبداية المقارنة.

لم يتغير Shared Engine، Backend، Prisma Schema، Migration History، Dashboard، ProductQuickViewModal أو Legacy Order Persistence. الملف غير المتتبع `ORDERSAWA_PRODUCT_DETAILS_UI_ISSUE_REPORT_AR.md` سابق لهذه المهمة ولم ألمسه.

## حالة المراجعة

هذه **ليست** موافقة على إطلاق رسوم التوصيل أو ادعاء استيفاء معايير القبول كلها. الخطوة التالية هي موافقة المؤسس المنفصلة على عقد Backend للرسوم، وعلى عقد Preview Legacy بلا آثار جانبية ومعنى رقم الطلب. حتى ذلك الحين تبقى الواجهة المحسنة ومعاينة Network/Mixed وحدهما ضمن هذه الحزمة. لا Deployment أو Merge إلى Production.
