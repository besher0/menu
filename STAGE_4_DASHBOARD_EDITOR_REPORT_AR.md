# OrderSawa — تقرير تنفيذ Stage 4: Dashboard Product Configuration Editor

التاريخ: 2026-10-12

الفرع: `feature/product-configuration-network`

الحالة: مكتملة داخل نطاق Stage 4 فقط، ولم يبدأ Stage 5.

## 1. الملخص التنفيذي

تم بناء محرر تاجر فعلي لشبكة تكوين الأصناف داخل نموذج تعديل الصنف القائم في OrderSawa، وليس كمشروع مستقل أو Prototype منفصل. يعتمد المحرر مباشرة على عقود `ProductConfigurationV1` ومحرك Stage 1، ويتعامل فقط مع واجهتي Stage 3 المعتمدتين للقراءة والحفظ:

- `GET /dashboard/products/:id/configuration`
- `PUT /dashboard/products/:id/configuration`

يستخدم البحث عن Linked Products مسار قائمة الأصناف الموجود أصلًا `GET /dashboard/products` تحت Restaurant Context نفسه؛ لم يُنشأ أي Backend API جديد.

لم تُعدّل Prisma Schema أو Migrations أو Backend أو Public Menu أو Cart أو Checkout، ولم يحدث اتصال بأي قاعدة بيانات حقيقية أو تنفيذ Migration/Backfill/Deployment.

## 2. المكونات المنفذة

الموقع الرئيسي:

`apps/web/src/components/dashboard/product-configuration/`

### المحرر الرئيسي

`product-configuration-editor.tsx`

- تحميل حالة Legacy/Network والنسخة الحالية والـCapability.
- إنشاء مسودة Network من منتج Legacy دون تحويل المصدر أو الحفظ التلقائي.
- ضبط `expectedVersion` و`revision = expectedVersion + 1`.
- حفظ يدوي صريح فقط.
- حفظ مسودة محلية في `localStorage` مع مفتاح معزول حسب المطعم والصنف.
- حماية `beforeunload` والتنقل عبر الروابط عند وجود تغييرات غير محفوظة.
- Cancel مع تأكيد قبل فقد البيانات.
- الحفاظ على المسودة عند HTTP 409 وإتاحة Rebase صريح على رقم النسخة الأحدث.
- إظهار HTTP 400 المهيكل، ورسائل 403/Capability، وعدم حذف البيانات أو الرجوع إلى Base عند فقد الميزة.

### Tree Editor وInspector

`configuration-workspace.tsx`

- شجرة رأسية Recursive RTL، وليست جدولًا.
- مجموعات `SIZE` و`OPTIONS` متعددة ومستقلة.
- إضافة وتعديل وحذف العقد، مع تأكيد حذف العناصر التي تحمل بيانات أو أبناء.
- إعادة ترتيب المجموعات والأحجام والخيارات بأزرار واضحة.
- Stable IDs باستخدام `crypto.randomUUID()` عند توفره.
- تحرير العقدة المحددة في Inspector منفصل لتقليل ازدحام الواجهة.
- Group min/max وIncluded Quantity.
- Option min/max quantity، السعر الافتراضي، Availability، والمجموعات المتداخلة.
- أسعار Size كاملة مستقلة وليست `priceDelta`.
- Size-specific overrides؛ الفراغ يعني fallback و`0` يعني صفرًا صريحًا.
- دعم الشاشة الصغيرة عبر تخطيط أحادي العمود وتحكمات بعرض كامل.

### Linked Products وCombos

- بحث Tenant-scoped باستخدام مسار قائمة الأصناف الحالي مع debounce وبحث Server-side.
- منع اختيار الصنف الحالي من الواجهة مع استمرار تحقق Backend الإلزامي.
- تحذير وتعطيل المنتجات غير المتاحة.
- `ORIGINAL` متاح فقط لمصدر Network محفوظ.
- مصدر Legacy يعرض `CUSTOM فقط`، ويتطلب إجراءً صريحًا لإنشاء Snapshot؛ لا يحدث Auto-conversion.
- عرض بنية مصدر ORIGINAL الحية.
- تحرير Parent-context overrides لعقد السعر؛ عدم وجود override يعني صفرًا محليًا وفق العقد.
- محرر Recursive مستقل لـCUSTOM Snapshot.
- دعم تكرار المصدر نفسه في أكثر من Combo slot.
- أخطاء Self-link وCycles وMissing/Cross-tenant Source تعرض من Shared/Backend بصورة مهيكلة.

### المعاينة والتسعير

`configuration-preview.tsx`

