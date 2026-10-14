# OrderSawa — Stage 6E.1: دمج شبكة التكوين في Dashboard الحالية

التاريخ: 2026-10-13–14. الفرع: `feature/product-configuration-network`. آخر Commit قبل العمل: `a850383` (Stage 6E.0)، وCommit تنفيذ 6D.3C3F: `8f117f3e26006a14315023d93b07fc6a1b7541f3`. نطاق هذه المرحلة هو مشروع المنيو الحالي المملوك لـRestaurant؛ طلب المؤسس الحالي صراحةً إكماله دون انتظار Dashboard V2 ودون تطبيق Business/Outlet الآن. لم تُفعّل الطلبات العامة أو إرسال WhatsApp.

## 1. الحالة والمراجع

راجعت `CODEX_HANDOFF.md` وخريطة 6E.0 وتقرير 6D.3C3F، وسجل القرارات `../work/product-network-pack/OrderSawa_Product_Network_Codex_Pack/AUTHORITATIVE_RULES/LATEST_FOUNDER_DECISION_LEDGER_V2_CURRENT.md` وقواعد `CURRENT_SUPERSESSION_AND_CONFLICT_RULES.md`، ثم فحصت Source Code الفعلي. كانت شجرة Git نظيفة على الفرع المطلوب. قرار المؤسس الجديد يغيّر **نطاق هذه المهمة** إلى Dashboard الحالية، ولا يعني أن Business Catalog/Outlet Differential نُفّذت أو أُلغيت معماريًا للمستقبل.

الموجود الذي أُعيد استخدامه دون إعادة بناء: Shared `ProductConfigurationV1`/Validation/Pricing، `ProductConfigurationEditor` وPreview وDemo، Admin GET/PUT مع optimistic version وحفظ Tree/Base/Dependency في Transaction، Public Configurator/Quote للمعاينة، وحماية Legacy/Network من Stage 3.1. تبقى Network Cart V2 وTrusted Order test endpoints وSnapshot/Acceptance/Idempotency/Design A/DB guard/WhatsApp Formatter في أماكنها دون تعديل.

## 2. العيوب المثبتة والإصلاح

1. شاشة إنشاء المنتج كانت تُعيد المستخدم إلى قائمة المنتجات، بينما محرر الشبكة لا يظهر إلا بعد وجود `productId`. أضفت اختيار **إعداد شبكة تكوين** إلى نموذج الإنشاء الحالي، لا Dashboard جديدة. `POST /dashboard/products` يقبل اختيارًا إضافيًا ضيقًا `configurationIntent: "NETWORK_SETUP"`؛ يتطلب صلاحية `product.configuration.manage` والـCapability المعيّنة، ويحفظ المنتج مبدئيًا غير متاح للعامة ثم يُوجّه المستخدم مباشرة إلى `/dashboard/products/:id/edit`. الإنشاء العادي يبقى كما كان. `configurationIntent` ممنوع في PATCH.
2. قيد Stage 2C `Product_configuration_legacy_state_check` يفرض `basePrice NOT NULL` عندما تكون `configurationTree=NULL` وVersion=0. لذلك يتطلب إنشاء الإعداد سعرًا **تمهيديًا صريحًا من التاجر**، لا صفرًا مُختلقًا ولا `null` غير مقبول في DB. يظل المنتج مخفيًا أثناء الإعداد؛ عند حفظ الشبكة من المحرر يمكن أن يصبح Base `null` أو `0` وفق العقد، ولا يغيّر الحفظ `isAvailable`. يجب أن يفعّل التاجر التوفر يدويًا بعد التحقق. لا تَرِث الشبكة السعر التمهيدي تلقائيًا إذا اختار مثالًا/شبكة Base=null؛ اختيار السعر في المحرر هو المعتمد.
3. Browser E2E كشف أن `type=number` بسعر `12.5` كان غير صالح HTML لأن `step` غير محدد (الافتراضي 1)، قبل وصول POST. ضبطت `step="0.000001"` بما يوافق دقة التخزين الداخلية الست، **دون** اعتماد سياسة تقريب عملات أو حساب مالي جديد.
4. قائمة المنتجات كانت تُظهر `null` كسعر حرفي، وتسمح بمحاولة Quick Price على Network رغم رفض Backend. صار العرض «شبكة التكوين» أو «بلا سعر» مع منع تحرير سعر Network من القائمة، وبقي تحرير سعر Legacy ممكنًا بما فيه قيمة ابتدائية فارغة. توسّع قيد الإدخال من `step=0.01` إلى دقة التخزين الداخلية `0.000001`. لم تتغير قواعد API للأسعار القديمة.

