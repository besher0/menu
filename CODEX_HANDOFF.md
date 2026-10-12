# OrderSawa Product Configuration Network — Codex Handoff

آخر تحديث: 2026-10-12
الحالة الحالية: **Stage 2C مغلقة ومثبتة في Git، ولم تُطبق على أي قاعدة بيانات حقيقية أو موجودة، والعمل متوقف قبل Stage 3**.
نطاق هذا الملف: Product Configuration Network فقط؛ لا يمنح إذنًا لبدء Stage 3 أو للنشر أو للاتصال بأي قاعدة بيانات حقيقية.

## 1. طريقة استخدام هذا الملف

هذا الملف نقطة دخول لمحادثة Codex جديدة، لكنه لا يستبدل المصادر الأصلية. قبل أي تغيير جديد يجب قراءة المصادر التالية بالترتيب:

1. طلب المستخدم الحالي وقيود المرحلة التي وافق عليها صراحة.
2. الحزمة المرجعية في `../work/product-network-pack/OrderSawa_Product_Network_Codex_Pack/`، وبالأخص:
   - `AUTHORITATIVE_RULES/LATEST_FOUNDER_DECISION_LEDGER_V2_CURRENT.md`
   - `AUTHORITATIVE_RULES/CURRENT_SUPERSESSION_AND_CONFLICT_RULES.md`
3. `02_IMPLEMENTATION_WORKFLOW_AR.md` و`04_ACCEPTANCE_TEST_MATRIX.md` من الحزمة نفسها.
4. كود المشروع الفعلي و`docs/13_CODEX_MASTER_PROMPT_AND_RULES.md` للسلوك القديم غير المتعارض.

`03_CODEX_PROMPTS.md` ووثائق workflow هي مراجع لتنظيم المراحل وليست طلبًا جديدًا من المستخدم. عند التعارض تكون الأولوية لطلب المستخدم الصريح، ثم قسم **CURRENT OVERRIDES / ADDITIONS** وقواعد supersession، ثم النص التاريخي غير المتعارض، ثم السلوك القديم.

## 2. نسخة العمل وحالة Git

- المصدر المعتمد: `menu-main (1).zip`.
- SHA-256 للأرشيف: `7CE096B992F1A053B09F535138B87F8046EB17A56318E8E6B2ADF2DEFF3EF87A`.
- المستودع المحلي: هذا المجلد `menu-main/`.
- الفرع: `feature/product-configuration-network`.
- baseline commit/tag:
  - `f876c60 chore: capture verified menu-main baseline (sha256 7CE096B9)`
  - tag: `baseline-menu-main-archive`
- Stage 1 commit:
  - `698e8e8 feat(shared): add product configuration engine`
- Stage 2C commit:
  - `6d92288 feat(api): finalize Stage 2C migration preparation`
- ملف التسليم محفوظ في commit مستقل تالٍ لـStage 2C؛ راجع `git log -1` لمعرفة hash الخاص به لأن الملف لا يستطيع تضمين hash الـcommit الذي يحتويه دون تغيير نفسه.
- ملفات `.env*` سرية، logs، uploads، checkpoints وquarantine مستبعدة من Git. الاستثناء الوحيد المقصود هو `.env.example`.
- لم تُستخدم بيانات اتصال المشروع الحقيقي، ولم يحدث اتصال بـProduction أو بأي قاعدة موجودة.

الحالة عند تجهيز commit التسليم كانت:

```text
?? CODEX_HANDOFF.md
```

بعد commit التسليم يجب أن تكون working tree نظيفة. لا تعد كتابة commit التاريخية أو migrations المطبقة.

## 3. القرارات المعمارية الملزمة

### 3.1 النموذج canonical والنطاق