- اختيار الأحجام والخيارات وتعديل الكميات.
- معاينة Nested Groups وLinked Product selections.
- Included Quantity وSize overrides.
- Price breakdown والسعر النهائي.
- يستخدم `calculatePrice` من `@menu/shared` مباشرة.
- الأموال تبقى Decimal strings؛ لا يوجد `parseFloat` أو `toFixed` أو حساب Money بـJavaScript floating-point.
- عند عدم صلاحية Selection يعرض Issues بدل سعر مضلل.

### State وAPI وMessages

- `editor-model.ts`: عمليات Immutable للشجرة، Stable IDs، المسودات، البحث عن العقد، الحذف، الترتيب، والإضافة.
- `api.ts`: عميل GET/PUT المعتمد مع أخطاء 400/403/409 المهيكلة، إضافة إلى قائمة الأصناف الحالية للبحث.
- `messages.ts`: ترجمة عربية واضحة لأخطاء Shared والـBackend الشائعة.
- `types.ts`: أنواع Envelope/Capability/Draft/API Error المطابقة للـBackend الفعلي.

## 3. التكامل مع Product Form القديم

تم تعديل `apps/web/src/components/dashboard/product-form.tsx` بصورة محدودة:

- يظهر محرر الشبكة فقط بعد وجود `productId` محفوظ؛ إنشاء الصنف الجديد يبقى مسار Legacy الحالي.
- أصبح نوع `basePrice` في الاستجابة يقبل `null`.
- لا يُرسل السعر الفارغ كـ`0`؛ تم حذف تحويل `Number("")` من Payload.
- حقل السعر القديم يصبح معطلًا لمنتج Network، ويُدار Base حصريًا عبر PUT الشبكة.
- حفظ بيانات الصنف القديم لا يغادر الصفحة إذا كانت مسودة الشبكة غير محفوظة.
- لم تُغيّر الصور أو 3D/VR أو التصنيف أو Metadata أو Import/Export أو صلاحيات النظام.

## 4. Base Price وسياسة المال

- `null` يظهر بوضوح كـ«لا يوجد سعر أساسي».
- إضافة Base تبدأ فقط بفعل مستخدم صريح، وقيمتها الابتدائية `"0"` بوصفها صفرًا حقيقيًا.
- حذف Base يعيده إلى `null` لا إلى صفر.
- وجود Size يعرض تنبيهًا بأن Shared Engine سيتجاهل Base.
- لم تُعتمد سياسة تقريب عملة جديدة؛ بقي الحد الحالي ست منازل عشرية وعقود Decimal strings.

## 5. أمثلة Demo

الملف: `demos.ts`

جميع الأمثلة تملأ المسودة المحلية فقط بعد تأكيد المستخدم، ولا تنشئ منتجات أو تعدّل Production:

1. **Pizza Margherita**: Small/Medium/Large بأسعار كاملة، Extra Cheese، Sauces، Nested Modifiers.
2. **Included Quantity**: Base = 100 وثلاث إضافات 30/15/50، وأعلى وحدتين مجانًا.
3. **Size-specific Pricing**: سعر الجبنة يختلف حسب Small/Medium/Large، مع fallback وصفر صريح مدعومين في المحرر.
4. **Combo ORIGINAL/CUSTOM**: يبحث في بيانات المطعم التجريبية عن مصدر Network صالح، ينشئ خانتي ORIGINAL مكررتين للمصدر نفسه، وخانة CUSTOM بلقطة صريحة.

تم اكتشاف وإصلاح تكرار Stable IDs في أول نسخة من Pizza Fixture بواسطة الاختبارات؛ أصبحت كل عقدة تحت كل Size تحمل ID فريدًا.

## 6. الملفات الجديدة

- `apps/web/src/components/dashboard/product-configuration/api.ts`
- `apps/web/src/components/dashboard/product-configuration/configuration-preview.tsx`
- `apps/web/src/components/dashboard/product-configuration/configuration-workspace.tsx`
- `apps/web/src/components/dashboard/product-configuration/demos.ts`
- `apps/web/src/components/dashboard/product-configuration/editor-model.ts`
- `apps/web/src/components/dashboard/product-configuration/messages.ts`
- `apps/web/src/components/dashboard/product-configuration/product-configuration-editor.tsx`
- `apps/web/src/components/dashboard/product-configuration/types.ts`
- `apps/web/src/components/dashboard/product-configuration/api.test.ts`
- `apps/web/src/components/dashboard/product-configuration/configuration-workspace.test.ts`
- `apps/web/src/components/dashboard/product-configuration/editor-model.test.ts`
- `apps/web/vitest.config.mts`
- `STAGE_4_DASHBOARD_EDITOR_REPORT_AR.md`

## 7. الملفات المعدلة

