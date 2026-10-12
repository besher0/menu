# تقرير Stage 3.1 — Backend Stabilization

التاريخ: 2026-10-12

الفرع: `feature/product-configuration-network`

الحالة: مكتملة ضمن نطاق Stage 3.1 فقط. لم يبدأ Stage 4، ولم تُنفذ Migration أو Backfill على أي قاعدة حقيقية.

## 1. المراجع المعتمدة

تمت المراجعة بالترتيب الآتي:

1. `CODEX_HANDOFF.md`.
2. `STAGE_3_ADMIN_API_IMPLEMENTATION_REPORT_AR.md`، وبخاصة قسم المخاطر المتبقية.
3. `AUTHORITATIVE_RULES/LATEST_FOUNDER_DECISION_LEDGER_V2_CURRENT.md`.
4. `AUTHORITATIVE_RULES/CURRENT_SUPERSESSION_AND_CONFLICT_RULES.md`.
5. `02_IMPLEMENTATION_WORKFLOW_AR.md`.
6. `04_ACCEPTANCE_TEST_MATRIX.md`.
7. الكود الفعلي لمسارات Product CRUD وAdmin Configuration وPublic Menu وWhatsApp Order وBackfill والحذف.

القواعد التي حكمت الإصلاحات:

- `configurationTree` هو المصدر canonical الوحيد لتكوين الشبكة وقت التشغيل.
- `ORIGINAL` يعتمد على بنية وقواعد المصدر الحية، بينما `CUSTOM` يحفظ Snapshot محليًا مع بقاء هوية المصدر واعتمادية الحذف حيتين.
- لا يرث Linked Product سعر بيعه المستقل داخل سعر الأب.
- لا تحويل تلقائي ولا تعديل صامت لبيانات المنتج.
- `Hide/isAvailable` حالة تشغيلية منفصلة عن الإزالة البنيوية وعن صلاحية Linked Product.
- حذف Product مصدر أو Category تحتوي مصدرًا مرتبطًا يجب أن يمنع العملية كاملة دون فصل صامت.
- فقد Capability يحفظ البيانات ولا يطبق Base Price fallback.

## 2. ملخص النتيجة

تم إصلاح خمس نقاط مؤكدة:

1. فصل `isAvailable` عن حارس جاهزية Public Network؛ لم يعد حفظ الشبكة يغيّر حالة الإتاحة اليدوية إلى `false`.
2. إضافة حارس مركزي لمسارات Public legacy يمنع إظهار أو طلب أي منتج لا يحقق معًا `configurationVersion = 0` و`configurationTree IS NULL`، حتى لو بقي `isAvailable=true` بعد Backfill.
3. توضيح مسار Legacy Linked Product: يسمح `CUSTOM` مع Snapshot صريح، بينما يرفض `ORIGINAL` إلى أن يحفظ المصدر شبكة فعلية، دون تحويل المصدر تلقائيًا.
4. إضافة HTTP E2E حقيقي عبر socket محلي لاختبار Authentication وAuthorization وTenant Isolation وValidation وRevision Conflict.
5. جعل فحص وحذف Category عملية Serializable ذرية، مع 409 واضح عند تعارض التزامن.

لم يتغير Prisma Schema أو Migration أو Backfill SQL، ولم تُستخدم بيانات Production.

## 3. Legacy Product مع ORIGINAL Linked Product

### المشكلة

وضع `ORIGINAL` يعني أن بنية المصدر وقواعده تُقرأ حيًا. Legacy Product لا يملك `configurationTree` canonical؛ استخدام جداول الخيارات القديمة كمصدر حي موازٍ سيخالف قرار أن الشبكة هي المصدر الوحيد وقت التشغيل، أما تحويله تلقائيًا فسيتعارض مع منع التعديل الصامت.

### الحل المطبق

