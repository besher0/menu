# OrderSawa — تقرير Stage 6E.2: السلة المختلطة وWhatsApp Checkout الموثوق

## النتيجة وحدودها

اكتمل مسار واحد في المنيو الحالي يضم أصناف Legacy وNetwork في السلة نفسها، ويجهز رسالة WhatsApp من أسعار وتكوينات أعاد الخادم التحقق منها. يفتح المتصفح الرابط **بعد موافقة الزبون الصريحة**؛ لا يرسل الخادم رسالة ولا ينشئ Order في قاعدة البيانات. المسار العام الجديد مستقل عن `/orders/network-test/*`، ومحكوم بعلم `ENABLE_PUBLIC_NETWORK_WHATSAPP_CHECKOUT=0` افتراضيًا ومفتاح HMAC منفصل. لم يُفعّل في Production، ولم تُطبّق Migration أو يُستخدم أي اتصال بقاعدة حقيقية.

المصدر السابق كان يضم Public Configurator وServer Quote ومحرك Shared وسلة Network V2، لكن Legacy WhatsApp Checkout كان يرفض السلة التي تحتوي Network. ظلّت بنية NETWORK_TEST التجريبية وحارس DB وOrder Snapshots كما هي. قرار المؤسس في طلب هذه المرحلة يجيز مسار WhatsApp فقط داخل معمارية Restaurant الحالية، ولا يجيز Business/Outlet أو نظام معالجة طلبات داخلي جديدًا. روجعت `CODEX_HANDOFF.md` وتقارير 6E.1A/6E.1/6E.0 و`AUTHORITATIVE_RULES` (Founder Ledger وSupersession Rules) قبل التعديل.

## الملفات المعدلة والمنشأة

| المجال | الملفات | التغيير |
|---|---|---|
| عقد وخدمة عامة | `apps/api/src/modules/public-menu/public-whatsapp-checkout.contract.ts`, `public-whatsapp-checkout.service.ts` | إدخال محدود للسلة المختلطة، إعادة تحميل وقفل بيانات المطعم والكتالوج، التسعير والتحقق، مسودة موثوقة، توقيع وقبول وإعادة تحقق قبل الرابط. |
| HTTP | `apps/api/src/modules/public-menu/public-menu.controller.ts`, `public-menu.module.ts`, `public-menu.service.ts` | مسارا prepare/confirm؛ إظهار علم التفعيل العام و`basePriceExact` للمنتجات القديمة مع إبقاء الحقول القديمة. |
| Formatter | `apps/api/src/modules/orders/network-order-whatsapp-formatter.ts`, `network-order-contract.ts` | استخراج تنسيق السطر والتفاصيل المعتمد على Snapshot لاستخدامه في رسالة مختلطة؛ بقي Formatter التاريخي نفسه واختباراته. |
| Web | `apps/web/src/components/public/trusted-whatsapp-checkout.tsx`, `public-menu-client.tsx`, `product-configurator.tsx`, `cart-model.ts`, `cart-model.test.ts`, `apps/web/src/lib/api.ts`, `apps/web/src/app/globals.css` | مراجعة موحدة، ملاحظات العناصر، استعادة سلة مختلطة، عرض الرسالة الموثوقة كاملة، موافقة/إعادة موافقة وفتح WhatsApp؛ RTL و390px. |
| اختبار وإعداد | `apps/api/src/modules/public-menu/public-whatsapp-checkout.integration.spec.ts`, `apps/api/src/modules/products/product-configuration.integration.spec.ts`, `apps/api/src/modules/public-menu/public-menu-race.integration.spec.ts`, `scripts/stage6e2-whatsapp-browser-e2e.mjs`, `.env.example` | HTTP/PostgreSQL، إصلاح حقن خدمة جديدة في اختبارات Nest القديمة، Runner متصفح يدوي، علم OFF ومفتاح فارغ بلا سر. |

Commit التنفيذ والاختبارات: `ec9e6ec` (`feat(public): integrate trusted mixed WhatsApp checkout`). لم يتغير Prisma Schema أو Migration History أو Shared Pricing Engine أو NETWORK_TEST Runtime.