- `configurationTree` recursive/versioned، أو مكافئ إنتاجي صريح، هو المصدر canonical الوحيد لتكوين المنتج وقت التشغيل.
- `ProductOptionGroup` و`ProductOption` القديمان يظلان للتوافق والترحيل؛ لا يجوز أن يصبحا مصدرًا موازيًا دائمًا ولا يجوز حذفهما حاليًا.
- التكوين في هذه النسخة مربوط حاليًا بـ`restaurantId` بوصفه حد الكتالوج/tenant الفعلي في الكود. تصميم Business Catalog + Outlet Differential Layer يظل قرارًا أعلى يجب احترامه لاحقًا، لكن لم يُنفذ Outlet overlay في هذه المراحل.
- لا روابط بين Restaurants/Markets. مصدر Linked Product يجب أن يكون ضمن نفس السياق الفعلي.
- Product Configuration هي Package Capability. فقدان entitlement يحفظ البيانات ويجعل المنتجات المعتمدة عليها Action Required وغير قابلة للنشر/الطلب؛ لا fallback صامت إلى Base. لم يُوصل هذا gate بعد.
- عملة السعر هي عملة Business المسموحة في Market؛ لا توجد عملة مستقلة اعتباطية لكل Product. لم تُعدّل بنية العملة القديمة في هذه المراحل.

### 3.2 الأموال والأسعار

- التمثيل داخل المحرك هو decimal strings مع BigInt، دون JavaScript floating-point للأموال.
- الحدود المعتمدة حاليًا: 18 رقمًا صحيحًا و6 منازل عشرية، والتخزين المقترح `DECIMAL(24,6)`.
- `null` تعني لا يوجد Base Price/سعر مشتق، بينما `"0"` أو `0.000000` سعر صفري حقيقي. يجب عدم تحويل `null` إلى صفر.
- إذا وُجد أي Size في أي مسار داخل التكوين، يُهمل Base Price بالكامل.
- كل Size يحمل سعر بيع كاملًا وليس delta. لا يوجد Size group رئيسي مميز؛ يمكن لمجموعات Sizes مستقلة أن تسهم معًا.
- السعر النهائي عند وجود Sizes = مساهمات Sizes المختارة + Options المدفوعة بعد Included Quantity.
- عند عدم وجود Sizes يمكن للـBase المشاركة، ويمكن لخدمة Service Mode أن تستبدله لاحقًا. أسعار Options مستقلة عن Service Mode في V1.
- Size-specific option override الفارغ/`null` يرجع للسعر الافتراضي؛ override بقيمة صفر يعني مجانيًا.
- سعر Linked Product المستقل لا يدخل تلقائيًا في سعر الأب. التسعير داخل parent context محلي.
- الحد الأدنى/`ابتداءً من` يجب أن ينتج من تكوينات صالحة في السياق الفعلي، بما يشمل المطلوب والـavailability والجدولة والروابط. Optional paid upsells وحدها لا تحول Base المتاح إلى `ابتداءً من`.
- سياسة quantization/rounding حسب العملة **غير معتمدة بعد**. PostgreSQL أظهر سلوك التقريب المعتاد في probes، لكن لا يجوز اعتبار `ROUND_HALF_UP` قرارًا منتجيًا معتمدًا.

### 3.3 البنية والاختيارات

- الأنواع canonical الحالية: `SIZE` و`OPTIONS`، مع nesting recursive.
- Sizes terminal بالنسبة لمسار Sizes: لا Size بعد Size على المسار نفسه. يمكن أن تتبعها Options في النطاق المسموح.
- Group `min=0` اختياري و`min>0` مطلوب. `max=null` يعني لا حد تاجر، مع safety cap داخلي 100.
- Min/Max تحسب مجموع الوحدات وليس عدد أنواع الخيارات المختلفة.
- لكل Option حدود كمية، والسعر per unit. Max الصريح للـOption لا يتجاوز Max الرقمي للأب.
- الوحدات المتكررة تستخدم Selection Instances ذات `instanceId` ثابت وفريد، لأن كل وحدة قد تحمل children مختلفة.
- Included Quantity يحسب مستقلًا لكل Options group: أعلى N وحدات أب سعرًا بعد السعر الفعال تصبح included/free. أسعار فروع الأطفال تظل مدفوعة ولا تدخل في اختيار الوحدات المجانية.
- لا تخفيض صامت للـMin عند عدم التوفر. إذا تعذر إشباع فرع مطلوب يصبح الأصل غير قابل للطلب مؤقتًا.
- Combo لا يحتاج نوع جدول خاص في التنفيذ الحالي: يُمثل Product عاديًا يحتوي مجموعات Options مطلوبة وخيارات Linked Products، مع إمكانية تكوين كل linked selection.

