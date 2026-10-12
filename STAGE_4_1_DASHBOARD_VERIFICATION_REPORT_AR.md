# OrderSawa — تقرير التحقق الوظيفي للمرحلة 4.1

التاريخ: 2026-10-12

الفرع: `feature/product-configuration-network`

نقطة البدء: `77ef9da feat(web): add Stage 4 product configuration editor`

## 1. النتيجة التنفيذية

اكتمل التحقق الوظيفي لمحرر Product Configuration Network داخل مشروع OrderSawa الحقيقي. شُغّل الـDashboard والـBackend على PostgreSQL 16 مؤقتة ومعزولة، واختُبرت عمليات الحفظ وإعادة التحميل والتسعير والتعارض والصلاحيات عمليًا. النتيجة النهائية لجميع الحزم: **114 اختبارًا ناجحًا من 114، بلا اختبارات متخطاة**.

عُثر على عيب مؤكد واحد ضمن Stage 4 وأُصلح: مثال Combo كان قد يختار Network Product لكل من `ORIGINAL` و`CUSTOM` إذا ظهر أولًا في نتائج البحث، بدل تفضيل Legacy Product لمثال `CUSTOM`. أصبح الاختيار الآن يفضّل مصدر Network صالحًا لـ`ORIGINAL` ومصدر Legacy مستقلًا لـ`CUSTOM`، مع اختبار Regression.

لم تُعدّل ملفات Backend أو Prisma أو Migration History أو Public Menu أو Cart أو Checkout، ولم تبدأ Stage 5.

## 2. المراجع وحالة Git عند البدء

قُرئت الملفات المرجعية التالية قبل الاختبار:

- `CODEX_HANDOFF.md`.
- `STAGE_4_DASHBOARD_EDITOR_REPORT_AR.md`.
- `AUTHORITATIVE_RULES/LATEST_FOUNDER_DECISION_LEDGER_V2_CURRENT.md`.
- `AUTHORITATIVE_RULES/CURRENT_SUPERSESSION_AND_CONFLICT_RULES.md`.
- `02_IMPLEMENTATION_WORKFLOW_AR.md`.
- `03_CODEX_PROMPTS.md`.
- `04_ACCEPTANCE_TEST_MATRIX.md`.

تأكد وجود Stage 1 وStage 2C وStage 3 وStage 3.1 وStage 4 داخل المصدر الحالي، وأن الفرع هو `feature/product-configuration-network` وأن نقطة البداية هي Commit `77ef9da`.

المرجع المذكور باسم `05_CONFLICT_RESOLUTION/OrderSawa_Pre_Implementation_Supersession_Register_V1.md` وملف البروتوتايب `OrderSawa_V62_4_Multilanguage_UX.html` غير موجودين في مساحة العمل الحالية. لذلك لم تُدّعَ مطابقة بصرية مع البروتوتايب؛ اقتصرت المقارنة على السلوك والقواعد المتاحة.

## 3. سبب تخطي 14 اختبار API سابقًا

السبب ليس فشلًا وظيفيًا. ملف:

`apps/api/src/modules/products/product-configuration.integration.spec.ts`

يحوّل المجموعة إلى `describe.skip` عند غياب المتغير `PRODUCT_CONFIGURATION_TEST_DATABASE_URL`. كما يحتوي على حارس أمان لا يقبل إلا:

- مضيف loopback.
- المنفذ `55440`.
- اسم قاعدة يبدأ بـ`ordersawa_stage3_`.

في Stage 4 لم تكن PostgreSQL disposable مشغّلة ولم يُمرر هذا المتغير، لذلك ظهرت 14 حالة متخطاة. في Stage 4.1 شُغلت قاعدة مؤقتة مطابقة للحارس، وكانت النتيجة **79/79 لاختبارات API، بلا تخطٍ**.

## 4. PostgreSQL المؤقتة وحماية البيانات

استُخدمت PostgreSQL 16 محلية مؤقتة بالمواصفات التالية:

- ربط محلي فقط على `127.0.0.1:55440`.
- مجلد بيانات جديد مخصص لـStage 4.1، بلا Volume سابق.
- قاعدة تكامل: `ordersawa_stage3_stage41`.
- قاعدة UI: `ordersawa_stage3_stage41_ui`.
- تطبيق Full Schema الخاص ببيئة الاختبار بواسطة `psql`.
- تفعيل Capability داخل قاعدة UI المؤقتة فقط.

لم تُستخدم ملفات `.env` الحقيقية، ولم يحدث اتصال بقاعدة موجودة أو Production، ولم تُشغّل `prisma migrate deploy` أو `prisma db push` أو Backfill. بعد الاختبارات أُوقفت الخدمات. ظل مجلد الـcluster المؤقت المعزول خارج Git داخل `work/stage4_1-postgres-data` لأن سياسة الحذف في البيئة منعت الإزالة الآلية؛ لا تستخدمه في أي تشغيل لاحق، ويمكن حذفه محليًا بعد التأكد من توقف PostgreSQL.

