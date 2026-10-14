# OrderSawa — التسليم التقني النهائي لشبكة تكوين الأصناف (Stage 6F.2)

**الجمهور:** محادثة/فريق Dashboard V2. **النطاق:** وصف ما في مستودع `menu-main` فعليًا حتى Stage 6F.1؛ لا يُعد هذا التقرير تصميم دمج معتمدًا أو إذنًا بالنشر. **الفرع:** `feature/product-configuration-network`. **نقطة الشيفرة المفحوصة:** `76e593d` (تسليم 6F.1؛ تنفيذ العملة `0b3d283`). Commit هذا التقرير وثيقتان و`CODEX_HANDOFF.md` فقط، ويُعرف بعد الحفظ بـ`git log -1 --format=%H`؛ لا يمكن كتابة Hash الـCommit داخل محتواه نفسه. كانت الشجرة نظيفة قبل 6F.2. لم يُفحص مصدر Dashboard V2 الأحدث في مساحة العمل، ولا قاعدة Production أو سيرفرها.

## 1. مصادر السلطة وترتيب القراءة

قرأت `CODEX_HANDOFF.md` وتقارير المراحل المحفوظة في الجذر من Stage 3 إلى 6F.1، مع تاريخ Stage 0–2C في التسليم و`docs/product-configuration-stage2c-runbook.md` وSQL الرسمية، ثم طابقت النقاط الأساسية مع Source Code. مرجعا القرار الأصليان خارج Git في `../work/product-network-pack/OrderSawa_Product_Network_Codex_Pack/AUTHORITATIVE_RULES/`: `LATEST_FOUNDER_DECISION_LEDGER_V2_CURRENT.md` (V62.4) و`CURRENT_SUPERSESSION_AND_CONFLICT_RULES.md`. يجب نقل هذين المرجعين مع هذه الوثيقة للمحادثة الجديدة؛ التقرير لا يحل محل النص المعتمد. `02_IMPLEMENTATION_WORKFLOW_AR.md` ومصفوفة القبول في الحزمة سياق تنفيذ، لا يتغلبان على قرار مؤسس أحدث أو طلب محدد أحدث. كذلك قرار Stage 6F.1 الصريح يحسم عملات المنيو الحالي: SYP صحيح فقط، EUR/USD/AED منزلتان للعرض.

الأولوية عند التعارض: قرار المؤسس الأحدث → قواعد supersession الحالية → العقود المطبقة واختباراتها. **V62.4 معمارية مستقبلية معتمدة؛ Backend هذا الفرع لا ينفذها.** قرار المؤسس اللاحق للمنيو الحالي يحصر هدف الإطلاق في Restaurant Electronic Menu + WhatsApp Checkout، ولا يجعل Business/Outlet أو POS/Kitchen/Delivery شرطًا له. مثال supersession مهم: Market تحدد العملات المسموحة وBusiness تختار واحدة منها؛ قاعدة Market-fixed القديمة متجاوزة. عند انتقال سلسلة إلى Outlet واحدة **لا** تُسطّح طبقة الـOutlet إلى Business ولا تُعاد كتابة IDs.

محطات Git التي ينبغي الاستناد إليها عند المقارنة: Shared Stage 1 `698e8e8`؛ SQL/Backfill Stage 2C `6d92288`؛ Admin Stage 3/3.1 `5fe7b82`/`2507720`؛ Dashboard Stage 4/4.1 `77ef9da`/`1925791`؛ Public Stage 5 `1a97529`؛ Quote 6A `55b5dc9`؛ Cart 6B `4ec4c14`؛ test Orders 6C `3816efc`؛ Design A التجريبي 6D.3C3F `8f117f3`؛ حماية Setup 6E.1A `f152b06`؛ Mixed WhatsApp 6E.2 `ec9e6ec`؛ إصلاح Legacy 6E.3/6E.4 `552b7dd`/`b82418f`؛ سياسة العملة 6F.1 `0b3d283` وتسليمها `76e593d`. التقارير المحفوظة في الجذر توضح Commits التوثيق والتجارب الوسيطة.

## 2. خريطة الحالة: المنفذ، المحروس، وغير المنفذ