### 3.4 Linked Products وDependency Graph

- `ORIGINAL`: بنية وقواعد وترجمات المصدر live، مع بقاء تسعير parent-context المحلي.
- `CUSTOM`: snapshot محلي لبنية/قواعد/تسعير subtree، مع إبقاء هوية المصدر وorderability متصلتين.
- الانتقال من Custom إلى Original يعيد أحدث بنية للمصدر؛ يمكن إبقاء overrides المحلية للعُقد ذات Stable IDs المطابقة حيث يسمح العقد.
- self-link والدورات المباشرة والعميقة ممنوعة كـbackend graph invariant، وليس UI validation فقط.
- Hard delete للمصدر ممنوع عند وجود dependents. حذف Category يجب لاحقًا فحص كل Products ومنع العملية كاملة إن وجدت dependency؛ لا partial delete ولا silent detach.
- Hide التشغيلي ليس Exclude/Removed البنيوي. Hide وحده لا يمنع دائمًا استخدام المنتج كمكوّن linked.
- Linked availability يجب أن يحل إلى effective same-Outlet representation في المستقبل، ويأخذ التعطيل والتوقف والجدولة وعدم قابلية الإشباع recursive بالحسبان.

### 3.5 السلة والتحقق وSnapshot

- هوية سطر السلة المستقبلية يجب أن تشمل Product + canonical configured selection؛ لا يجوز الدمج حسب slug فقط.
- قبل checkout يجب أن يعيد الخادم validation/pricing من الكتالوج الحالي والسياق والتوفر، وألا يثق في سعر العميل أو labels النصية.
- تغييرات جوهرية لا تُطبق بصمت؛ تتطلب انتباه/قبول العميل.
- الطلب النهائي يحتفظ immutable snapshot يتضمن revision والاختيارات الدقيقة والأسعار والروابط اللازمة لإعادة العرض التاريخي.
- المنفذ في Stage 1 هو pure snapshot/selection key فقط؛ ربط Cart/Quote/Order/WhatsApp لم يبدأ.

## 4. ما أُنجز حسب المرحلة

### Stage 0 — فحص baseline

الحالة: مكتملة دون تعديل وظيفي.

- فُحص monorepo الحقيقي: `packages/shared` + NestJS/Prisma/PostgreSQL API + Next.js Web.
- فُحص schema وProduct CRUD وProduct Form وPublic Menu وCart وWhatsApp/Order flow.
- تأكد أن النظام القديم flat ولا يدعم Sizes/Nesting/Linked/Selection Instances/trusted configured pricing.
- اكتُشفت مخاطرة مهمة: مجلد migrations لا يحتوي Initial CREATE migration كاملًا؛ الموجود سلسلة تغييرات غير كافية لإنشاء schema من الصفر.
- baseline بعد توليد Prisma وبناء shared: API tests 37/37، typecheck ناجح، build ناجح، Next.js بنت 27 route.
- التقرير: `../outputs/NETWORK_BASELINE_AUDIT.md`.

### Stage 1 — Shared Contracts & Engine

الحالة: مكتملة ومثبتة في commit `698e8e8`، ومقبولة مبدئيًا من المستخدم.

- أُضيف `ProductConfigurationV1`, `ProductSelectionV1`, `ConfigurationSnapshot` بإصدارات ثابتة.
- أُضيف money parser/arithmetic exact، validation، selection validation، pricing، minimum-price، linked resolution، dependency discovery/cycle validation، snapshot وsemantic selection key.
- دُعمت Sizes full prices، Base nullable، nested groups، quantities/min/max، Included Count، Linked ORIGINAL/CUSTOM، repeated instances، cycle/cross-catalog checks.
- حدود المحرك الافتراضية: depth 12، nodes 1000، group choices 100، group quantity 100، selection instances 500، minimum-price states 20000.
- لا تغييرات Prisma/API/UI في هذه المرحلة.
- التقرير: `../outputs/STAGE_1_PRODUCT_CONFIGURATION_ENGINE_REPORT_AR.md`.

