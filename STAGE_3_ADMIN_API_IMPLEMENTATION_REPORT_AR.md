# تقرير تنفيذ Stage 3 — Admin API & Product Configuration Integration

التاريخ: 2026-10-12

الفرع: `feature/product-configuration-network`

النطاق: Stage 3 فقط — لم يبدأ Stage 4 ولم تُعدّل واجهة Dashboard أو Public Menu أو Cart أو Checkout.

## 1. الخلاصة التنفيذية

تم ربط محرك Product Configuration في `packages/shared` مع نموذج Prisma وخدمة المنتجات وAdmin API، مع استخدام أداة الحفظ الذري المنفذة في Stage 2C. أصبحت الشبكة قابلة للقراءة والحفظ من Admin API مع:

- Tenant isolation مبني على `RestaurantContextGuard` الموثوق من الخادم.
- صلاحية بنيوية مستقلة `product.configuration.manage` للأدوار OWNER وMANAGER وEDITOR.
- Capability gate باسم `PRODUCT_CONFIGURATION` مع فصل الإسناد عن حالة دورة الفوترة الحالية.
- Validation كامل عبر Shared Engine قبل أي كتابة.
- optimistic concurrency بواسطة `expectedVersion` و`configuration.revision`.
- HTTP 409 للتعارضات، و400 للأخطاء البنيوية، و403 للصلاحيات/الـcapability.
- تحديث `configurationTree` و`configurationVersion` و`basePrice` وDependency Index وحالة الحماية العامة داخل Serializable Transaction واحدة.
- حماية Linked Product من soft delete وhard delete، وفحص حذف Category.
- حماية Legacy APIs من تعديل سعر Network Product أو نشره عبر المسار العام القديم.
- إبقاء القراءة متاحة عند فقد capability من دون حذف الشبكة أو تحويلها إلى Base Price.

لم يتم الاتصال بأي قاعدة موجودة أو Production. اختبارات قاعدة البيانات استُخدمت فيها PostgreSQL محلية disposable جديدة فقط على loopback، وتم توليد الـschema الكامل من `schema.prisma` ثم تطبيقه كـSQL، من دون `db push` أو `migrate deploy`.

## 2. المراجع والقرارات المطبقة

تمت المراجعة قبل البرمجة بالترتيب التالي:

1. `CODEX_HANDOFF.md` كاملًا.
2. `AUTHORITATIVE_RULES/LATEST_FOUNDER_DECISION_LEDGER_V2_CURRENT.md`.
3. `AUTHORITATIVE_RULES/CURRENT_SUPERSESSION_AND_CONFLICT_RULES.md`.
4. `02_IMPLEMENTATION_WORKFLOW_AR.md`.
5. `04_ACCEPTANCE_TEST_MATRIX.md`.
6. عقود ومحرك Stage 1، و`product-configuration.persistence.ts` من Stage 2C.

القرارات المطبقة مباشرة:

- `configurationTree` هو المصدر canonical الوحيد للشبكة الجديدة.
- `null` في Base Price مختلف عن الصفر الصريح.
- الأسعار داخل العقود Decimal strings والتخزين `DECIMAL(24,6)`.
- أسعار Sizes أسعار كاملة وليست deltas.
- Linked Product يحافظ على سعر محلي داخل الأب؛ لا يرث سعر بيع المصدر تلقائيًا.
- `ORIGINAL` يعتمد بنية مصدر حية محفوظة؛ `CUSTOM` يحفظ snapshot محليًا مع بقاء هوية المصدر والاعتماد الحي عليه.
- self-link والدورات المباشرة والعميقة ممنوعة في الخادم.
- جميع المصادر المرتبطة ضمن نفس Restaurant في المعمارية الحالية.
- capability loss يحافظ على البيانات ويمنع الكتابة/التفعيل ولا ينفذ fallback صامتًا.
- Hide التشغيلي لا يساوي حذفًا بنيويًا؛ الحذف البنيوي للمصدر ممنوع عند وجود dependents.

