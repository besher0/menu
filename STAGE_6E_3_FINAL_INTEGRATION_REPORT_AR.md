# OrderSawa — تقرير Stage 6E.3: تثبيت الدمج النهائي في النظام الحالي

## 1. النتيجة وحدودها

أُصلح انحراف Stage 6E.2 في واجهة السلة: **Legacy-only** تستخدم Checkout القديم الذي يحفظ `Order` و`OrderItem` ويُسجل حدث التحليلات، سواء كان علم WhatsApp Network مفعّلًا أم لا. **Network-only** و**Mixed** تستخدمان Prepare/Confirm الموثوقين عند تفعيل العلم فقط. لا يُمرَّر Network إلى Legacy ولا تُحفظ `NETWORK_TEST` Order في رحلة WhatsApp العامة. أُزيل فتح رابط بديل مبني على أسعار المتصفح عند فشل Legacy API؛ الفشل يعرض رسالة ولا يفتح WhatsApp.

هذا تنفيذ محلي واختبار، **وليس تفعيلًا عامًا أو اعتمادًا للإنتاج**. ظل `ENABLE_PUBLIC_NETWORK_WHATSAPP_CHECKOUT` متوقفًا افتراضيًا، و`orderingEnabled:false` وحواجز `NETWORK_TEST` كما هي. لم تُستخدم قاعدة حقيقية أو `.env` حقيقية أو Migration تشغيلية أو Deployment، ولم تُرسل رسالة WhatsApp.

المراجع: `CODEX_HANDOFF.md`، تقارير `STAGE_6E_2_PUBLIC_CART_WHATSAPP_INTEGRATION_REPORT_AR.md` و`STAGE_6E_1A_NETWORK_SETUP_ACTIVATION_GUARD_REPORT_AR.md` و`STAGE_6E_0_NETWORK_INTEGRATION_COMPATIBILITY_MAP_AR.md`، والملفان الأصليان `../work/product-network-pack/OrderSawa_Product_Network_Codex_Pack/AUTHORITATIVE_RULES/LATEST_FOUNDER_DECISION_LEDGER_V2_CURRENT.md` و`CURRENT_SUPERSESSION_AND_CONFLICT_RULES.md`. قرار المؤسس الصريح لهذه المرحلة يحصر التشغيل الحالي في **Restaurant Electronic Menu + WhatsApp**؛ Business/Outlet موثقة كأساس مستقبلي ولم تُنفذ هنا. بداية المرحلة: الفرع `feature/product-configuration-network`، Commit التنفيذ السابق `ec9e6ec` وCommit تسليمه `e58dff5`، وحالة Git نظيفة.

## 2. جرد الميزات وحالة التفعيل

| المكون | التصنيف | الحالة |
|---|---|---|
| محرر Dashboard للشبكة، Admin GET/PUT والحفظ الذري، وحارس `NETWORK_SETUP` | ACTIVE NOW | Implemented & Tested على PostgreSQL disposable وChrome؛ لا ينشر المنتج غير المكتمل |
| Public Menu وConfigurator وQuote من Shared Engine | ACTIVE NOW | Implemented & Tested محليًا؛ السعر الموثوق يأتي من Backend |
| Legacy-only Checkout الذي يحفظ Order والتحليلات | ACTIVE NOW | Implemented & Tested؛ بقي مسار الواجهة بغض النظر عن علم Network |
| سلة واحدة فيها Legacy وNetwork؛ Trusted WhatsApp Prepare/Confirm | ACTIVE NOW بعد موافقة التفعيل فقط | Implemented but Not Production-enabled؛ العلم OFF افتراضيًا |
| رابط WhatsApp المجهز والرسالة المفصلة | ACTIVE NOW بعد موافقة التفعيل فقط | Implemented & Tested بالاعتراض داخل Chrome، دون فتح خدمة WhatsApp أو إرسال |
| Design A وIdempotency وAcceptance Tokens وSnapshots المختومة وحارس DB | FUTURE FOUNDATION | محفوظة كما هي؛ تخص `NETWORK_TEST` المعزول، وليست Checkout WhatsApp العام |
| `/orders/network-test/*` وBrowser/Benchmark/PoC Scripts | DEVELOPMENT/TEST ONLY | حواجز loopback/disposable/flags باقية؛ اختبار HTTP مباشر أعاد 403 |
| Business Catalog/Outlet Differential وPOS/Kitchen/Dispatch وإرسال WhatsApp تلقائي | خارج المرحلة | Not Implemented في المسار الحالي؛ لا موافقة على بنائها هنا |
| سياسة تقريب/عرض العملة، تاريخ Migration الحقيقي، إدارة HMAC وRate Limit متعدد النسخ | قرار/عمل مستقل | Requires Founder Decision أو اعتماد تشغيل مستقل قبل التفعيل العام |