**قيد معلوم مهم:** `NETWORK_SETUP` قصدٌ لحظة الإنشاء فقط، وليس حالة Draft محفوظة مستقلة في Schema. قبل أول حفظ للتكوين يبقى المنتج بنيويًا Legacy مخفيًا. لو فعّل التاجر `isAvailable` يدويًا قبل حفظ الشبكة، قد يُعرض كسعر Legacy التمهيدي. لا ندّعي أن هذا يمثل Activation Guard إنتاجيًا؛ يتطلب منعًا قاطعًا في مرحلة مستقلة إما حالة Draft محفوظة مع Migration معتمدة أو إنشاء Network صحيح ذريًا منذ البداية، بعد قرار/تدقيق Migration History. لم أغيّر قيد Stage 2C أو `isActive` أو مسار Legacy العام في هذه المرحلة. لذلك لا يُعتمد هذا المسار للإطلاق قبل حسم هذه الفجوة.

## 3. الملفات المعدلة

| الملف | التغيير |
|---|---|
| `apps/api/src/modules/products/dto/create-product.dto.ts` | حقل POST الاختياري المحصور `NETWORK_SETUP` |
| `apps/api/src/modules/products/products.controller.ts` | تحقق صلاحية مدير التكوين عند طلب الإعداد |
| `apps/api/src/modules/products/products.service.ts` | تحقق Capability، إنشاء غير متاح، منع Intent في PATCH؛ Legacy العادي دون تغيير |
| `apps/api/src/modules/products/product-configuration.integration.spec.ts` | HTTP/DB: الإنشاء والتفويض والقدرة وحفظ/إعادة تحميل/Quote/Conflict |
| `apps/web/src/components/dashboard/product-form.tsx` | اختيار نوع الإعداد، توجيه بعد الإنشاء، سعر عشري، عرض null بصدق |
| `apps/web/src/components/dashboard/restaurant-dashboard-client.tsx` | عرض Network/null في القائمة ومنع Quick Price للشبكة |
| `apps/web/src/app/globals.css` | تنسيق خيار الإنشاء RTL داخل التصميم الحالي |
| `scripts/stage6e1-dashboard-browser-e2e.mjs` | Runner Chrome CDP مع قاعدة اختبار محروسة بالاسم/loopback والمنفذ |
| `CODEX_HANDOFF.md` وهذا التقرير | تسليم الحالة والقيود |

لم يتغير Shared Engine أو Prisma Schema/Migration History أو Public Runtime أو Cart/Checkout/Order Runtime/Formatter أو Business/Outlet. لا حذف لأي Future Foundation.

## 4. ما جُرّب فعليًا

- PostgreSQL **16.15 disposable جديدة** تحت `../work/stage6e1-postgres-data` على `127.0.0.1:55440`، بقواعد منفصلة `ordersawa_stage3_stage6e1` للمتصفح و`ordersawa_stage3_stage6e1_api` لاختبارات API. استُخدم `../work/stage3-full-schema.sql` للاختبار وSQL Stage 6C فقط في القاعدتين المؤقتتين. لا ملف `.env` حقيقي، ولا اتصال بقاعدة موجودة أو Production، ولا `migrate deploy`/`db push`/Backfill.
- HTTP/PostgreSQL Product Configuration: **22/22**. الاختبار الجديد أثبت 403 للموظف ولغياب Capability، و400 للسعر المفقود/Intent غير صحيح/PATCH Intent، و201 لإنشاء إعداد مخفي، ثم GET → PUT → GET للشبكة، 409 لإصدار قديم، وPublic Configurator/Quote بعد تفعيل التوفر. Quote للحجم الصغير أعادت `10.000001` مع `baseIgnored=true` وBase محفوظة `null`. الاختبارات الموجودة تغطي ORIGINAL/CUSTOM، Nested/Included، تكرار Linked instances، Cross-tenant، validation، decimal، وLegacy.
- Shared: **21/21**. Web: **39/39** (Editor/Preview/Demo/Public tests). API الكاملة في قاعدة API المعزولة: **118 passed، 69 skipped، صفر فشل**؛ الاختبارات المتخطاة هي مجموعات DB لمراحل أخرى ذات قواعد/أعلام اختبار منفصلة. لا نعدّها ناجحة. أول تشغيل API على قاعدة Browser المأهولة فشل بسبب Fixture من `Menu` يمنع تنظيف المطاعم؛ أُعيد على قاعدة API جديدة مستقلة ونجح. أول تشغيل Product Integration على Schema أقدم فشل لغياب أعمدة Stage 6C؛ أُعيد بعد تطبيق SQL Stage 6C على disposable فقط ونجح.
- Browser E2E الفعلية عبر Nest وNext محليين: **5/5 نقاط تحقق**، صفر تخطٍ/فشل في التشغيل الأخير: إنشاء إعداد Network والانتقال للمحرر، حفظ Pizza Demo عبر GET/PUT الحقيقي، Reload واستعادة Tree/Base null/Version، RTL وعرض 390px، وإنشاء Legacy بسعر صفر. صورة تجريبية خارج Git: `../work/stage6e1-dashboard-mobile.png`. الاختبار الأول كشف عيب HTML `step`، وبعد إصلاحه نجح التشغيل النهائي.
- Root Typecheck: **ناجح**. Root Build: **ناجح**، Next.js 27/27 صفحة. `prisma validate`: **ناجح**. `git diff --check`: بلا أخطاء محتوى (تحذير Windows LF/CRLF فقط).

