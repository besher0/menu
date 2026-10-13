# OrderSawa — تقرير Stage 6C: إنشاء طلبات Network الموثوقة والـSnapshot الثابتة

التاريخ: 2026-10-13. الفرع: `feature/product-configuration-network`. Commit التنفيذ: `3816efc` (`feat(api): add Stage 6C test-only trusted Network orders`). هذا تقرير لمرحلة Backend **اختبارية معزولة فقط**؛ لا يوجد تفعيل لطلبات Network العامة، ولا WhatsApp Network، ولا Stage 6D.

## النتيجة والحدود

أُضيف مسار اختبار محمي لإنشاء `Order` و`OrderItem` من اختيارات Network، باستخدام `Order` الحالي وStage 6A Quote وShared Engine أنفسها. لا يثق بأي أسعار أو إجماليات أو Quote محفوظة محليًا. أُبقي `orderingEnabled:false` في واجهة المنيو والسلة، ولا تستطيع السلة الحالية استدعاء المسار الجديد. بقي Legacy WhatsApp منفصلًا وقابلًا للعمل، مع استمرار منع Network عنه. لا Migration ولا Backfill ولا Deployment على قاعدة حقيقية.

المرجع الأعلى للقرارات هو `../work/product-network-pack/OrderSawa_Product_Network_Codex_Pack/AUTHORITATIVE_RULES/LATEST_FOUNDER_DECISION_LEDGER_V2_CURRENT.md` ثم `CURRENT_SUPERSESSION_AND_CONFLICT_RULES.md`، وبعدهما `02_IMPLEMENTATION_WORKFLOW_AR.md` و`04_ACCEPTANCE_TEST_MATRIX.md`. راجعت أيضًا `CODEX_HANDOFF.md` وتقريري Stage 6A و6B والعقود الفعلية في Shared وAPI وCart. لا توجد هنا سياسة تقريب جديدة أو بنية Business/Outlet جديدة.

## API الاختبارية والعقد

المسار محصور في `127.0.0.1:55440`، قاعدة PostgreSQL يبدأ اسمها بـ`ordersawa_stage3_stage6c_`، `NODE_ENV` غير Production، و`ENABLE_DISPOSABLE_NETWORK_ORDERS=1`. الحارس يرفض اتصال HTTP غير loopback. إن غاب أي شرط، يرجع 403 قبل الكتابة. هذا حاجز مؤقت للاختبار **وليس** مصادقة Production أو واجهة طلب عمومية جاهزة.

- `POST /public/menus/:restaurantSlug/orders/network-test/prepare`: يستقبل `{ "locale":"ar", "items":[{"productId":"...","quantity":2,"selection":{...}}] }`. يعيد `draft` موثوقة بالسعر الحالي و`acceptanceToken` موقّعًا صالحًا لعشر دقائق، مع `requiresExplicitAcceptance:true` و`orderingEnabled:false`.
- `POST /public/menus/:restaurantSlug/orders/network-test`: يستقبل الجسم نفسه مع `idempotencyKey` فريد للمحاولة و`acceptanceToken` الناتج بعد عرض الـDraft للزبون وموافقته الصريحة. يعيد `orderId` و`totalAmount` و`currency` و`status:"VALIDATED_TEST"` و`replayed` و`orderingEnabled:false`، بلا رابط WhatsApp.
- ترفض الـDTO الحقول غير المعروفة، ومنها أسعار وإجماليات العميل، في أي مستوى مدعوم بواسطة Parser الاختيار من Stage 6A. حدود الطلب: 1–50 سطرًا، 1–100 قطعة لكل سطر، 100 قطعة إجمالًا. تُعاد أخطاء 400/403/409 مهيكلة، بما فيها `lineIndex` ومراجعة التكوين الحالية عند توافرها.

مثال مختصر (تُستبدل `selection` باختيار Stage 5/6A الفعلي):

```json
{"locale":"ar","items":[{"productId":"s6c-pizza","quantity":2,"selection":{"schemaVersion":1,"productId":"s6c-pizza","configurationRevision":1,"groups":[]}}]}
```