| الطبقة | الوضع في هذا المستودع | مصدر الحقيقة / الحد |
|---|---|---|
| Shared V1 Tree/Selection/Validation/Pricing/Minimum/Snapshot | **منفذ ومختبر محليًا** | `packages/shared/src/product-configuration/`؛ الأموال نصوص Decimal وBigInt |
| Prisma Product/Dependency وAdmin حفظ ذري | **منفذ في الشيفرة وSQL رسمية محفوظة** | `apps/api/prisma/schema.prisma` وStage 2C؛ **تطبيقها على Production غير معلوم** |
| Dashboard Editor و`NETWORK_SETUP` | **منفذ ومختبر محليًا** | Dashboard الحالي، وليس Dashboard V2؛ Setup شجرة Network حقيقية غير مسعّرة وغير متاحة |
| Public Configurator وServer Quote وسلة Legacy/Network | **منفذ ومختبر محليًا** | Quote من Backend؛ Local Storage تلميح/مسودة فقط |
| Legacy WhatsApp فقط | **المسار القديم المحفوظ** | يحفظ Order/Items وAnalytics؛ شيفرة هذا الفرع تحافظ عليه، لكن حالة Production الفعلية غير مدققة |
| Network-only/Mixed Trusted WhatsApp | **منفذ لكن غير مفعّل في Production** | Prepare/Confirm عام مستقل؛ العلم OFF افتراضيًا؛ لا يحفظ Order |
| `NETWORK_TEST` Prepare/Create/Preview وDesign A/DB Guard | **أساس مستقبلي اختباري معزول** | Loopback/Disposable/non-Production فقط؛ ليس Checkout العام |
| Business Catalog/Outlet Differential/Effective Product/Market/Service Mode/Schedule/Dashboard V2 | **قرارات مستقبلية؛ غير منفذة في Backend الحالي** | لا تفترض توافقًا مباشرًا مع محرر أو DB V2 |
| POS/Kitchen/Dispatch وإرسال WhatsApp من السيرفر | **غير منفذ وغير مطلوب للمنيو الحالي** | المتصفح يفتح رابطًا؛ الزبون يرسل بنفسه |

## 3. المعمارية الحالية وعقود Shared

### حدود المطعم والبيانات

`Product.restaurantId` و`Restaurant` هما نطاق المنتج والسلة وCapability حاليًا؛ `Branch` يوفر سياقًا محدودًا لرقم WhatsApp وبعض الطلبات، **وليس** Outlet Differential Catalog. `Product` يحمل `basePrice Decimal? @db.Decimal(24,6)` و`configurationTree Json?` و`configurationVersion Int`. الوضع Legacy البنيوي: Tree = SQL NULL وVersion = 0 وBase غير NULL؛ Network: Tree V1 محفوظة وVersion > 0 ويجب أن يطابق Base في SQL قيمة Tree، مع بقاء الفرق بين `null` و`"0"`. لا تستخدم `Number(null)` ولا تنسخ Legacy Options إلى مسار تسعير موازٍ. `ProductOptionGroup`/`ProductOption` باقية للتوافق؛ Stage 2C Backfill أداة منفصلة لا تُشغَّل تلقائيًا.

العقد المرجعي في `packages/shared/src/product-configuration/types.ts` هو `ProductConfigurationV1={schemaVersion:1,productId,revision,basePrice:string|null,groups}`. توجد مجموعات `SIZE` متعددة (لا افتراض لمجموعة واحدة) بأسعار **كاملة** لكل Size وليست `priceDelta`، و`OPTIONS` بحدود `min/max/includedQuantity`؛ للـOption سعر و`minQuantity/maxQuantity` و`priceOverrides` حسب Size، وتوجد `children` متداخلة. اختيار العميل `ProductSelectionV1` يحمل `configurationRevision` و`GroupSelection`، ولكل وحدة خيار `instanceId` مستقل؛ لذلك يمكن تكرار Linked Product في Combo باختيارات مختلفة دون دمجها. Stable Node IDs هي هوية العقد؛ لا تُعد تسمياتها مفاتيحًا.

`ORIGINAL` يحل بنية المصدر الحية مع `originalPriceOverrides` في سياق الأب، ولا يرث سعر بيع المصدر المستقل؛ أي عقدة مسعرة بلا Override في سياق الأب تعطي مساهمة صفرًا وفق العقد، **لكن المصدر نفسه لا يجوز أن يكون مفقودًا أو غير قابل للربط**. `CUSTOM` يحفظ `customConfiguration` محلية صريحة، مع استمرار فحص هوية المصدر وتوافره. Legacy source مع ORIGINAL يحتاج أولًا Network Configuration محفوظة؛ Legacy source مع CUSTOM مسموح بشروط Snapshot، دون تحويل المنتج القديم. تشمل Validation منع self/deep cycles وcross-restaurant والمصادر الناقصة والحدود. يحسب `includedQuantity` إعفاء أغلى N وحدات **الأب** المختارة، ويبقي أسعار children مدفوعة إن وجدت. وجود أي Size يجعل Base متجاهلة عند التسعير، لا محذوفة من البيانات.

خريطة محرك Shared: `validation.ts` لصحة البنية والحدود، `dependencies.ts` للحواف/الدورات، `resolution.ts` لمصادر Linked، `selection.ts` للاختيار والمفتاح المستقر، `pricing.ts` للـBreakdown والإجمالي، `minimum-price.ts` للقابلية والسعر الأدنى، `snapshot.ts` للتمثيل التاريخي، `money.ts` للحساب الدقيق. الحدود الافتراضية: عمق 12، عقد 1000، خيارات المجموعة 100، كمية المجموعة 100، نسخ اختيار 500، Scale نقدي 6، حالات Minimum Price 20000. تعرض `PriceLine` نوع BASE/SIZE/OPTION و`amount/chargedAmount/included/path`؛ لا يجوز اشتقاق سعر الطلب من React أو `priceDelta` قديم.

### العملة من Stage 6F.1

