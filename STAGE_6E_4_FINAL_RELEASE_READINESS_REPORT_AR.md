# OrderSawa — تقرير Stage 6E.4: عقد Checkout النهائي وجاهزية التشغيل

التاريخ: 2026-10-14. الفرع: `feature/product-configuration-network`. هذه مرحلة إصلاح وتدقيق محلي فقط؛ لم تُستخدم قاعدة OrderSawa الحقيقية، ولم تُنفّذ Migration أو Deployment أو تفعيل للعلم العام أو إرسال WhatsApp.

## الخلاصة والجواب الصريح

**نعم، رحلة Product Configuration + WhatsApp Checkout جاهزة وظيفيًا ضمن الاختبارات المحلية المعزولة، لكنها ليست جاهزة للتفعيل على سيرفر OrderSawa الحقيقي الآن.** العائق الأهم هو غياب تدقيق مخطط قاعدة البيانات وتاريخ ترحيلاتها الحقيقيين؛ لا يجوز افتراض وجود أعمدة Prisma اللازمة. كما يلزم التحقق من إعدادات السيرفر والأسرار ورقم WhatsApp وسياسة عرض مبالغ العملة قبل الإطلاق. لا يُعد Business/Outlet أو POS أو Kitchen أو Delivery Dispatch شرطًا لإطلاق المنيو الحالي.

أُغلقت فجوة Stage 6E.3: طلب `Legacy-only` المباشر إلى Trusted WhatsApp API يُرفض الآن من Backend في `prepare` و`confirm` بعقد ثابت `HTTP 400 / LEGACY_CHECKOUT_REQUIRED`. الواجهة تواصل توجيه Legacy-only إلى Checkout القديم الذي يحفظ `Order` و`OrderItem` وآثار Analytics؛ أما Network-only وMixed فيستخدمان Trusted Prepare/Confirm، ولا يحفظان `NETWORK_TEST` Order.

## 1. عقد Checkout النهائي والإصلاح

| السلة | العلم العام OFF | العلم العام ON | الحفظ |
|---|---|---|---|
| Legacy-only | Checkout القديم | Checkout القديم | Order/Items وآثار Analytics القديمة |
| Network-only | غير متاحة | Trusted Prepare ثم Confirm | لا Order؛ رابط WhatsApp للزبون بعد الموافقة |
| Mixed | غير متاحة | Trusted Prepare ثم Confirm | لا Order؛ لا تُمرر Network إلى Legacy API |

- `POST /public/menus/:restaurantSlug/orders/whatsapp` هو مسار Legacy القائم، ولم يُعدّل في هذه المرحلة.
- `POST /public/menus/:restaurantSlug/checkout/whatsapp/prepare` يقبل Network-only أو Mixed فقط عند تفعيل العلم. بعد فحص كل السطور، يرفض غياب سطر `NETWORK` قبل إنشاء Draft أو تنفيذ استعلامات التسعير.
- `POST /public/menus/:restaurantSlug/checkout/whatsapp/confirm` يطبق الفحص نفسه **قبل** إعادة بناء Draft أو فحص Acceptance Token؛ لذلك لا ينفع تمرير Token مختلطة مع سلة Legacy-only.
- الاستجابة للرفض: `400`، و`error: "LEGACY_CHECKOUT_REQUIRED"`، و`message` و`issues` مهيكلة، دون Token أو رابط WhatsApp أو تفاصيل Prisma. عندما يكون العلم OFF يبقى الرد `403 WHATSAPP_CHECKOUT_DISABLED` قبل تحليل الطلب.
- بقيت مدخلات Legacy في سلة Mixed صالحة؛ أسعارها يعاد تحميلها من `Product.basePrice` الموثوق، وأسعار Network عبر Shared Engine. لم يُغيَّر محرك التسعير أو Legacy endpoint.

الملفان المعدلان في Commit التنفيذ `b82418fc8934491a3929968bf09f2d5ddd60b37c`:

1. `apps/api/src/modules/public-menu/public-whatsapp-checkout.contract.ts` — شرط وجود Network line وعقد الخطأ.
2. `apps/api/src/modules/public-menu/public-whatsapp-checkout.integration.spec.ts` — HTTP regression للمسارين، وتحويل حالات الفحص القديمة إلى Mixed حتى تستمر تغطية السعر، Token، العزل، URL، الملاحظات والكمية.

لا تغيير في Prisma Schema أو Migration History أو الواجهة أو Shared Engine أو Design A.

## 2. نتائج Regression الفعلية

استخدمت PostgreSQL 16.15 جديدة ومؤقتة على `127.0.0.1:55440`، مع قواعد اختبار مستقلة للمجموعات المحروسة. أُنشئ Test Baseline ثم طُبّقت وفُحصت قيود Product `CHECK` الخمس من SQL الرسمي لـStage 2C، وStage 6C SQL الاختباري حيث تتطلبه المجموعة. الحارس المرشح لـDB Completeness طُبّق فقط على قواعد `NETWORK_TEST` المعزولة التي تتطلبه؛ وقواعد no-guard/fake-guard بقيت أو ضُبطت لاختبار الرفض. لا `.env` حقيقي ولا بيانات زبائن حقيقية.

| التحقق | النتيجة |
|---|---|
| Trusted WhatsApp HTTP/PostgreSQL الموجه | **12/12 ناجحة**؛ رفض Legacy-only في Prepare/Confirm، دون Order أو رابط، وبقية Mixed/Network regression |
| API كاملة بعد تهيئة قواعدها وأعلامها الاختبارية | **202/202 ناجحة، 26/26 ملفات، 0 فاشلة، 0 متخطاة**؛ يشمل Suites التي كانت متخطاة سابقًا |
| Shared | **21/21 ناجحة** |
| Web | **41/41 ناجحة** |
| Root Typecheck | ناجح |
| Root Build | ناجح؛ Next بنى **27/27** صفحة |
| Prisma validate وdiff مقابل Disposable كاملة | ناجح؛ `No difference detected` |
| Chrome/Nest/Next — العلم ON | **13/13 checkpoints**: Legacy persist مرة واحدة وAnalytics، Network/Mixed، Pizza/Combo، Cart reload/edit/delete، ملاحظات، تغير سعر 409 وإعادة قبول، رابط WhatsApp صحيح دون فتح/إرسال فعلي |
| Chrome/Nest/Next — العلم OFF | **4/4 checkpoints**: Legacy القديم يحفظ Order، Trusted API ترفض، Network/Mixed محجوبتان |
| Dashboard Chrome/Nest/Next | **6/6 checkpoints**: Network setup والحماية والحفظ وإعادة الفتح وLegacy zero وRTL/390px |
| HTTP مباشر على Nest مع العلم ON | Legacy-only Prepare وConfirm: **400 `LEGACY_CHECKOUT_REQUIRED`**، بلا Token أو URL |

الـBrowser checkpoints ليست 23 سيناريو Browser مستقلة، ولا نعدّ HTTP/Unit بديلاً عن كل سيناريو بصري. الصور المحلية خارج Git: `../work/stage6e2-mixed-cart-mobile.png` و`../work/stage6e1a-dashboard-mobile.png`. اعتراض `window.open` في Runner منع التواصل مع WhatsApp. في أول تشغيل API كامل فشلت ثلاث حالات بسبب إعداد Fixture فقط: علم `NETWORK_TEST` لم يكن مضبوطًا لمجموعة Audit، وقاعدة fake-guard احتوت الحارس الحقيقي. صُححت **بيئة الاختبار المؤقتة فقط** وأُعيدت المجموعة كاملة بنتيجة 202/202؛ لم تُخفَّف حواجز التطبيق. أُوقف Nest وNext وPostgreSQL بعد الفحص، و`pg_isready` أعاد `no response`.

## 3. مراجعة الأمان والتوافق