لا يُفترض نجاح هذا المثال التوضيحي إذا كانت مجموعة الأحجام/الإضافات مطلوبة؛ يجب إرسال اختيار صالح من الـConfigurator. عند اختلاف السعر بعد `prepare` يرجع `409 NETWORK_ORDER_REQUIRES_NEW_ACCEPTANCE` مع `changedQuote` و`acceptanceToken` جديد؛ لا يُنشأ Order. `accepted:true` وحدها ليست عقد قبول ولا يُسمح بإرسالها. تغيّر Revision أو التوافر أو Capability أو مصدر Linked قد يرجع 409/400/403 وفق نوع الفشل، من دون حفظ طلب.

## المعاملة وإعادة التحقق

تتم `prepare` و`create` داخل Prisma `Serializable` Transaction. تُقفل صفوف Restaurant وSubscription/Feature وصفوف Product الخاصة بالمطعم بـ`FOR SHARE` قبل قراءة Catalog وبناء الـDraft؛ فتتعارض مع تحديثات/حذف SQL العادية أيضًا، لا مع كتابات Serializable وحدها. داخل المعاملة يُعاد تحميل التكوين والسعر والحالة والمصادر، ويمر كل سطر عبر Stage 6A Quote وShared Snapshot؛ تُفحص مراجعات المالك والمصادر، Min/Max وNested وSIZE وIncluded وORIGINAL/CUSTOM والعزل/التوافر. يُعاد حساب سعر الوحدة وضرب الكمية وجمع الإجمالي بدوال Decimal-string/BigInt، مع فحص حدود `DECIMAL(24,6)` بلا تقريب صامت. بعد ذلك فقط يُكتب Order وبنوده ويُختم Snapshot داخل المعاملة نفسها. `40001`/`40P01` سواء ظهرت كـPrisma `P2010` أو `P2034` يعاد التعامل معها بمحاولات محدودة، ثم 409 واضح؛ فشل إدراج بند يُرجع المعاملة كاملة.

الـToken يربط HMAC بمطعم محدد وبـSHA-256 لـDraft كامل: الاختيارات المعيارية، الـRevision، أسعار الأسطر والإجمالي، العملة، الأسماء والبنية والمصادر. لذلك لا يثبت قبول Quote قديمة أو معدّلة. توقيع هذه المرحلة مفتاح عشوائي **لكل عملية تشغيل**؛ انقطاع/إعادة تشغيل الـAPI يبطل Token القديمة. يلزم قرار تشغيلي لمفتاح ثابت وآمن عند تعدد النسخ قبل التفعيل الحقيقي. لم تُحفظ مفاتيح سرية في Git.

`idempotencyKey` مطلوب، ويُربط بالمطعم وHash للطلب الكامل. فهرس PostgreSQL فريد على `(restaurantId,idempotencyKey)`؛ إعادة المحاولة المطابقة تعيد Order نفسه ولو تغيرت Capability بعد إنشائه، بينما يُرفض Payload مختلف. فهرس ثانٍ فريد على `(restaurantId,acceptanceTokenHash)` يمنع استهلاك الموافقة نفسها بمفتاح مختلف. التزامن محمي أيضًا بالمعاملة والقيود الفريدة، وليس React.

## Snapshot ومخطط قاعدة البيانات

Migration إضافية `20261013000000_network_order_test_snapshot` تضيف أعمدة Order nullable: `idempotencyKey`، `requestHash`، `acceptanceTokenHash`، `networkSnapshotSealedAt`، وفهرسين فريدين، وEnum `VALIDATED_TEST`. لا تُغيّر أعمدة الأسعار الموجودة؛ `Order.totalAmount` و`OrderItem.unitPrice/totalPrice` أصلًا `DECIMAL(24,6)`. لا تحذف Legacy أو تغيّر تاريخ Migrations السابق. لم تُطبّق Migration إلا على قاعدتين disposable جديدتين.

في `Order.cartSnapshot` غلاف `snapshotVersion:1`, `mode:NETWORK`, `locale`, `currency`, `totalAmount`, `createdAt`, و`items`. في كل `OrderItem.options` Snapshot للسطر تشمل Product ID/Slug/Name، الكمية، Configuration Revision، Canonical Selection وSelection Key، Revision للمصادر، السعر لكل وحدة والسطر، Breakdown، Tree المالك وTrees/أسماء Linked Sources، ووقت الحفظ. تتضمن الـTrees أسماء الأحجام والخيارات والبنية المتداخلة وCUSTOM، بينما يثبت Breakdown أثر Included Quantity. تظل أسطر المنتج نفسه باختيارات مختلفة مستقلة؛ وORIGINAL المتكرر يحتفظ بـ`instanceId` واختياراته لكل تكرار. لا يُعاد تسعير طلب تاريخي من المنيو الحالية.