`packages/shared/src/currency-policy.ts` فصل العرض عن الحساب. SYP والاسم التاريخي `ل.س`: أي جزء كسري غير صفري مرفوض Backend، لذلك `12500.000000` صالح و`12500.50` مرفوض، بلا تقريب أو حذف. التحقق يمر على Base وSizes وOptions وOverrides وCUSTOM nested، وعلى كتابة Legacy/Import/Quick Price، ويمنع منتج SYP قديمًا كسريًا من Public/Checkout بدل تعديل بياناته. EUR/USD/AED تُعرض بمنزلتين بـDecimal-safe `HALF_UP` **للعرض فقط**؛ الأسعار المحفوظة وQuote وHMAC/Snapshot تبقى بدقة ست منازل. قد يختلف مجموع السطور المقربة عن الإجمالي المقرب؛ `currencyDisplayReconciliation` يعرض الفرق صراحةً ولا يغير المال. لا سياسة مستحدثة للعملات الأخرى. عرض Legacy القديم خارج هذه العملات حافظ على سلوكه السابق حيث لزم؛ أي مستهلك خارجي لـAnalytics `totalAmount` النصي يحتاج فحصًا.

## 4. خريطة الوحدات والـAPI القابلة لإعادة الاستخدام

| وظيفة/عقد | ملفات فعلية | العقد والحد المفتوح |
|---|---|---|
| شجرة، اختيار، تسعير، Snapshot | `packages/shared/src/product-configuration/{types,validation,dependencies,resolution,selection,pricing,minimum-price,snapshot,money}.ts` | قابلة لإعادة الاستخدام إذا زُوّد المحرك بـ**كتالوج فعال وسياق هوية صحيح**؛ API المال `string` |
| سياسة العملة | `packages/shared/src/currency-policy.ts`، `apps/web/src/lib/currency-display.ts` | قواعد العرض الحالية؛ Business currency/Market validation ستحتاج Adapter مستقبليًا |
| Product/Dependency ومخطط DB | `apps/api/prisma/schema.prisma`، `apps/api/prisma/migrations/20261012000000_product_configuration_network/migration.sql` | Restaurant FKs/قيود؛ تحتاج تصور نقل/تكييف قبل Business/Outlet |
| كتابة Tree ذرية | `apps/api/src/modules/products/product-configuration.persistence.ts` | Serializable: صلاحية Capability، مال المطعم، ملكية/Version، Linked source، Cycle، Tree/Base/Version ثم استبدال Dependency edges في معاملة واحدة |
| Admin | `apps/api/src/modules/products/{products.controller,products.service,product-configuration.service,network-setup-configuration}.ts` و`dto/update-product-configuration.dto.ts` | JWT + RestaurantContext + صلاحية `product.configuration.manage` + Capability، 400/403/409 مهيكلة |
| محرر Dashboard الحالي | `apps/web/src/components/dashboard/product-form.tsx` و`product-configuration/{product-configuration-editor,configuration-workspace,editor-model,configuration-preview,api,demos}.tsx/.ts` | Tree/Inspector RTL/Preview Shared/Demos/مسودة محلية؛ لا تنقل إلى V2 حرفيًا قبل مراجعة Source V2 |
| Public Configurator/Quote | `apps/api/src/modules/public-menu/{public-menu.controller,public-menu.service,public-product-configuration,public-product-quote}.ts` و`apps/web/src/components/public/{product-configurator,product-configurator-model}.tsx/.ts` | حاليًا Restaurant scope؛ لا Outlet/Mode/Schedule |
| سلة موحدة وTrusted WhatsApp | `apps/web/src/components/public/{cart-model,public-menu-client,trusted-whatsapp-checkout}.ts/.tsx`، `apps/api/src/modules/public-menu/{public-whatsapp-checkout.contract,public-whatsapp-checkout.service}.ts` | Local Storage V2 ليس سلطة سعر؛ Mixed draft يعيد تحميل الكتالوج؛ علم عام مستقل OFF |
| تنسيق الرسالة | `apps/api/src/modules/orders/network-order-whatsapp-formatter.ts` و`network-order-whatsapp-preview.ts` | Formatter تاريخي من sealed Snapshot؛ helper مشترك للـTrusted WhatsApp Draft؛ لا قراءة حية للـSnapshot التاريخية |
| أساس Orders المستقبلي | `apps/api/src/modules/orders/{network-order-contract,network-orders.controller,network-orders.service,network-order-db-guard}.ts`، Stage 6C SQL، Candidate Guard في `scripts/` | `NETWORK_TEST` فقط، ليس عقد إطلاق WhatsApp |

عقود HTTP الأساسية من Controllers/Services الحالية:

| المسار | Request/Response المهمة | الحماية/النتيجة |
|---|---|---|
| `POST /dashboard/products` مع `configurationIntent:"NETWORK_SETUP"` | Product جديد بشجرة `{schemaVersion:1,productId,revision:1,basePrice:null,groups:[]}`، Version 1، Base NULL، `isAvailable=false` | ينكر Base تمهيدية؛ هذه شجرة صالحة البنية لكنها `MISSING_PRICE_SOURCE` وغير قابلة للبيع؛ أول PUT يتوقع 1→2 |
| `GET /dashboard/products/:id/configuration` | `{mode,configurationVersion,configurationTree,basePrice,isAvailable,capability,orderabilityState}` | قراءة في المطعم؛ على فقد Capability تبقى البيانات، لكن لا كتابة/تفعيل |
| `PUT /dashboard/products/:id/configuration` | `{expectedVersion,configuration}` و`configuration.revision=expectedVersion+1` | Validation Shared وCurrency؛ 400 issues، 403، 409 Version/Linked/Cycle؛ تحديث Tree/Base/Dependency واحد ذريًا، ولا يغير `isAvailable` عند الحفظ العادي |
| `GET /public/menus/:slug/products/:id/configuration` | Tree/Linked summary/Minimum و`orderable` | `previewOnly:true` و`runtimeContext.scope:"RESTAURANT"`؛ المنتج المخفي/غير المسعر ليس orderable |
| `POST /public/menus/:slug/products/:id/quote` | `{selection:ProductSelectionV1}` → `canonicalSelection,selectionKey,trustedTotal,priceBreakdown,linkedSourceRevisions` | يرفض أسعار العميل/Revision قديمة/اختيار غير صالح؛ الرد يحتفظ تاريخيًا بـ`previewOnly:true,orderAction:"STAGE_6_REQUIRED",orderingEnabled:false`؛ هذه ليست رخصة لتجاوز Checkout |
| `POST /public/menus/:slug/orders/whatsapp` | DTO Legacy المعتاد | Legacy فقط؛ يحفظ Order/Items/Analytics، ويرفض Network بنيويًا |
| `POST /public/menus/:slug/checkout/whatsapp/prepare` | `locale` وحقول العميل المعتمدة و`items[1..50]` Legacy/Network؛ سقف 100 وحدة؛ Network `selection` و`expectedLinkedSourceRevisions?`، و`expectedUnitPrice?` للمقارنة فقط | **يشترط وجود Network line**؛ Legacy-only المباشر `400 LEGACY_CHECKOUT_REQUIRED`؛ يعيد `draft,messagePreview,acceptanceToken` لمدة 10 دقائق بعد إعادة تسعير DB |
| `POST /public/menus/:slug/checkout/whatsapp/confirm` | `{request,acceptanceToken}` → `draft,message,whatsappUrl` | يعيد البناء داخل Serializable؛ التغيير/انتهاء الموافقة `409 WHATSAPP_CHECKOUT_REQUIRES_ACCEPTANCE` مع Draft جديدة **بلا URL**؛ لا Order جديد؛ Flag OFF = 403، مفتاح مفقود = 503 |
| `/public/menus/:slug/orders/network-test/{prepare,POST, :id/preview}` | Draft/إنشاء/Preview من Order مختومة | **تجريبي محروس فقط**، منفصل عن Checkout الحالي |

حقول تفاصيل الطلب المعتمدة: `customerName`, `customerPhone`, `fulfillmentType` pickup/delivery، `deliveryArea`, `deliveryNear`, `deliveryBeside`, `pickupTime`, `orderNote`, `items[].note`. تتبع شروط Legacy UI الحالية: Delivery يحتاج أجزاء العنوان الثلاثة، وPickup قد يحدد الوقت؛ الهاتف غير إلزامي بقرار جديد. لا رسوم توصيل/ضريبة/خصم مستحدثة. `whatsappUrl` يُكوّن لرقم المطعم/الفرع الرسمي ولا يُقص إذا تجاوز 8192 حرفًا؛ الزبون هو من يرسل الرسالة. يجب التعامل بحذر مع PII في Preview والرابط والـProxy Logs.

## 5. ما يحدث حاليًا عند Checkout

| نوع السلة | Flag `ENABLE_PUBLIC_NETWORK_WHATSAPP_CHECKOUT=0` | Flag `=1` بعد موافقة تشغيل مستقلة | حفظ Order/Analytics |
|---|---|---|---|
| Legacy-only | Checkout القديم | Checkout القديم نفسه | نعم: Order/Items وحدث `WHATSAPP_ORDER_CLICKED`، بلا نسخ إضافية |
| Network-only | محجوبة بأمان | Trusted Prepare → موافقة صريحة → Confirm → رابط `wa.me` | **لا**؛ لا تستعمل `NETWORK_TEST` |
| Mixed Legacy + Network | محجوبة بأمان | المسار Trusted نفسه، مع مصدر سعر مختلف لكل نوع | **لا**؛ لا يُحوَّل Legacy إلى Network ولا العكس |

Web يستخدم `shouldUseTrustedWhatsappCheckout` فقط إذا وجد Network وسُمح بالعلم. `NetworkCartItem` يحمل `lineId/identity/restaurantSlug/productId/selection/configurationRevision/acceptedQuote/proposedQuote/linkedSourceRevisions/status/note`؛ identity تجمع المطعم والعملة والمراجعة وSelectionKey ومراجعات المصادر وسياق Runtime. التخزين محلي لكل مطعم، لكن كل Prepare/Confirm يعيد قراءة الأسعار والأسماء والتوافر من قاعدة Backend؛ `expectedUnitPrice` لا يصبح مصدر حقيقة. التغيير المؤثر يطلب قبولًا جديدًا؛ لا fallback إلى رسالة من Local Storage عند فشل API. Legacy Checkout القديم أعيد إلى حفظه وتحليلاته في Stage 6E.3، وحُسم تجاوز Legacy-only المباشر للـTrusted API في 6E.4.