### Stage 2A — Migration Preparation

الحالة: مكتملة كمقترحات وتقارير فقط؛ لم يُعدّل source حينها ولم تُنفذ Migration.

- صُمم `configurationTree`, `configurationVersion`, nullable `basePrice`, dependency index و`DECIMAL(24,6)`.
- صُممت baseline disposable، preflight، migration، optional order money alignment، backfill preview، verification وguarded rollback.
- تقرر أن Backfill منفصل عن schema migration، وأن legacy groups تتحول إلى `OPTIONS` فقط بلا تخمين Sizes.
- تقرر quarantine للحالات الغامضة، وidempotent conditional write.
- المخرجات: `../outputs/stage2a/`.

### Stage 2B — Disposable PostgreSQL Validation

الحالة: مكتملة على PostgreSQL 16.15 محلي مؤقت فقط.

- شُغل baseline ثم proposed migration ثم order-money alignment على قواعد disposable معزولة عند `127.0.0.1:55439` دون `.env` للمشروع.
- Prisma diff كان فارغًا بعد تثبيت أسماء constraints/indexes واستعادة قيمة العملة Unicode.
- اختُبرت قيم Base: `null`, `0`, موجب؛ وتخزين Sizes/Nesting/Modifiers/Linked Products.
- اختُبرت FKs: cross-restaurant، self-link، owner version، duplicate path، وdelete source.
- اختُبر Backfill أول مرة وإعادة التشغيل وquarantine، وبقيت أسعار legacy دون تغيير.
- صُحح dependency path إلى الشكل canonical مثل `$configuration.groups[1].options[0]`.
- صُحح rollback ليعيد أيضًا أعمدة Order/OrderItem.
- قاعدة الاختبار أُوقفت؛ `pg_isready` أعطى no response. بقي runtime المحلي في `../work/stage2b-postgres-runtime` بسبب قيود حذف sandbox، ولا يمثل خدمة متصلة.
- المخرجات: `../outputs/stage2b/`.

### Stage 2C — Migration Implementation Preparation

الحالة: منجزة ومثبتة في commit `6d92288`، ولم تُنفذ على أي قاعدة حقيقية أو موجودة.

- عُدّل `schema.prisma` رسميًا حسب التصميم المجرب.
- أُنشئ migration رسمي schema-only داخل transaction، دون Backfill أو حذف legacy.
- أُنشئت أداة Backfill إنتاجية: dry-run افتراضي، batching 1..1000، keyset cursor، resume/checkpoint، counters تراكمية، idempotency، quarantine/conflicts JSONL، وتأكيد اسم قاعدة البيانات عند الكتابة.
- أُنشئ helper transactional لحفظ tree/version/dependency index مع validation وtenant/source checks وcycle check وoptimistic concurrency في `Serializable` transaction.
- helper غير موصول بأي Controller/Service route؛ لا API تشغيلية تغيرت.
- أُنشئ read-only Migration History audit، guarded rollback، وrunbook.
- migration الرسمي اختُبر فقط على قواعد disposable جديدة: `ordersawa_stage2c`, `ordersawa_stage2c_resume`, `ordersawa_stage2c_rollback`.
- في اختبار الإغلاق النهائي أُنشئت أيضًا قاعدتا disposable فقط: `ordersawa_stage2c_finalize_20261012` و`ordersawa_stage2c_finalize_rollback_20261012`؛ حُذفتا بعد الاختبار وأُوقف PostgreSQL المحلي وتحقق `pg_isready` من `no response`.
- لم يحدث `prisma migrate deploy` أو `prisma db push`.
- التقرير والمراجعات: `../outputs/stage2c/`.

### Stage 3 وما بعدها