تفرض SQL Triggers عدم تعديل الأدلة المالية والوصفية والـSnapshot والهوية بعد الإنشاء، وعدم تعديل/حذف/إضافة بنود Order المختوم، وعدم حذف Order الاختباري. يمكن تغيير `status` لاحقًا من حيث التخزين، لكن **لا توجد عملية إرسال أو انتقال حالة Network في هذه المرحلة**. Trigger مؤجّل يفرض وجود الختم عند Commit. هذه حماية لطلب `NETWORK_TEST` فقط؛ مسار Legacy لا يتغير. Truncate في Fixture قاعدة الاختبار لا يمثل API إنتاجية.

## الملفات المتغيرة

- `apps/api/prisma/schema.prisma`: حقول Order والفهارس والحالة الاختبارية.
- `apps/api/prisma/migrations/20261013000000_network_order_test_snapshot/migration.sql`: الأعمدة والقيود والختم والـTriggers.
- `apps/api/src/modules/orders/network-order-contract.ts` و`.spec.ts`: Parsing وHash وToken واختبارات العقد.
- `apps/api/src/modules/orders/network-orders.service.ts`: البوابة، الأقفال، إعادة التحقق، القبول، Idempotency، الحفظ.
- `apps/api/src/modules/orders/network-orders.controller.ts`: HTTP وحارس loopback.
- `apps/api/src/modules/orders/network-orders.integration.spec.ts`: اختبارات HTTP/PostgreSQL الفعلية.
- `apps/api/src/modules/orders/orders.module.ts`: ربط Controller/Service.
- `STAGE_6C_TRUSTED_ORDERS_REPORT_AR.md` و`CODEX_HANDOFF.md`: التقرير والتسليم (Commit توثيقي منفصل).

## الاختبارات والنتائج

أُنشئت PostgreSQL 16 disposable **جديدة** في `../work/stage6c-postgres-data` على `127.0.0.1:55440`، مع قاعدتي `ordersawa_stage3_stage6c_orders_v3` و`ordersawa_stage3_stage6c_regression_v3`. طُبّق Baseline SQL الاختباري `../work/stage3-full-schema.sql` ثم Migration Stage 6C النهائية باستخدام `psql` داخل القاعدتين فقط. لم يُستخدم `.env` الحقيقي أو قاعدة موجودة أو بيانات مطاعم حقيقية. Prisma Validate نجح وSchema Diff: `No difference detected`.

| الفحص النهائي | النتيجة |
|---|---:|
| Shared Vitest | 21/21 ناجحة |
| API Vitest، Unit + HTTP/DB + Regression | 115/115 ناجحة، 19 ملفًا، 0 متخطاة |
| Web Vitest Regression | 35/35 ناجحة |
| الإجمالي | 171/171 ناجحة، 0 متخطاة |
| Root Typecheck | ناجح |
| Root Build | ناجح؛ Next.js 27/27 مسارًا |
| Prisma Validate وSchema Diff | صالح، بلا اختلاف |

اختبارات API تغطي Pizza بالأحجام/التداخل/Included/الدقة، Combo ORIGINAL/CUSTOM والتكرار، الكميات والمنتج نفسه بتكوينين، التلاعب، تغيّر السعر/Revision/Availability/Capability/Linked Sources، Required غير قابل للتحقيق، عزل المطاعم، قبول السعر الجديد، Idempotency وإعادة المحاولة والتوازي، تحديث Product/Source/Availability/Capability بالتزامن، Rollback، ثبات Snapshot، استمرار Legacy، وإغلاق بوابة الطلب الحقيقي. لا يلزم Browser E2E في 6C ولم يُشغّل. أثناء التطوير كشفت اختبارات التزامن أن PostgreSQL `40001` قد تصل من Prisma كـ`P2010`، فأُضيفت معالجتها وأُعيدت الاختبارات. كما شُدد Trigger Snapshot بعد مراجعة حذف الطلب وتغيير `productId`؛ أُعيد تطبيق Migration النهائية على قاعدتين جديدتين وأُعيدت جميع اختبارات API.