Checkout العام يأخذ كل Product في Restaurant ويحجز صفوفها بـ`FOR SHARE` داخل Serializable **مرتين** (Prepare وConfirm) لإعادة فحص Linked والتوافر والسعر. مفاتيحه `ENABLE_PUBLIC_NETWORK_WHATSAPP_CHECKOUT` (OFF افتراضيًا) و`PUBLIC_WHATSAPP_CHECKOUT_HMAC_KEY` (hex سري ≥32 byte). يتطلب `CART_ORDERING` و`WHATSAPP_ORDERING` و`PRODUCT_CONFIGURATION` عندما توجد Network، واشتراكًا نشطًا/تجريبيًا وإعداد واجهة WhatsApp ورقمًا رسميًا. يوجد Rate Limiter ذاكرة لكل API process، لا ضمان موزع. `NETWORK_TEST` له علم وحواجز مختلفة ولا يجوز استعماله كاختصار لتفعيل هذا المسار. تبقى نافذة زمنية بعد Confirm وقبل ضغط الزبون «إرسال» في WhatsApp؛ لا توجد Order محفوظة لتثبيت السعر في هذه الفترة.

## 6. أساس Orders المستقبلي — لا تخلطه بالـWhatsApp العام

Stage 6C أضافت اختبار `NETWORK_TEST` فقط: `network-orders.service.ts` يعيد بناء Draft من المصدر الحي بـShared Engine داخل PostgreSQL Serializable، يتحقق من Revision/Capability/Availability/Linked ومن قبول HMAC، ثم ينشئ Order وOrderItems و`cartSnapshot` تاريخية. Stage 6D.3C3F دمجت **Design A**: INSERT مكتملة دون Read-Before-Insert لمفتاح Idempotency أو Acceptance، مع UNIQUE `(restaurantId,idempotencyKey)` و`(restaurantId,acceptanceTokenHash)`, ربط `requestHash`, ختم Snapshot، ثم فرض Constraint الحارس المسمّى IMMEDIATE وفحص مستقّل بعد Commit ضمن المطعم. `P2002` لا يعني Replay تلقائيًا؛ لا ترجع Order قديمة إلا بعد مطابقة tenant/key/request/token/source/seal/Snapshot. Prisma 5.22.0 قد تُرجع قيمة callback رغم فشل Deferred COMMIT؛ لذلك هذا الفحص ليس ترفًا. تتعامل مع P2034 وP2010:40001/40P01، ونتيجة Commit المجهولة fail-closed مع إعادة محاولة موثوقة. لا Claim Table ولا `POC_PENDING` في Runtime.

Stage 6C SQL يضيف حقول Order الأربع nullable والفهارس و`VALIDATED_TEST` وTriggers تمنع تبديل الدليل التاريخي بعد الختم. Candidate SQL في `scripts/stage6d3c3e-network-order-completeness-candidate.sql` **خارج Migration History التشغيلية**؛ حارس `network-order-db-guard.ts` يقبل فقط بصمات تعريف الحارس والـTriggers كما اختبرت على PostgreSQL 16 disposable، ويمنع إنشاء اختبار عند غيابه أو تزويره. الحارس يفحص تطابق Snapshot/Items/Options/الهوية/الكمية/المال عند Commit، لكن صحة HMAC وShared Pricing وتوافر المنتج تبقى مسؤولية Backend. `network-order-whatsapp-formatter.ts` يقرأ Snapshot المختومة فقط: أسماء وأسعار تاريخية، Size/Nested/Included/Combo/instances مستقلة وملاحظات/عميل، دون استعلام المنيو الحي أو إرسال فعلي. أدوات PoC/Benchmark وBrowser في `scripts/stage6d3c3*.mjs`, `scripts/stage6d3c3e-db-guard-verify.mjs`, `scripts/stage6d2b-browser-e2e.mjs` للتجربة المعزولة فقط.

حواجز هذا الأساس: `NODE_ENV` غير Production، loopback Request، علم `ENABLE_DISPOSABLE_NETWORK_ORDERS=1`، PostgreSQL disposable على loopback بمنفذ/اسم محددين، وحارس DB المطابق؛ `orderingEnabled:false`. الاحتفاظ به يتيح مستقبلًا بناء نظام Orders/Delivery على Snapshots وIdempotency والتحقق، **لكنه ليس مستخدمًا لحفظ Network/Mixed WhatsApp اليوم**، ولا يجوز نقل Guard المرشحة إلى Production بلا تدقيق Migration History وتصميم اعتماد مستقل.

## 7. قاعدة البيانات وترتيب الترحيل المستقبلي

