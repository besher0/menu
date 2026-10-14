# OrderSawa — Stage 6F.0: فحص ما قبل الإصدار وتوافق قاعدة البيانات

التاريخ: 2026-10-14. الفرع: `feature/product-configuration-network`. آخر Commit قبل العمل: `9abda6c6e7837a9c63b65114857c0da7c3472de2`، وكانت شجرة Git نظيفة. هذا **تقرير إعداد فقط**: لا اتصال بقاعدة أو سيرفر Production، ولا Migration أو Deployment أو تفعيل علم أو تعديل Runtime/Prisma Schema.

## 1. حالة الميزة الحالية

Dashboard Network setup والحفظ، Public Configurator وTrusted Quote، سلة Legacy/Network المختلطة، وWhatsApp Prepare/Confirm موجودة في Source Code الحالي واختُبرت سابقًا على PostgreSQL Disposable. Legacy-only يظل في Checkout القديم الذي يحفظ `Order`/`OrderItem` وحدث `WHATSAPP_ORDER_CLICKED`؛ Network-only وMixed لا يحفظان Order بل يعيدان رابط WhatsApp بعد قبول Draft موثوقة. Trusted API ترفض Legacy-only المباشرة بـ`400 LEGACY_CHECKOUT_REQUIRED`. العلم `ENABLE_PUBLIC_NETWORK_WHATSAPP_CHECKOUT` **OFF افتراضيًا**. `NETWORK_TEST` وDesign A وSnapshot/DB Guard بنية مستقبلية محروسة، ليست مسار WhatsApp العام. نتائج Stage 6E.4 السابقة: API 202/202 بلا تخطٍ، Shared 21/21، Web 41/41، Typecheck/Build، وفحوص Browser موثقة في تقريرها؛ **لم تُعد هذه الاختبارات في مرحلة التوثيق الحالية**.

## 2. الحد الأدنى لمخطط قاعدة البيانات والتوافق مع Prisma

المصدر الحاكم لمخطط التطبيق المترجم هو `apps/api/prisma/schema.prisma`، مع SQL المحفوظة في `apps/api/prisma/migrations/`. يلزم توافق **المخطط الأساسي كله** مع Prisma، لا البنود الإضافية أدناه وحدها. لا توجد Initial CREATE Migration في تاريخ Git (الموجود سبعة مجلدات ترحيل إضافية تبدأ من يوليو 2026)، لذلك لا يمكن استنتاج حالة أي قاعدة حقيقية من أسماء الملفات. هذا الجدول يحدد بدقة دلتا Network/Order المؤثرة على الإصدار الحالي؛ Query التدقيق المرفقة تُظهر كامل أعمدة وقيود وفهارس الجداول المعنية للمقارنة مع `schema.prisma`، دون قراءة صفوف العملاء.