## 3. Dashboard والمنيو والتهيئة

فُحص الكود الفعلي `products.service.ts` و`product-configuration.persistence.ts` ومحرر `apps/web/src/components/dashboard/product-configuration/`. شُغّل Browser Runner الموجود `scripts/stage6e1-dashboard-browser-e2e.mjs` على قاعدة جديدة فيها **قيود Product الخمس الرسمية من Stage 2C بعد VALIDATE** وStage 6C SQL الاختباري. نجحت 6/6 نقاط: Create `NETWORK_SETUP` بشجرة صالحة غير مسعرة وBase `null` ومخفية، منع Availability المبكر بـ409، منع الظهور العام، حفظ Pizza Demo عبر Admin API، إعادة فتحها مع Revision 2 والأحجام، RTL/390px، وإنشاء Legacy Base `0` مستقل. لم يتغير `isAvailable` تلقائيًا عند حفظ الشبكة. لم نختبر عملية Publish النهائية بزر Dashboard مستقل؛ غطت اختبارات HTTP صلاحيات/تفعيل Stage 6E.1A، ويفضل سيناريو Browser نشر/إلغاء نشر مستقل قبل التفعيل العام.

في المنيو، استخدم Browser Runner الحالي Product Configurator لاختيار Medium، Cheese ×3، وBBQ المتداخل، ثم Quote وإضافة السطر. أضاف Combo بمنتجين ORIGINAL مستقلين ومصدر CUSTOM، واستعاد السلة بعد Reload. اختبار API يغطي اختلاف السعر بدقة Decimal، Revision، Availability، Linked Source، Capability، Tenant، حقن السعر وطول الرابط. لا يوجد محرك تسعير ثانٍ في Frontend؛ `basePriceExact` للـLegacy مؤشر مقارنة فقط، وNetwork تعتمد Shared Engine.

## 4. السلة وCheckout والتوافق مع Legacy

القرار المحدود في `cart-model.ts`: `shouldUseTrustedWhatsappCheckout` يختار المسار الجديد **فقط** إذا كان العلم مفعّلًا وفي السلة سطر `NETWORK`. سلة Legacy-only، حتى مع العلم ON، تعرض `CheckoutSteps` القديم وترسل إلى `POST /public/menus/:slug/orders/whatsapp`. سلة Network-only أو Mixed مع العلم ON تعرض Trusted Checkout. مع العلم OFF تظهر بوابة منع للـNetwork/Mixed، فلا يستطيع المستخدم تمريرها إلى Legacy. تغيّر منتج Legacy محفوظ في السلة إلى Network لا يؤدي إلى تحويل صامت؛ يبقى محجوبًا.

فُحص `createWhatsappOrder` القديم: يتحقق من المطعم وإعدادات WhatsApp والأصناف المتاحة، ويحفظ Order وItems وبيانات العميل و`cartSnapshot` و`whatsappMessage` وحالة `PENDING_WHATSAPP` ويسجل `WHATSAPP_ORDER_CLICKED`. اختبار PostgreSQL جديد أثبت حفظ طلب واحد وحدث واحد لكل عملية، سواء كان العلم OFF أو ON، ورفض Network من endpoint القديم. Browser اختبر أيضًا أن فشل Legacy API لا يفتح رابط fallback بأسعار المتصفح ولا ينشئ Order ثانية. **لم نغيّر تسعير Legacy الموجود داخليًا**؛ لا يزال يستخدم قواعده الحالية، بما فيها استخدام `Number` في مساره القديم، وهو دين منفصل لا يعني أن أسعار Network تستخدم floating-point.

قيد عقد يجب مراجعته قبل التفعيل: endpoint Prepare/Confirm الجديد نفسه ما زال يقبل **Legacy-only بطلب HTTP مباشر** ويعيد رسالة بلا Order وفق عقد Stage 6E.2؛ واجهة السلة الحالية لا تستخدمه لـLegacy-only. هذا لا يزوّر السعر، لكنه مسار بديل لا يحافظ على History/Analytics القديمة إذا استدعاه عميل آخر. لم نغيّر العقد التشغيلي السابق بصمت في هذه المرحلة؛ يوصى بحسم ما إذا كان يجب رفض Legacy-only على endpoint الجديد بعقد صريح واختبار تكامل قبل إطلاقه للعامة.

## 5. سلامة المسودة ورسالة WhatsApp

