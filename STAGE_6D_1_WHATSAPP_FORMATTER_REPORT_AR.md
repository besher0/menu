# OrderSawa — تقرير Stage 6D.1: تنسيق رسالة WhatsApp من Snapshot الطلب

التاريخ: 2026-10-13. الفرع: `feature/product-configuration-network`. Commit التنفيذ: `3ec08c8` (`feat(api): format Stage 6C Network order snapshots for WhatsApp preview`). هذه مرحلة **Formatting وTesting فقط**؛ لم يُربط Formatter بإرسال الطلبات أو Public Checkout، ولم يُرسل أي WhatsApp.

## النتيجة والعقد

أُضيفت دالة نقية `formatNetworkOrderWhatsappMessage(snapshot: unknown): string` تقرأ غلاف `Order.cartSnapshot` المحفوظ في Stage 6C (`snapshotVersion:1`, `mode:"NETWORK"`) فقط. لا تستدعي Prisma، ولا تقرأ Product أو أسماء/أسعار المنيو الحالية، ولا تستخدم حساب أموال عائمًا. تُظهر كل سطر بكمية المنتج، الحجم، مجموعات الخيارات المطلوبة/الاختيارية، كل Option ووحداته، التداخل، Included/Free/Paid، المنتج المرتبط وموقعه ونمط ORIGINAL/CUSTOM ورقم تكراره، سعر الوحدة وإجمالي السطر والطلب والعملة. تعتمد تسميات المنتج/الحجم/الخيارات والمصادر على `configurationTree` و`linkedSources` التاريخية، وتعتمد المبالغ المعروضة على `priceBreakdown` و`unitPrice` و`lineTotal` و`totalAmount` المحفوظة. لا تعيد تسعيرها من تكوين حي.

تتحقق الدالة من اكتمال ونسخة الغلاف، الهوية والمراجعات، حدود المجموعات والكميات، وجود Price Line واحدة لكل اختيار، هوية Linked Source، وست منازل الدقة المالية. تستعمل دوال Shared الآمنة `multiplyMoney` و`sumMoney` **للمقارنة بين مجاميع Snapshot المحفوظة فقط**، وليس لاشتقاق أسعار جديدة أو تقريبها. عند نقص معلومة أو تناقض ترمي `NetworkOrderSnapshotFormatError` مع `code` و`path`؛ لا تُخفي اختيارًا ولا تخترع اسمًا أو سعرًا. نص الرسالة الكامل يُعاد دون قطع. الأسماء التي تحتوي أسطرًا أو محارف تحكم أو علامات WhatsApp تُعرض في سطر آمن مع عزل اتجاه النص؛ لا تُغيَّر الـSnapshot الأصلية. نص تاريخي فارغ أو يتجاوز 200 حرف يُرفض بدل اقتطاعه.

`buildNetworkWhatsappPreviewUrl(phone, message)` تنشئ رابطًا مشفّرًا بـ`encodeURIComponent` دون فتحه أو الإرسال. ترفض رقمًا غير رقمي دولي، وتعيد خطأ صريحًا إذا تجاوز الرابط حد السلامة المحلي 8192 حرفًا؛ هذا الحد **ليس ادعاءً بشأن حد WhatsApp الرسمي** ولا تُقطع الرسالة. تنسيق Legacy بقي كما هو في `PublicMenuService.buildWhatsappMessage`؛ لم يُغيَّر مسار الطلبات القديمة أو أسعارها. لا تُقبل Legacy Snapshot في Formatter الجديدة.

## أمثلة المعاينة

الحروف المحيطة ببعض الأسماء في الخرج الحقيقي هي Unicode Bidi Isolation غير مرئية غالبًا؛ أُزيلت هنا من العرض النصي لتسهيل قراءة المثال. الأرقام أدناه مأخوذة من Fixture Demo المبنية بــShared Engine ثم من Snapshot، بلا تقريب.

### بيتزا بالعربية

```text
🧾 طلب OrderSawa — معاينة

1. بيتزا مارغريتا × 2
📏 الأحجام — الحجم: كبير (200.000001 EGP للوحدة)
➕ الإضافات (اختياري):
  • جبنة إضافية × 1 — مشمول
    ➕ الصوصات (اختياري):
      • صوص حار × 1 — 5.000001 EGP للوحدة
  • جبنة إضافية × 2 — 30.000001 EGP للوحدة
  • زيتون × 1 — مجاني
سعر الوحدة: 265.000004 EGP
إجمالي الصنف: 530.000008 EGP
━━━━━━━━━━━━━━

💵 إجمالي الطلب: 530.000008 EGP
```

