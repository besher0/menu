# OrderSawa — Stage 6E.1A: حماية إنشاء وتفعيل Network Product

التاريخ: 2026-10-14. الفرع: `feature/product-configuration-network`. البداية من Commit ‏`d343c2ae923015a5c5b636ef211ff6e3e0ee115d` مع Git Status نظيف. هذه المرحلة تصلح فجوة إنشاء المنتج فقط؛ لا Checkout عام، ولا تفعيل Network Ordering أو إرسال WhatsApp أو Migration على قاعدة حقيقية.

## السبب الجذري والقرار

Stage 6E.1 كان يحفظ `configurationIntent:"NETWORK_SETUP"` في الطلب فقط؛ المنتج المنشأ بقي `configurationTree=NULL` و`configurationVersion=0` وBase Price تمهيديًا. هذا يطابق تعريف Legacy وقيد Stage 2C `Product_configuration_legacy_state_check`. لذلك كان `PATCH /dashboard/products/:id/toggle-availability` يستطيع إظهاره للـLegacy Public Menu/WhatsApp قبل أول حفظ للشبكة.

اخترنا أصغر حل داخل العقد الحالي، دون Schema أو Configuration مصطنعة: إنشاء صف Product **بـINSERT واحدة** تحمل هوية Network حقيقية `{schemaVersion:1, productId, revision:1, basePrice:null, groups:[]}`، و`configurationVersion=1`، و`basePrice=NULL`، و`isAvailable=false`. يفحص الإنشاء البنية عبر `validateConfiguration` من Shared. الشجرة الفارغة سليمة **بنيويًا** وفق V1 وقيود Stage 2C، لكنها غير قابلة للبيع: `calculatePrice` يعيد `MISSING_PRICE_SOURCE`، و`calculateMinimumPrice` يعيد `orderable=false` و`minimum=null`. ليست سعرًا وهميًا أو منتجًا Legacy مؤقتًا، ولا تكتب Dependency Edges لأنها بلا Linked nodes. السعر الاختياري الصريح في أول حفظ لاحق يمكن أن يبقى `null` أو يصبح `"0"` حقيقيًا. يبدأ المحرر من Revision 1، وأول PUT يصير Revision 2، مع حفظ Tree/Base/Edges المعتاد في Transaction الحالية ودون تغيير `isAvailable`.

يرفض Backend أي `basePrice` مرسلة مع `NETWORK_SETUP`، ويرفض التفعيل المبكر بخطأ 409 `PRODUCT_CONFIGURATION_SETUP_INCOMPLETE`. يعرض GET الإداري `SETUP_INCOMPLETE` مع بقاء Capability loss أعلى أولوية. بقي إنشاء Legacy العادي بحاجة إلى Base صريح، وQuick Price ممنوعًا لأي Network Product. عند فقد Capability تبقى الشجرة محفوظة، ولا يتحول الصنف إلى Legacy. لا تعتمد السلامة على Redirect أو إخفاء عنصر React.

## حدود Legacy/Network ومسارات الفحص

| المسار | حماية الإعداد غير المكتمل |
|---|---|
| `POST /dashboard/products` | إنشاء Network/NULL Base/Revision 1 ذرّيًا؛ صلاحية structural + capability كما في Stage 6E.1؛ السعر التمهيدي يُرفض |
| Product PATCH وQuick Price | PATCH لا يغير Base للشبكة ولا يستعمل Intent؛ Quick Price يرجع 409؛ DTO لا يكتب `isAvailable` |
| Availability Toggle | يرجع 409 للإعداد الفارغ غير المسعّر قبل أول تكوين قابل للتسعير؛ بعد حفظ Pizza صحيحة يعود التحكم اليدوي المعتاد، ولا يفعّل الحفظ المنتج تلقائيًا |
| Public Menu/Configurator/Quote | Network لا يطابق Legacy predicate قط؛ المخفي لا يظهر. حتى عند إجبار `isAvailable=true` مباشرةً في قاعدة الاختبار، يرجع Public Configurator `orderable=false` وQuote ‏409 بلا Trusted Total |
| ORIGINAL/CUSTOM Linked source | مصدر Network غير المسعّر لا يُعتبر orderable في Public resolver حتى لو غُيّر توفره خارج API؛ لا يُخفّض Min في Parent. تبقى قواعد ORIGINAL/CUSTOM الأخرى كما هي |
| Legacy WhatsApp Checkout | predicate البنيوية `Tree IS NULL + Version 0` ترفض الإعداد عبر HTTP حتى مع تغيير التوفر خارج API؛ Legacy حقيقي بسعر صفر يظل يعمل |

التزامن: اختبار حفظ أول تكوين مع Toggle متزامن سمح فقط بنتيجة Toggle ‏200 بعد الحفظ أو 409 قبله، مع استمرار Network identity وNULL Base ورفض Legacy Checkout. الفشل المحافظ 409 عند سباق مع الحفظ ليس فقدًا للبيانات. لا تغيّر هذه المرحلة استراتيجية Serializable للحفظ أو تسعير Shared.

## الملفات

- `apps/api/src/modules/products/network-setup-configuration.ts` و`.spec.ts`: عقد الإعداد والبرهان المالي.
- `apps/api/src/modules/products/products.service.ts`: INSERT أولية آمنة وحاجز Availability.
- `apps/api/src/modules/products/product-configuration.service.ts`: حالة GET ‏`SETUP_INCOMPLETE`.
- `apps/api/src/modules/products/product-configuration.integration.spec.ts`: HTTP/DB للتفعيل، العزل، Legacy، null/zero، Quote، Revision والتزامن.
- `apps/api/src/modules/public-menu/public-product-configuration.ts` و`.spec.ts`: مصدر Linked غير المكتمل غير قابل للطلب.
- `apps/web/src/components/dashboard/product-form.tsx` و`product-configuration/types.ts`: إزالة السعر التمهيدي، نصوص الإعداد وتوسيع حالة GET.
- `scripts/stage6e1-dashboard-browser-e2e.mjs`: تحديث Runner الفعلي لقاعدة 6E.1A والإصدار الجديد والحاجز.
- هذا التقرير و`CODEX_HANDOFF.md`.