## 3. Admin API المنفذة

جميع المسارات تحت:

`/dashboard/products`

وتستخدم الحراسات الموجودة:

- `JwtAuthGuard`
- `RestaurantContextGuard`

### 3.1 قراءة الشبكة

`GET /dashboard/products/:id/configuration`

ترجع:

- `productId`
- `mode`: إما `LEGACY` أو `NETWORK`
- `configurationVersion`
- `configurationTree`
- `basePrice` كـdecimal string أو `null`
- `isAvailable`
- حالة capability للقراءة والكتابة
- `orderabilityState`: `LEGACY` أو `PUBLIC_INTEGRATION_PENDING` أو `ACTION_REQUIRED_CAPABILITY`

القراءة مسموحة لعضو المطعم المخوّل بالسياق حتى عند فقد capability، كي لا تختفي البيانات المحفوظة.

### 3.2 حفظ الشبكة

`PUT /dashboard/products/:id/configuration`

DTO:

```json
{
  "expectedVersion": 0,
  "configuration": {
    "schemaVersion": 1,
    "productId": "product-id",
    "revision": 1,
    "basePrice": null,
    "groups": []
  }
}
```

القواعد:

- `configuration.productId` يجب أن يطابق `:id`.
- `configuration.revision` يجب أن يساوي `expectedVersion + 1` بالضبط.
- كل الشبكة تمر عبر `validateConfiguration` في Shared Engine.
- OWNER وMANAGER وEDITOR فقط يملكون `product.configuration.manage`.
- EMPLOYEE لا يملك صلاحية التعديل البنيوي.
- capability يُفحص قبل المعاملة ويُعاد فحصه داخل المعاملة لمنع race عند سحب الميزة.
- المنتج يُبحث داخل `restaurantId` المأخوذ من backend context، وليس من body.

لا يوجد endpoint منفصل للإصدار لأن `configurationVersion` موجود صراحة في استجابة GET وPUT.

## 4. شكل الأخطاء

### Validation — HTTP 400

```json
{
  "statusCode": 400,
  "error": "PRODUCT_CONFIGURATION_VALIDATION_FAILED",
  "message": "Product configuration validation failed",
  "issues": [
    {
      "code": "SELF_LINK",
      "path": "$configuration.groups[0].options[0].linkedProduct",
      "message": "A product cannot link to itself."
    }
  ]
}
```

### Revision/dependency conflict — HTTP 409

```json
{
  "statusCode": 409,
  "error": "PRODUCT_CONFIGURATION_CONFLICT",
  "message": "Configuration version conflict: expected 1, found 2"
}
```

### Capability denied — HTTP 403

```json
{
  "statusCode": 403,
  "error": "FEATURE_LOCKED",
  "message": "This capability is not assigned to the current restaurant package",
  "featureKey": "PRODUCT_CONFIGURATION"
}
```

### Structural permission denied — HTTP 403

```json
{
  "statusCode": 403,
  "error": "PRODUCT_CONFIGURATION_PERMISSION_DENIED",
  "message": "The current restaurant role cannot manage product configuration."
}
```

## 5. Atomic Persistence

يستخدم `ProductConfigurationService` الدالة الموجودة من Stage 2C:

`persistProductConfiguration(...)`

داخل Serializable Transaction واحدة يحدث الآتي:

1. إعادة فحص capability المسندة.
2. التحقق من ملكية المنتج وعدم حذفه.
3. مقارنة الإصدار الحالي مع `expectedVersion`.
4. التحقق من وجود Linked Product Sources في المطعم نفسه.
5. اشتراط configuration محفوظة لمصدر `ORIGINAL` كي يكون قابلًا للحل runtime.
6. بناء Dependency Graph مع الحواف الحالية واكتشاف deep cycles.
7. تحديث Base Price مع الحفاظ على `null` مقابل `0`.
8. تحديث `configurationTree` و`configurationVersion` optimistic atomically.
9. ضبط `isAvailable=false` لحماية المنتج من المسار العام القديم حتى Stage 5.
10. حذف الحواف القديمة وإنشاء الحواف الجديدة بإصدار الشبكة الجديد.