السعر الافتراضي للجبنة في Demo هو `20`، لكن السعر الفعلي المحفوظ لحجم «كبير» هو `30.000001`. تظهر الوحدة المشمولة دون إضافتها ثانية، ويبقى الصوص المتداخل مدفوعًا.

### كومبو بالإنجليزية مع ثلاث نسخ مستقلة من مصدر واحد

```text
🧾 OrderSawa order — preview

1. Family combo × 1
➕ Choose pizzas (required):
  • Original pizza × 1 — 10 EGP each
    ↳ Linked product #1: Source pizza (Original)
      📏 Pizza sizes — Size: Large (8 EGP each)
  • Original pizza × 1 — 10 EGP each
    ↳ Linked product #2: Source pizza (Original)
      📏 Pizza sizes — Size: Medium (5 EGP each)
  • Custom pizza × 1 — 3 EGP each
    ↳ Linked product #3: Source pizza (Custom)
      📏 Combo size — Size: Custom medium (7 EGP each)
Unit price: 43 EGP
Line total: 43 EGP
━━━━━━━━━━━━━━

💵 Order total: 43 EGP
```

تبقى كل نسخة من Linked Product في موضعها، باختيار حجم مستقل. يصلح التنسيق لمجموعة Combo متداخلة لأن العرض يسير على الشجرة والـSelection والـPrice Lines المحفوظة. لا يدمج نسخًا مرتبطة مختلفة؛ يجمّع فقط وحدات Option الورقية المتجاورة والمتطابقة في حالة الدفع، ويُظهر سعرها **للوحدة**.

## الملفات

- `apps/api/src/modules/orders/network-order-whatsapp-formatter.ts`: Formatter النقية، أخطاء Snapshot المهيكلة، والعزل النصي/رابط المعاينة.
- `apps/api/src/modules/orders/network-order-whatsapp-formatter.spec.ts`: 11 اختبار وحدة.
- `apps/api/src/modules/orders/network-order-whatsapp-demo.ts`: Snapshot Demo في الذاكرة لبيتزا وكومبو بالعربية/الإنجليزية باستخدام Shared Engine، بلا DB seed.
- `apps/api/src/modules/orders/network-order-whatsapp-preview.ts`: أمر CLI محلي للمعاينة فقط.
- `apps/api/package.json`: أمر `preview:network-whatsapp`.
- `apps/api/src/modules/orders/network-orders.integration.spec.ts`: تأكيد تنسيق Snapshot بيتزا وكومبو المحفوظتين فعليًا، بعد تغيير اسم Product حي.
- `STAGE_6D_1_WHATSAPP_FORMATTER_REPORT_AR.md` و`CODEX_HANDOFF.md`: التقرير والتسليم.

## تشغيل المعاينة الآمنة

من جذر `menu-main`:

```powershell
npm run preview:network-whatsapp -w @menu/api -- pizza ar
npm run preview:network-whatsapp -w @menu/api -- pizza en
npm run preview:network-whatsapp -w @menu/api -- combo ar
npm run preview:network-whatsapp -w @menu/api -- combo en
```

يمكن أيضًا تمرير ملف JSON محلي يحتوي **`Order.cartSnapshot` فقط** من طلب Stage 6C تجريبي محفوظ، دون فتح قاعدة بيانات أو إرسال رسالة:

```powershell
npm run preview:network-whatsapp -w @menu/api -- snapshot C:\path\to\local-cartSnapshot.json
```

لا تضف ملف Snapshot تشغيلي أو بيانات زبائن إلى Git. الأمر يبني API محليًا ويطبع الرسالة على الشاشة فقط؛ لا يأخذ رقم هاتف ولا يتصل بـWhatsApp. اختبار رابط `wa.me` في الوحدة يبنيه ويفك ترميزه فقط برقم Fixture شكلي، دون طلب شبكة.

## الاختبارات الفعلية

| الفحص | النتيجة |
|---|---:|
| Formatter Unit | 11/11 ناجحة |
| API كامل، HTTP/DB وLegacy Regression | 126/126 ناجحة، 20 ملفًا، 0 متخطاة |
| Shared | 21/21 ناجحة |
| Web Regression | 35/35 ناجحة |
| الإجمالي | 182/182 ناجحة، 0 متخطاة |
| Root Typecheck | ناجح |
| Root Build | ناجح؛ Next.js 27/27 مسارًا |
| Demo Preview | Pizza AR وCombo AR/EN نجحت يدويًا |