تحقق Prisma:

- `prisma validate`: ناجح.
- `prisma migrate diff` بين القاعدة المؤقتة و`schema.prisma`: فارغ (`This is an empty migration`).

## 5. التحقق الوظيفي عبر Admin API

شُغّل الـBackend الحقيقي مقابل قاعدة UI المؤقتة، ونُفذت السيناريوهات التالية:

| السيناريو | النتيجة |
|---|---|
| Authentication بحساب Demo معزول | ناجح |
| قائمة المنتجات ضمن Tenant الحالي | ناجح |
| إنشاء Pizza بثلاثة Sizes | ناجح |
| حفظ الشبكة وإعادة تحميلها | ناجح |
| تعديل الشبكة ورفع Revision | ناجح، من 1 إلى 2 |
| الحفاظ على Base Price بقيمة `null` | ناجح |
| Medium 110 + Extra Cheese 15 | السعر النهائي `125` |
| Included Quantity لأثمان 50 و30 و15 مع إعفاء خيارين | السعر النهائي `115` مع Base 100 |
| Nested Groups وRequired/Optional | ناجح |
| Size-specific prices | ناجح |
| Combo مع ORIGINAL وCUSTOM | ناجح |
| تكرار نفس Linked Product في Combo | ناجح |
| Legacy Product كمصدر CUSTOM صريح | ناجح |
| Revision Conflict | HTTP `409` |
| موظف غير مخول بالحفظ | HTTP `403` |
| فقد Capability | القراءة باقية، الحفظ `403`، والبيانات لا تُحذف |
| محاولة تغيير Base لمنتج Network من Product PATCH القديم | HTTP `400` |
| تعديل Metadata غير المالي لمنتج Network | ناجح |
| توافق Legacy Product | ظل `LEGACY`، الإصدار 0، والسعر 340 بلا تغيير |

اختُبرت الحسابات بواسطة Shared Engine نفسه باستخدام Decimal strings، من دون إنشاء محرك تسعير ثانٍ أو استخدام floating-point للأموال.

## 6. التحقق عبر المتصفح

شُغّل Next.js والـBackend محليًا، ثم استُخدمت Browser Automation لتسجيل الدخول والتنقل إلى نموذج المنتج ومحرر الشبكة.

تم التحقق من:

- ظهور نموذج المنتج القديم وحقوله الأساسية دون كسر.
- ظهور محرر Product Configuration أسفل النموذج الحالي.
- تحميل منتج Network محفوظ وعرض `النسخة الحالية 2`.
- عرض شجرة Pizza المتداخلة: Sizes وToppings وCheese Finish وSauces.
- عرض أسعار Small 80 وMedium 110 وLarge 150.
- تشغيل المعاينة بمحرك Shared وإظهار السعر 80 عند اختيار Small.
- اتجاه الصفحة `rtl`.
- عرض بعرض 390×844 وتحول منطقة المحرر إلى عمود واحد بعرض فعلي يقارب 350px.
- وضوح حالة Network وعدم الرجوع إلى Base Price القديم.

التقطت صور فعلية أثناء الجلسة وعُرضت داخل سجل المحادثة. أداة المتصفح لم تُخرج ملفات صور دائمة إلى المستودع، لذلك لا توجد Screenshots مُضافة إلى Git. كما كانت اعتراضات `confirm()` الآلية غير مستقرة أحيانًا؛ عُوّض ذلك باختبارات المكونات والـHTTP الفعلية، ولا يُدّعى وجود Playwright E2E دائم في المستودع.

## 7. العيب المكتشف والإصلاح

### العيب

كان `applyComboDemo` يكتفي بأول مصدر صالح لـ`CUSTOM`. إذا كان هذا المصدر Network Product، أمكن أن يستخدم المثال المصدر نفسه/نوعه لكل من `ORIGINAL` و`CUSTOM`، فلا يوضح قاعدة Stage 3.1 الخاصة بـLegacy CUSTOM Snapshot.

### الإصلاح

- إضافة `selectComboDemoSources` لاختيار مصدر Network محفوظ لـ`ORIGINAL`.
- تفضيل Legacy Product مستقل لـ`CUSTOM`.
- إبقاء fallback آمن عند عدم توفر Legacy Product.
- استمرار البحث حتى العثور على Network source وLegacy custom source أو انتهاء النتائج.
- إضافة اختبار Regression يثبت السلوك عندما يظهر Network Product أولًا.

لا يغيّر هذا الإصلاح عقد البيانات أو القواعد المعمارية.

## 8. الملفات المتغيرة

- `apps/web/src/components/dashboard/product-configuration/demos.ts`.
- `apps/web/src/components/dashboard/product-configuration/product-configuration-editor.tsx`.
- `apps/web/src/components/dashboard/product-configuration/editor-model.test.ts`.
- `STAGE_4_1_DASHBOARD_VERIFICATION_REPORT_AR.md`.
- `CODEX_HANDOFF.md`.