| الجزء | الأعمدة/الأنواع اللازمة في المخطط الحالي | القيود والفهارس اللازمة | صلته بإطلاق WhatsApp الحالي |
|---|---|---|---|
| `Product` — Stage 2C | `basePrice DECIMAL(24,6) NULL`؛ `configurationTree JSONB NULL`؛ `configurationVersion INTEGER NOT NULL DEFAULT 0`. تبقى حقول المنتج الأساسية و`restaurantId` و`isActive/isAvailable/deletedAt` و`currency` كما يطلب Prisma. | الفهارسان الفريدان `Product_restaurantId_id_key` و`Product_restaurantId_id_configurationVersion_key`، وخمسة CHECKs المُتحقَّق منها: `Product_configurationVersion_nonnegative_check`، `Product_basePrice_nonnegative_check`، `Product_configuration_legacy_state_check`، `Product_configuration_shape_check`، `Product_configuration_basePrice_match_check`. فهارس/مفاتيح Legacy القائمة تُحفظ. | **مطلوب** لإنشاء/عرض/تسعير Network، وللفصل الآمن بين Legacy وNetwork مع `null` مقابل `0`. |
| `ProductConfigurationDependency` — Stage 2C | `id`, `restaurantId`, `productId`, `sourceProductId`, `optionId`, `path`, `mode`, `configurationVersion`, `createdAt` بالأنواع وعدم السماح بـNULL كما في SQL؛ Enum `LinkedProductMode = ORIGINAL/CUSTOM`. | PK؛ FK مالك مركب `(restaurantId,productId,configurationVersion)` مع `ON DELETE CASCADE`؛ FK مصدر `(restaurantId,sourceProductId)` مع `ON DELETE RESTRICT`؛ CHECKs منع self-link وإصدار موجب و`optionId/path` غير فارغين؛ UNIQUE `(productId,path)`؛ فهرسا `(restaurantId,sourceProductId)` و`(productId,configurationVersion)`. | **مطلوب** للحفظ الذري، العزل بين المطاعم، وحماية حذف مصدر Linked. لا يكفي وجود JSON وحده. |
| `Order` و`OrderItem` — Stage 2C | `Order.totalAmount` و`OrderItem.unitPrice/totalPrice` إلى `DECIMAL(24,6)`، دون فقد حقول Legacy. | مفاتيح/علاقات Order وOrderItem الأصلية كما في Prisma. | **مطلوب لتوافق المخطط الحالي**؛ توسيع الدقة لا يجيز اختراع سياسة تقريب. |
| `Order` — Stage 6C | أربعة أعمدة nullable: `idempotencyKey TEXT`, `requestHash TEXT`, `acceptanceTokenHash TEXT`, `networkSnapshotSealedAt TIMESTAMP(3)`. تبقى الحقول الأساسية: `id`, `restaurantId`, `branchId`, `customerName`, `customerPhone`, `totalAmount`, `currency`, `status`, `source`, `whatsappMessage`, `cartSnapshot`, `createdAt`. | فهرسا UNIQUE `(restaurantId,idempotencyKey)` و`(restaurantId,acceptanceTokenHash)` باسمَي `Order_restaurantId_idempotencyKey_key` و`Order_restaurantId_acceptanceTokenHash_key` في المخطط الكامل. SQL الرسمية تضيف `Order_network_test_idempotency_check` وEnum `VALIDATED_TEST` وTriggers لعزل Snapshot المستقبلية. | **الأعمدة الأربعة لازمة لتوافق Prisma Client الحالي حتى مع Legacy**: تجربة Stage 6E.4 على Stage2C-only Disposable أعادت `P2022` عند `order.findMany` لغياب `idempotencyKey`. أما فهارس/Enum/Triggers Stage6C فتحمي `NETWORK_TEST` أو تطابق مخطط Git الكامل؛ لا تستخدمها WhatsApp العامة التي لا تحفظ Network Order. لا يُسمح بنشر «أعمدة فقط» ارتجالًا دون تاريخ/خطة ترحيل معتمدة. |
| جداول Legacy والسياق | `ProductOptionGroup`, `ProductOption`, `Restaurant`, `Branch`, `Category`, `Order`, `OrderItem`, `AnalyticsEvent`, `RestaurantSubscription`, `SubscriptionFeature`, `SubscriptionPlan`, `RestaurantThemeSettings` وحقولها حسب Prisma. | مفاتيح وفهارس Legacy الأصلية؛ لا حذف للجداول القديمة. | حفظ Legacy Order/Analytics، رقم WhatsApp، Subscription/Capability، وPublic Menu يتطلب استمرارها وتوافق كامل حقولها. |

التمييز الحاسم: **الحد الأدنى التشغيلي لتوافق Binary الحالية** يشمل أعمدة Stage6C الأربعة إذا كانت مفقودة، لأن Prisma قد يقرأ جميع Scalar fields افتراضيًا؛ لكن **DB Completeness Guard المرشحة في `scripts/stage6d3c3e-network-order-completeness-candidate.sql` ليست شرطًا لرحلة WhatsApp العامة**، وليست Migration تشغيلية معتمدة. الترحيل الرسمي `20261013000000_network_order_test_snapshot` يتضمن Enum/فهرسين/CHECK/Triggers إلى جانب الأعمدة. يجب تدقيق التاريخ ثم تقرير مسار قانوني متسق، لا تطبيق جزء منه بصمت. تجربة `P2022` دليل على قاعدة مؤقتة ناقصة، **وليست إثباتًا لحالة Production**.

