# OrderSawa — خطة ترحيل قاعدة البيانات المرشحة للمراجعة (Stage 6F.4)

**ليست إذنًا بتنفيذ SQL على `menu`.** لا توجد هنا SQL إنتاجية غير مشروطة: وصف القاعدة الحقيقي المرسل في Stage 6F.3 تقرير metadata مشتق من `schema.json`، لا Dump ولا تدقيق مباشر. لم تُفحص checksums، أو numeric typmods، أو drift الناتج عن `prisma db push`، أو البيانات، ولم يصل تأكيد نجاح استعادة النسخة الاحتياطية. لذلك **STOP** قبل أي DDL على القاعدة الحقيقية إلى أن تُستكمل الفحوص أدناه وتُراجع الخطة على Restore معزولة وتصدر موافقة ترحيل مستقلة.

## المصادر والحزمة

- المخطط المعتمد: `apps/api/prisma/schema.prisma` وملفا SQL الرسميان، **دون تعديل**: `apps/api/prisma/migrations/20261012000000_product_configuration_network/migration.sql` (Stage 2C) ثم `apps/api/prisma/migrations/20261013000000_network_order_test_snapshot/migration.sql` (Stage 6C).
- تقرير الوصف المستلم ومحدوديته: `STAGE_6F_3_PRODUCTION_SCHEMA_RECONCILIATION_REPORT_AR.md` و`ORDERSAWA_DISPOSABLE_MIGRATION_VERIFICATION_AR.md`. القاعدة الموصوفة PostgreSQL 18.6 باسم `menu`، 34 جدولًا/325 عمودًا/37 FK/93 فهرسًا وخمسة أسماء Migrations مطابقة للأسماء في Git؛ **هذا لا يثبت تطابق التعريفات أو checksums**.
- استعلام metadata للقراءة فقط: `apps/api/prisma/stage6f0-readonly-preflight.sql`. استعلام بيانات إجمالية فقط: `apps/api/prisma/stage6f4-readonly-data-prechecks.sql`. لا يشملان أسماء المطاعم/العملاء ولا أسعارًا فردية؛ يحتاج تشغيلهما على `menu` إلى إذن قراءة مستقل ودور read-only محدد.
- أداة بروفة معزولة **وليست Production SQL**: `scripts/stage6f4-disposable-migration-candidate.sql`. ترفض أي قاعدة ليست `ordersawa_stage6f4_candidate` على loopback PostgreSQL 18، وتتحقق من Baseline اصطناعية وخمس checksums اصطناعية قبل تضمين الملفين الرسميين. **لا تُعدّل شروطها لتعمل على Production**؛ المبرمج يصوغ إجراء التنفيذ النهائي بعد مطابقة Restore الحقيقية ومراجعة منفصلة.

## تصنيف التغييرات

| التصنيف | التغيير | سبب الحاجة الآن |
|---|---|---|
| Required Current Menu | `Product.basePrice DECIMAL(24,6) NULL` مع إبقاء `NULL` مختلفًا عن `0`؛ `configurationTree JSONB`؛ `configurationVersion INTEGER NOT NULL DEFAULT 0`؛ `LinkedProductMode`؛ جدول `ProductConfigurationDependency` بفهرسي المصدر/الإصدار وFKs المركبة ذات العزل المطعمي؛ فهرسا `Product` المركبان؛ خمس `Product` CHECKs المفعّلة | Dashboard، Public Configurator، Linked resolution، Quote، Checkout الموثوق. لا حذف لـ`ProductOptionGroup`/`ProductOption` ولا Backfill تلقائي. |
| Required Prisma/Legacy Compatibility | توسيع `Order.totalAmount` و`OrderItem.unitPrice/totalPrice` إلى `DECIMAL(24,6)`؛ أعمدة `Order.idempotencyKey`, `requestHash`, `acceptanceTokenHash`, `networkSnapshotSealedAt` nullable | Prisma Client الحالي يقرأ نموذج `Order` بكل أعمدته؛ غياب أعمدة Stage 6C أعاد `P2022` سابقًا حتى مع Legacy. قيم `NULL` تحفظ عقود Legacy. |
| Future `NETWORK_TEST` Foundation | قيمة `OrderStatus.VALIDATED_TEST`، فهرسا Unique لـIdempotency/Token، CHECK، وستة Triggers/Functions في Stage 6C | موجودة في ملف SQL الرسمي لحماية المسار التجريبي المعزول، **ليست** مسار WhatsApp الحالي الذي لا يحفظ Network/Mixed Orders. لا تفتح API التجريبية للعامة. |
| **غير مشمول** | `scripts/stage6d3c3e-network-order-completeness-candidate.sql`، Claim Table، Backfill، Business/Outlet، تغيير Runtime | حارس الاكتمال Candidate تجريبي وليس Migration تشغيلية، ولا يلزم WhatsApp العام. |

## بوابات STOP الدنيا قبل اعتماد SQL إنتاجية

1. تأكيد المبرمج أن Backup أُعيدت بنجاح داخل بيئة معزولة، وأن الاستعادة قابلة للفحص، مع زمن التراجع وصاحب القرار. مجرد إنشاء Backup لا يكفي.
2. إذن **منفصل للقراءة فقط** من `menu`، ثم تشغيل `stage6f0-readonly-preflight.sql` و`stage6f4-readonly-data-prechecks.sql` بدور read-only مع `statement_timeout` و`lock_timeout`. احفظ مخرجات metadata والعدادات فقط، دون secrets/PII/أسعار فردية. تحقق من `format_type` الحقيقي لكل عمود مالي، قيم Enum، تعريف CHECK/FK/index/trigger، وتسلسل Schema؛ لا تفترض `numeric(10,2)` لأن التقرير لم يذكر typmod.
3. قارن كل صف `_prisma_migrations` الفعلي: الاسم، checksum، `finished_at` و`rolled_back_at` مقابل SHA-256 لملف Git الموافق؛ لا تنقل `logs`. أي اختلاف أو Migration غير معروفة أو drift ناتج عن `db push` = **STOP**. غياب Initial CREATE Migration في Git يمنع اعتماد `migrate deploy` أو `migrate resolve` آليًا.
4. يجب أن تكون عدادات القيم السلبية، أو التي لها أكثر من ست منازل مؤثرة، أو تتجاوز مجال `DECIMAL(24,6)`، أو أسعار SYP/`ل.س` الكسرية **صفرًا أو ذات معالجة صريحة معتمدة**. `ALTER COLUMN TYPE` قد يقرب 7 منازل بصمت؛ لا نسمح به. لا تُغيّر البيانات القديمة أو تكشف أسعارها عبر هذا الفحص.
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