## عقد Checkout العام

`POST /public/menus/:restaurantSlug/checkout/whatsapp/prepare` يستقبل `locale`، تفاصيل العميل/الاستلام المعتمدة من Stage 6D.2A، و`items` (1–50، حد 100 وحدة). سطر Legacy يحتوي `mode`, `lineId`, `productSlug`, `quantity`, `note?`, `expectedUnitPrice?`. سطر Network يحتوي `productId`, `selection` وفق Stage 1 و`expectedLinkedSourceRevisions?`. المدخلات المالية ليست مصدرًا للتسعير: `expectedUnitPrice` للمقارنة فقط، وتُرفض حقول الإجمالي والأسعار الإضافية أو غير المعروفة. الرد: `draft` بأسعار Decimal strings وحالة `changed` لكل سطر، `messagePreview` كاملة، و`acceptanceToken` موقعة ومدتها عشر دقائق.

`POST /public/menus/:restaurantSlug/checkout/whatsapp/confirm` يستقبل `{request, acceptanceToken}`. يعيد التحميل والتحقق والحساب داخل معاملة Serializable جديدة. إذا تغيّرت البيانات أو انتهت الموافقة، يعيد HTTP 409 مع `WHATSAPP_CHECKOUT_REQUIRES_ACCEPTANCE`, `changedDraft`, `changedMessagePreview` وToken جديدة، **دون رابط**. بعد التطابق يعيد `message` و`whatsappUrl` الرسميين. أخطاء الإدخال 400؛ غياب الميزة/Capability ‏403؛ نفاد/اختلاف المصدر أو طول الرابط أو تعارض Serializable معروف 409 منظم؛ غياب مفتاح صحيح 503. لا تُعاد أخطاء Prisma الداخلية للزبون.

مثال مختصر بلا بيانات حقيقية:

```json
{"locale":"ar","fulfillmentType":"pickup","items":[{"mode":"LEGACY","lineId":"legacy:salad","productSlug":"salad","quantity":1,"expectedUnitPrice":"12.000001"},{"mode":"NETWORK","lineId":"pizza-1","productId":"pizza-id","quantity":1,"selection":{"schemaVersion":1,"productId":"pizza-id","configurationRevision":2,"groups":[]},"expectedUnitPrice":"265.000004"}]}
```

الـ`selection` أعلاه شكل توضيحي للغلاف فقط؛ يجب إرسال مجموعات واختيارات صالحة من Public Configurator الفعلي، وإلا تُرفض. يتضمن رد المسودة أسماء وأسعارًا وتفاصيل تحضير مأخوذة من الخادم، وليس من Local Storage.

## مصادر الحقيقة وإعادة التحقق

- Legacy: `Product.basePrice` الحالي داخل المطعم، بشرط أن يظل Legacy وفعّالًا ومتاحًا؛ Decimal string هو مصدر الحساب. `basePriceExact` في المنيو مجرد hint للمقارنة، ولا يُقبل كإجمالي موثوق.
- Network: `quotePublicProductConfiguration` ومحرك Shared نفسه للتحقق من Size وNested وIncluded والحدود وLinked ORIGINAL/CUSTOM والنسخ المستقلة. يُنشأ Snapshot **داخل المسودة المؤقتة** لضمان تطابق Price Breakdown؛ لا يُحفظ Order Snapshot جديد.
- جميع العناصر يجب أن تنتمي إلى Restaurant المأخوذ من `restaurantSlug`، وبعملة المطعم نفسها. تُراجع Subscription Capability وTheme وAvailability وRevision ومصادر Linked ونوع المنتج ورقم المطعم الرسمي. المعاملة تقفل صفوف Restaurant/Capability/Products ذات الصلة وفق استراتيجية الكتالوج الحالية، دون تغيير استراتيجية Stage 6C.
- لا يحدث تصحيح صامت للاختيار. يتغير السعر/Revision/Availability/مصدر Linked بين prepare وconfirm فيُرفض الرابط أو تُطلب موافقة جديدة بحسب نوع التغير. السلة محفوظة لكل مطعم، وNetwork instance IDs مستقلة.
- الرسالة من المسودة الموثوقة بعد التحقق، وتستخدم Formatter الشبكة لاستخراج الحجم والإضافات وIncluded وNested وLinked، مع Adapter صغير لأسطر Legacy. النصوص تُنظَّف للعرض؛ المبالغ تُجمع بـShared Decimal-safe arithmetic فقط. رابط WhatsApp يُرفض إذا تجاوز 8192 حرفًا؛ لا قطع صامتًا.