ملفا Migration في Git للمقارنة بعد تصريح التدقيق: Stage 2C `20261012000000_product_configuration_network` SHA-256=`B4426156DFF515A2A5C928ABE4BB87513EB24AA46DBBC2AF8A2C25366229E700`؛ Stage 6C `20261013000000_network_order_test_snapshot` SHA-256=`8CB453DDFDCE0194A54838290477724608C7CF60C4C1FD580AE41EEFDAEE7B0F`. **لا تفترض تطابقهما مع `_prisma_migrations` قبل قراءة التاريخ المصرح بها.**

## 3. استعلامات التدقيق للقراءة فقط — للمراجعة، لم تُنفذ على Production

الملف الجديد: `apps/api/prisma/stage6f0-readonly-preflight.sql`. يبدأ `REPEATABLE READ READ ONLY` مع مهلة 15 ثانية و`lock_timeout` ثانيتين، ويتوقف عند الخطأ. يعرض فقط: هوية قاعدة البيانات وإصدار PostgreSQL، وجود الجداول، تعريفات أعمدة الجداول المعنية، CHECK/FK/PK والفهارس وصلاحيتها، قيم `LinkedProductMode` و`OrderStatus`، أسماء وحالة Triggers، واسم/Checksum/أوقات حالة Migration History إن وجد الجدول. لا يقرأ صفوف `Order` أو `OrderItem` أو `Product` أو `Customer`، ولا عمود `logs` في `_prisma_migrations`، ولا يُظهر أسرار الاتصال أو أجسام وظائف DB. عدم وجود الجدول يُبلّغ عنه بدل فشل Cast إلى `regclass`.

**لا تنفّذ الملف ضد Production الآن.** قبل أي تشغيل مستقبلي يلزم تفويض صريح يحدد قاعدة البيانات والدور Read-only وجهة حفظ المخرجات وطريقة توفير الاتصال من Secret Store. لا تُمرر كلمة مرور في CLI/Logs أو Git. المخرجات Metadata تشغيلية ينبغي حفظها في مكان وصوله محدود خارج المستودع، مع مراجعة أي تعريفات SQL قبل مشاركة التقرير.

الملف الحالي الأقدم `product-configuration-history-audit.sql` يقرأ `logs_preview` ويستخدم `::regclass` لجداول قد تغيب؛ لذلك أُعدّ هذا الاستعلام الجديد المحدد لهذه المهمة بدل إعادة استخدامه كما هو. بعد التدقيق، قارِن أسماء/Checksums التاريخ بملفات Git، وقيود `convalidated` و`indisvalid` وتعريفات FK/CHECK والفهارس، ثم اختبر diff على نسخة Staging/Disposable مماثلة. Catalog metadata وحدها لا تثبت دلالات Trigger body أو توافق كل جداول التطبيق.

## 4. مخاطر الترحيل وخطة التحضير — لا تنفيذ

1. **أولًا تاريخ ومخطط فعليان:** هل `_prisma_migrations` موجود؟ هل يوجد Initial Baseline خارجي؟ هل هناك Migration غير مكتملة/راجعة/Checksum مختلف؟ هل تغييرات Stage2C/6C طبقت يدويًا؟ أي اختلاف يوقف الخطة؛ لا `migrate deploy` ولا `db push` ولا `migrate resolve` تلقائيًا.
2. **نسخة احتياطية قابلة للاستعادة:** قبل أي DDL لاحق، يلزم Backup متسق واختبار Restore على بيئة معزولة وقياس RPO/RTO ونافذة صيانة. لا يكفي نجاح أمر النسخ وحده. لا تنسخ PII إلى Disposable غير محمية.
3. **ترتيب لاحق بعد الموافقة:** تصالح Baseline/History، اختبر Stage2C وتحقق من CHECK/FK/Legacy prices، ثم عالج اعتماد Prisma على Stage6C عبر خطة Migration مراجَعة تحافظ على Legacy؛ أبقِ Candidate Guard المستقبلية منفصلة. لا Backfill افتراضيًا؛ إن لزم، جولة dry-run/Quarantine وتصريح مستقل.
4. **مخاطر Legacy:** قد تفشل CHECKs Stage2C إذا وُجد Base سالب/Legacy null أو Tree جزئية؛ تغييرات DECIMAL تتطلب قفلًا وتخطيطًا، وفهارس فريدة قد تصطدم ببيانات قديمة؛ Stage6C SQL يضيف Triggers/Enum يجب اختبارها على نسخة مماثلة. لا تحذف Legacy Options أو تغيّر أرقام Order القائمة أو أسعارها.
5. **Rollback:** افصل رجوع التطبيق/العلم OFF عن رجوع SQL. قبل وجود Network data قد يفيد guarded rollback Stage2C بعد مراجعة؛ بعد وجودها أو قيم 6 منازل قد يسبب رجوع النوع/الأعمدة فقد بيانات، فيُفضّل إبقاء Schema الإضافية مع تعطيل الميزة وForward Fix. لا تُزال أعمدة Order المطلوبة قبل رجوع Client متوافق. لا تُلغِ Migration History قديمة.
6. **التحقق:** Staging/Disposable من مخطط موثوق، تشغيل Prisma Client نفسه وLegacy create/read/Analytics وAdmin Product GET/PUT وPublic Quote/Prepare/Confirm، ثم Schema diff وقيود/فهارس وSmoke؛ لا تكتفِ بنجاح `prisma validate` الذي يفحص ملف Schema محليًا فقط.