أي فشل يرمي المعاملة كاملة. أخطاء Prisma `P2034` تُعاد محاولتها بحد أقصى ثلاث محاولات، ثم تتحول إلى 409 آمن. `P2002` الناتج من سباق على الفهرس يتحول أيضًا إلى 409.

## 6. Validation المغطاة

Shared Engine الموجود يغطي:

- schema version وstable IDs ومنع التكرار.
- Base/Size/Option money strings حتى ست منازل عشرية.
- Sizes كاملة السعر وSize nesting rules.
- Min/Max للمجموعات والخيارات والكميات.
- Included Quantity.
- Nested Groups وحدود العمق والعقد والاختيارات والكميات.
- Size-specific overrides والفرق بين blank override وzero.
- ORIGINAL/CUSTOM وشروط snapshot.
- self-link.

Stage 3 يضيف في طبقة قاعدة البيانات والخدمة:

- route product mismatch.
- next revision exactness.
- missing linked source.
- cross-restaurant linked source.
- ORIGINAL source without a persisted configuration.
- global direct/deep dependency cycles.
- optimistic and concurrent updates.
- tenant-scoped reads/writes/deletes.

## 7. Delete Protection

- `ProductsService.delete` يفحص incoming dependency edges قبل soft delete.
- عند وجود dependents يرجع 409 مع product ID/name وoption/path، ولا يعدّل المصدر أو الأب.
- hard delete محمي كذلك بواسطة FK `onDelete: Restrict` واختُبر فعليًا في PostgreSQL.
- حذف Category يفحص منتجاتها أولًا بحثًا عن مصادر مرتبطة ويمنع العملية كاملة برسالة مهيكلة.
- لم تُحذف الحواف أو الشبكات بصمت.
- لم تُحذف الجداول القديمة.

## 8. Package Capability

أضيف المفتاح `PRODUCT_CONFIGURATION` إلى سجل feature keys، لكن لم تتم إضافته تلقائيًا إلى BASIC/PRO/PREMIUM؛ تحديد الباقات التجارية التي تحصل عليه قرار منتج غير منصوص عليه بدقة، لذلك بقي الإسناد صريحًا عبر plan features الحالية.

الـadapter الحالي:

- يقرأ feature المسندة من الخطة المرتبطة بالمطعم.
- يتجاهل حالة `ACTIVE/TRIALING/CANCELED/...` لهذا الفحص تحديدًا، وفق قرار أن Billing State ليس entitlement master.
- لا يعيد بناء Billing أو Package Versioning.
- لا يدعم بعد Entitlement Snapshot أو Super Admin Exceptions أو Market-scoped package versions لأن schema الحالي لا يمثلها.

هذه المحدودية موثقة وليست قرارًا معماريًا جديدًا.

## 9. Legacy Compatibility والحماية المرحلية

- إنشاء Legacy Product ما زال يتطلب Base Price غير فارغ على مستوى الخدمة.
- DTO أصبح يسمح بإغفال `basePrice` في update كي يمكن تعديل metadata لاحقًا من دون إجبار Network Product ذي Base null على قيمة مزيفة.
- تحديث metadata لشبكة موجودة لا يسمح بتغيير السعر خارج endpoint الشبكة.
- Quick Price Update مرفوض لـNetwork Product.
- `serializeProduct` لم يعد يحول `null` إلى `0`، ويضيف `configurationMode` و`configurationVersion`.
- Excel export يكتب السعر decimal string كاملًا، ويكتب blank عند Base null بدل `Number(null)`.
- Legacy Product يبقى قابلًا للتعديل والتسعير بالطريقة القديمة.
- ProductOptionGroup وProductOption لم يُحذفا ولم يتحولا إلى مصدر تسعير للشبكة الجديدة.
- عند حفظ شبكة، المنتج يصبح `isAvailable=false` داخل نفس المعاملة.
- legacy toggle لا يستطيع إعادة نشر Network Product قبل تنفيذ Public Configurator/Stage 5.
- لم يتغير كود Public Menu أو Cart أو Checkout.

