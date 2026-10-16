# OrderSawa — Stage 6F.3: تحقق الترحيل على PostgreSQL معزولة

**النتيجة:** نجاح مخططَي Stage 2C وStage 6C وقراءات Prisma على Baseline وبيانات اصطناعية في PostgreSQL **18.6** محلية؛ ظهور موانع بيانات تاريخية حقيقية محتملة لا يمكن استبعادها بتقرير Schema. لا اختبار على `menu` الفعلية ولا إذن تطبيق عليها. المرجع التحليلي: `STAGE_6F_3_PRODUCTION_SCHEMA_RECONCILIATION_REPORT_AR.md`.

## البيئة وطريقة الإعادة

- تنزيل binaries الرسمي لإصدار PostgreSQL 18.6 من EDB إلى `../work/stage6f3-pg18/` خارج Git، و`postgres --version` = `18.6`. SHA-256 للـZIP: `E2246BA91D22345BC3D017586C09EDE52D9DF180B1EEB480F050445F1CAD84E2`. هذا نفس رقم إصدار التقرير، وليس نفس جهاز Production/إعداداته/Extensions/Build fingerprint.
- Cluster **جديدة** في `../work/stage6f3-pg18-data`، loopback `127.0.0.1:55444` فقط؛ قواعد `stage6f3`, `stage6f3_negative`, `stage6f3_rollback`, `stage6f3_scale`. Trust auth محلي داخل بيئة الاختبار؛ لا Port عام ولا Credential/`.env` حقيقية. PostgreSQL 16.15 على loopback 55443 شُغّلت أولًا للتحقق الأولي، ثم أُعيدت الاختبارات الأساسية على 18.6؛ النتائج أدناه للإصدار 18.6 ما لم يُذكر خلافه.
- Prisma CLI/Client `5.22.0`. توليد Baseline بصيغة SQL خارج Git من `../work/phase0-source/menu-main/apps/api/prisma/schema.prisma` باستخدام `prisma migrate diff --from-empty --to-schema-datamodel ... --script --output ...`. لم نستخدم `db push`، ولم نُنشئ Initial Migration رسمية أو سجل تطبيق مزيفًا للترحيلات الخمس.
- `scripts/stage6f3-disposable-fixtures.sql` يضيف جدول `_prisma_migrations` **فارغًا اصطناعيًا** لاستكمال بنية التقرير، ثم مطعمين/قسمين/3 منتجات Legacy/مجموعة وخيارًا/Order وOrderItem وAnalytics Event باسم `s6f3-*` وبأرقام هاتف اختبارية. **لا صف إنتاجي واحد**. خلاصة بنية Baseline بعد الجدول: 34 جدولًا، 325 عمودًا، 37 FK، 93 فهرسًا؛ مساوية لأعداد التقرير، لا لدلالات DDL غير المصدّرة.
- تطبيق SQL الرسمية من `apps/api/prisma/migrations/20261012000000_product_configuration_network/migration.sql` ثم `20261013000000_network_order_test_snapshot/migration.sql` بواسطة `psql -v ON_ERROR_STOP=1` على قواعد disposable فقط. لم نُطبّق Candidate DB Completeness Guard، ولم نُشغّل Backfill. `scripts/stage6f3-disposable-assertions.sql` يحمل الفحوص SQL القابلة للإعادة. مخرجات Preflight التجريبية خارج Git في `../work/stage6f3-preflight-pg18-after.txt`؛ لا PII.

## نتائج القياس والفحوص المباشرة على PostgreSQL 18.6