`apps/api/prisma/migrations/20261012000000_product_configuration_network/migration.sql` (Stage 2C) يجعل Product Base nullable بدقة `DECIMAL(24,6)`, يضيف Tree/Version وEnum `LinkedProductMode`, جدولا `ProductConfigurationDependency` بفهرس وفاتيح مركبة تمنع الربط بين مطعمين وتحمي المصدر من الحذف، وخمسة CHECKs للـLegacy/Network/Version/Base/Shape؛ ويزيد دقة Order/OrderItem إلى `(24,6)`. الحفظ الذري يحدّث Tree/Version/Base/Index في معاملة واحدة؛ حذف مصدر Linked البنيوي يُمنع، أما Hide التشغيلي فمختلف. الترحيل لا يحوّل Legacy تلقائيًا. أداة Backfill في `apps/api/prisma/product-configuration-backfill.ts` مع runbook/Quarantine/Resume معدّة للاستخدام المصرح به لاحقًا، وليست مستخدمة على البيانات الحقيقية.

`apps/api/prisma/migrations/20261013000000_network_order_test_snapshot/migration.sql` (Stage 6C) يضيف Order `idempotencyKey`, `requestHash`, `acceptanceTokenHash`, `networkSnapshotSealedAt`, UNIQUEs وStatus/Triggers الخاصة بأساس Orders المستقبلي. **الـPrisma Client الحالي يتوقع الأعمدة الأربعة حتى في مسارات Legacy:** تجربة قاعدة disposable فيها Stage 2C وحدها أعادت `P2022` عند `order.findMany` بسبب غياب `idempotencyKey`. إذن لا يكفي القول إن WhatsApp العام لا يحفظ Network Order؛ Binary الحالية تحتاج مخططًا متوافقًا، أو قرارًا مستقلًا بفصل الاعتماد. Candidate DB Completeness Guard ليست شرطًا لمسار WhatsApp العام ولا Migration رسمية. لا يحتوي Git على Initial CREATE Migration موثوقة؛ الأسماء في Git لا تثبت ما طُبّق على Production. **لم تُقرأ Production DB ولا `_prisma_migrations` الحقيقية.**

خطة الأمان قبل أي DDL: تفويض قراءة منفصل لقاعدة محددة ودور Read-only، ثم استخدام `apps/api/prisma/stage6f0-readonly-preflight.sql` لجرد Metadata فقط (اختُبر على disposable في Stage 6F.1)؛ مطابقة التاريخ/Checksums/Drift والقيود مع Git؛ Backup قابل للاستعادة وRestore مجرب؛ Staging مطابق؛ خطة تطبيق/تراجع بتمييز رجوع التطبيق/العلم عن رجوع SQL. لا `db push`/`migrate deploy`/Backfill على قاعدة حقيقية بناء على هذا التقرير. إذا وُجد Shell قديم من نافذة Stage 6E.1 قبل Guard 6E.1A فلا توجد علامة دائمة تميزه تلقائيًا عن Legacy؛ يتطلب تدقيق بيانات وخطة صريحة، لا تحويلًا صامتًا.

## 8. Dashboard V2: إعادة استخدام ثم تكييف، لا ادعاء توافق

المتاح لإعادة الاستخدام هو **عقود الشجرة والاختيار ومحرك Decimal/Validation/Snapshot**، وتصميم المحرر التفاعلي، وأشكال أخطاء Admin/Quote. أما طبقة DB/Authorization/Resolver/Cart/Checkout الحالية فهي Restaurant-scoped: `Product.restaurantId`, Dependency composite FK, `catalogId=restaurantId`, `runtimeContext.scope="RESTAURANT"` مع `outletDifferentialApplied/serviceModeApplied/productScheduleApplied=false`. لا تعني أسماء `Branch` أو حقلها وجود Outlet Effective Product. لم تُقدَّم أحدث شيفرة Dashboard V2 في Workspace؛ النموذج HTML V62.4 خارج Git ليس دليلًا لتكامل Source V2.

| موضوع V62.4 | الوضع الحالي | ما يحتاج Adaptation قبل الدمج |
|---|---|---|
| Business Catalog مصدر قانوني وOutlet Differential | Product واحد لكل Restaurant؛ لا Overlay | بناء canonical/effective identity وstable inherited IDs، overrides/tombstones/local nodes/revert/ordering، دون Flatten عند Outlet واحدة؛ يحتاج Schema/صلاحيات/Backfill بتصريح مستقل |
| Linked Products ضمن Outlet | نفس `restaurantId` فقط | حل source إلى **effective same-Outlet** لا raw Business، منع cross-Market، تمييز local/inherited، دورة/Availability في السياق الصحيح؛ تعديل Dependency Index/Resolver/API |
| Capability | Subscription مرتبطة Restaurant | تعيين Package/Entitlement لكل Outlet ومراجعة خسارة الميزة دون حذف Tree؛ لا تعميم Gate الحالية |
| Availability/Service Modes/Schedule | `isActive/isAvailable/deletedAt`، لا Mode/Schedule في Public Quote | تركيب effective state ووقت Market؛ no Sizes→Mode Base override، any Sizes→Size price، Option mode-independent V1؛ Hide ليس structural tombstone |
| Market/Currency | Restaurant.currency؛ سياسة SYP/EUR/USD/AED للمنيو الحالي | Market allowlist وBusiness chosen currency مع منع cross-Market؛ فصل Billing currency؛ لا تصفير/تقريب تلقائي عند تغيير العملة |
| Multilanguage | أسماء/labels تاريخية واحدة لكل Snapshot، locale رسالة ar/en | Business-owned translations، Outlet published subset حسب Package، fallback **whole record**، حفظ دليل لغوي تاريخي قبل Orders الحقيقية؛ لا ترجمة مخترعة من Formatter |