## 5. ما تثبته ملفات Deployment وما لا تثبته

`docker-compose.yml` يعرّف **خدمة PostgreSQL محلية واحدة** (`postgres:16-alpine`، port محلي 5433، volume محلي، healthcheck) ولا يعرّف API أو Web أو Proxy. `package.json` يشغّل Nest وNext كـDev/Build Scripts، وليس مخطط Production. `.env.example` يحدد أسماء متغيرات Placeholder. `README.md` و`PROJECT_RUNBOOK.md` تعليمات إعداد قديمة تتضمن `prisma db push` وDemo seed؛ **لا تصلح خطة نشر على قاعدة قائمة**. لا تظهر في الملفات المفحوصة Dockerfile لـAPI/Web، أو Nginx/Caddy، أو Kubernetes/Helm، أو PM2/Procfile، أو CI/CD deployment manifest. لا توجد أدلة كافية على عدد API/Web instances أو Proxy/TLS أو قاعدة البيانات الفعلية أو Backup/Rollback أو طريقة إدارة الأسرار.

مطلوب من المؤسس/المشغّل قبل اقتراح نشر: (أ) تعريف السيرفر/مزود الاستضافة ونسخ API/Web ومسار Traffic، دون Credentials؛ (ب) Reverse Proxy وTLS ودومينات القائمة و`TRUST_PROXY`؛ (ج) نسخة PostgreSQL ومخطط/تاريخ Migration *بعد تصريح قراءة مستقل*؛ (د) آلية Backup/Restore وتوقيت الصيانة؛ (هـ) Secret Store وتوزيع HMAC على النسخ وتدويره؛ (و) آلية Deploy/Rollback السابقة؛ (ز) إعدادات CORS/Origins وأرقام WhatsApp والباقة للعملاء المقصودين. لا نفترض Single-instance.

## 6. قائمة إعدادات البيئة والتحقق دون كشف قيم سرية