### إعادة الاختبار محليًا

استخدم PostgreSQL **جديدة ومعزولة فقط** على loopback/55440 وباسم يبدأ بـ`ordersawa_stage3_stage6c_`، وطبّق Baseline الاختباري ثم Migration Stage 6C يدويًا على تلك القاعدة؛ لا تستخدم `migrate deploy` أو `db push` على قاعدة موجودة. اضبط `NETWORK_ORDER_TEST_DATABASE_URL` لقاعدة HTTP و`PRODUCT_CONFIGURATION_TEST_DATABASE_URL` لقاعدة Regression disposable منفصلة، و`TEMP`/`TMP` لمجلد محلي خارج Git، ثم شغّل `npm run test:api`. تختبر Suite HTTP فعلية عبر `listen(0,"127.0.0.1")` وتضبط `ENABLE_DISPOSABLE_NETWORK_ORDERS=1` داخل الاختبار فقط. للمراجعة اليدوية، يجب تشغيل API على loopback مع Flag نفسه وقاعدة disposable المستوفية للحاجز، واستدعاء `prepare` ثم عرض Draft وقبولها ثم `create`؛ لا تربط الواجهة العامة بهذه المسارات.

## مخاطر وموانع التفعيل الحقيقي

1. **مانع:** سياسة تقريب العملات حسب العملة لم تُعتمد. التخزين والاختبار بدقة ست منازل فقط، بلا تقريب؛ لا يمكن تعميم Checkout المالي قبل قرار صريح.
2. **مانع:** هذا endpoint مختبري لا يحمل Auth/Rate Policy مستقلة للتشغيل العام، ومفتاح قبول السعر عشوائي لكل عملية لا يصلح للنسخ المتعددة. Stage 6D أو قرار إطلاق منفصل يحتاج عقد قبول نهائي وتخزين مفتاح آمن ودورة حياة واضحة.
3. **مانع:** Stage 6B Cart لم تُربط بإنشاء الطلب ولم يُنسّق WhatsApp Network ولم يُنفّذ Browser E2E كامل. `orderingEnabled:false` باقٍ. لا يمكن إعلان Production Ordering جاهزًا.
4. **مانع:** Migration History لأي قاعدة OrderSawa حقيقية غير مدققة، ولا Initial Migration معتمدة في التاريخ الحالي. لا تُطبق هذه Migration أو Stage 2C على أي قاعدة موجودة دون مراجعة وقرار منفصل.
5. **قيد معماري معتمد:** القراءة الحالية على نطاق Restaurant؛ Business/Outlet differential وService Mode/Scheduling خارج المرحلة. لا يُستنتج توافرها من Snapshot.
6. **تحسين لازم قبل التوسع:** Stage 6A Quote والإنشاء يقرآن Catalog المطعم كاملًا؛ يُحتاج قياس أداء وحد استدعاءات لكل مطعم/منتج وحماية استهلاك قبل الإطلاق. قفل جميع Product rows صحيح لاتساق الاختبار لكنه قد يحد التوازي في المطاعم الكبيرة.
7. **تحسين عرض قبل الإطلاق:** مسارات Dashboard القديمة تحوّل بعض Prisma Decimal إلى JavaScript `Number`؛ ينبغي ألا يُستخدم ذلك لعرض مبالغ Network التاريخية بدقة أو لإنتاج WhatsApp. اعتمد Snapshot strings في Stage 6D.
8. **قيد البيانات التاريخية:** أسماء/لغات العرض محفوظة كما تظهر في Tree وقت الطلب، مع `locale` المطلوبة. يجب اختبار جودة تنسيق العربية/الإنجليزية للرسالة في Stage 6D، دون إعادة تحميل أسماء حية.

Stage 6D المقترحة بعد موافقة مستقلة: ربط السلة بعد موافقة صريحة بالمسار الآمن المناسب للإنتاج بعد حسم الموانع، تنسيق WhatsApp من Snapshot فقط، حالات الطلب/الأخطاء، واختبار Browser E2E. لا تبدأها تلقائيًا. الحالة النهائية المقصودة: Commit التنفيذ `3816efc` ثم Commit توثيق هذا التقرير والـHandoff، وشجرة Git نظيفة؛ راجع `git log -2` و`git status --short` للتحقق من الـHash النهائي.