تسلسل دمج مقترح **للمراجعة فقط**: (1) استلام Commit/Golden Master محدد لـDashboard V2 وملفات السلطة الحالية ومقارنة مسارات Product/Category/Package/Market؛ (2) تثبيت هوية canonical/effective وملكية الصلاحيات/ترجمة البيانات قبل UI؛ (3) رسم Adapter يعطى Shared Engine `ProductConfigurationContext` من Effective Outlet Catalog مع اختبارات same-Outlet/Market/Mode/Schedule و`null`/`0`؛ (4) مواءمة Admin GET/PUT وDependency/Deletion وVersion/Capability، ثم المحرر الحالي بعقود UI V2؛ (5) Quote/Cart/Checkout تتلقى context/version جديدًا وتعيد التحقق؛ (6) Regression Legacy/Network ومقارنة Browser وبناء خطة Migration مستقلة. **لا تنسخ API أو Schema الحالية إلى V2 على أنها جاهزة، ولا تغيّر العقود قبل اختبار الدمج.**

## 9. الدين الأدائي والموثوقية — مفصول حسب المسار

**المشترك مع WhatsApp العام الآن:** `resolvePublicProductConfiguration`/`configurationCatalogProducts` يحتاجان كتالوج Restaurant كاملًا؛ `public-whatsapp-checkout.service.ts` يستعلم جميع Products ويقفل صفوفها بـ`FOR SHARE` في **Prepare وConfirm**، حتى لمنتج واحد. ذلك قد يؤخر تعديل Product B غير مرتبط بطلب A. لا توجد Dependency Closure Loader/Locker، ولا Cache تسعير جديد؛ هذه تحسينات **مقترحة فقط** تتطلب إثبات Cycle/Missing/CUSTOM/ORIGINAL/tenant/Serializable correctness. Rate Limiter per-process، والتوبولوجيا الفعلية مجهولة. قبول Draft مرتين يضاعف قراءة/قفل المسار، لكنه يحافظ على Revalidation ولا يجوز حذفه لتقليل الزمن دون بديل آمن.

**خاص بـ`NETWORK_TEST` المستقبلي:** Stage 6D.3C3 HTTP benchmark محلي على PostgreSQL disposable قاس medians (ms):

| عدد Products | Quote | Prepare | Create | العينات المتسلسلة |
|---:|---:|---:|---:|---:|
| 10 | 10.47 | 11.09 | 20.71 | 9 |
| 100 | 10.73 | 11.66 | 22.07 | 9 |
| 1,000 | 23.31 | 29.40 | 37.99 | 9 |
| 10,000 | 154.86 | 234.76 | 258.46 | 5 |

في موجة 1,000 Product و25 Create متزامنة **قبل Design A**: 33/50 نجاح و17/50 HTTP 409، Median/P95 ‏604.45/774.09ms. اختبار قفل موجّه أمسك معاملة 250ms عمدًا: UPDATE لـProduct B غير المرتبط انتظر نحو 266–326ms مقابل baseline نحو 1.79–2.68ms، وثبت `Lock wait`؛ لا تُسوَّق هذه الأزمنة بوصفها زمن Production طبيعيًا. Stage 6D.3C3B عزلت سببًا مثبتًا للـSSI: absent-key Read-Before-Insert على فهارس Order Idempotency/Token داخل Serializable؛ SQL Probe **22/25** تعارض P2034 حتى دون Product locks، وظهر `SIReadLock`. القفل الشامل يزيد نافذة التداخل لكنه ليس السبب اللازم الوحيد.

Design A في Stage 6D.3C3F **نُفذت فقط في Runtime التجريبي `NETWORK_TEST`** وخففت التعارضات المرصودة: موجتا HTTP عند 1,000 Product و25 تزامن أعطتا **49/50 نجاح و1/50 409**، مع **26 retry داخليًا** وMedian/P95 ‏382.79/605.43ms. ليست مقارنة A/B مضبوطة ظروفها بالكامل؛ لا نعلن SLA أو انتهاء التعارض. تكلفة Candidate DB Guard المباشرة عند 50 Order lines: COMMIT Median/P95 ‏**29.924/39.831ms** مقابل **0.851/1.218ms** دونها، 30 عينة؛ ليست تكلفة WhatsApp العام الذي لا يحفظ Network Order. لا تخلط هذه الأرقام مع إطلاق المنيو الحالي. بقيت حالات 25×10k، عمق 12/1000 عقدة، عدة API instances، Wait under real storage/network، Mixed 50 line، ومستهلكو Analytics الخارجيون غير مقاسة. `DashboardService.ensureAllCategory` ما زال بحاجة تدقيق Race منفصل؛ إصلاح `PublicMenuService.ensureAllCategory` تم في Stage 6D.3C1. ذُكرت أخطاء TypeScript قديمة في مصادر اختبارات معينة بتقرير 6E.0؛ نجاح Root Typecheck/Build لا يمحو ملاحظة الفحص الأوسع، وتحتاج إعادة تحقق عند تغيير بيئة الاختبار.