**لم تبدأ**. لا Admin API ولا Dashboard ولا Public Menu ولا Cart/Quote/Order behavior يستخدم `configurationTree` حاليًا.

## 5. الملفات المتغيرة

### Stage 1 — committed

```text
.gitignore
package.json
package-lock.json
packages/shared/package.json
packages/shared/tsconfig.json
packages/shared/src/index.ts
packages/shared/src/product-configuration/dependencies.ts
packages/shared/src/product-configuration/index.ts
packages/shared/src/product-configuration/minimum-price.ts
packages/shared/src/product-configuration/money.ts
packages/shared/src/product-configuration/pricing.ts
packages/shared/src/product-configuration/product-configuration.test.ts
packages/shared/src/product-configuration/resolution.ts
packages/shared/src/product-configuration/selection.ts
packages/shared/src/product-configuration/snapshot.ts
packages/shared/src/product-configuration/types.ts
packages/shared/src/product-configuration/validation.ts
```

### Stage 2C — committed in `6d92288`

```text
.gitignore
apps/api/package.json
apps/api/prisma/schema.prisma
apps/api/prisma/backfill-product-configurations.ts
apps/api/prisma/migrations/20261012000000_product_configuration_network/migration.sql
apps/api/prisma/product-configuration-backfill.spec.ts
apps/api/prisma/product-configuration-backfill.ts
apps/api/prisma/product-configuration-guarded-rollback.sql
apps/api/prisma/product-configuration-history-audit.sql
apps/api/prisma/tsconfig.product-configuration.json
apps/api/src/modules/products/product-configuration.persistence.spec.ts
apps/api/src/modules/products/product-configuration.persistence.ts
docs/product-configuration-stage2c-runbook.md
```

### Handoff — commit مستقل بعد Stage 2C

```text
CODEX_HANDOFF.md
```

### مخرجات المراجعة خارج المستودع

- `../outputs/NETWORK_BASELINE_AUDIT.md`
- `../outputs/STAGE_1_PRODUCT_CONFIGURATION_ENGINE_REPORT_AR.md`
- `../outputs/stage2a/`
- `../outputs/stage2b/`
- `../outputs/stage2c/`

## 6. تصميم قاعدة البيانات الحالي في Stage 2C

- `Product.basePrice Decimal? @db.Decimal(24,6)`.
- `Product.configurationTree Json?`.
- `Product.configurationVersion Int @default(0)`.
- حالة legacy المسموحة: tree null + version 0 + Base non-null.
- حالة configured: tree non-null + version >= 1؛ Base يمكن null أو صفرًا أو موجبًا ويجب أن يطابق `configurationTree.basePrice`.
- `ProductConfigurationDependency` يخزن owner/source/option/path/mode/version.
- composite FKs تمنع cross-restaurant source وتربط edges بنسخة owner نفسها.
- source delete = `RESTRICT`؛ owner delete = `CASCADE` للـedges فقط.
- Order totals وOrderItem unit/total أصبحت مقترحة `DECIMAL(24,6)` لتجنب قطع precision بين quote وsnapshot.
- checks داخل DB تتحقق من envelope/revision/base mirror وبعض invariants فقط. التحقق العميق يبقى في shared engine قبل الكتابة.
- migration schema-only؛ لا يغير أي legacy option rows ولا ينشئ tree تلقائيًا.

## 7. Backfill وPersistence — السلوك الفعلي

### Backfill

- يفحص فقط Products غير المحذوفة ذات `tree IS NULL`, `version=0` ولديها legacy groups.
- يرتب بالـProduct ID ويستخدم keyset pagination.
- يحول كل legacy group إلى `OPTIONS`، ويحفظ `priceDelta` كسعر Option محلي؛ لا يخمن Size أو Linked Product.
- يعين revision 1، ويثبت Base إلى 6 منازل، ثم يشغل `validateConfiguration` و`calculateMinimumPrice`.
- الحالات الغامضة/غير الصالحة لا تُكتب وتذهب إلى quarantine.
- الكتابة تستخدم `persistProductConfiguration(... expectedVersion: 0)`؛ إعادة التشغيل لا تعيد معالجة ما صار version 1.
- وضع الكتابة يتطلب `--execute`, `--confirm-database <exact current_database>`, checkpoint وquarantine paths.
- checkpoint يكتب atomically عبر temp+rename وبصلاحية `0600` حيث يدعم النظام؛ dry-run وexecute لا يتشاركان mode checkpoint.