- Prepare/Confirm يعيدان تحميل Restaurant/Subscription/Capability/Products وWhatsApp destination من قاعدة البيانات داخل Serializable؛ Network يُسعّر بـShared Engine، وLegacy داخل Mixed من Base Price الفعلي. المبلغ المرسل من العميل يُرفض. اختيار أو Revision أو Linked Source غير صالح/غير متاح يُرفض. لا `null → 0` ولا اعتماد على السعر المخزن في Browser.
- Confirm يعيد البناء من جديد ويطابق HMAC Token مع `restaurantId` وDigest الطلب والـDraft ووقت انتهاء 10 دقائق. تغير السعر أو البيانات أو الطلب ينتج `409 WHATSAPP_CHECKOUT_REQUIRES_ACCEPTANCE` مع Draft جديد؛ لا يُعاد استخدام URL قديم. Browser يغلق نافذة WhatsApp عند الفشل ولا يستخدم fallback سعريًا.
- رقم WhatsApp الرسمي يؤخذ من Restaurant/Branch الحالية مع فحص الصيغة؛ الرسالة التاريخية لهذا الـDraft تُركّب من بيانات موثوقة، وتُرفض الروابط الطويلة بدل قطعها. لا يتم إرسال الرسالة من السيرفر.
- Tenant isolation وCapability وAvailability وNetwork/Legacy boundary وFeature Flag جرى اختبارها في API وBrowser. بقيت `/orders/network-test/*` مستقلة ومحروسة ولم تُستخدم في Checkout العام. `orderingEnabled:false` لم يتغير.
- لم يُضف تسجيل لاسم/هاتف الزبون أو ملاحظاته؛ مع ذلك تحتوي استجابة Prepare/Confirm والرابط النهائي على بيانات شخصية، ويلزم ضبط سياسات سجلات Proxy والمتصفح والاحتفاظ بها قبل التفعيل.
- Rate Limiting الحالية ذاكرة داخل العملية: الافتراضي `120` طلب كتابة/دقيقة/IP و`300` عام/دقيقة/IP، و`TRUST_PROXY` يؤثر في تحديد IP. لا يمكن عدّها حماية موزعة إن كان هناك أكثر من API instance. لم تتوفر ملفات Deployment تثبت عدد النسخ أو بنية الـProxy، فلا نفترض Single-instance.
- توجد نافذة طبيعية بعد Confirm وقبل أن يرسل الزبون الرسالة بنفسه؛ لا يوجد Order محفوظ للـNetwork/Mixed ولا ضمان إعادة التحقق لحظة الإرسال البشري. يجب قبول هذه الدلالة التشغيلية صراحةً للمنيو + WhatsApp.

## 4. جاهزية قاعدة البيانات والترحيلات

فحصت `apps/api/prisma/schema.prisma` وSQL المحفوظة في Git فقط. **لم يُفحص Migration History أو Schema في قاعدة OrderSawa الحقيقية.** تتطلب الشبكة Stage 2C Product fields/قيودها وفهرس التبعيات، والتحقق من ترحيلها على القاعدة الفعلية يحتاج إذنًا وتدقيقًا منفصلين.

تجربة سلبية مهمة على Disposable **Stage2C-only** (من دون Stage6C SQL): عمود `Order.idempotencyKey` غير موجود، بينما Prisma Client الحالي يتوقعه. فشل `prisma.order.findMany({ take: 1 })` بـ`P2022`. أظهر Prisma diff أيضًا أعمدة Stage6C الأربعة (`idempotencyKey`, `requestHash`, `acceptanceTokenHash`, `networkSnapshotSealedAt`) وفهرسين فريدين وحالة `VALIDATED_TEST`. هذا لا يعني أن Checkout WhatsApp العام يحتاج حفظ Network Order أو حارس DB Completeness؛ **بل يعني أن Binary التطبيق الحالي لا يمكن افتراض توافقه مع مخطط يفتقد أعمدة Order تلك، وقد تتأثر قراءة/حفظ Legacy Order**. يجب تدقيق قاعدة النشر الفعلية ثم اعتماد خطة Schema reconciliation أو فصل هذا الاعتماد قبل التفعيل. لا يجوز تطبيق Stage6C SQL التجريبي أو Candidate Guard على قاعدة حقيقية تلقائيًا. تاريخ Initial Migration غير مكتمل في المستودع، فلا يكفي `migrate deploy` دون مطابقة التاريخ الفعلي.