| الإعداد | تحقق آمن قبل التفعيل |
|---|---|
| `ENABLE_PUBLIC_NETWORK_WHATSAPP_CHECKOUT` | يبقى `0` الآن. اختبر OFF في Staging، ثم ON هناك بموافقة منفصلة؛ لا تبديل Production في Stage 6F.0. |
| `PUBLIC_WHATSAPP_CHECKOUT_HMAC_KEY` | تحقّق آليًا من **الوجود والطول/صيغة hex الزوجية فقط** (32 byte عشوائية على الأقل)، ومن تطابق بصمة آمنة بين API instances عبر Secret Store؛ لا تطبع القيمة أو Token. غياب/فساد المفتاح عند ON ينتج `503`. خطة تدوير تراعي Tokens ذات 10 دقائق. |
| `PRODUCT_CONFIGURATION` | تحقق من إسناد Capability في الخطة المعينة للمطعم؛ لا تفترض تفعيلها تلقائيًا لكل BASIC/PRO/PREMIUM. التحقق التجاري من الباقات قرار مستقل. |
| `WHATSAPP_ORDERING` و`CART_ORDERING` | يلزمان في Trusted Draft مع اشتراك `ACTIVE/TRIALING`؛ راجع Flag إعدادات المطعم `publicUi.whatsappOrderingEnabled`. |
| رقم WhatsApp | تحقق من وجوده في Restaurant أو Branch الصحيح، وصيغة دولية صالحة؛ لا تعرض الرقم في تقرير عام أو Logs. اختبر الوجهة برقم اختبار على Staging. |
| `DATABASE_URL`/`DIRECT_URL` | تحقق من اسم البيئة والدور والصلاحيات/SSL عبر قناة سرية؛ لا تعرض URL أو تستخدم `.env` الفعلي هنا. |
| `API_ORIGIN`, `WEB_ORIGIN`, `CORS_ORIGINS`, `ROOT_DOMAIN`, `NEXT_PUBLIC_API_URL/WEB_URL` | راجع الدومينات والـTLS والـRouting الفعليين، وعدم توسيع CORS إلى `*` دون مراجعة. |
| `TRUST_PROXY` و`RATE_LIMIT_*` | اضبطهما حسب Proxy الحقيقي؛ Rate Limit الحالية In-memory per-process (`write` 120/min/IP و`global` 300/min/IP افتراضيًا)، فلا تُعد موزعة. إذا النشر متعدد النسخ أو خلف Proxy غير موثوق، يلزم قرار حماية مناسب قبل ON. |
| `ENABLE_DISPOSABLE_NETWORK_ORDERS` | يجب ألّا يُستعمل لتفعيل Checkout العام؛ `/orders/network-test/*` تتطلب non-Production، loopback، قاعدة Disposable محددة وعلمًا منفصلًا، وتبقى مغلقة للعامة. |

التحقق من البيئة يجب أن ينتج **حالة/طول/بصمة غير قابلة لاسترجاع السر فقط**، لا `env` dump ولا Logs تتضمن هاتف عميل أو ملاحظاته أو رابطًا كاملًا. إعدادات `.env.example` أمثلة محلية وليست قيم تشغيلية.

## 7. حماية Legacy وSmoke Tests المقترحة

**قبل التفعيل والعلم OFF في Staging مماثلة:** (1) Health/Login/Public Menu/Legacy product listing؛ (2) Legacy-only Checkout يحفظ Order/Items و`WHATSAPP_ORDER_CLICKED` مرة واحدة، والأسعار/الرسالة/رقم المطعم كما قبل التغيير؛ (3) Network/Mixed لا تفتحان WhatsApp؛ (4) طلب مباشر لـTrusted API يرد `403`؛ (5) `/orders/network-test/*` محجوبة؛ (6) لا إرسال WhatsApp آلي؛ (7) تحقق من عدم تحول Network Setup غير المكتمل إلى Legacy sellable.

**بعد تفعيل Staging بموافقة مستقلة — ليس Production الآن:** أعِد (1) Legacy-only عبر المسار القديم مع Order/Analytics واحد بلا تكرار؛ (2) طلب HTTP مباشر Legacy-only إلى Prepare/Confirm يرد `400 LEGACY_CHECKOUT_REQUIRED`؛ (3) Network-only وMixed تحصلان على Draft Decimal موثوقة ثم Confirm و`wa.me` من الرقم الصحيح، دون `Order` أو `NETWORK_TEST`؛ (4) السعر/Revision/Availability/Linked Source/Capability المتغيرة تُرفض أو تتطلب موافقة جديدة، ولا تُفتح WhatsApp عند الفشل؛ (5) عزل مطعمين ورفض الأسعار المتلاعب بها، URL الطويل، Token منتهية/غير صالحة؛ (6) RTL/390px وCart reload/edit/delete؛ (7) لا تغير في Legacy أسعار/Analytics. لا ترسل رسالة حقيقية أثناء Smoke المحلية.

في Production لاحقًا، لا يُجرى Smoke يكتب Order أو يفتح WhatsApp إلى رقم حقيقي إلا بعد تفويض وتشغيل محكوم؛ يمكن البدء بقراءات صحية وFlag OFF. يجب تحديد هوية Test Restaurant/Number وحذف أو وسم آثار Smoke التجريبية بطريقة معتمدة، دون إسقاط بيانات حقيقية.

## 8. قرارات المؤسس والجاهزية التشغيلية