| الفحص | النتيجة الفعلية | الحد |
|---|---|---|
| Baseline المولّدة + Fixture | **34/325/37/93** tables/columns/FKs/indexes؛ الإدخالات 2 Restaurants، 2 Categories، 3 Products، 1 OptionGroup/Option، 1 Order/Item، 1 Analytics | لم تُسترجع 5 سجلات Migration التاريخية؛ التقرير لا يحوي Checksum. |
| Prisma Client قبل Stage 6C | `order.findMany({take:1})` أعاد **`P2022`** | يؤكد مشكلة Binary الحالي عند غياب عمود Order، وليس دليلًا عن Production. |
| Stage 2C الرسمية | **نجحت** و`COMMIT`؛ Product Tree/Version، Base nullable، Dependency، Decimal(24,6)، 5 Product CHECKs | Baseline اصطناعية محدودة الحجم؛ lock time غير ممثل لـProduction. |
| Stage 6C الرسمية | **نجحت**؛ 4 Order columns، 2 UNIQUE، Enum `VALIDATED_TEST`، CHECK و6 Triggers | تخص Foundation `NETWORK_TEST` عدا ضرورة أعمدة Order لتوافق Prisma؛ لا Candidate Guard. |
| البنية بعد المرحلتين | **35/340/39/101** tables/columns/FKs/indexes؛ 6 Triggers غير داخلية على Order/Item؛ 5 Product CHECKs `convalidated=true` | مطابقة Schema Prisma ليست إثبات دلالات Trigger body. |
| `prisma migrate diff` بعد الترحيل إلى Schema Git | `-- This is an empty migration.` | Prisma diff لا يثبت جميع CHECKs/Triggers/بيانات الصفوف/History؛ فُحص بعضها SQL مستقلًا. |
| Legacy preservation | SQL assertions **PASS**: مطعمان وقسمان، Product Legacy بقي `configurationTree IS NULL`, Version 0, Base 12500؛ OptionGroup/Option، Order/Item وAnalytics باقية بالأرقام نفسها | لم يُنفَّذ Legacy HTTP Checkout أو Analytics runtime في هذه المرحلة؛ توجد اختبارات مراحل سابقة. |
| Network create/linked constraints | أُدرج منتج `basePrice=NULL` وآخر `basePrice=0` مع Tree V1، وحافة ORIGINAL داخل المطعم؛ رفض FK الربط بمطعم آخر، وCHECK منع self-link وعدم مطابقة Tree/Base؛ **PASS** | اختبار DB بنيوي لا يثبت Shared validation/سعر Tree أو حفظ Admin HTTP الذري. حالات الاختبار تشمل Tree فارغة غير قابلة للطلب، وDependency منفصلة لا تمثل كتابة Runtime. |
| Legacy write بعد Stage 6C | إدراج Order/Item WhatsApp ثاني **نجح**؛ أعمدة Order الأربع الجديدة بقيت NULL | ليس اختبار WhatsApp إرسال/رسالة فعلية. |
| Prisma Client بعد الترحيل | قرأ **2 Orders/2 Items/5 Products/1 Dependency**؛ Legacy Tree NULL، Network Base NULL وZero `"0"` منفصلان؛ لا P2022 | لا يثبت توافق كل مسارات API. |
| `stage6f0-readonly-preflight.sql` | نُفّذ بنجاح على disposable PG18 وأخرج Metadata فقط | لم يُنفّذ على Production؛ جدول migration history الاصطناعي فارغ. |
| تماثل PG16 الأولي | Stage 2C + 6C والـAssertions وPrisma diff/Client نجحت كذلك على PG16.15 | نتيجة ثانوية؛ المرجع المحلي الأقرب هو PG18.6. |

## الفشل المتعمّد/التراجع/الأموال