### Persistence helper

- يرفض productId غير المطابق وrevision غير المتقدمة.
- يشغل shared validation ويجمع dependency edges.
- داخل transaction واحدة: يتحقق من owner/version، يتحقق من linked sources ضمن نفس Restaurant وغير محذوفة، يدمج graph الحالي ويمنع cycle، يحدث Product optimistic، يحذف edges القديمة ويكتب الجديدة.
- isolation level هو `Serializable`.
- لا توجد retry policy للـserialization failures بعد؛ Stage 3 يجب أن يحدد ترجمة conflict/retry في service boundary.
- غير موصول بمسار API، ولذلك لا يغير السلوك التشغيلي الحالي.

## 8. نتائج الاختبارات المثبتة

بيئة القياس: Node.js `v24.19.0`، npm `11.17.0`، Prisma `5.22.0`، PostgreSQL disposable `16.15`.

أُعيد تشغيل هذه البوابات أثناء إغلاق Stage 2C مباشرة قبل الـcommits. استُخدمت قيمتا `DATABASE_URL` و`DIRECT_URL` وهميتان على `127.0.0.1:1` في `prisma validate/generate` لمنع أي اتصال؛ المحاولة الأولى بدون `DIRECT_URL` فشلت بإعداد `P1012` ثم نجحت بعد توفير القيمتين الوهميتين.

| الفحص | النتيجة الأخيرة |
|---|---|
| `npm run test -w @menu/shared` ضمن full test | 21/21 نجحت |
| API Vitest | 42/42 نجحت في 10 ملفات |
| الاختبارات الجديدة المباشرة | 3 Backfill + 2 graph persistence نجحت ضمن API total |
| `npm test` | 63/63 إجمالًا (21 shared + 42 API) |
| `npm run typecheck` | Shared/API/Web نجحت |
| `npm run typecheck:product-configuration-tools -w @menu/api` | نجح |
| `npm run build` | Shared/API/Web نجحت؛ Next.js بنى 27 route |
| `prisma validate` | نجح |
| baseline + official migration عبر `psql` على disposable | نجح |
| Prisma schema diff بعد migration | فارغ؛ لا drift غير مقصود |
| Backfill dry-run | scanned=2, eligible=1, quarantined=1, migrated=0 |
| Backfill execute/resume/idempotency | migrated=1؛ resume أكمل counters؛ إعادة لاحقة no-op |
| write guards | غياب الملفات، اسم DB الخطأ، وmode mismatch رُفضت |
| persistence integration | revision 1→2 وedge version 2 atomically؛ cross-tenant/stale version رُفضا بلا تغيير حالة |
| post-migration assertions | 8 anomaly counts = 0؛ legacy tables بقيت |
| guarded rollback على DB نظيفة | نجح وعاد Prisma diff إلى baseline |
| guarded rollback بعد configured data | رُفض كما هو مقصود وبقي schema |

تفاصيل إعادة التحقق النهائية من PostgreSQL disposable:

