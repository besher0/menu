# OrderSawa — تقرير Stage 6A: Server-side Quote & Validation

## النطاق والحالة

نُفذت Stage 6A فقط على الفرع `feature/product-configuration-network` فوق Commit المرحلة الخامسة `1a97529`. تمت مراجعة `CODEX_HANDOFF.md`، وتقرير Stage 5، وسجل القرارات الحالي وقواعد التعارض، وخطة الشبكة ومصفوفة القبول، ومحرك Shared، وPublic Configurator وPublic API. لم تُنفذ Stage 6B أو 6C أو 6D، ولم تُفعّل Network Ordering.

## العقد المنفذ

`POST /public/menus/:restaurantSlug/products/:productId/quote`، بلا مصادقة كجزء من Public Menu، ويعيد `200` مع `Cache-Control: no-store`. جسم الطلب الوحيد المقبول:

```json
{
  "selection": {
    "schemaVersion": 1,
    "productId": "quote-pizza",
    "configurationRevision": 1,
    "groups": [
      { "type": "SIZE", "groupId": "quote-sizes", "sizeChoiceId": "quote-medium" },
      { "type": "OPTIONS", "groupId": "quote-toppings", "instances": [
        { "instanceId": "cheese-1", "optionId": "quote-cheese" }
      ] }
    ]
  }
}
```

الاستجابة المغلفة بعقد API الحالي (`data`, `meta`, `message`) تحتوي `schemaVersion`, `productId`, `configurationRevision`, `selectionKey`, `canonicalSelection`, `currency`, `trustedTotal`, `baseIgnored`, `priceBreakdown`, `linkedSourceRevisions`, `runtimeContext`، بالإضافة إلى:

```json
{
  "configurationOrderable": true,
  "previewOnly": true,
  "orderAction": "STAGE_6_REQUIRED",
  "orderingEnabled": false
}
```

`configurationOrderable` يعني أن الاختيار صالح وقابل للتسعير **لحظة القراءة**. لا يعني أن مسار إرسال الطلب صار جاهزًا؛ `previewOnly` و`orderingEnabled:false` و`orderAction` تحافظ على عقد Stage 5 صراحةً. هذا Quote محسوب من المصدر الحالي وليس حجز سعر، أو إثبات دفع، أو Snapshot طلب، أو تصريحًا بتمرير `trustedTotal` مباشرة إلى Checkout. يجب على Stage 6C إعادة تحميل البيانات وإعادة التحقق والتسعير قبل الحفظ. `linkedSourceRevisions` للمراجعة والتشخيص ولا يغني عن إعادة التحقق.

مثال مختصر للاستجابة عند نجاح بيتزا متوسطة وجبنة ×3، أول وحدة جبنة مجانية، وصوص فرعي واحد:

```json
{
  "data": {
    "schemaVersion": 1,
    "productId": "quote-pizza",
    "configurationRevision": 1,
    "currency": "EGP",
    "trustedTotal": "265.000004",
    "baseIgnored": true,
    "configurationOrderable": true,
    "previewOnly": true,
    "orderAction": "STAGE_6_REQUIRED",
    "orderingEnabled": false,
    "linkedSourceRevisions": []
  },
  "meta": {},
  "message": "Success"
}
```

المثال يعرض جزءًا من الاستجابة فقط؛ تعيد الاستجابة الفعلية `canonicalSelection` و`priceBreakdown` كاملين.

الأخطاء مُهيكلة بـ`error`, `message`, `issues[]`، ومع `currentRevision` عند الحاجة. أمثلة:

```json
{ "error": "CONFIGURATION_REVISION_CHANGED", "message": "Product configuration has changed; reload before continuing.", "currentRevision": 2, "issues": [{ "code": "STALE_CONFIGURATION_REVISION", "path": "$selection.configurationRevision", "message": "Selection revision does not match the current configuration." }] }
```

- `400`: جسم طلب يحتوي سعر/إجمالي أو حقلًا غير معروف في أي عمق، أو اختيار لا يحقق العقد والحدود (بما في ذلك Min/Max والعُقد المجهولة).
- `403`: فقد Capability، دون تعديل أو حذف التكوين المحفوظ.
- `404`: مطعم/منتج خارج نطاق المطعم أو منتج Legacy غير مؤهل لهذا الـNetwork endpoint.
- `409`: Revision قديمة للمنتج أو مصدر ORIGINAL، منتج/مصدر غير متاح، أو Configuration Required غير قابلة للإشباع. مصدر من مطعم آخر لا يُكشف؛ لا يوجد في Catalog المطعم الحالي ويُعامَل كـMissing Source.

الخادم يعيد قراءة مطعم الطلب، وCatalog منتجاته مع أشجارها وأسعارها وتوافرها، وPackage Capability من قاعدة البيانات في كل طلب. لا تُقبل أسعار أو إجماليات العميل؛ يمر الاختيار بعد فحص شكله وحقوله عبر `resolvePublicProductConfiguration` و`calculatePrice` و`validateSelection` من Shared Engine. لا يوجد محرك تسعير ثانٍ أو حساب مالي بـJavaScript floating-point. حفظ Stable instance IDs وتكرار Linked Product باختيارات فرعية مستقلة، ثم ترتيب مجموعات/وحدات الاختيار ترتيبًا canonical وتوليد `selectionKey` من Shared. يعمل ORIGINAL من بنية المصدر الحية مع أسعار سياق الأب، وCUSTOM من Snapshot محلي مع بقاء هوية المصدر وتوافره حيّين. النطاق الحالي Restaurant فقط؛ لم يُطبّق Business/Outlet Differential أو Scheduling.