المسار الجديد يعيد تحميل Restaurant والاشتراك والميزة وTheme والفرع ورقم WhatsApp وCatalog من PostgreSQL داخل Serializable، ويقفل صفوف Product بـ`FOR SHARE`. Legacy Base يأتي من DB، وNetwork Quote/Canonical Selection/Snapshot من Shared Engine. Confirm يعيد بناء المسودة من الطلب ويقارن HMAC المربوطة بالمطعم والطلب والمسودة ولمدة عشر دقائق. تغيير السعر أو Revision أو التوفر أو مصدر Linked أو Capability أو الكمية أو ملاحظات/بيانات العميل يُبطل الموافقة القديمة أو يمنع التكوين؛ لا تُفتح رسالة قديمة بعد 409. رابط أطول من 8192 حرفًا يُرفض دون قطع الرسالة. لا تُعاد أسعار أو أسماء حية بعد بناء المسودة الموثوقة لتغيير نصها.

اختبار Chrome رأى رسالة Mixed تضم اسم المطعم، Legacy Salad، Pizza Margherita بالحجم وCheese وBBQ وIncluded Quantity، Family Combo ومصادره المتكررة، ملاحظتي الصنف والطلب، `13.000001` و`265.000004` وإجماليات دقيقة ورقم المطعم الاصطناعي الصحيح. لا توجد سياسة تقريب جديدة. الواجهة تعترض `window.open` في الاختبار، فلا تتصل بـWhatsApp. بقي Formatter التاريخي لـNetwork Snapshots و`NETWORK_TEST` دون تعديل.

## 6. الأمن والموثوقية والأداء

- علم المسار العام OFF افتراضيًا ومفتاح `PUBLIC_WHATSAPP_CHECKOUT_HMAC_KEY` مستقل بصيغة hex صحيحة شرط خادمي. اختبارات 403 وغياب المفتاح 503 ورفض السعر المدسوس وToken غير صحيح نجحت. لا تُعرض تفاصيل Prisma/SQL في 409 الخاصة بتعارض Serializable. لا أرقام أو ملاحظات زبائن حقيقية في Fixtures أو Logs جديدة.
- Rate Limiting الحالي في `main.ts` ذاكرة **لكل عملية**، وليس حدًا موزعًا. قبل التفعيل العام يلزم تصميم إدارة HMAC آمنة وتدويرها، حماية PII، سياسة Abuse/Rate متعددة النسخ، وقرار عن الاحتفاظ ببيانات العميل؛ لم نبتكر منظومة جديدة هنا.
- موجة HTTP موجهة من 5 Prepare متزامنة ثم Confirm للناجحة حافظت على إجمالي `554.00001`، أعادت فقط نجاحًا أو 409 منظمًا، ولم تحفظ Order. لا تُثبت هذه الموجة قدرة إنتاجية أو غياب كل سباقات التزامن.
- `buildDraft` العام يحمل Catalog المطعم كاملًا ويقفل كل Product بـ`FOR SHARE` مرتين (Prepare ثم Confirm). ديون 10k Product وتأخير تعديل Product غير مرتبط باقية. لم نغيّر Dependency Closure أو Serializable. حارس اكتمال DB المكلف عند 50 line يخص `NETWORK_TEST` المستقبلي **وليس** مسار WhatsApp العام الذي لا يحفظ Order. تبقى تعارضات Serializable المحتملة تحت حمل أعلى.
- بعد Confirm وقبل أن يضغط الزبون Send في WhatsApp قد تتغير المنيو؛ لا توجد Order محفوظة لتثبيت السعر في هذا الفراغ الزمني. هذه حدود رحلة WhatsApp ويجب شرحها تشغيليًا، لا ادعاء ضمان غير موجود.

## 7. الاختبارات الفعلية

PostgreSQL 16.15 disposable جديدة فقط على `127.0.0.1:55440` داخل `../work/stage6e3-postgres-data`: قاعدة Checkout وقاعدة Product API وقاعدة Dashboard Browser منفصلة. طُبق Test Baseline وSQL Stage 6C الاختباري، وأضيفت ثم **VALIDATED** قيود Stage 2C الخمس الفعلية. لا مشروع `.env` ولا بيانات مطعم حقيقية. أُوقف الخادم بعد الاختبارات (`pg_isready`: no response).

