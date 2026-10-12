# OrderSawa — تقرير تنفيذ Stage 5: Public Product Configurator

التاريخ: 2026-10-12

الفرع: `feature/product-configuration-network`

نقطة البداية: `1925791 test(web): verify Stage 4 dashboard editor`

## النتيجة

أُضيف محرر تكوين الزبون إلى صفحة الصنف في Public Menu الحالي، مع API عامة للقراءة، ومعاينة سعر تستخدم محرك `@menu/shared` نفسه. تظهر منتجات Network في القائمة بعلامة «ابتداءً من» أو «غير متاح»، وتظل المعاينة غير قابلة للإضافة إلى السلة أو إرسال طلب WhatsApp. جُرّبت الواجهة فعليًا بمنتجات Pizza وCombo وLegacy على PostgreSQL 16 مؤقتة محلية.

مرّت الاختبارات النهائية: Shared ‏21/21، API ‏85/85، Web ‏22/22، أي **128/128 بلا تخطٍ**. نجح Typecheck وBuild وPrisma Validate وSchema Diff بلا اختلاف.

## المراجع والحدود

اعتمد التنفيذ على `CODEX_HANDOFF.md`، وتقرير Stage 4.1، وسجلي `AUTHORITATIVE_RULES/LATEST_FOUNDER_DECISION_LEDGER_V2_CURRENT.md` و`CURRENT_SUPERSESSION_AND_CONFLICT_RULES.md`، و`02_IMPLEMENTATION_WORKFLOW_AR.md`، و`04_ACCEPTANCE_TEST_MATRIX.md`، وعقود Stage 1 الفعلية. وصلت المراجع الناقصة في حزمة Stage 5؛ تأكد وجود سجل التعارض التاريخي وبروتوتايب V62.4، وطُوبق Hash البروتوتايب مع المرجع الرسمي. المقارنة مع البروتوتايب هنا سلوكية فقط؛ تصميم الواجهة مبني على Public Menu الحقيقي، ولا توجد مطالبة بتطابق بصري حرفي.

لم تُعدّل Prisma Schema أو Migration History أو Dashboard أو Cart أو Checkout أو Billing. لم يُنفذ Migration أو Backfill أو Deployment على أي قاعدة حقيقية.

## الملفات الجديدة والمعدلة

الجديدة:

- `apps/api/src/modules/public-menu/public-product-configuration.ts`: حلّ التكوين العام ومصادر Linked Products داخل مطعم واحد، وحساب الحد الأدنى وقابلية المعاينة.
- `apps/api/src/modules/public-menu/public-product-configuration.spec.ts`: اختبارات الحد الأدنى، فقد الميزة، المصدر المفقود، Legacy CUSTOM، والمصدر غير المتاح.
- `apps/api/prisma/seed-stage5-public-demo.ts`: أمثلة تطوير قابلة للإعادة على قاعدة disposable محلية فقط.
- `apps/web/src/components/public/product-configurator.tsx`: واجهة الاختيار المتداخل وملخص السعر.
- `apps/web/src/components/public/product-configurator-model.ts`: تهيئة Selection Instances وسياق Shared Engine.
- `apps/web/src/components/public/product-configurator.module.css`: RTL وResponsive.
- `apps/web/src/components/public/product-configurator-model.test.ts` و`product-configurator.test.tsx`: اختبارات السعر والاختيار والحدود والعرض.
- هذا التقرير.

المعدلة:

- `apps/api/src/modules/public-menu/public-menu.controller.ts`: endpoint القراءة.
- `apps/api/src/modules/public-menu/public-menu.service.ts`: قوائم Network الآمنة، Capability Gate، ورفض طلب Legacy بلا سعر.
- `apps/api/src/modules/products/product-configuration.integration.spec.ts`: اختبارات HTTP وقاعدة البيانات لمسار Public، وحماية Legacy null/zero.
- `apps/api/package.json`: أمر Fixture التطوير.
- `apps/web/src/lib/api.ts`: عقود Public Configuration و`basePrice` nullable.
- `apps/web/src/components/public/public-menu-client.tsx`: ربط المحرر في تفاصيل المنتج، وعرض الأسعار، ومنع أزرار الطلب لمنتجات Network أو Legacy بلا سعر.
- `apps/web/src/app/globals.css`: تنسيق «ابتداءً من».
- `apps/web/package.json`: إدراج اختبارات Public ضمن Web Tests.
- `CODEX_HANDOFF.md`: تحديث حالة التسليم.

## Public API والعقد

`GET /public/menus/:restaurantSlug/products/:productId/configuration`