## الملفات المتغيرة

- `apps/api/src/modules/public-menu/public-product-quote.ts`: عقد Quote، فحص صارم لطلب العميل، حساب السعر من Shared، canonical selection، ونتائج/أخطاء منظمة.
- `apps/api/src/modules/public-menu/public-menu.controller.ts`: مسار POST للـQuote مع HTTP 200 ومنع التخزين المؤقت.
- `apps/api/src/modules/public-menu/public-menu.service.ts`: إعادة تحميل سياق المطعم والمنتجات والـCapability والتحويل إلى أخطاء HTTP؛ لا كتابة إلى القاعدة.
- `apps/api/src/modules/public-menu/public-product-quote.spec.ts`: اختبارات وحدة Decimal/Size/Nested/Included/ORIGINAL/CUSTOM/Revision/التلاعب.
- `apps/api/src/modules/products/product-configuration.integration.spec.ts`: Fixtures واختبارات HTTP حقيقية على PostgreSQL مؤقتة؛ السعر الحالي، الحدود، التلاعب، المصادر، Capability، التوافر والعزل.
- `STAGE_6A_SERVER_QUOTE_REPORT_AR.md`: هذا التقرير.
- `CODEX_HANDOFF.md`: ملخص الحالة وتعليمات المتابعة.

لم تتغير Prisma Schema أو Migrations أو Dashboard أو Public Configurator أو Cart أو Checkout أو WhatsApp أو Order Snapshot.

## نتائج الاختبارات الفعلية

أنشئت مجموعة PostgreSQL 16 **جديدة ومعزولة** تحت `../work/stage6a-postgres-data` خارج Git، مربوطة فقط بـ`127.0.0.1:55440`، وقاعدة جديدة باسم `ordersawa_stage3_stage6a`. طُبّق SQL الاختباري المشتق من Stage 2C على هذه القاعدة وحدها، من دون استخدام `.env` الحقيقي أو أي قاعدة قائمة. أُوقفت المجموعة بعد الاختبارات، ولا يوجد Listener على المنفذ.

| الفحص | النتيجة |
|---|---:|
| Shared Tests | 21/21 ناجحة |
| API Unit + Integration + HTTP (قاعدة مؤقتة) | 96/96 ناجحة، 0 متخطاة، 17 ملفات اختبار |
| منها Integration/HTTP الموجهة للـNetwork | 21/21 ناجحة |
| Web Regression | 22/22 ناجحة |
| الإجمالي | 139/139 ناجحة، 0 متخطاة |
| Root Typecheck | ناجح |
| Root Build | ناجح؛ Next.js بنى 27/27 صفحة/مسار |

غطت اختبارات المرحلة الجديدة التسعير بست منازل عشرية، الأحجام وسعرها الكامل، تفرع الصوص، إعفاء Included Quantity الأعلى، تكرار ORIGINAL بخيارين مستقلين، CUSTOM، عدم وراثة سعر المصدر، تغيّر Revision للمنتج والمصدر، إعادة قراءة السعر الحالي، السعر المُزوّر على مستوى الطلب أو داخله، Max، الاختيار غير المعروف، المصدر غير المتاح والمفقود/العابر للمطعم، فقد Capability، Legacy، وعدم تعريض المنتج القديم لمسار الـQuote. لم يُشغّل Browser E2E جديد لأن المرحلة Backend-only؛ ولم يُشغّل Prisma Schema Diff أو Migration Test جديد لأن schema لم تتغير.

## قرارات معلقة ومخاطر منتقلـة

1. **التقريب حسب العملة غير معتمد**؛ يظل المبلغ Decimal string بدقة المحرك الحالية، ولا يُحوّل إلى `Number` أو إلى `DECIMAL(24,6)` إلا عند مرحلة الحفظ المعتمدة لاحقًا.
2. **الـQuote ليس ضمانًا طويل الأجل**: قد تتغير الأسعار أو التوافر أو الـCapability بعد الرد. لا تُستخدم قيمته المخزنة كحقيقة للسلة أو للطلب؛ Stage 6B تحفظ الاختيار/الهوية، وStage 6C تعيد التحقق والتسعير قبل إنشاء Order مع معالجة التغيّر دون تصحيح صامت.
3. قراءتا Catalog والـCapability ليستا Snapshot معاملة واحدة. هذا مقبول هنا فقط لأن Network Ordering ما زال معطّلًا؛ يلزم ضمان الاتساق عند Stage 6C وفق قرار المعاملة/إعادة المحاولة النهائي.
4. تكلفة قراءة كامل Catalog وحساب الحد الأدنى في كل Quote تحتاج قياسًا وتحسينًا عند التوسع، دون التفاف حول Shared Engine أو تمييع التحقق.
5. ربط Business/Outlet وService Mode وProduct Scheduling مؤجل بعقد صريح؛ التنفيذ الحالي Restaurant-only.
6. لم تُجرَ مراجعة Migration History أو تطبيق Migration/Backfill على قاعدة حقيقية، ولا يجوز استنتاج أن Stage 2C مطبقة في بيئة تشغيلية.

## حالة Git ونقطة التوقف

هذا التقرير وملف التسليم محفوظان مع تنفيذ Stage 6A في Commit مستقل على `feature/product-configuration-network`. لا تبدأ Stage 6B أو 6C أو 6D قبل موافقة جديدة، ولا تُفتح أي قاعدة حقيقية أو يُنفذ Deployment.