| المجموعة | آخر نتيجة | ملاحظات |
|---|---:|---|
| Shared Engine | 21/21 نجاح | محاولة أولى تعثرت لأن TEMP خارج نطاق الكتابة؛ إعادة تشغيل مع TEMP داخل work نجحت |
| API full suite المتاحة | 133 نجاح، 69 تخطٍ، 0 فشل | 21 ملفًا ناجحًا و5 ملفات متخطاة لأنها تتطلب قواعد/أعلام اختبار مستقلة؛ **لا تُحسب المتخطاة نجاحًا** |
| Trusted WhatsApp HTTP/PostgreSQL | 12/12 نجاح ضمن API | منها Legacy Flag ON/OFF و5 طلبات متزامنة؛ Product Configuration HTTP 23/23 ضمن المجموعة الكاملة |
| Web component/unit | 41/41 نجاح، 8 ملفات | اختبار جديد يثبت مصفوفة Legacy/Network/Mixed وعلم الميزة |
| Chrome/Nest/Next مع العلم ON | 13/13 checkpoints | Legacy persistence والفشل الآمن، Pizza، Network-only، Mixed، Combo، Reload، Edit/Delete، Notes، 409 وإعادة الموافقة، RTL/390px ورابط معترض |
| Chrome/Nest/Next مع العلم OFF | 4/4 checkpoints | Legacy persistence، رفض API الجديد مباشرةً، ومنع Checkout لسلة Mixed وNetwork-only |
| Dashboard Chrome/Nest/Next | 6/6 checkpoints | Setup/Save/Reopen وحارس التفعيل وLegacy zero وRTL/390px |
| `NETWORK_TEST` direct HTTP | 403 | مع بيئة لا تحقق علمها/حارسها؛ لم نشغّل كل Suites التجريبية الـ69 هنا |
| Root Typecheck وRoot Build | نجاح | Build أنشأ 27/27 صفحة Next؛ `node --check` و`git diff --check` نجحا |

التعدادات أعلاه **checkpoints** وليست 23 اختبارات Browser مستقلة لكل بند في طلب المرحلة. Delivery/Pickup، تغيّر Linked/Capability، حقن السعر، Tenant وToken مغطاة بـHTTP؛ publish من Dashboard، ضغط أكبر وتعدد عمليات API، وفتح WhatsApp فعليًا لم تُختبر في المتصفح. أول تشغيل Dashboard Browser فشل بسبب CORS المحلي (`WEB_ORIGIN` لم يتضمن `127.0.0.1:3000`)؛ صححنا إعداد عملية Nest المعزولة وأُعيد السيناريو بنجاح دون تعديل الشيفرة. لقطتا 390px محليتان خارج Git: `../work/stage6e2-mixed-cart-mobile.png` و`../work/stage6e1a-dashboard-mobile.png`.

## 8. موانع الإصدار والديون المؤجلة

**لا موافقة على Production Activation**. يلزم مراجعة سياسة عرض وتقريب العملات، تاريخ Migrations الحقيقي قبل أي تطبيق، تخزين/تدوير HMAC، Rate Limiting موزع، متطلبات هاتف العميل/PII، الرسوم والضرائب والخصومات ورقم الطلب التجاري، محتوى Snapshot متعدد اللغات، وسياسة فتح WhatsApp والتعامل مع تغير السعر بعد Confirm. `Business Catalog + Outlet Differential` وService Mode/Scheduling قرار معماري مستقبلي ولا يجب الادعاء بتوافق Dashboard V2 غير الموجود في هذه النسخة. Legacy-only direct call لعقد Checkout الجديد يحتاج حسمًا كما في §4. لا نوصي بإزالة Foundation أو تغيير `orderingEnabled:false`.

## 9. الملفات والحفظ في Git

Commit التنفيذ والاختبارات: `552b7dd2134c1bee3515e40a42489b8eeeb02aaf` على `feature/product-configuration-network`.

- `apps/web/src/components/public/cart-model.ts` و`cart-model.test.ts`: توجيه السلة مع Regression.
- `apps/web/src/components/public/public-menu-client.tsx`: إعادة Legacy-only إلى Checkout المحفوظ، منع fallback غير الموثوق، وإزالة صياغة سعرية محلية ميتة.
- `apps/api/src/modules/public-menu/public-whatsapp-checkout.integration.spec.ts`: حفظ Legacy/Analytics مع العلمين، حماية Network، وتزامن محدود.
- `scripts/stage6e2-whatsapp-browser-e2e.mjs`: Runner موجود توسع إلى ON/OFF وLegacy/Mixed والتحقق من الحفظ والفشل الآمن؛ لا إطار جديد.
- `STAGE_6E_3_FINAL_INTEGRATION_REPORT_AR.md` و`CODEX_HANDOFF.md`: توثيق مرحلة 6E.3 في Commit توثيق منفصل يُعرف بـ`git log -1` بعد الحفظ.

لم تتغير Prisma Schema أو Migrations أو Shared Engine أو Formatter التاريخي أو Network Order Persistence أو Benchmark/PoC Scripts. راجعنا `git diff --check` وقائمة الملفات قبل الحفظ؛ لا `.env` ولا Credentials ولا Logs ولا بيانات تشغيلية مضافة. حالة Git النهائية يجب التحقق منها بعد Commit التوثيق؛ قاعدة الاختبار والخوادم أُوقفت، وملفات الصور/PG المؤقتة خارج Git فقط. **التوقف هنا؛ لا Stage 6E.4 ولا نشر أو تفعيل دون موافقة جديدة.**