- baseline الحالي ثم migration الرسمي ثم fixtures/constraints: نجحت.
- Base `null` و`0` والموجب، تخزين Sizes/Nested Options/Linked، cross-tenant/self/version/path/delete-source guards: نجحت.
- Backfill dry-run: `scanned=2`, `eligible=1`, `quarantined=1`, `migrated=0`.
- Backfill execute على batch واحدة ثم resume: `migrated=1` ثم quarantine واحدة؛ التشغيل الثالث no-op مع counters نفسها.
- غياب checkpoint/quarantine واسم DB غير المطابق رُفضا قبل الكتابة.
- أسعار `legacy-good`, `legacy-quarantine`, `legacy-zero` بقيت `100.120000`, `50.000000`, `0.000000` دون تغيير.
- post-migration verification: كل anomaly counts الثمانية = 0، والجداول القديمة بقيت.
- Prisma diff بعد إزالة جدول fixture المساعد: `This is an empty migration.`
- rollback على configured DB رُفض؛ rollback على DB نظيفة أعاد Product/Order/OrderItem إلى `DECIMAL(10,2)` وحذف أعمدة/جدول Stage 2C.
- قاعدتا الاختبار النهائيتان حُذفتا، والخادم المحلي أُوقف وأصبح `127.0.0.1:55439 - no response`.

ملاحظة بيئية: wrapper الخاص بـ`tsx` فشل داخل sandbox بـ`uv_os_get_passwd/ENOMEM` قبل الاتصال. الكود اجتاز typecheck، ثم جرى compile إلى CommonJS وتشغيل نفس الأداة المجمعة فعليًا ضد PostgreSQL disposable بنجاح. يجب عمل smoke test لأمر npm/tsx في بيئة النشر المعتمدة قبل أي استخدام حقيقي. استخدمت Vitest قيمة TEMP داخل `../work` بسبب قيود Windows sandbox.

## 9. المشاكل والمخاطر المتبقية

1. **Migration History غير مدققة على أي قاعدة قائمة.** لا يوجد Initial CREATE migration موثوق في repository.
2. لا يجوز تشغيل `migrate deploy` إن كانت `_prisma_migrations` غائبة مع وجود tables. يلزم baseline مطابق تمامًا ثم موافقة مستقلة قبل أي `prisma migrate resolve --applied`.
3. أي unfinished/rolled-back migration أو checksum mismatch أو drift غير مفهوم يوقف التنفيذ؛ لا تعدل migration rows أو الملفات القديمة.
4. `ALTER COLUMN`, بناء indexes و`VALIDATE CONSTRAINT` قد يأخذ locks أو scans على جداول كبيرة؛ لم تُقاس أحجام حقيقية.
5. guarded rollback آمن فقط قبل وجود tree/dependency/null Base أو أموال لا تلائم `(10,2)`. بعد ذلك الاتجاه الآمن app rollback + forward fix، لا حذف بيانات أو تقريب تاريخ الطلبات.
6. JSONB لا يفرض كل recursive invariants؛ جميع writers المستقبلية يجب أن تمر بالمحرك والـtransaction helper. الكتابة المباشرة يمكن أن تسبب drift بين tree والdependency index.
7. Backfill cursor حسب ID مع concurrent writes يتطلب maintenance gate/final rescan وخطة تشغيل مراقبة.
8. quarantine تحتاج مراجعة بشرية؛ لا توجد معالجة تلقائية للحالات الغامضة.
9. API القديم وDTO/import/public menu ما زالت تفترض Base non-null/Number في مواضع؛ schema غير مفعل تشغيليًا قبل Stage 3، ويجب تعديل هذه المسارات قبل السماح بمنتجات configured ذات Base null.
10. Order persistence لا يزال قد يستخدم JavaScript Number في المسارات القديمة؛ تغيير column precision وحده لا يجعل الحساب end-to-end آمنًا.
11. Currency-specific scale/rounding قرار مفتوح ومانع لتفعيل التسعير النهائي المنتج عند currencies المختلفة.
12. Service Mode/Outlet effective resolver/schedules/entitlement gate ليست منفذة في shared persistence الحالي.
13. Category delete dependency scan وsoft-delete semantics لم تُوصل بعد.
14. لا UI/E2E/Playwright لهذه المراحل لأن Stage 3+ لم تبدأ.

## 10. Migration History decision tree المعتمد

- History موجودة وكل الأسماء/checksums مطابقة: شغل audit/diff read-only، ولا تتقدم إلا إذا كان diff هو Stage 2C المراجع فقط.
- History غائبة مع schema قائم: لا deploy. حضّر baseline يمثل schema المنشور السابق حرفيًا، راجعه، ثم اطلب موافقة مستقلة قبل `resolve --applied`.
- History جزئية أو مختلفة: freeze، احتفظ بالنسختين، وصمم reconciliation؛ لا rewrite.
- قاعدة فارغة: disposable baseline للاختبار فقط، ولا يُسمى production history دون مراجعة baseline مستقلة.