## 10. الاختبارات الفعلية

بيئة PostgreSQL disposable:

- Cluster جديد داخل `work/stage3-postgres-data`.
- loopback فقط على port `55440`.
- قاعدة `ordersawa_stage3_integration`.
- لا `.env` ولا credentials ولا Volume قائم.
- تم إنشاء schema بواسطة Prisma schema diff من empty إلى `schema.prisma` وتطبيق SQL الناتج بـ`psql`.
- لم يُستخدم `prisma db push` أو `prisma migrate deploy`.

النتائج النهائية:

| الاختبار | النتيجة |
|---|---:|
| Shared Vitest | 21/21 passed |
| API Unit + Integration Vitest | 72/72 passed في 15 files |
| PostgreSQL integration ضمن API | 8/8 passed |
| الإجمالي | 93/93 passed |
| Prisma validate | passed |
| Prisma schema diff مقابل disposable DB | empty migration |
| API typecheck | passed |
| Product configuration tools typecheck | passed |
| Root typecheck Shared/API/Web | passed |
| Root build Shared/API/Web | passed |

حالات PostgreSQL المغطاة:

- create/update للشبكة.
- base null وzero وsix-decimal values.
- ORIGINAL وCUSTOM.
- dependency index version replacement.
- missing/cross-tenant/unconfigured linked sources.
- self-link.
- deep cycle.
- atomic rollback وعدم وجود partial tree/edges.
- concurrent update؛ نجح طلب واحد فقط.
- capability loss مع بقاء البيانات.
- soft/hard delete protection.
- legacy product unchanged.
- tenant-scoped read.

ملاحظة: Vitest يحتاج `TEMP/TMP` داخل workspace في هذه البيئة بسبب sandbox؛ المحاولة الأولى باستخدام Windows Temp أعطت EPERM ولم تشغّل أي test. التشغيل النهائي الموثق استخدم `work/stage3-test-temp` ونجح بالكامل.

## 11. الملفات الجديدة

- `apps/api/src/modules/products/dto/update-product-configuration.dto.ts`
- `apps/api/src/modules/products/product-configuration.service.ts`
- `apps/api/src/modules/products/product-configuration.service.spec.ts`
- `apps/api/src/modules/products/product-configuration.integration.spec.ts`
- `apps/api/src/modules/products/products.controller.spec.ts`
- `apps/api/src/modules/products/products.service.spec.ts`
- `apps/api/src/modules/feature-flags/feature-flags.service.spec.ts`
- `STAGE_3_ADMIN_API_IMPLEMENTATION_REPORT_AR.md`

## 12. الملفات المعدلة

- `packages/shared/src/feature-keys.ts`
- `packages/shared/src/roles.ts`
- `apps/api/package.json`
- `apps/api/src/modules/feature-flags/feature-flags.service.ts`
- `apps/api/src/modules/products/dto/create-product.dto.ts`
- `apps/api/src/modules/products/product-configuration.persistence.ts`
- `apps/api/src/modules/products/product-configuration.persistence.spec.ts`
- `apps/api/src/modules/products/products.controller.ts`
- `apps/api/src/modules/products/products.module.ts`
- `apps/api/src/modules/products/products.service.ts`
- `apps/api/src/modules/products/products-import.service.ts`
- `apps/api/src/modules/dashboard/dashboard.service.ts`
- `apps/api/src/modules/dashboard/dashboard.service.spec.ts`
- `CODEX_HANDOFF.md`