- **عرض العملة:** ما العملات المستخدمة حاليًا؟ هل تُعرض القيم الداخلية ذات 6 منازل كما هي أم وفق Scale/تقريب معتمد لكل عملة؟ كيف تعرض القيمة نفسها في Cart وDraft والرسالة؟ لا تغيير في Shared Engine قبل القرار.
- **WhatsApp:** اعتمد نموذج الرسالة النهائي بأمثلة Pizza/Combo/Legacy Mixed؛ قبول السعر صالح الآن 10 دقائق في HMAC Token. هل مدة 10 دقائق مناسبة تجاريًا؟ فتح `wa.me` لا يضمن أن القائمة/السعر لم يتغير قبل ضغط الزبون «إرسال»؛ ما التعهد الذي ينبغي عرضه للزبون والمطعم؟ لا يُرسل النظام WhatsApp تلقائيًا.
- **النشر:** من يملك اعتماد مخطط القاعدة وخطة Backup/Restore ونافذة الصيانة وFeature Flag؟ ما topology الفعلي وSecret Store؟ لا يمكن إصدار توصية بالتفعيل قبل إجابات موثقة.
- **الأساس المستقبلي:** Business/Outlet وPOS/Kitchen/Delivery، `NETWORK_TEST` Orders، Commercial Order Number، DB Completeness Guard، وDependency Closure ليست شروطًا لرحلة المنيو + WhatsApp الحالية ولا تُفعّل هنا.

## 9. التحقق في هذه المرحلة وحدود الأدلة

- فحصت Git/Prisma/SQL/المسارات الفعلية وملفات النشر؛ لم أغيّر أي Runtime أو Schema أو Migration History.
- `prisma validate --schema apps/api/prisma/schema.prisma` نجح باستخدام URL وهمي محلي في **متغيرات العملية فقط**؛ لا اتصال DB، ولا إثبات توافق قاعدة موجودة.
- ملف الاستعلام الجديد خضع لمراجعة ثابتة فقط؛ **لم يُشغَّل على Production ولا على Disposable**. محاولة إنشاء PostgreSQL Disposable جديدة على `127.0.0.1:55441` تعذرت بسبب خطأ Windows restricted token في `initdb/pg_ctl`؛ `pg_isready` أكد عدم وجود مستمع. بقي مجلد تهيئة جزئية خارج Git في `../work/stage6f0-postgres-data`، ولم يُستخدم لأي بيانات حقيقية. لا تُعد هذه محاولة اختبار قاعدة ناجحة.
- لم أعد تشغيل Shared/API/Web/Browser؛ هذا العمل Documentation/SQL read-only ولا يغيّر Runtime. نتائج Stage 6E.4 المذكورة تاريخية وليست نتيجة جديدة.
- SQL الجديدة لا تجمع PII أو Credentials. قبل الاستخدام الحقيقي يلزم اختبارها على PostgreSQL Disposable/نسخة Staging عند توفر Runner آمن، ثم موافقة منفصلة على أي Read-only Production Audit.

## 10. الخطوة الآمنة التالية والتوقف

الخطوة التالية **ليست Deployment**: يزوّد المؤسس/المشغّل معلومات topology/Backup/Secret Store وسياسة عرض العملة، ويمنح — إن شاء — إذنًا منفصلًا لتشغيل `stage6f0-readonly-preflight.sql` بدور قراءة على قاعدة محددة أو يقدّم مخرجات Metadata موثوقة. بعد مراجعة النتائج يمكن إعداد خطة Baseline/Schema reconciliation وStaging Test مستقلة للموافقة. إلى ذلك الحين يبقى العلم OFF، ولا `db push` أو `migrate deploy` أو Production SQL أو إرسال WhatsApp.

## 11. Git

الملفات الجديدة/المعدلة في Stage 6F.0: `STAGE_6F_0_PRODUCTION_RELEASE_PREFLIGHT_REPORT_AR.md`، `apps/api/prisma/stage6f0-readonly-preflight.sql`، `CODEX_HANDOFF.md` فقط. لم تتغير Secrets أو `.env` أو Runtime أو Prisma Schema أو ملفات Migrations. يُثبت Commit التوثيق النهائي وحالة Git بأمر `git log -1 --format=%H` و`git status --short --branch` بعد الحفظ؛ Hash البداية `9abda6c6e7837a9c63b65114857c0da7c3472de2`. **توقف بعد Stage 6F.0 وانتظر تفويضًا جديدًا قبل أي خطوة على Production.**