لا تغيّر Prisma Schema أو Migration History أو Legacy tables أو Shared Engine أو Order Persistence أو Test-only endpoint guards.

## PostgreSQL والاختبارات الفعلية

استخدمت PostgreSQL 16.15 **جديدة** في `../work/stage6e1a-postgres-data` على `127.0.0.1:55440`، وقاعدتين جديدتين معزولتين `ordersawa_stage3_stage6e1a_api` و`ordersawa_stage3_stage6e1a_browser`. لم أستخدم `.env` أو قاعدة قائمة/حقيقية. بعد Test Baseline المشتقة من Prisma وSQL Stage 6C التجريبي، استخرجت **نص قيود Product الخمسة نفسه** من `apps/api/prisma/migrations/20261012000000_product_configuration_network/migration.sql` وطبقته على القاعدتين فقط؛ ثم نفذت أوامر `VALIDATE CONSTRAINT` الخمسة من الملف الرسمي. استعلام `pg_constraint` أكد `convalidated=true` للخمسة، ومنها Legacy state وShape وBase match. محاولة SQL لإدراج Legacy بقاعدة `basePrice=NULL` فشلت باسم `Product_configuration_legacy_state_check` ولم تترك صفًا. لم أطبّق Migration الرسمية كاملة أو أعدل تاريخها؛ هذا تحقق مباشر من CHECKs الأصلية فوق Schema الاختبار، وليس إثباتًا لتاريخ أي قاعدة حقيقية.

| الفحص | النتيجة |
|---|---:|
| HTTP/PostgreSQL Product Configuration على CHECKs الحقيقية | 23/23 ناجح |
| API كاملة | 121 ناجح، 69 متخطى، 0 فشل؛ خمس مجموعات تحتاج قواعد/أعلام اختبار منفصلة |
| API Unit الموجّهة (ضمن المجموعة الكاملة) | 11/11 ناجح |
| Shared | 21/21 ناجح |
| Web | 39/39 ناجح |
| Chrome/Nest/Next Browser E2E | 6/6 نقاط: إنشاء، رفض تفعيل/وصول مبكر، Pizza GET/PUT، Reload، RTL/390px، Legacy صفر |
| Root Typecheck وBuild | ناجحان؛ Next.js ‏27/27 صفحة |
| Prisma Validate و`node --check` | ناجحان |

اختبار HTTP أثبت 403 للصلاحية/Capability، و400 لـIntent خاطئة أو Base تمهيدي، و409 للتفعيل/Quick Price/PATCH Base والإصدار القديم، ورفض Legacy WhatsApp عبر HTTP، ثم Quote موثوقة `10.000001` بعد حفظ Pizza وتفعيلها. فُحص حفظ Base `null` ثم `"0"` دون تحويل أحدهما إلى الآخر. عند فرض توفر الإعداد غير المكتمل من SQL مباشرةً ظلت Quote/Legacy ordering مغلقتين. Browser Runner حقيقي وليس Fixture رسالة؛ صورته في `../work/stage6e1a-dashboard-mobile.png` خارج Git. لا تدعي هذه النقاط تغطية كل Combo Browser flows؛ بقيت اختبارات المراحل السابقة لها.

## أثر المنتجات القديمة والمخاطر المتبقية

منتجات Legacy القائمة **لا تُحوَّل**؛ إنشاءها المعتاد وتسعيرها السريع وسعرها صفر بقيت كما كانت. منتجات Network المحفوظة سابقًا لا تُعدل، وAvailability اليدوية لها تبقى. **أي Shell قديم أنشئ بكود Stage 6E.1 قبل هذا التعديل يظل Legacy مخفيًا وله سعر تمهيدي**: لا توجد حالة دائمة تسمح بتمييزه تلقائيًا من Legacy حقيقي. لا نفترض وجود هذه الصفوف في قاعدة حقيقية؛ قبل أي نشر يلزم تدقيق قراءة مستقل مع إذن وخطة صريحة لمعالجتها إن وجدت. لا Backfill أو Migration الآن. تاريخ Migrations الحقيقي غير مدقق، وStage 2C لم يُفترض تطبيقها على Production.

فجوة الإعداد الجديدة مغلقة في Source Code وPostgreSQL disposable؛ **هذا لا يجيز Stage 6E.2 أو Production Activation تلقائيًا**. ما زالت قرارات العملة/عرضها وتقريبها، Business/Outlet/Market، الهاتف والرسوم، الترجمة التاريخية، HMAC/Auth/Rate وMigration History وWhatsApp Sending مانعة للإطلاق. Full Catalog/Locking والأداء مسائل مستقلة. `orderingEnabled:false` وحواجز `NETWORK_TEST` لم تتغير.

Git: Commit مستقل لهذه المرحلة فوق `d343c2a`. Hash النهائي يُقرأ من `git log -1 --format=%H` بعد حفظ التقرير، لأن إدخاله في محتوى Commit نفسها يغيّر Hash. تحقق من `git status --short --branch`؛ يجب أن تكون الشجرة نظيفة. **توقف بعد Stage 6E.1A.**
