# OrderSawa — تقرير Stage 6B: دمج شبكة التكوين مع السلة

التاريخ: 2026-10-12. الفرع: `feature/product-configuration-network`. أُنجز التنفيذ في Commit مستقل `4ec4c14` (`feat(web): integrate Stage 6B Network cart with server quote`) فوق Stage 6A `55b5dc9`. تقرير التسليم وملف handoff في Commit توثيقي تالٍ؛ راجع `git log -2 --oneline` للحالة النهائية.

## النطاق والنتيجة

دُمج Public Product Configurator مع السلة الموجودة في `PublicMenuClient`، من دون إنشاء Checkout أو Order أو API جديد. يتطلب إدراج Network Product استجابة `POST /public/menus/:slug/products/:id/quote` من Stage 6A. تُحفظ اختياراته البنيوية ونسخ Linked Product المستقلة، ويُعرض السعر الموثوق **عند لحظة الرد فقط** مع تحذير أنه قابل للتغير. واجهة السلة للمعاينة؛ يُمنع إرسال أي سلة تحتوي Network عبر مسار Checkout/WhatsApp القديم، بما في ذلك الحارس داخل دالة الإرسال نفسها. لم يتغير Backend أو Prisma أو Shared Engine أو نظام Legacy العام.

## عقد هوية السطر والتخزين

`CartItem` اتحاد واضح بين `LEGACY` و`NETWORK` ضمن السلة نفسها. هوية Network سلسلة مستقرة مشتقة من: نوع السطر، Restaurant slug، Currency، Product ID، `configurationRevision`، `selectionKey` الصادر من Shared Engine، مراجعات وأنماط Linked Sources، و`runtimeContext` الحالي. تُرتّب مراجعات المصادر قبل تكوين الهوية. لذلك تندمج الاختيارات المتساوية دلاليًا حتى عند اختلاف `instanceId`، بينما تبقى الأحجام، والتكوينات المتداخلة، والاختيارات الفرعية لمصادر ORIGINAL/CUSTOM، والإصدارات والسياقات المختلفة أسطرًا منفصلة. لم نستخدم `slug` وحده أو `JSON.stringify` الخام للاختيار في الدمج.

تُخزَّن السلة في مفتاحها السابق `cart:<restaurant-slug>:main` بغلاف `version:2` واسم المطعم. تُرحَّل مصفوفات Legacy القديمة عند القراءة فقط؛ لا تتحول إلى Network ضمنيًا. يُرفض العنصر المحلي التالف أو ذو `price:null` بدل تحويله إلى صفر، وتظل قيمة صفر صحيحة. يُعاد تحميل Network بحالة `CHECKING` حتى يرد Quote جديد؛ لا يصبح السعر المخزن موثوقًا بمجرد الاستعادة. أي تغيير في السعر/Breakdown/مراجعات المصادر يبقي الاختيار والسعر المقبول سابقًا ويعرض المقترح منفصلًا. زر الموافقة يعيد Quote ولا يقبل سوى المقترح نفسه؛ إن تغيّر مجددًا تظل الحالة `CHANGED`. عند 409/403/عدم التوافر يصبح السطر `INVALID`؛ عند فشل الشبكة أو الخادم يصبح `OFFLINE`. لا يوجد تصحيح صامت أو موافقة تلقائية.

يمكن تعديل تكوين السطر بالعودة إلى صفحة الصنف مع اختياراته الأصلية، ثم Quote جديدة. إذا تغيّر Revision تعرض الواجهة تنبيهًا وتبدأ اختيارًا جديدًا، مع إبقاء سطر السلة القديم دون تعديل إلى أن يحفظ المستخدم صراحةً. يُسمح بتعديل الكمية والحذف مستقلًا. بوابة جيل الطلبات تمنع استجابة Quote قديمة من تجاوز اختيار أحدث؛ وتوجد هوية طلب منفصلة لكل سطر عند إعادة فحص السلة أو إعادة المحاولة.

Legacy CRUD في السلة بقي قائمًا، مع اختبار الإضافة وتعديل الكمية والحذف والسعر الصريح صفر. السلة المختلطة معطلة الإرسال بالكامل حتى لا يُرسل جزء من الطلب على أنه الطلب كله. وإذا كان سطر Legacy محفوظًا محليًا ثم صار منتجه Network في Catalog الحالي، لا يُحوَّل أو يُحذف بصمت؛ تظهر رسالة إزالة وإعادة إضافة، ويُمنع WhatsApp القديم حتى تُحل الحالة.

## الملفات

- `apps/web/src/components/public/cart-model.ts` (جديد): عقد السلة، الهوية، الدمج، إعادة فحص Quote، قبول التغيير، الاستعادة الآمنة وعمليات Legacy.
- `apps/web/src/components/public/cart-model.test.ts` (جديد): الهوية، الاختيارات المتداخلة، Linked instances، الإصدار، التخزين، التغيير، Legacy وبوابة Checkout.
- `apps/web/src/components/public/public-quote-client.test.ts` (جديد): طلب Quote وأخطاء 409/403/انقطاع الاتصال.
- `apps/web/src/lib/api.ts`: عقد استجابة Quote وعميل HTTP دون إرسال أسعار من React.
- `apps/web/src/components/public/product-configurator-model.ts` واختباره: منع أثر Quote الأقدم.
- `apps/web/src/components/public/product-configurator.tsx` واختباره وملف CSS الخاص به: الإضافة/التعديل مع حالات التحميل والخطأ والرجوع إلى السلة.
- `apps/web/src/components/public/public-menu-client.tsx` و`apps/web/src/app/globals.css`: ربط السلة والواجهة والـRTL/الشاشات الصغيرة والحارس الذي يمنع Network Checkout/WhatsApp.
- `STAGE_6B_NETWORK_CART_REPORT_AR.md` و`CODEX_HANDOFF.md`: توثيق المرحلة.