- المصدر Legacy صالح للربط بوضع `CUSTOM` فقط عندما يرسل العميل `customConfiguration` صريحًا صالحًا. يبقى `sourceProductId` حيًا وتبقى حماية الاعتمادية والحذف فعالة.
- `ORIGINAL` يتطلب أن يكون المصدر قد حُفظ صراحة كـNetwork Product (`configurationTree != null` و`configurationVersion >= 1`).
- لا تُحوّل خيارات Legacy ولا سعره ولا حالته تلقائيًا.
- أصبح الرد 409 مهيكلًا:

```json
{
  "statusCode": 409,
  "error": "ORIGINAL_LINKED_SOURCE_REQUIRES_NETWORK_CONFIGURATION",
  "message": "ORIGINAL linked products require a saved network configuration: source-id",
  "details": {
    "sourceProductIds": ["source-id"],
    "allowedWithoutSourceConversion": ["CUSTOM"],
    "requiresExplicitSourceConfigurationForOriginal": true
  }
}
```

هذا توضيح وتنفيذ مباشر لمعنى ORIGINAL/CUSTOM المعتمد، وليس عقدًا جديدًا.

## 4. حماية Backfill وPublic Legacy

### الخطر السابق

Backfill Stage 2C يحفظ الشبكة ذريًا لكنه لا يغيّر `isAvailable`. وكان حارس Stage 3 يعالج ذلك عبر تعيين `isAvailable=false` عند كل حفظ يدوي للشبكة. هذا يخلط حالة الإخفاء التي يتحكم بها التاجر مع جاهزية مسار الطلب، ولا يحمي وحده كل Writer أو Backfill.

### الحماية المطبقة

أصبح مسارا Legacy الفعليان يشترطان أن يكون المنتج Legacy بنيويًا:

- قائمة المنتجات في Public Menu.
- تحقق المنتج قبل إنشاء WhatsApp Order.

الشروط الإضافية:

```text
configurationVersion = 0
configurationTree IS NULL
```

مع الإبقاء على شروط `isActive` و`isAvailable` و`deletedAt` القديمة.

النتيجة:

- Backfill لا يحتاج إلى تعديل حالة `isAvailable` اليدوية كي يمنع التسرب إلى الطلب القديم.
- Network Product لا يظهر ولا يُطلب عبر المسار القديم حتى اكتمال Public Configurator في مرحلة لاحقة.
- المنتج المرتبط المخفي تشغيليًا لا يُحذف ولا تُفصل اعتماديته تلقائيًا.
- لم يُنفذ Public Configurator أو Cart/Checkout جديد.

## 5. تدقيق مسارات تعديل Product

تمت مراجعة جميع كتابات Product داخل `apps/api/src`:

| المسار | النتيجة |
|---|---|
| Admin configuration PUT | يمر عبر Shared validation ثم `persistProductConfiguration` داخل Serializable Transaction. |
| Product create | ينشئ Legacy Product فقط؛ لا يقبل حقول الشبكة. |
| Excel import | ينشئ Legacy Products فقط؛ لا يعدل Network Products. |
| Generic product update | DTO لا يحتوي حقول الشبكة، وBase Price لمنتج Network محمي. |
| Quick price update | مرفوض لمنتج Network. |
| Availability toggle | يغيّر الحالة التشغيلية فقط ولا يكتب tree/version/base. |
| Sort/reorder/media/metadata | لا تكتب حقول الشبكة أو السعر الشبكي. |
| Backfill | يستخدم atomic persistence helper. |
| Product soft delete | Serializable ويفحص incoming dependency edges. |
| Category soft delete | أصبح الفحص والحذف داخل Serializable Transaction واحدة. |
| Admin permanent restaurant delete | حذف كامل للمطعم وليس Writer لتكوين منتج منفرد؛ بقي خارج نطاق تغيير العقود. |

أضيف اختبار يمنع Generic Update من تغيير السعر الذي تديره الشبكة.

## 6. Capability Gate

تمت إعادة مراجعة القراءة والكتابة وفقد الميزة:

- القراءة تبقى متاحة لعرض البيانات المحفوظة وحالة `ACTION_REQUIRED_CAPABILITY`.
- الكتابة تُرفض قبل Transaction وتُعاد مراجعة Capability داخل Transaction لمنع السباق.
- فقد Capability لا يحذف `configurationTree` ولا Dependency Index.
- لا يُرجع المنتج تلقائيًا إلى Base Price.
- الحارس الجديد لمسار Legacy يستبعد المنتج بحسب علامات الشبكة نفسها، لذلك لا يؤدي فقد Capability أو تغيير `isAvailable` إلى fallback غير مقصود.

لم يُبنَ Billing أو Entitlement Snapshot أو Package Versioning جديد.

## 7. الحذف والتزامن

تم التحقق فعليًا على PostgreSQL disposable من:

- منع Soft Delete لمصدر Linked مع قائمة dependents.
- منع Hard Delete بواسطة FK `onDelete: Restrict`.
- منع حذف Category تحتوي مصدرًا Linked، وبقاء `deletedAt = null`.
- تنفيذ فحص Category والحذف داخل Serializable Transaction واحدة.
- نجاح تحديث Optimistic واحد فقط من تحديثين متزامنين لنفس revision.
- عدم وجود كتابة جزئية للشجرة أو Dependency Index عند الفشل.

## 8. HTTP E2E الحقيقي

أُنشئ تطبيق Nest اختباري يستعمل Controller وGuards وService وPrisma الحقيقيين، ويستمع على `127.0.0.1` ومنفذ مؤقت أثناء الاختبار فقط. استُخدمت قاعدة Stage 3 disposable المعزولة.

السيناريوهات:

1. طلب بلا Bearer Token يعيد 401.
2. عضو بدور `EMPLOYEE` يحاول PUT فيُرفض 403 بـ`PRODUCT_CONFIGURATION_PERMISSION_DENIED`.
3. OWNER في Restaurant 1 لا يرى Product تابعًا لـRestaurant 2 ويستلم 404.
4. محاولة تزوير `X-Restaurant-Id` إلى Restaurant بلا Membership تُرفض 403.
5. Self-link غير صالح يعيد 400 مع `issues` مهيكلة من Shared Engine.
6. PUT صالح ينشئ revision 1.
7. إعادة PUT بنفس `expectedVersion=0` تعيد 409 Revision Conflict.

## 9. الملفات المعدلة

### كود التشغيل

- `apps/api/src/modules/products/product-configuration.persistence.ts`
- `apps/api/src/modules/products/product-configuration.service.ts`
- `apps/api/src/modules/products/products.service.ts`
- `apps/api/src/modules/public-menu/public-menu.service.ts`
- `apps/api/src/modules/dashboard/dashboard.service.ts`

### الاختبارات

- `apps/api/src/modules/products/product-configuration.integration.spec.ts`
- `apps/api/src/modules/products/product-configuration.persistence.spec.ts`
- `apps/api/src/modules/products/product-configuration.service.spec.ts`
- `apps/api/src/modules/products/products.service.spec.ts`
- `apps/api/src/modules/dashboard/dashboard.service.spec.ts`

### التوثيق

- `STAGE_3_1_BACKEND_STABILIZATION_REPORT_AR.md`
- `CODEX_HANDOFF.md` (يُحدّث في Commit التسليم بعد Commit التنفيذ).

لم يتغير:

- `apps/api/prisma/schema.prisma`.
- أي Migration file.
- Dashboard/Web UI.
- Cart أو Checkout.
- Legacy option tables.

## 10. نتائج الاختبارات الفعلية

كل أوامر DB استعملت PostgreSQL disposable داخل workspace، على loopback والمنفذ المحجوز للاختبارات `55440`، وقاعدة اسمها يبدأ بـ`ordersawa_stage3_`. لم تُقرأ ملفات `.env` الحقيقية.

| الفحص | النتيجة |
|---|---:|
| Shared Vitest | 21/21 passed |
| API Vitest، متضمنًا PostgreSQL وHTTP E2E | 79/79 passed في 15 ملفًا |
| PostgreSQL integration subset | 14/14 passed |
| الإجمالي | 100/100 passed |
| Root typecheck: Shared/API/Web | passed |
| Root build: Shared/API/Web | passed؛ Next.js أنشأ 27 route/page |
| Product configuration tools typecheck | passed |
| Prisma validate | passed |
| `git diff --check` | passed |