- `.gitignore`: تجاهل Temp/Cache الخاصة بـVitest.
- `apps/web/package.json`: إضافة Web test script وVitest.
- `package-lock.json`: تثبيت تعريف Workspace dependency فقط؛ لم تُنزّل حزمة جديدة خارج النسخة الموجودة أصلًا.
- `apps/web/src/app/globals.css`: تصميم المحرر RTL/Responsive المعزول تحت بادئة `pc-`.
- `apps/web/src/components/dashboard/product-form.tsx`: التكامل المحدود الموضح أعلاه.
- `CODEX_HANDOFF.md`: حالة Stage 4 وتعليمات المتابعة.

## 8. الاختبارات الفعلية

### Web Stage 4

- 3 ملفات اختبار.
- 13/13 اختبارًا ناجحًا.
- تغطية: null/zero، Stable IDs، add/move/nest/delete، local draft، Pizza، Included Quantity، size-specific price، ORIGINAL/CUSTOM، repeated source، Admin GET/PUT فقط، 400/403/409، tenant-scoped linked search، وSSR render للشجرة العربية المتداخلة.

### Regression

- Shared: 21/21 ناجحًا.
- API: 65 ناجحًا، و14 اختبار Disposable PostgreSQL متجاوزة لأن Stage 4 لم تنشئ قاعدة مؤقتة ولم تحتج تغيير DB/API.
- الإجمالي المنفذ في آخر جولة: 99 اختبارًا ناجحًا، 14 متجاوزة.
- Root Typecheck (Shared/API/Web): ناجح.
- Prisma Validate: ناجح باستخدام `DATABASE_URL` و`DIRECT_URL` وهميين محليين على `127.0.0.1:1`؛ لا يحدث اتصال في `prisma validate`.
- Root Build: ناجح؛ Shared/API/Web، وNext.js ولّد 27 Route/Page.
- `git diff --check`: ناجح.

احتاج Vitest إلى `TEMP/TMP` داخل مساحة العمل لأن Sandbox يمنع Windows user Temp. لم يكن ذلك عيبًا في الكود.

## 9. الفحص البصري وScreenshots

تم التحقق من RTL/Responsive عبر CSS المخصص، SSR component test، وNext production build. لم تُلتقط Screenshot تشغيلية لأن صفحة المحرر تحتاج جلسة Dashboard مصادقًا عليها وBackend/قاعدة Disposable ببيانات Product وCapability؛ لم يتم استخدام Production أو `.env` حقيقية لمجرد التقاط صورة. هذا قيد بيئة آمن وليس نقصًا في التنفيذ.

## 10. القيود والمخاطر المتبقية

1. Public Configurator وCart وCheckout غير منفذة عمدًا؛ Network Products تظل محمية من المسار العام القديم بقواعد Stage 3.1.
2. لا توجد سياسة تقريب حسب العملة؛ لم تُخترع واحدة.
3. Business Catalog + Outlet Differential مؤجل وفق القرار المعتمد.
4. أمثلة Combo تعتمد على وجود مصدر Network صالح داخل Tenant التجريبي؛ إن لم يوجد تعرض رسالة واضحة ولا تحفظ بيانات ناقصة.
5. اختبارات HTTP/DB الخاصة بـStage 3.1 لم تُعد على PostgreSQL disposable في هذه الجولة، لأنها غير متأثرة وStage 4 لا يغير Backend/DB. آخر حالة معتمدة لها 14/14 ناجحة حسب تقرير Stage 3.1.
6. Full browser E2E لم يُضف لعدم وجود Browser test harness/JSDOM/Playwright في المشروع؛ عُوّض باختبارات model/API/SSR وBuild فعلي. إضافة E2E يمكن أن تكون عمل QA مستقلًا دون تغيير العقد.

## 11. مراجعة الأمان والنطاق

- لا توجد ملفات `.env` أو Credentials أو Connection Strings حقيقية أو Logs أو بيانات تشغيلية ضمن التغييرات.
- لا يوجد تعديل في `apps/api` أو Prisma أو Migration History.
- لا يوجد اتصال بقاعدة بيانات أو Migration أو Backfill أو Deployment.
- لا يوجد تغيير في Public Menu أو Cart أو Checkout.
- لم يبدأ Stage 5.

## 12. الاستخدام

1. افتح Dashboard ثم عدّل صنفًا محفوظًا.
2. أسفل نموذج الصنف يظهر قسم «شبكة تكوين الصنف».
3. أضف مجموعة أحجام أو خيارات، ثم اختر العقدة من الشجرة وعدّل خصائصها.
4. استخدم Linked Product داخل Inspector للخيار عند الحاجة.
5. اختبر Selection والسعر من المعاينة.
6. أصلح Validation Issues الظاهرة.
7. اضغط «حفظ الشبكة»؛ الحفظ لا يحدث تلقائيًا على الخادم.

## 13. نقطة التوقف

Stage 4 مكتملة. يجب التوقف وانتظار موافقة صريحة قبل Stage 5 أو أي Public Configurator/Cart/Checkout أو تشغيل Migration على أي قاعدة.