لم يتغير `schema.prisma` أو أي migration في Stage 3.

## 13. أمثلة Request/Response

### GET

```http
GET /dashboard/products/product-1/configuration
Authorization: Bearer <token>
X-Restaurant-Id: restaurant-1
```

```json
{
  "data": {
    "productId": "product-1",
    "mode": "NETWORK",
    "configurationVersion": 2,
    "configurationTree": {
      "schemaVersion": 1,
      "productId": "product-1",
      "revision": 2,
      "basePrice": null,
      "groups": []
    },
    "basePrice": null,
    "isAvailable": false,
    "capability": {
      "key": "PRODUCT_CONFIGURATION",
      "assigned": true,
      "canRead": true,
      "canWrite": true
    },
    "orderabilityState": "PUBLIC_INTEGRATION_PENDING"
  },
  "meta": {},
  "message": "Success"
}
```

### PUT بحجم وإضافة Nested

```http
PUT /dashboard/products/product-1/configuration
Authorization: Bearer <token>
X-Restaurant-Id: restaurant-1
Content-Type: application/json
```

```json
{
  "expectedVersion": 0,
  "configuration": {
    "schemaVersion": 1,
    "productId": "product-1",
    "revision": 1,
    "basePrice": null,
    "groups": [
      {
        "type": "SIZE",
        "id": "pizza-size",
        "label": "الحجم",
        "sizes": [
          {
            "id": "small",
            "label": "صغير",
            "price": "100.000000",
            "children": [
              {
                "type": "OPTIONS",
                "id": "cheese",
                "label": "الجبنة",
                "min": 0,
                "max": 3,
                "includedQuantity": 1,
                "options": [
                  {
                    "id": "extra-cheese",
                    "label": "جبنة إضافية",
                    "price": "10.500000",
                    "minQuantity": 0,
                    "maxQuantity": 3
                  }
                ]
              }
            ]
          }
        ]
      }
    ]
  }
}
```

## 14. المؤجل والمخاطر المتبقية

1. Stage 4 Dashboard editor لم يبدأ.
2. Stage 5 Public Configurator/ordering لم يبدأ؛ Network Products التي تُحفظ عبر API تبقى غير متاحة للعامة عمدًا.
3. Backfill من Stage 2C لا يغيّر `isAvailable` افتراضيًا. لذلك لا يجوز تشغيل backfill حقيقي قبل اعتماد ترتيب rollout يضمن عدم تعرض Network Products للمسار العام القديم. لم تُعدّل أداة Stage 2C هنا لتجنب تغيير قرار ترحيل معتمد ضمنيًا.
4. Entitlement Snapshot/Exception/Market-scoped Package Version غير ممثل في schema الحالي؛ الـgate الحالي adapter محدود ومعلن.
5. ربط capability بأي باقات افتراضية لم يُقرر؛ يجب أن يتم بقرار تجاري صريح.
6. سياسة rounding حسب العملة ما زالت معلقة؛ التخزين والحساب الداخلي عند ست منازل عشرية فقط.
7. اختبارات Stage 3 هي controller/service/unit وPostgreSQL integration؛ لا يوجد HTTP E2E عبر socket/supertest في البنية الحالية.
8. DB constraints تحمي envelope والـFK، لكن writers خارج الخدمة يمكن أن يتجاوزوا Shared semantic validation؛ يجب إبقاء كل writer تشغيلي على helper الذري.
9. لا يجوز تطبيق migration/backfill أو نشر هذا العمل على قاعدة حقيقية قبل Migration History audit وموافقة مستقلة.

## 15. نقطة التوقف

Stage 3 مكتمل ضمن النطاق المذكور. لا يبدأ Stage 4 تلقائيًا. يلزم مراجعة هذا التقرير والموافقة الصريحة قبل تعديل Dashboard أو أي مسار عام/Cart/Checkout أو تنفيذ migration/backfill حقيقي.