يقبل `productId` أو slug للمنتج ضمن المطعم الحالي فقط. يستجيب بالتكوين المحفوظ و`configurationRevision`، ومصادر Linked Products الممكن الوصول إليها فقط، و`orderable`، و`minimumPrice`/`maximumRequiredPrice` كسلاسل عشرية، و`priceDisplay`، وقائمة `issues` المهيكلة. يصرّح العقد بـ`previewOnly: true` و`orderAction: "STAGE_6_REQUIRED"`. سياق الحل الحالي `RESTAURANT`، ولا يطبق فروق Outlet أو Service Mode أو Product Scheduling. لا يكشف بيانات إدارية أو مصدرًا من مطعم آخر؛ الطلب إلى مطعم خاطئ يرجع 404.

مثال مختصر للاستجابة:

```json
{
  "data": {
    "schemaVersion": 1,
    "productId": "stage5-demo-pizza",
    "configurationRevision": 1,
    "configuration": { "schemaVersion": 1, "productId": "stage5-demo-pizza", "revision": 1, "basePrice": null, "groups": ["..."] },
    "linkedProducts": [],
    "orderable": true,
    "previewOnly": true,
    "orderAction": "STAGE_6_REQUIRED",
    "minimumPrice": "80",
    "maximumRequiredPrice": "145",
    "priceDisplay": "STARTING_AT",
    "issues": [],
    "runtimeContext": { "scope": "RESTAURANT", "outletDifferentialApplied": false, "serviceModeApplied": false, "productScheduleApplied": false }
  }
}
```

مصدر ORIGINAL يستخدم البنية الحية المحفوظة؛ مصدر CUSTOM يستخدم `customConfiguration` الصريحة داخل التكوين الأب. لا يحدث تحويل صامت لمنتج Legacy. إذا فُقد مصدر أو تعذر استيفاء الاختيارات الإلزامية، تبقى Min كما هي ويصبح المنتج غير قابل للطلب مع Issues واضحة. فقد Capability يحجب العرض العام دون حذف البيانات المخزنة أو الرجوع إلى Base Price.

## تجربة الزبون والتسعير

في صفحة الصنف، يختار الزبون الأحجام كاملة السعر، والخيارات المفردة/المتعددة، والكميات، والعناصر المتداخلة، ووحدات Linked Products المستقلة. لكل وحدة متكررة `instanceId` ثابت داخل المسودة. تُحفظ مسودة الاختيار في `sessionStorage` بحسب المطعم والصنف وRevision، ولا تُرسل للسيرفر تلقائيًا. عند تغيير Revision لا تُعاد مسودة قديمة على تكوين جديد.

الحساب يتم عبر `calculatePrice` و`validateSelection` من Shared Engine، بما فيه Included Quantity، وتجاوزات السعر حسب الحجم، وأسعار ORIGINAL في سياق الأب. لا يجري React عمليات Floating Point لتكوين السعر. عند التكوين غير الصالح تُعرض الأخطاء بدل إجمالي نهائي. يوضح النص أن الإجمالي معاينة وليس Quote. زر «تحقق من التكوين» يفحص الاختيار؛ لا يوجد زر متابعة إلى طلب فعلي لمنتجات Network.

اكتُشف وأُصلح عيب Radio أثناء الاختبار بالمتصفح: كان بلوغ `max=1` يمنع تبديل الخيار الحالي بخيار آخر. أضيف اختبار Regression. كذلك حُفظ الفرق بين `basePrice=null` و`0`: المنتج القديم بسعر صفر يظل قابلًا للطلب؛ المنتج القديم بلا سعر يظهر غير متاح للطلب ويُرفض في Backend بدل التحويل الصامت إلى صفر.

## أمثلة Demo وطريقة التشغيل المحلي

أداة Fixture تستخدم فقط قاعدة باسم `ordersawa_stage3_stage5_*` على `127.0.0.1:55440` أو `localhost:55440`، وتتطلب `DATABASE_URL` و`DIRECT_URL` متطابقين؛ ترفض أي هدف آخر. تنشئ مطعمًا مستقلًا اسمه `stage5-demo` وباقة Demo مع Capability داخل القاعدة المؤقتة فقط، ثم تحفظ التكوينات بمحرك الحفظ الذري Stage 2C. تكرار تشغيلها لا ينشئ منتجات أو علاقات مكررة. لا تعمل تلقائيًا أثناء تشغيل التطبيق أو في Production.

بعد تجهيز PostgreSQL disposable جديدة وتطبيق Schema Stage 2C عليها، من جذر المستودع في PowerShell:

```powershell
$env:DATABASE_URL = 'postgresql://postgres@127.0.0.1:55440/ordersawa_stage3_stage5_demo?schema=public'
$env:DIRECT_URL = $env:DATABASE_URL
npm --workspace @menu/api run seed:stage5-public-demo
$env:NEXT_PUBLIC_API_URL = 'http://localhost:5000'
npm run dev:api
```

شغّل `npm run dev:web` في نافذة أخرى، ثم افتح `http://localhost:3000/m/stage5-demo/menu`. يوجد:

- Pizza Margherita: Small/Medium/Large، جبنة إضافية، صوصات، وتعديل جبنة متداخل مع أسعار حسب الحجم.
- Combo: نسختان مستقلتان من Pizza بوضع ORIGINAL، ومصدر Legacy بوضع CUSTOM.
- Included Quantity: أغلى خيارين مشمولان في سعر الأب، ويحسب Shared Engine الإضافات غير المشمولة.

الأمر أعلاه مثال لاتصال **قاعدة اختبار جديدة فقط**؛ لا تستخدم ملفات `.env` الحقيقية. في بيئة Windows المقيدة المستخدمة لهذا التحقق احتاج تشغيل `tsx` إلى workaround محلي خارج Git لـ`os.userInfo()`، ولا يحتاجه التشغيل العادي.

## نتائج التحقق الفعلية

| التحقق | النتيجة |
| --- | --- |
| Shared Tests | 21/21 ناجحة |
| API Unit + Integration + HTTP على PostgreSQL disposable | 85/85 ناجحة، 0 متخطاة |
| Web Component/Model Tests | 22/22 ناجحة |
| Root Typecheck | ناجح |
| Root Build | ناجح؛ Next.js أنشأ 27/27 صفحة/مسار |
| Prisma Validate | ناجح |
| Prisma Schema Diff مع القاعدة المؤقتة | لا اختلاف |
| تشغيل Fixture مرتين | ناجح، دون تكرار |

أُوقفت خدمات Next.js وNestJS وPostgreSQL بعد التحقق، وتأكد عدم وجود Listener على المنافذ 3000 و5000 و55440. بقي مجلد Cluster التجريبي `../work/stage5-postgres-data` خارج Git؛ رفضت سياسة مساحة العمل حذفًا recursive له، ولم تُجرَ محاولة تجاوز. لا يحتوي على بيانات Production.

في المتصفح المحلي جُرّبت Pizza وCombo عمليًا: حجم Large مع كميتي جبنة، خيار متداخل، وصوص أعطى إجمالي 206؛ نسختا ORIGINAL احتفظتا باختيارات مختلفة؛ استبدال خيار CUSTOM أعطى 295 بعد إصلاح Radio؛ ظهر Legacy القديم بأزرار الطلب المعتادة. تحقق RTL عند عرض 390×844 بلا Overflow أفقي، وظهرت الواجهة كمعاينة دون زر طلب Network. التُقطت لقطات داخل جلسة اختبار المتصفح، لكنها لم تُصدّر إلى ملفات بالمستودع؛ لذلك لا توجد روابط صور قابلة للتنزيل في هذا التقرير. لم يُضف Browser E2E آلي إلى المستودع لغياب Runner مثبت؛ التغطية القابلة للإعادة موجودة في Unit/Integration/HTTP، ويحتاج اختبار المتصفح إعادة تنفيذ يدوي/عبر أداة المتصفح.

## المخاطر والأعمال المؤجلة

1. Stage 6 مطلوب قبل طلب منتجات Network: Server Quote وRevalidation وCart Identity وTrusted Checkout Pricing وImmutable Order Snapshot. مسار WhatsApp القديم محجوب عنها.
2. لا يوجد حاليًا Outlet Differential أو Service Mode أو Product Scheduling في العقد العام؛ سياق API يصرّح بذلك بدل افتراض سياسة جديدة.
3. سياسة تقريب العملات لم تُعتمد؛ بقيت الأسعار الداخلية Decimal strings و`DECIMAL(24,6)`.
4. Migration History في قواعد OrderSawa الحقيقية لم تُدقق ولم تُطبق Stage 2C Migration عليها؛ يلزم الإذن المنفصل قبل أي تشغيل حقيقي.
5. لم تُضف اختبارات Browser E2E آلية قابلة للتشغيل من CLI لعدم وجود Playwright/Puppeteer مثبتين؛ لقطات المتصفح اختُبرت تفاعليًا فقط.

حالة Git والـCommit النهائي تُراجع من `git status --short` و`git log -1 --oneline` بعد حفظ هذا التقرير مع التنفيذ في Commit Stage 5 مستقل. توقف العمل هنا بانتظار مراجعة Stage 5؛ لا يبدأ Stage 6 تلقائيًا.
