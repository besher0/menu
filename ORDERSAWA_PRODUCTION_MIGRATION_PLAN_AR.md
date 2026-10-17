# OrderSawa — خطة ترحيل قاعدة البيانات المرشحة للمراجعة (Stage 6F.4)

**ليست إذنًا بتنفيذ SQL على `menu`.** وصل في 17 أكتوبر 2026 ملف نتائج فحص Production للقراءة فقط، وحُلّل حقل `audit_report` الذي يحتوي JSON نصيًا. أكد الأنواع المالية الأساسية وChecksums الخمس وعدادات المال الأربعة أدناه، دون أن نتصل نحن بقاعدة Production. لا يغطي الملف DDL الكامل لكل جداول النظام أو بيانات Legacy Options، ونتائجه لقطة زمنية يمكن أن تتغير. لم يصل تأكيد نجاح استعادة النسخة الاحتياطية. لذلك **STOP** قبل أي DDL إلى أن تُراجع الفجوات على Restore معزولة وتصدر موافقة ترحيل مستقلة.

## المصادر والحزمة

- المخطط المعتمد: `apps/api/prisma/schema.prisma` وملفا SQL الرسميان، **دون تعديل**: `apps/api/prisma/migrations/20261012000000_product_configuration_network/migration.sql` (Stage 2C) ثم `apps/api/prisma/migrations/20261013000000_network_order_test_snapshot/migration.sql` (Stage 6C).
- تقرير Stage 6F.3: `STAGE_6F_3_PRODUCTION_SCHEMA_RECONCILIATION_REPORT_AR.md` و`ORDERSAWA_DISPOSABLE_MIGRATION_VERIFICATION_AR.md`. أضاف مرفق 17 أكتوبر `steep_shadow_51076378_production_menu_2026_10_17_18_28_47_1.json` (SHA-256 `E4152E2449BFCA986DA374B9EE7F5290053D6643A8558E4CC1D2C41754AFE5D3`) تدقيقًا read-only لـ7 مواضع جداول و47 عمودًا و11 فهرسًا و36 قيدًا وثلاث قيم `OrderStatus` وخمس Migrations وأربعة حقول مال مجمّعة؛ لا يتضمن Dump أو جميع تعريفات القاعدة.
- استعلام metadata للقراءة فقط: `apps/api/prisma/stage6f0-readonly-preflight.sql`. استعلام بيانات إجمالية فقط: `apps/api/prisma/stage6f4-readonly-data-prechecks.sql`. لا يشملان أسماء المطاعم/العملاء ولا أسعارًا فردية؛ يحتاج تشغيلهما على `menu` إلى إذن قراءة مستقل ودور read-only محدد.
- أداة بروفة معزولة **وليست Production SQL**: `scripts/stage6f4-disposable-migration-candidate.sql`. ترفض أي قاعدة ليست `ordersawa_stage6f4_candidate` على loopback PostgreSQL 18، وتتحقق من Baseline اصطناعية وخمس checksums اصطناعية قبل تضمين الملفين الرسميين. **لا تُعدّل شروطها لتعمل على Production**؛ المبرمج يصوغ إجراء التنفيذ النهائي بعد مطابقة Restore الحقيقية ومراجعة منفصلة.

## مطابقة نتائج Production المرفقة مع Git — 17 أكتوبر 2026

| الفحص | النتيجة من JSON | الاستنتاج |
|---|---|---|
| PostgreSQL/الدور | `menu` على PostgreSQL `18.6 (653b019)`؛ `transaction_read_only=on` أثناء الفحص | دليل تقرير قراءة فقط؛ لم نستخدم Credentials أو نتصل نحن. |
| الأعمدة المالية | `Product.basePrice`, `Order.totalAmount`, `OrderItem.unitPrice/totalPrice` كلها `numeric(10,2)` وNOT NULL | يطابق Baseline الاصطناعية في 6F.3/6F.4؛ Stage 2C تحولها إلى `DECIMAL(24,6)` وBase فقط إلى nullable. |
| غياب الشبكة | لا `ProductConfigurationDependency` ولا `Product.configurationTree`/`configurationVersion` ولا أعمدة Stage 6C الأربعة | Stage 2C ثم 6C لم تُطبقا بحسب نطاق الفحص؛ Client الجديد لا يصلح قبل أعمدة Stage 6C. |
| History | خمسة records مكتملة بلا rollback؛ كل اسم وSHA-256 checksum يطابق ملف `migration.sql` المقابل في Git **5/5** | تعارض checksums الذي كان مجهولًا في 6F.3 **غير موجود في هذه الخمسة**. لا يثبت ذلك انعدام `db push` drift خارج النطاق المفحوص، ولا يوجد Initial CREATE Migration في Git. |
| أسعار Legacy التاريخية | 930 Product Base، 246 Order Total، 272 Unit و272 Line؛ لكل حقل: 0 NULL/سالب/كسر SYP/>6 منازل/overflow | لا مانع Decimal أو SYP مثبت في هذه الحقول **وقت Snapshot فقط**. لم يُفحص `ProductOption.priceDelta` ضمن money counts؛ افحصه Aggregate قبل التفعيل، وأعد فحص الأربع قبيل DDL. |
| OrderStatus/Triggers | القيم الحالية `PENDING_WHATSAPP`, `SENT_TO_WHATSAPP`, `CANCELED`؛ 0 Custom Triggers في نطاق التدقيق | Stage 6C تضيف `VALIDATED_TEST` وTriggers المستقبلية، دون استبدال Legacy status. نطاق الفحص لا يثبت غياب Triggers في كل قاعدة البيانات. |