| تجربة منفصلة على PG18 | الدليل والنتيجة |
|---|---|
| Legacy Base سالب `-1` قبل Stage 2C | فشل `VALIDATE CONSTRAINT Product_basePrice_nonnegative_check` في SQL الرسمية؛ بعد فشل المعاملة بقي Tree column/table Dependency **غائبين** وBase `NOT NULL`. لا حالة مخطط نصف مطبقة من Stage 2C. هذه حالة يجب عدّها قبل أي تطبيق حقيقي، لا تصحيحها تلقائيًا. |
| Guarded rollback قبل أي Tree/Dependency | على `stage6f3_rollback` بعد Stage 2C فقط: `product-configuration-guarded-rollback.sql` أنهى `COMMIT`، وPrisma diff إلى Stage 0 عاد فارغًا؛ Tree/Dependency غابتا وBase رجع `NOT NULL`. هذه ليست خطة rollback لبيانات Network. |
| Guarded rollback بعد إنشاء Network | على `stage6f3`: رفض برسالة `Rollback blocked: configurationTree contains data` وبقي Tree/Dependency. لم يُحذف أي صف. |
| Precision >6 (Variant اصطناعي) | بدّلنا **في قاعدة `stage6f3_scale` فقط** Base القديم إلى `numeric` بلا typmod وأدخلنا `1.1234567`، ثم نجحت Stage 2C لكن القيمة صارت `1.123457`. **تقريب صامت مثبت** إذا كانت بيانات فعلية تحمل >6 منازل. تقرير `menu` يسمي النوع `numeric` فقط ولا يحسم هل هذا السيناريو ممكن فيها. |
| Overflow | تحويل `1000000000000000000` إلى `DECIMAL(24,6)` أعاد `numeric field overflow`؛ العدد الصحيح يجب أن يكون أقل من `10^18` بالقيمة المطلقة. فحص مدى المبالغ التاريخية إلزامي. |
| SYP قديم كسري | أُدخل Legacy Product اصطناعي `12500.50 SYP` قبل Stage 2C؛ بقي `12500.500000` وTree NULL بعدها، **دون Backfill/تعديل**. Prisma أعاد `12500.5`، و`validateCurrencyAmount` الحالية أعادت `SYP_FRACTIONAL_PRICE`. `12500.000000` صحيح عددياً. ترحيل Schema لا يصلح البيانات القديمة ولا يمنعها DB وحدها؛ Runtime 6F.1 يحجب/يرفض السعر الكسري. |

**Stage 6C rollback** لم يُنفّذ؛ لا توجد Down Migration رسمية ولا يجوز افتراض إمكان إزالة Enum/Triggers/أعمدة بعد استخدام Network Test. ملف Stage 6C غير ملفوف بـTransaction صريحة في نصه؛ لم نختبر انقطاعًا في منتصف تنفيذه أو سلوك أداة نشر على قاعدة قائمة. اختبار Network DB Guard المرشحة/Order Snapshot/Idempotency لم يُكرر لأنه خارج حاجة WhatsApp العام ونطاق هذه المصالحة؛ أدلته من المراحل السابقة محلية فقط. كذلك لم تُشغّل HTTP API/Browser/Build الشاملة هنا لأن Runtime لم يتغير، ولم نَدّعِ نجاحها في Stage 6F.3.

## ما لا تثبته التجربة ومتطلبات ما قبل الإنتاج

مطابقة الأعداد وPrisma diff فارغتان **لا تثبتان** أن `menu` الفعلية مطابقة للـBaseline: تقريرها لا يكشف `format_type`/numeric scale، قيم Enums، Checksums، كافة الـdefaults، أحجام الجداول، الصفوف المخالفة، drift الناتج عن `db push`، أو أثر الأقفال عند الحجم الحقيقي. اختبار 18.6 المحلي ليس Staging مماثلة ولا Restore من Backup. المرجح أن Stage 2C ستحتاج فحص بيانات مسبقًا؛ **لا تطبّق SQL كما هي على Production الآن**. إذا وُجدت أسعار أكثر من 6 منازل، قد تنجح Migration مع فقد دقة صامت؛ إذا وُجد سالب أو overflow فقد تفشل وتتراجع Stage 2C؛ وإذا وُجد SYP كسري فسيبقى مخزنًا لكن Runtime الحالي يرفض ظهوره/طلبه.

الخطوة الآمنة التالية — بعد موافقة منفصلة — هي Metadata read-only من قاعدة محددة بـ`stage6f0-readonly-preflight.sql` ومقارنة Checksums/typmod/Enums/constraints/triggers/indexes، ثم **موافقة محددة أخرى** على فحوص بيانات مجمّعة بلا PII ونسخة Backup/Restore Staging، وبعدها فقط خطة SQL تشغيلية مصحّحة ومراجعة. لا تنقل مخرجات schema-only أو fixtures هذه إلى `_prisma_migrations` ولا تستخدم `migrate resolve/db push/deploy` على القاعدة الحقيقية بناءً على هذا التقرير.

أدوات الاختبار المحفوظة داخل Git هي ملفا `scripts/stage6f3-disposable-*.sql` فقط؛ Runtime/Schema/Migrations الرسمية لم تتغير. قواعد التجربة ومخرجات Prisma/Preflight وZIP خارج Git، ويمكن إعادة الاختبار دون Production. اعرف Commit النهائي وحالة Git من `git log -1 --format=%H` و`git status --short --branch` بعد حفظ Stage 6F.3.