محدودية الدليل: `stage3-full-schema.sql` هو مخطط اختبار مشتق من Prisma ولا يحمل PostgreSQL CHECKs الإضافية في Migration Stage 2C؛ لم تُجرِ هذه المرحلة Audit/Deploy لتاريخ Migration الحقيقي. مسار الإعداد يستخدم سعرًا غير null ومتوافقًا مع قيد Stage 2C، لكن الاختبار لم يُشغّل مجموعة HTTP الكاملة فوق جميع CHECKs الرسمية. Browser Runner لا يغطي تفاعل إنشاء Combo/ORIGINAL/CUSTOM خطوة بخطوة في الواجهة؛ هذا مغطى باختبارات Editor/Shared/API السابقة، وليس ادعاء Browser E2E جديدًا.

## 5. التشغيل المحلي للتجربة

جهّز PostgreSQL disposable **جديدة** على loopback فقط وبنية الاختبار المناسبة؛ لا تستخدم قاعدة موجودة أو `.env` حقيقيًا. شغّل Backend محليًا بمتغيرات `DATABASE_URL`/`DIRECT_URL` الخاصة بها و`JWT_SECRET` اختباري و`WEB_ORIGIN=http://127.0.0.1:3000`، ثم Web مع `NEXT_PUBLIC_API_URL=http://127.0.0.1:5000`. داخل Dashboard الحالية: **المنتجات → إضافة منتج → إعداد شبكة تكوين**، أدخل اسمًا وسعرًا تمهيديًا صريحًا، احفظ، ثم استخدم محرر الشبكة أسفل صفحة التعديل؛ Demo لا يرسل للخادم إلا بعد «حفظ الشبكة». افتح صفحة التعديل مجددًا للتحقق من الحفظ، ثم فعّل التوفر يدويًا إن أردت معاينة Public. Runner اليدوي يحتاج قاعدة الاختبار ذات الاسم الدقيق `ordersawa_stage3_stage6e1` والبيئة المحلية، ويُشغّل: `node scripts/stage6e1-dashboard-browser-e2e.mjs`. هو ليس مسار Production.

## 6. ما تبقى وStage 6E.2

لا WhatsApp Checkout عام في هذه المرحلة. قبل 6E.2 يلزم حسم حالة إعداد Network قبل أول حفظ ومنع إعادة عرض السعر التمهيدي إذا فعّل التاجر المنتج قبل التكوين؛ لا نغيّر عقد Schema/الترحيل بصمت. ثم يلزم تصميم/اعتماد Checkout عام يخلط Legacy وNetwork بTrusted Quote/Revalidation ورسالة WhatsApp صحيحة دون استعمال test-only endpoints، مع حسم سياسة عرض/تقريب العملة، بيانات العميل والرسوم، HMAC/Auth/Rate، التاريخ الفعلي للـMigration، والترجمة التاريخية. بقي `orderingEnabled:false` وحواجز تجربة الطلب كما كانت، ولا إرسال WhatsApp فعلي.

Commit هذه المرحلة مستقل عن `a850383`. يُقرأ Hash النهائي من `git log -1 --format=%H` بعد حفظ هذا التقرير لأن إدراج Hash الـCommit داخل محتواه سيغيّر الـHash ذاته. تحقق من `git status --short --branch` بعد الحفظ. **نقطة التوقف: Stage 6E.1 فقط؛ لا تبدأ 6E.2 دون موافقة.**