## تدفق الزبون والحماية

عند تفعيل العلم والمفتاح في بيئة مراجعة معزولة، يظهر Checkout واحد للسلة المختلطة. يراجع الزبون العناصر، يكتب ملاحظات الصنف والطلب وبيانات الاستلام/التوصيل وفق العقد الحالي، يطلب مسودة موثوقة، ويرى تفاصيل الرسالة والأسعار. زر الموافقة يفتح تبويبًا فارغًا أثناء النقر، ثم يوجهه إلى `wa.me` **فقط** بعد confirm ناجح. عند 409 يغلق التبويب وتظهر المسودة الجديدة، دون فقد السلة. أي تعديل في السلة أو بيانات العميل يلغي الموافقة السابقة في الواجهة؛ الخادم يتحقق مجددًا بصرف النظر عن الواجهة.

العلم OFF افتراضيًا، ووجود المفتاح الصحيح شرط خادمي في كلا endpoint. لا تُستخدم أعلام أو مسارات NETWORK_TEST. بقيت حماية loopback/disposable الخاصة بها دون تغيير. مدخلات المسار محدودة، ولا تُسجل بيانات هاتف الزبون أو ملاحظاته في Logs جديدة. Rate Limiting العام الموجود في `main.ts` ما زال per-process، وهو **غير كافٍ كسياسة تشغيل متعددة النسخ**؛ يحتاج اعتمادًا قبل التفعيل العام. لا توجد حماية من تغيّر المنيو **بعد** confirm وفتح WhatsApp وقبل ضغط الزبون إرسال؛ هذا حد طبيعي لمسار لا يحفظ Order، ويجب توضيحه تشغيليًا.

## الاختبارات الفعلية

استُخدمت PostgreSQL 16.15 مؤقتة على `127.0.0.1:55440`، قاعدة جديدة باسم `ordersawa_stage3_stage6e2_checkout` وقاعدة regression مستقلة. طُبق Test Baseline وقيود Product الخمس من SQL Stage 2C؛ احتاج اختبار Legacy Regression أعمدة Stage 6C فأضيف SQL الاختباري إلى القاعدتين المؤقتتين فقط. لم تُستخدم `.env` الحقيقية. نتائج آخر تشغيل بعد التعديل النهائي:

| الاختبار | النتيجة |
|---|---:|
| Shared | 21/21 ناجح |
| API كامل مع قاعدتي الاختبار المخصصتين | 132 ناجح، 69 متخطى من 201؛ 5 ملفات تتطلب قواعد/أعلام disposable أخرى ولم تُحسب ناجحة |
| HTTP/PostgreSQL Checkout الجديد | 11/11 ناجح ضمن API، وتشمل Legacy-only وNetwork-only وMixed، السعر/Revision/Availability/Linked/Capability/tenant، حقن السعر، طول الرابط، الرسالة وعدم حفظ Order |
| Product Configuration HTTP/PostgreSQL regression | 23/23 ناجح ضمن API بعد استكمال Stage 6C test schema |
| Web | 40/40 ناجح، بينها استعادة السلة المختلطة والملاحظات والسعر العشري |
| Browser Runner على Nest وNext وPostgreSQL حقيقيين محليًا | 8/8 checkpoints ناجحة: Pizza، Legacy، Combo متكرر ORIGINAL/CUSTOM، Reload، RTL/390px، مسودة ورسالة كاملة، تغيّر سعر، إعادة موافقة وURL صحيح؛ الرابط اعتُرض ولم يُفتح خارجيًا |
| Root Typecheck / Root Build | ناجحان؛ 27/27 صفحة Next مولّدة |