## 5. موانع التفعيل الحالي — مرتبة حسب الأولوية

### A — Blocking for Current WhatsApp Launch

1. **تدقيق DB/Migration History الفعلي بموافقة مستقلة**، وإثبات وجود Stage2C Product schema والحقول التي يتطلبها Prisma Client الحالي أو اعتماد ترحيل/تعديل متوافق. فشل Disposable Stage2C-only دليل ملموس على الخطر؛ لا استنتاج بشأن وضع Production الفعلي.
2. **تحديد Deployment الفعلي**: عدد API instances، Ingress/Proxy، أسلوب توزيع الأسرار وبيئة Web/API، مع التأكد من public routing وCORS/hosts و`TRUST_PROXY`. ملفات Git المحلية (`docker-compose.yml`/README/Runbook) ليست إثباتًا لتكوين السيرفر الجاري.
3. **توفير مفتاح HMAC عام مستقل وسري** (`PUBLIC_WHATSAPP_CHECKOUT_HMAC_KEY`، hex عشوائي 32 byte على الأقل ومتطابق بين كل instances)، وسياسة تخزين/تدوير تمنع إبطال موافقات نشطة بلا تخطيط. المفتاح فارغ في `.env.example` عمدًا؛ لا تضعه في Git.
4. **التحقق من إعدادات المطاعم الحقيقية**: رقم WhatsApp الدولي الرسمي، `CART_ORDERING`/`WHATSAPP_ORDERING`/`PRODUCT_CONFIGURATION` حيث يلزم، حالة الاشتراك، `publicUi.whatsappOrderingEnabled`، المنتجات والشبكات المهيأة، وفشل آمن عند غيابها. لا تُستخدم بيانات حقيقية قبل إذن منفصل.
5. **قرار المؤسس حول عرض/تقريب العملة عند الإرسال الفعلي**: الحساب Decimal string دقيق حتى ست منازل؛ قد تظهر ست منازل في الرسالة. لم تُعتمد سياسة عرض نهائية، ولا يجوز فرض تقريب من تلقاء أنفسنا. مطلوب تحديد عملات المطاعم الفعلية ومتطلبات العرض قبل إطلاقها للعملاء.
6. **مراجعة نشر/رجوع Feature Flag**: إبقاء `ENABLE_PUBLIC_NETWORK_WHATSAPP_CHECKOUT=0` حتى اكتمال البنود السابقة واختبار staging على مخطط مماثل؛ لا تبديل العلم في هذه المرحلة. يجب إثبات أن Legacy-only يظل يحفظ Order سواء كان العلم OFF أو ON.

### B — Recommended but Not Blocking for Current Single-instance Deployment بعد التحقق من أنه Single-instance

- ضبط/مراقبة Rate Limits وخطأ `429` واختبار IP الحقيقي خلف Proxy؛ الحماية الحالية per-process وليست موزعة. إذا ظهر أن النشر متعدد النسخ أو حركة عالية، يُعاد تصنيفها إلى مانع يحتاج تصميمًا مناسبًا.
- ضبط سياسة سجلات Proxy وPII، وMonitoring للأخطاء `400/403/409/429/503` دون تسجيل أرقام العملاء أو الملاحظات أو Tokens.
- تجربة قبول من متصفح هاتف حقيقي ولغات المطاعم الفعلية، وفحص حد طول WhatsApp URL والتعامل مع انتهاء الموافقة وتغير السعر. لا تُعد نسخة Browser المحلية SLA للإنتاج.
- قياس تكلفة تحميل Catalog كامل وقفل جميع Product rows في Prepare/Confirm؛ لم يثبت أنها مانع مالي/أمني للمنيو الحالي، لكنها دين أداء معروف عند اتساع الكتالوج أو التزامن.

### C — Future Order/Delivery Infrastructure وليست شروطًا لهذا الإطلاق