## الاختبارات الفعلية

| الفحص | النتيجة |
|---|---:|
| Shared Vitest | 21/21 ناجحة |
| API Vitest، بما فيها تكامل/HTTP على PostgreSQL disposable | 96/96 ناجحة، 0 متخطاة، 17 ملفًا |
| Web Vitest | 35/35 ناجحة، 0 متخطاة، 7 ملفات |
| الإجمالي | 152/152 ناجحة، 0 متخطاة |
| Root Typecheck | ناجح |
| Root Build | ناجح؛ Next.js أنشأ 27/27 صفحة/مسار |

أنشئت مجموعة PostgreSQL 16 **جديدة** في `../work/stage6b-postgres-data` خارج Git، واستُخدمت قاعدة `ordersawa_stage3_stage6b` على `127.0.0.1:55440` بعد تطبيق Baseline SQL الاختباري `../work/stage3-full-schema.sql` عليها فقط. محاولة أولى على منفذ 55441 رفضها حاجز اختبارات Stage 3 قبل أي اختبارات DB؛ أُوقفت المجموعة وأُعيد تشغيلها على 55440، فنجحت 96/96. أُوقف PostgreSQL بعد الاختبارات؛ لم تُستخدم ملفات `.env` الحقيقية أو قاعدة موجودة أو Migration/Backfill على بيانات حقيقية. لم يُنفَّذ Browser E2E لهذه المرحلة؛ السلة مغطاة باختبارات الموديل وعميل HTTP وBuild، أما التحقق الشامل في المتصفح فمؤجل إلى Stage 6D كما طلب المستخدم. لم تُلتقط Screenshots.

## تجربة محلية آمنة

استخدم **قاعدة disposable جديدة فقط** مع Schema Stage 2C ثم Fixture المطعم Demo من تقرير Stage 5. أداة Fixture ترفض أي قاعدة لا يبدأ اسمها بـ`ordersawa_stage3_stage5_` وعلى المنفذ المحلي `55440`؛ لا تستخدم قاعدة Stage 6B أعلاه أو `.env` الحقيقي. بعد تجهيز القاعدة، راجع أوامر `STAGE_5_PUBLIC_CONFIGURATOR_REPORT_AR.md` في قسم «أمثلة Demo وطريقة التشغيل المحلي»: شغّل `seed:stage5-public-demo`، ثم `npm run dev:api` و`npm run dev:web` مع `NEXT_PUBLIC_API_URL=http://localhost:5000`، وافتح `http://localhost:3000/m/stage5-demo/menu`. اختر Pizza أو Combo، أكمل التكوين واضغط «تحقق وأضف إلى السلة»، ثم افتح `/m/stage5-demo/cart`. جرّب تكوينين مختلفين، تعديل كمية/تكوين، تحديث الصفحة، وقبول تغير السعر. هذا Demo محلي فقط؛ زر إرسال Network غير موجود.

## مراجعة أمان Quote والمخاطر المتبقية

- جسم الطلب له حد افتراضي `256kb` في `main.ts`، وطلب POST يخضع لسياسة Rate Limit العامة للكتابة (`120` لكل IP/دقيقة افتراضيًا). Parser في Stage 6A يرفض الحقول السعرية/المجهولة ويحد العمق وعدد العقد/الوحدات. لم أغيّر هذه الضوابط في Stage 6B.
- **مخاطرة متوسطة قبل إطلاق عام:** Quote يعيد قراءة Catalog المطعم كاملًا ويحسب قابلية التكوين؛ الكلفة قد تكبر مع المطاعم الكبيرة، وحدّ الاستدعاءات عالمي لكل IP لا لكل Restaurant/Product. يلزم قياس وحماية أدق قبل التوسع، دون الالتفاف حول Shared Engine. ليست ثغرة تسمح بطلب Network حاليًا لأن الطلب معطل.
- تخزين Local Storage قابل للتلاعب؛ استُخدم فقط للعرض وإعادة إرسال الاختيار إلى Quote، وليس كسلطة Order. Stage 6C يجب أن يعيد قراءة البيانات والتسعير في معاملة الحفظ، ويتعامل مع تغيّر الأسعار والـCapability والتوافر والمصادر من دون اعتماد Quote قديم.
- لا توجد سياسة تقريب عملة معتمدة، ولا Order Snapshot أو Business/Outlet Differential أو Service Mode/Scheduling. لم يُضف حساب مالٍ عائم لمنتجات Network؛ عرض ضرب الكمية يستعمل `multiplyMoney` من Shared. مسار Legacy السابق ما زال يستخدم `number` كما كان، ولم يُعاد تصميمه.
- لا يضمن نجاح Quote بقاء السعر أو قابلية الطلب حتى الإرسال؛ `previewOnly:true` و`orderingEnabled:false` باقيان. لا تُستخدم السلة الحالية لإنشاء طلب.

نقطة التوقف: Stage 6B مكتملة في المصدر فقط. لا تبدأ Stage 6C أو 6D ولا تُفعّل Network Ordering قبل موافقة مستقلة.