محاولات تشغيل مبكرة فشلت بسبب TEMP خارج مساحة الكتابة، ونقص أعمدة Stage 6C في Test Baseline، وحد عرض ملاحظة Legacy في Adapter؛ صُححت البيئة والـAdapter وأعيدت الاختبارات بنجاح. Browser Runner لا يدّعي تغطية كل حالة منفردة في قائمة 28 داخل المتصفح: تعديل/حذف عنصر وبعض فروع 403 والـflag OFF مغطاة باختبارات Web/HTTP، لا بسيناريو Chrome مستقل. لم يُختبر فتح WhatsApp أو إرسال فعلي. لقطة 390px: `../work/stage6e2-mixed-cart-mobile.png` خارج Git ولا تحتوي بيانات عميل حقيقية.

## تجربة Demo محلية آمنة

شغّل فقط قاعدة PostgreSQL disposable باسم الاختبار المذكور، وحمّل Test Baseline والقيود الخمس الرسمية وStage 6C SQL التجريبي؛ ثم شغّل اختبار `public-whatsapp-checkout.integration.spec.ts` لتجهيز Fixtures الاصطناعية. استخدم API وNext على `127.0.0.1` مع `ENABLE_PUBLIC_NETWORK_WHATSAPP_CHECKOUT=1` ومفتاح HMAC **اختباري مولّد محليًا وغير محفوظ في Git** و`NEXT_PUBLIC_API_URL` المحلي. افتح `/m/s6e2-r1/product/s6e2-pizza` ثم `/m/s6e2-r1/cart`. يمكن إعادة السيناريو عبر `node scripts/stage6e2-whatsapp-browser-e2e.mjs`؛ يرفض Runner أي قاعدة لا تطابق اسمه/منفذه/loopback، ويعترض `window.open` حتى لا يتصل بـWhatsApp. لا تستخدم هذا الإعداد مع قاعدة حقيقية.

## التوافق والقرارات المعلّقة

عندما يكون علم المرحلة OFF، يبقى Legacy WhatsApp Checkout القديم كما كان، بما فيه Order Persistence وسلوكه القديم؛ وعند ON تستخدم سلة Legacy-only المسار الموثوق الجديد **دون حفظ Order**، وفق قرار هذه المرحلة بعدم إنشاء Persistence غير ضرورية. هذا اختلاف سلوكي مقصود يجب مراجعته قبل التفعيل. لم تتغير الأسعار المخزنة أو Product CRUD أو Billing أو Dashboard أو Network Test Orders أو Design A أو Idempotency أو حارس DB أو Snapshots التاريخية أو `orderingEnabled:false`.

لا تزال موانع/قرارات Production التالية مفتوحة: سياسة تقريب وعرض العملة، Migration History الحقيقية، إدارة وتدوير مفتاح HMAC عبر النسخ، Rate Limit موزع وحماية إساءة الاستخدام، سياسة الاحتفاظ ببيانات العميل عند عدم حفظ Order، رقم الطلب التجاري، الهاتف والرسوم/الضرائب/الخصومات، اللغات التاريخية، Business/Outlet وScheduling المستقبلية. لا توجد سياسة رسوم أو تقريب جديدة في هذا التنفيذ. كما تبقى تكلفة Full Catalog Loading/`FOR SHARE` والاعتماد على اشتراك المطعم الحالي ديون أداء معروفة. لا يُعد نجاح PostgreSQL وChrome المحلي إذن تفعيل عام أو Deployment.

## Git

الفرع: `feature/product-configuration-network`. البداية النظيفة: `f152b06` (Stage 6E.1A). Commit التنفيذ: `ec9e6ec`. يُحفظ هذا التقرير وتحديث `CODEX_HANDOFF.md` في Commit توثيق منفصل بعد مراجعة الأسرار؛ راجع `git log -2` و`git status` للحصول على Hash التوثيق النهائي. لا توجد تغييرات Database Schema أو Migrations ضمن هذه المرحلة.