ملف التدقيق: `apps/api/prisma/product-configuration-history-audit.sql`. هو read-only ويجب ألا يُشغل على قاعدة موجودة إلا بعد موافقة منفصلة تحدد host/database/credential المسموح.

## 11. خطوات المتابعة المسموحة بعد مراجعة المستخدم فقط

### الإجراء الفوري

1. ابدأ بقراءة هذا الملف ثم سجل القرارات الأصلي و`docs/product-configuration-stage2c-runbook.md`.
2. تحقق من `git status` و`git log --oneline -5`؛ الحالة المتوقعة working tree نظيفة والـHEAD هو commit التسليم التالي مباشرة لـ`6d92288`.
3. لا تبدأ Stage 3 تلقائيًا، ولا تتصل بأي قاعدة بيانات لمجرد بدء محادثة جديدة.

### إذا منح المستخدم موافقة مستقلة لتدقيق قاعدة بعينها

1. ثبت هوية host/database والصلاحيات read-only ولا تطبع secrets.
2. شغل history audit فقط واحفظ ناتجه المنقح.
3. قارن migration names/checksums والـschema diff.
4. توقف وقدم تقريرًا؛ موافقة التدقيق لا تعني موافقة migration أو backfill.

### إذا مُنحت لاحقًا موافقة منفصلة على التطبيق

اتبع `docs/product-configuration-stage2c-runbook.md`: backup قابل للاستعادة، maintenance/feature gate، schema migration، diff/verification، Backfill dry-run، مراجعة quarantine، batches صغيرة مؤكدة باسم DB، final rescan، وإبقاء legacy tables/read paths. هذه الخطوات غير مصرح بها الآن.

### المرحلة التالية في roadmap فقط

Stage 3 هي Admin/API persistence integration: DTOs، service/controller routes، permissions/capability gate، tenant scoping، optimistic conflict mapping، delete guards، والاختبارات. لا تبدأها دون طلب جديد صريح.

## 12. محظورات مستمرة

- لا Production ولا أي قاعدة موجودة دون موافقة مستقلة محددة.
- لا `prisma migrate deploy` أو `prisma db push` أو `migrate resolve` الآن.
- لا Backfill على بيانات حقيقية.
- لا تعديل/حذف Migration History القديم.
- لا حذف legacy tables أو legacy data/read paths.
- لا تفعيل `configurationTree` في Backend API أو Dashboard أو Public Menu قبل مرحلتها.
- لا Stage 3 أو Dashboard أو Cart/Checkout تلقائيًا.
- لا commit لملفات secrets أو connection strings أو checkpoint/quarantine operational records.

## 13. مراجع المراجعة النهائية

- تقرير Stage 2C: `../outputs/stage2c/STAGE_2C_MIGRATION_IMPLEMENTATION_PREPARATION_AR.md`
- SQL النهائي: `../outputs/stage2c/STAGE_2C_FINAL_MIGRATION.sql`
- rollback: `../outputs/stage2c/STAGE_2C_GUARDED_ROLLBACK.sql`
- history audit: `../outputs/stage2c/STAGE_2C_MIGRATION_HISTORY_AUDIT.sql`
- runbook: `../outputs/stage2c/STAGE_2C_RUNBOOK.md`
- hashes: `../outputs/stage2c/STAGE_2C_FILES_SHA256.txt`

الخلاصة التشغيلية: Stage 1 مثبتة في `698e8e8`، Stage 2A/2B موثقتان، وStage 2C مثبتة في `6d92288` مع commit مستقل لهذا التسليم. لا توجد قاعدة حقيقية تغيرت، ولا API/UI تستخدم الشبكة بعد، ولا توجد صلاحية ضمنية للانتقال إلى Stage 3.