Business Catalog/Outlet Differential، POS/Kitchen/Dispatch، أرقام طلبات تجارية لـNetwork، Delivery Fees/Taxes/Discounts جديدة، إرسال WhatsApp آلي، حفظ Orders للشبكة/السلة المختلطة، Design A وDB Completeness Guard وImmutable Order Snapshots التشغيلية، وتحسين Dependency Closure/FOR SHARE. لا تُبنى أو تُفعّل ضمن Stage 6E.4.

## 6. الإعدادات وخطوات التفعيل المقترحة للمراجعة فقط

راجعوا على السيرفر، دون نشر أو تغيير الآن: `DATABASE_URL` و`DIRECT_URL` مع مخطط موثّق؛ `API_ORIGIN`/`WEB_ORIGIN`/`CORS_ORIGINS`/`ROOT_DOMAIN` و`NEXT_PUBLIC_API_URL`/`NEXT_PUBLIC_WEB_URL`؛ `TRUST_PROXY` وفق الـIngress؛ حدود الطلبات؛ رقم المطعم/الفرع الرسمي؛ والباقة/Capability. العلم العام يبقى `0`، والمفتاح HMAC خارج المستودع. لا تعتمدوا على `.env.example` كنص أسرار جاهز ولا تتبعوا إرشاد `db push` القديم في README/Runbook على قاعدة قائمة.

قائمة تحقق قبل أي موافقة لاحقة: (1) تفويض Read-only لتاريخ ومخطط DB الحقيقي أو نسخة موثوقة منه؛ (2) خطة SQL ومراجعة Backups/Rollback منفصلة؛ (3) معرفة topology وProxy/secret store؛ (4) قرار عرض العملة؛ (5) اختبار Staging ببيانات غير حقيقية وFlag OFF ثم ON بموافقة؛ (6) تأكيد Legacy Order/Analytics وNetwork/Mixed URL؛ (7) خطة Monitoring/Rollback وقرار المؤسس بتفعيل العلم. **هذه قائمة مراجعة، لم يُنفذ منها شيء على Production.**

## 7. الأساس المستقبلي والدين المتبقي

بقيت دون تغيير: Shared Engine، Network Cart، Design A atomic `NETWORK_TEST` creation، Idempotency وAcceptance Tokens، Immutable Snapshots، DB Completeness Guard المرشح المعزول، WhatsApp Snapshot Formatter، APIs الاختبارية، Benchmark/PoC scripts. لم تُلغَ ضمانات loopback/Disposable/`NODE_ENV`/Feature Flag، ولم يُغيّر Full Catalog loading أو `FOR SHARE` أو معاملات Serializable.

المخاطر التشغيلية الباقية: Catalog كامل وقفل صفوف غير مرتبطة على مسار Prepare/Confirm العام؛ قابلية `409` تحت تحديثات متزامنة؛ Race/throughput والتكلفة على كتالوجات كبيرة؛ مخاطر الاعتماد على URL مفتوح لدى الزبون بعد تغير القائمة؛ محدودية Rate Limiter per-process. لا يُخلط قياس Guard على طلبات `NETWORK_TEST` ذات 50 line مع تكلفة WhatsApp العام الذي لا يحفظ Order.

## 8. Git والتوقف

- Commit الإصلاح والاختبار: `b82418fc8934491a3929968bf09f2d5ddd60b37c`.
- تقرير Stage 6E.4 وهذا تحديث التسليم: Commit توثيق مستقل لاحق؛ يرجع `git log -1 --format=%H` بعد الحفظ إلى Hash النهائي.
- جرت مراجعة `git diff --check` وفحص إضافات Git بحثًا عن أسرار؛ لا `.env` أو Credentials أو Logs أو بيانات تشغيلية ضمن الملفات المحفوظة. حالة Git النهائية يثبتها `git status --short --branch` بعد Commit التوثيق.
- **نقطة التوقف:** لا Production DB أو Migration أو Deployment أو تفعيل علم أو إرسال WhatsApp. انتظر موافقة مؤسس جديدة على خطوات الإطلاق المحددة.