**SQL المرشحة الفعلية هي ملفا Migration الرسميان المذكوران أعلاه، بالتسلسل، مع فحوص STOP وتوقيت تنفيذ معتمد بعد Restore.** لا نبتكر DDL انتقائية؛ Stage 6C الكاملة تلزم لتوافق Prisma Client الحالي وإن كان مسار WhatsApp العام لا ينشئ `NETWORK_TEST` Order. Candidate DB Completeness Guard المستقلة غير مشمولة.

| Migration موجودة في Production | SHA-256 في JSON وفي ملف Git — تطابق حرفي |
|---|---|
| `20260719000000_add_category_visual_settings` | `A5BBCB330F71578EE49750E0C15D79DD6088500C1248359EEC432BC6713FBC1B` |
| `20260721000000_add_product_mood_key` | `4A085CEE7B45F7E46F9BC9F24E903D1F7BBE46EC412BEEE9DD2654B7A3C61EE1` |
| `20260721001000_add_category_icon_dimensions` | `A27E49CB39595C5D98CB6EEAF4E2D79D6A0AD921A665598E78B5BEEBBA2F4565` |
| `20260807000000_add_product_libraries` | `579D7AEB52CFF91C99756482BD44AB1749B099EF8C15624D3FBE146F74BA18D9` |
| `20260815000000_global_product_libraries` | `4544E53CE71008FE157B97B4D1D7883E0C532BAAD7C40CDDE2B4514FCC15C92C` |

## تصنيف التغييرات

| التصنيف | التغيير | سبب الحاجة الآن |
|---|---|---|
| Required Current Menu | `Product.basePrice DECIMAL(24,6) NULL` مع إبقاء `NULL` مختلفًا عن `0`؛ `configurationTree JSONB`؛ `configurationVersion INTEGER NOT NULL DEFAULT 0`؛ `LinkedProductMode`؛ جدول `ProductConfigurationDependency` بفهرسي المصدر/الإصدار وFKs المركبة ذات العزل المطعمي؛ فهرسا `Product` المركبان؛ خمس `Product` CHECKs المفعّلة | Dashboard، Public Configurator، Linked resolution، Quote، Checkout الموثوق. لا حذف لـ`ProductOptionGroup`/`ProductOption` ولا Backfill تلقائي. |
| Required Prisma/Legacy Compatibility | توسيع `Order.totalAmount` و`OrderItem.unitPrice/totalPrice` إلى `DECIMAL(24,6)`؛ أعمدة `Order.idempotencyKey`, `requestHash`, `acceptanceTokenHash`, `networkSnapshotSealedAt` nullable | Prisma Client الحالي يقرأ نموذج `Order` بكل أعمدته؛ غياب أعمدة Stage 6C أعاد `P2022` سابقًا حتى مع Legacy. قيم `NULL` تحفظ عقود Legacy. |
| Future `NETWORK_TEST` Foundation | قيمة `OrderStatus.VALIDATED_TEST`، فهرسا Unique لـIdempotency/Token، CHECK، وستة Triggers/Functions في Stage 6C | موجودة في ملف SQL الرسمي لحماية المسار التجريبي المعزول، **ليست** مسار WhatsApp الحالي الذي لا يحفظ Network/Mixed Orders. لا تفتح API التجريبية للعامة. |
| **غير مشمول** | `scripts/stage6d3c3e-network-order-completeness-candidate.sql`، Claim Table، Backfill، Business/Outlet، تغيير Runtime | حارس الاكتمال Candidate تجريبي وليس Migration تشغيلية، ولا يلزم WhatsApp العام. |

## بوابات STOP الدنيا قبل اعتماد SQL إنتاجية