ملاحظة بيئية: Vitest يحتاج `TEMP/TMP` داخل workspace لأن Windows sandbox يمنع إنشاء cache في user Temp.

فحص إضافي غير داخل scripts الرسمية، `tsc -p apps/api/tsconfig.json --noEmit`، ما زال يكشف خطأ TypeScript قديمًا خارج Stage 3.1 في `product-import-parser.spec.ts:23` متعلقًا بتعارض generic نوع `Buffer`. الـAPI build/typecheck الرسميان وجميع اختبارات Vitest ينجحان. لم يُعدّل هذا الاختبار لأنه خارج نطاق الشبكة.

## 11. تصنيف المشاكل المتبقية

### أ. مشاكل كان يجب إصلاحها الآن — أُغلقت

- خلط `isAvailable` مع جاهزية الشبكة للطلب العام.
- احتمال ظهور Network Product بعد Backfill في Public legacy.
- غموض رسالة ORIGINAL عند مصدر Legacy.
- غياب HTTP E2E حقيقي للـAdmin Configuration API.
- فصل فحص Category deletion عن عملية الحذف الذرية.
- نقص اختبار Generic Product Update ضد تغيير Network Base Price.

### ب. قيود معتمدة

- Legacy Product لا يمكن أن يكون مصدر `ORIGINAL` حيًا قبل حفظ شبكة صريحة؛ يمكن ربطه `CUSTOM` مع Snapshot صريح.
- Network Products غير قابلة للطلب عبر Legacy public flow حتى تنفيذ Public Configurator.
- الدقة الداخلية `DECIMAL(24,6)` وDecimal strings؛ لا توجد سياسة تقريب حسب العملة بعد.
- Shared semantic validation هو invariant تطبيقي؛ DB constraints وحدها لا تستطيع تمثيل كل قواعد recursion والاختيار.

### ج. قرارات تحتاج موافقة

- ربط `PRODUCT_CONFIGURATION` افتراضيًا بخطط BASIC/PRO/PREMIUM أو تركه كFeature assignment صريح.
- تصميم Package version/snapshot/exception/market entitlement الكامل.
- سياسة التقريب النهائية لكل عملة.
- توقيت وخطة التحويل اليدوي من Legacy إلى Network في Dashboard؛ لم يُنشأ تحويل تلقائي.
- السماح بأي قراءة Migration History من قاعدة موجودة أو تنفيذ Migration/Backfill فعلي.

### د. أعمال مؤجلة لمراحل لاحقة

- Stage 4: Dashboard Product Configuration Editor.
- Stage 5: Public Configurator وربط Cart/WhatsApp/Checkout بالتكوين والسعر والسnapshot.
- Business Catalog + Outlet Differential + Market resolver.
- تنفيذ Migration/Backfill على بيئة حقيقية بعد تدقيق history وموافقة مستقلة.
- معالجة خطأ test-source TypeScript القديم في Product Import ضمن مهمة صيانة منفصلة.

## 12. المخاطر المتبقية

1. لا يوجد Initial Migration في المستودع، ولم يُدقق Migration History الحقيقي.
2. أي Writer خارجي يتجاوز API وatomic helper يمكنه تجاوز بعض semantic validation رغم قيود DB.
3. Public Configurator غير موجود؛ الحماية الحالية تمنع الطلب بدل تنفيذ الشبكة علنًا.
4. نموذج Capability الحالي adapter محدود إلى plan feature assignment.
5. لا توجد سياسة تقريب عملات معتمدة.

## 13. الأمان ونقطة التوقف

- لا اتصال بProduction أو أي قاعدة موجودة.
- لا `prisma migrate deploy` ولا `prisma db push`.
- لا Backfill أو Rollback على بيانات حقيقية.
- لا تعديل لـMigration History.
- لا حذف لجداول Legacy.
- لا Deployment.
- لم يبدأ Stage 4.

التوقف هنا وانتظار مراجعة وموافقة المستخدم.