استُخدمت مجموعة PostgreSQL 16 **جديدة ومؤقتة** في `../work/stage6d1-postgres-data` على `127.0.0.1:55440`، وقاعدتان جديدتان باسم `ordersawa_stage3_stage6c_formatter*`. طُبّق عليهما فقط Baseline الاختباري وMigration Stage 6C الحالية. لم يُستخدم `.env` الحقيقي أو قاعدة Production أو بيانات حقيقية. أُوقفت المجموعة بعد الاختبارات. تعثر `tsx` في أمر Preview أولًا بسبب `uv_os_get_passwd` داخل Windows sandbox؛ استُبدل تشغيله بـAPI Build ثم Node، وثبت نجاح الأمر. تعثر اختبار Shared أولًا بسبب Temp الافتراضي المحظور؛ نجح عند تحديد Temp داخل مساحة العمل. لا توجد اختبارات متخطاة في التشغيل النهائي.

تغطي الاختبارات Pizza بالحجم والتداخل وIncluded والمجاني والمدفوع وتسعير الحجم والدقة، Combo ORIGINAL/CUSTOM والتكرار، العربية والإنجليزية والمختلط/Emoji، النصوص الخاصة، الرسائل الطويلة وعدم الاقتطاع، ترميز الرابط، تغيّر Product الحي بعد الحفظ، الحقول الناقصة/المشوّهة، وLegacy. اختبارا PostgreSQL يمرران `Order.cartSnapshot` المحفوظة فعليًا إلى Formatter؛ لا توجد قراءة Catalog داخلها.

## النواقص وما ينتقل إلى Stage 6D.2

- غلاف Stage 6C يحفظ `locale` واسمًا/label تاريخيًا واحدًا لكل عقدة، لكنه **لا يحفظ حزمة ترجمات مستقلة** لكل اختيار. إذا كانت التسمية التاريخية بلغة واحدة فقط، لا يستطيع Formatter توليد ترجمة أخرى دون اختراعها؛ يطبع الاسم المحفوظ. قرار/تنفيذ دعم رسائل متعددة اللغات على مستوى Snapshot قبل إطلاقها الحقيقي يحتاج مراجعة مستقلة، مع احترام قاعدة fallback للترجمة كسجل كامل.
- Snapshot Stage 6C الاختبارية لا تتضمن بعد رقم طلب تجاري، بيانات زبون، نوع توصيل/استلام، عنوانًا أو ملاحظات؛ لم تُنشأ بيانات افتراضية لها. Stage 6D.2 تحتاج تحديد عقد هذه البيانات وطريقة حفظها/قبولها الموثوقة قبل تنسيق رسالة إنتاجية كاملة.
- الرسالة موسومة «معاينة/preview» عمدًا. لم يُضف رابطها إلى Checkout أو `whatsappMessage` في Order، ولم تتغير `orderingEnabled:false`. Stage 6D.2 لا يجوز أن تستخدم Formatter وحدها ذريعة لتفعيل الطلبات.
- لا يضمن حد الرابط المحلي 8192 أن WhatsApp يقبل كل رسالة قصيرة عنه؛ الرسائل الأطول تُرفض صراحةً على مستوى رابط المعاينة. يلزم قرار UX لتجزئة/إرسال الرسائل الطويلة في مرحلة الإرسال؛ ممنوع قطعها بصمت.
- سياسة تقريب العملات، مفتاح قبول السعر متعدد النسخ، حماية endpoint الإنتاجي، Migration History الحقيقية، وقدرات Business/Outlet/Scheduling ما زالت موانع من Stage 6C. لم تتغير هنا.

Stage 6D.1 مكتملة في المصدر فقط. لا تبدأ Stage 6D.2 أو 6D.3، ولا تطبق Migration أو ترسل WhatsApp أو تفعّل Network Ordering دون موافقة جديدة. الحالة النهائية المقصودة: Commit التنفيذ `3ec08c8` ثم Commit توثيقي لهذا التقرير و`CODEX_HANDOFF.md`، وشجرة Git نظيفة؛ تحقق من `git log -2` و`git status --short` لمعرفة Hash التوثيق النهائي.