1. تأكيد المبرمج أن Backup أُعيدت بنجاح داخل بيئة معزولة، وأن الاستعادة قابلة للفحص، مع زمن التراجع وصاحب القرار. مجرد إنشاء Backup لا يكفي.
2. يوجد إذن/تقرير قراءة سابق في المرفق، لكن **أي إعادة فحص مباشرة من طرفنا أو المبرمج تحتاج صلاحية منفصلة وفق السياسة**. قبيل DDL أعد فحص `stage6f0-readonly-preflight.sql` و`stage6f4-readonly-data-prechecks.sql` بدور read-only مع timeouts، خصوصًا أي تغير منذ Snapshot، و`ProductOption.priceDelta` الذي لم يدخل money counts المرفقة. لا تطبع PII أو أسعارًا فردية.
3. قارِن History قبل التنفيذ مجددًا: الـJSON الحالي أثبت **5/5 checksum match**، لكن أي Migration جديدة/تغير checksum أو drift من `db push` خارج جداول التدقيق = **STOP**. غياب Initial CREATE Migration في Git يمنع اعتماد `migrate deploy` أو `migrate resolve` آليًا.
4. العدادات الأربع كانت صفرًا وقت الفحص؛ **أعد قياسها قبيل DDL**، وأكمل فحص Legacy Options. أي سالب/>6 منازل/overflow/كسر SYP مستجد = **STOP أو معالجة صريحة معتمدة**. `ALTER COLUMN TYPE` قد يقرب 7 منازل بصمت؛ لا نسمح به. لا تُغيّر البيانات القديمة أو تكشف أسعارها عبر الفحص.
5. Diff metadata/DDL من Restore حقيقية مقابل Baseline المرشحة؛ تحقق من عدم وجود `configurationTree`/أعمدة Stage 6C مطبقة جزئيًا، ومن المفاتيح والفهارس/Enums والأسماء والتبعيات. أي Partial Application = **STOP** وإعداد SQL تفاضلية خاصة بعد مراجعة.
6. بروفة على Restore معزولة من نفس Backup (أو staging مكافئة يوافق عليها المؤسس)، مستخدمة PostgreSQL 18.6 ونسخة Prisma الحالية. قِس وقت الأقفال/DDL، واختبر Legacy Order/Analytics، Network setup/Quote، Network/Mixed checkout، وRollback/forward fix. الاختبار الاصطناعي في Stage 6F.4 لا يغني عنها.
7. راجع الإجراء النهائي ونقطة التوقف قبل التطبيق مع المؤسس؛ احصل على **موافقة Migration إنتاجية مستقلة**. لا `db push` أو `migrate deploy` أو `migrate resolve` تلقائيًا، ولا تعديل لتاريخ Migrations القديم.

## تسلسل التنفيذ المرشح بعد الموافقات — للمبرمج لا للتنفيذ الآن

1. صيانة قصيرة وBackup قابلة للاستعادة؛ اجعل علم WhatsApp العام `0` وأوقف الكتابات عند نافذة DDL المعتمدة وفق topology الحقيقي.
2. نفّذ SQL Stage 2C الرسمية أو نسخة مراجعة مطابقة لـRestore الفعلية. الملف يبدأ `BEGIN` ويضبط `lock_timeout=5s` و`statement_timeout=5min` ويختم `COMMIT`. يضيف التكوين/الفهارس/FKs/CHECKs ويحوّل الأعمدة المالية، ولا يرحّل Legacy Options.
3. تحقق من الأعداد وقيود `convalidated` والفهارس و`Prisma migrate diff` على Staging. نفّذ SQL Stage 6C الرسمية فقط ضمن الإجراء المصادق عليه؛ الملف نفسه لا يحتوي transaction wrapper، لذلك اختُبر داخل `BEGIN`/`COMMIT` في disposable. يحتاج التعامل مع `ALTER TYPE ... ADD VALUE` ووضع PostgreSQL/Prisma Migration History مراجعة واضحة، وليس إدراج حالة History اصطناعية في Production.
4. لا تُسجل Migration بوصفها مطبقة إلا بإجراء History معتمد بعد مطابقة checksums وحالة القاعدة؛ لا تكتب `_prisma_migrations` يدويًا بناء على بروفة هذه الحزمة.
5. تحقق من Schema وPrisma Client وLegacy Order/Analytics بعلم `OFF`، ثم انشر Binary المتوافقة بموافقة Deployment منفصلة. تفعيل Network/Mixed يحتاج موافقة أخرى.

## التراجع والمخاطر

- **قبل ظهور Network data**: توجد خطة Stage 2C guarded rollback في المستودع، لكن لا تُنفّذ آليًا؛ تراجع عمود `basePrice` من nullable إلى NOT NULL أو من ست إلى منزلتين قد يفقد بيانات أو يفشل. اختبره على Restore.
- **بعد ظهور Network data**: لا تزيل Tree/Dependency/`NULL` Base ولا ترجع DDL قديمًا. أطفئ Feature Flag، تراجع عن Binary فقط إن كان متوافقًا، واعتمد forward-fix أو Restore كاملة بموافقة وتقييم فقد البيانات. لا توجد Down Migration عامة آمنة لـStage 6C.
- تغيير `DECIMAL` يأخذ أقفالًا وقد يعيد كتابة الجداول؛ لا تستنتج زمنًا إنتاجيًا من Fixture صغيرة. Legacy Options/Orders/Analytics لا تُحذف. الرمز `NETWORK_TEST` وDB Guard التجريبي لا يعنيان تفعيل الطلبات الحقيقية.

**نتيجة Stage 6F.4 المحلية:** PostgreSQL 18.6 disposable جديد؛ Baseline اصطناعية + بيانات Legacy اصطناعية، فحوص تمهيدية، Stage 2C ثم 6C، Assertions وPrisma diff وClient/HTTP اختُبرت بنجاح كما في `ORDERSAWA_FINAL_RELEASE_VERIFICATION_AR.md`. هذه أدلة Candidate محلية **وليست** ترخيصًا لترحيل `menu`.