## 10. دليل الاختبارات وحدوده

| المرحلة / الدليل | نتائج فعلية موثقة | حدود الاستنتاج |
|---|---|---|
| Stage 1/2C | Shared V1؛ Stage 2C SQL/Backfill/Transaction وأدوات disposable موثقة في `CODEX_HANDOFF.md` وrunbook | لا تطبيق على قاعدة حقيقية؛ تقارير 0–2 ليست جميعها ملفات مستقلة في هذا الجذر |
| Stage 3.1 و4.1 | HTTP PostgreSQL + Web/Browser؛ 4.1 API **79/79** (0 skip)، Shared **21/21**، Web **14/14** | تحقق Backend/Editor محلي، لا Dashboard V2 |
| Stage 5 | API **85/85**، Shared **21/21**، Web **22/22**، Prisma diff بلا فرق | Public Configurator preview-only آنذاك |
| Stage 6A و6C | 6A API **96/96**، Shared **21/21**، Web **22/22**؛ 6C API **115/115**، Web **35/35** | Quote/Order test-only؛ لا تفعيل عام |
| Stage 6D.3C3E/F | Guard negative/rollback **25/25**؛ F Atomic HTTP **28/28**، Full API **186/186** (0 skip)، Browser **15/15** checkpoints | Candidate Guard disposable؛ لا يمثل DB Production |
| Stage 6E.4 | API **202/202** بـ26 ملفًا، Shared **21/21**، Web **41/41**؛ Chrome ON **13/13** وOFF **4/4** وDashboard **6/6** checkpoints، Root Typecheck/Build | Browser checkpoints ليست 23 سيناريو مستقلاً؛ PostgreSQL 16 disposable فقط |
| Stage 6F.1 (الأحدث) | API **206/206** بلا skip، Shared **25/25**، Web **43/43**، focused **47/47**، Chrome/Nest/Next **14/14** checkpoints؛ Typecheck/Build وPreflight SQL على disposable | أول Browser run تعثر ثم أُعيد ونجح؛ لا WhatsApp فعلي ولا Production verification |
| Stage 6F.2 | **مراجعة مصادر وتقارير وGit/paths فقط؛ لا اختبارات Runtime/DB أُعيدت** | لا يُحوَّل نجاح تاريخي محلي إلى اعتماد نشر |

أرقام Browser أعلاه checkpoints للـRunner لا بديل عن اختبار قبول على Staging/أجهزة ولغات المطاعم الفعلية. لم يُستخدم Production DB، ولم تُختبر topology/Proxy/Secret Store الحقيقية، ولم تنفذ Migration/Backfill/Deployment أو رسالة WhatsApp حقيقية خلال هذه المراحل.

## 11. موانع إطلاق المنيو الحالي ونقطة التسليم

الموانع العملية الحالية: (1) تفويض ثم تدقيق **مخطط Production وتاريخ Migration** ومطابقة Prisma/Stage2C/أعمدة Stage6C؛ (2) معرفة topology/Proxy/TLS/Origins وBackup قابل للاستعادة وخطة Rollback/Staging؛ (3) Secret Store ومفتاح HMAC العام وتوزيعه/تدويره دون كشف؛ (4) حدود Rate/Trust Proxy وPII/Logs؛ (5) رقم WhatsApp الرسمي واشتراك/Capabilities وإعدادات المطاعم؛ (6) تدقيق بيانات SYP الكسرية القديمة وأي Shell من Stage 6E.1 وAnalytics consumers؛ (7) Smoke Legacy/Network/Mixed على Staging قبل أي Flag ON. السياسة النقدية الأساسية اعتمدت في 6F.1، لكن عملات المطاعم الفعلية وسلوك الفروقات المعروضة يجب التحقق منهما. **Business/Outlet/POS/Delivery ليست موانع هذا الإصدار الحالي.** راجع `ORDERSAWA_CURRENT_PRODUCTION_RELEASE_CHECKLIST_AR.md` لقائمة تشغيل قابلة للتوقيع.

للمحادثة الجديدة: ابدأ بهذه الوثيقة ثم تقارير 6E.0/6E.4/6F.0/6F.1 ومرجعي `AUTHORITATIVE_RULES`، اطلب Source/Commit Dashboard V2 المعرّف، ثبّت فروق العقود قبل أي تعديل، واحفظ `NETWORK_TEST` والحواجز والعلم العام OFF. **Stage 6F.2 وثائق فقط؛ لا يبدأ دمج V2 أو نشر أو ترحيل تلقائيًا.**