## 9. نتائج الاختبارات النهائية

| المجموعة | النتيجة |
|---|---:|
| Shared Vitest | 21/21 |
| API Vitest مع PostgreSQL disposable | 79/79 |
| Web Vitest | 14/14 |
| الإجمالي | **114/114** |
| الاختبارات المتخطاة | **0** |
| Root Typecheck | ناجح |
| Root Build | ناجح؛ Next.js ولّد 27/27 صفحة/مسار |
| Prisma Validate | ناجح |
| Prisma Schema Diff | لا اختلافات |

## 10. طريقة التشغيل المحلي والوصول إلى Demo

يجب استخدام قاعدة PostgreSQL محلية مؤقتة فقط، وباسم يبدأ بـ`ordersawa_stage3_` وعلى المنفذ `55440` لاختبارات التكامل. لا تستخدم `.env` الحقيقي.

1. ثبّت الاعتماديات من جذر المشروع:

```powershell
npm install
```

2. أنشئ قاعدة disposable وطبّق عليها Schema الاختبار الموافق لـStage 2C. لا تستخدم `db push` أو `migrate deploy` على قاعدة قائمة.

3. مرّر اتصال الاختبار للـBackend في جلسة PowerShell مؤقتة:

```powershell
$env:DATABASE_URL = "postgresql://<local-user>:<local-password>@127.0.0.1:55440/ordersawa_stage3_local_ui"
$env:DIRECT_URL = $env:DATABASE_URL
$env:JWT_SECRET = "<local-test-secret>"
$env:PORT = "5000"
npm run dev:api
```

4. في جلسة أخرى شغّل Web:

```powershell
$env:NEXT_PUBLIC_API_URL = "http://127.0.0.1:5000"
npm run dev:web
```

5. افتح `http://localhost:3000/login` وسجّل بحساب Demo موجود في قاعدة الاختبار، ثم انتقل إلى Dashboard > المنتجات > تعديل منتج. يظهر قسم «شبكة تكوين المنتج» أسفل نموذج المنتج القديم.

6. لإنشاء Pizza اختر Demo «Pizza Margherita»، ثم جرّب Sizes والإضافات والتداخل والمعاينة واحفظ. لإنشاء Combo يلزم وجود Product Network محفوظ لمصدر `ORIGINAL` وLegacy Product لمصدر `CUSTOM`؛ اختر Demo «Combo ORIGINAL/CUSTOM» ثم راجع المصادر قبل الحفظ.

## 11. المقارنة مع القواعد المعتمدة

السلوك المنفذ متوافق مع القواعد المتاحة:

- `configurationTree` هو المصدر canonical للشبكة.
- Sizes أسعار كاملة وليست price deltas.
- عند اختيار Size يُتجاهل Base في التسعير.
- يوجد فرق محفوظ بين `null` و`0`.
- Nested Options وIncluded Quantity والتسعير تمر عبر Shared Engine.
- `ORIGINAL` يحتاج Network source محفوظًا.
- Legacy source مسموح في `CUSTOM` عبر Snapshot صريح فقط.
- تكرار Linked Product مسموح بعقد مستقلة.
- الحفظ يمر عبر Admin API وAtomic Persistence.
- فقد Capability لا يحذف البيانات ولا يرجع تلقائيًا إلى Base Price.
- Network Products لا تُعرض لمسار الطلب Legacy قبل Stage 5.

لا يمكن إجراء مقارنة بصرية موثوقة مع البروتوتايب السابق لأن ملفه غير متاح. تم التحقق من RTL والاستجابة والسلوك الفعلي فقط.

## 12. المخاطر والقيود المتبقية

- لا يوجد حاليًا Browser E2E دائم ومُشغّل تلقائيًا داخل المستودع؛ التحقق المتصفحي في هذه المرحلة كان جلسة عملية مدعومة باختبارات Web وAPI.
- سياسة تقريب العملات لا تزال قرارًا معلقًا؛ لم تُضف أي سياسة جديدة.
- Migration History لأي قاعدة حقيقية لم تُدقق ولم تُطبّق.
- Public Configurator وCart وCheckout مؤجلة كليًا، ولم تُفتح Network Products لمسار الطلب القديم.
- Business/Outlet Architecture وBilling خارج النطاق ولم تُعدّل.

## 13. الجاهزية ونقطة التوقف

لا توجد مشكلة تقنية معروفة في Stage 4 تمنع الانتقال التخطيطي إلى Stage 5 بعد موافقة صريحة ونطاق جديد. Stage 4.1 مكتملة وظيفيًا وفق الاختبارات المذكورة، مع بقاء قيد QA الخاص بعدم وجود Browser E2E دائم.

توقف العمل هنا. لم تبدأ Stage 5 أو Stage 6، ولم يحدث Deployment أو اتصال ببيانات حقيقية.
