# OrderSawa — تقرير Stage 6D.2A: بيانات الطلب وتجربة رسالة WhatsApp

التاريخ: 2026-10-13. الفرع: `feature/product-configuration-network`. Commit التنفيذ: `ce0e192` (`feat(api): preserve network order details in sealed WhatsApp preview`). هذه المرحلة تخص **المعاينة والطلب التجريبي المعزول فقط**؛ بقي `orderingEnabled:false` ولم تُرسل رسالة WhatsApp أو يُفتح Checkout للشبكة.

## المرجع والنطاق

رُوجعت `CODEX_HANDOFF.md` وتقرير Stage 6D.1 و`AUTHORITATIVE_RULES/LATEST_FOUNDER_DECISION_LEDGER_V2_CURRENT.md` و`CURRENT_SUPERSESSION_AND_CONFLICT_RULES.md` في حزمة المراجع، إضافة إلى عقد Stage 6C وLegacy Checkout الفعلي. قرار المؤسس بشأن الـSnapshot النهائي غير القابل للتغيير في قسم Product Configuration، وقاعدة Multilingual Fallback «سجل ترجمة كامل، لا مزج بين حقول لغتين»، هما المرجعان الأساسيان هنا. لم يتغير Shared Pricing Engine أو Schema أو Migration أو Legacy WhatsApp Checkout.

## الحقول المعتمدة ومصدر كل قاعدة

| الحقل | الحالة في العقد التجريبي | المرجع الحالي |
|---|---|---|
| `customerName`, `customerPhone` | اختياريان | `CreateWhatsappOrderDto` في Legacy؛ الواجهة الحالية لا تطلبهما أصلًا، لذلك لم يُفرضا. |
| `fulfillmentType` = `pickup`/`delivery` | اختياري | Legacy DTO؛ الواجهة العامة الحالية ترسله عند Checkout. |
| `deliveryArea`, `deliveryNear`, `deliveryBeside` | مطلوبة **إذا اختير delivery فقط** | قاعدة التحقق في `public-menu-client.tsx` عند تقديم طلب توصيل؛ Legacy Backend DTO نفسه أوسع ويجعلها اختيارية. لا يُسمح بعنوان مع pickup. |
| `pickupTime` | اختياري مع pickup فقط | Legacy DTO والواجهة؛ لم تُخترع صيغة وقت أو شرط حد أدنى. |
| `orderNote` وملاحظة `items[].note` | اختياريان | Legacy DTO وOrderItem.note الحالي. |
| `restaurantName` | يلتقطه الخادم من Restaurant | اسم تاريخي موثوق لتوضيح الجهة المستقبلة، وليس إدخالًا من العميل. |
| رقم الطلب و`branchSlug` | **مؤجلان** | Legacy يولّد رقمًا من عدد طلبات اليوم، وهو غير مضمون التفرد عند التزامن. Stage 6C يعمل بنطاق Restaurant لا Outlet؛ لا يجوز اختراع رقم تجاري أو إسناد فرع في هذه المرحلة. |

قيود طول النص ومنع أسطر التحكم وBidi controls هي حماية تقنية لعقد HTTP والرسالة، وليست سياسة تجارية جديدة. الأرقام الهاتفية تُحفظ كنص كما في Legacy؛ لم نفرض تنسيق بلد جديد. `null` أو الفراغ الاختياري يعني غياب الحقل، ولا يتحول إلى قيمة مخترعة.

## عقد الطلب وSnapshot

امتد `NetworkOrderDraftRequest` و`NetworkOrderCreateRequest` بحقول `NetworkOrderDetails` الاختيارية، و`items[].note`. تمر كلها عبر نفس Parser ومراجعة الطلب الموجودة في Stage 6C. توقيع قبول المسودة يشمل التفاصيل؛ تغيير اسم الزبون بعد `prepare` يعطي `409 NETWORK_ORDER_REQUIRES_NEW_ACCEPTANCE`. الـSnapshot المحفوظ في `Order.cartSnapshot` بقي `snapshotVersion:1, mode:"NETWORK"` مع إضافة `orderDetails: NetworkOrderSnapshotDetails` و`items[].note`. يحتوي `orderDetails.restaurantName` المأخوذ من القاعدة في نفس معاملة القراءة. يُنسخ الاسم والهاتف كذلك إلى أعمدة Order الموجودة أصلًا، وتُحفظ ملاحظة الصنف في `OrderItem.note` وSnapshot. لا توجد أعمدة جديدة أو Migration.

يواصل Trigger Stage 6C منع تعديل Order وOrderItem والـSnapshot بعد ختمها. تعتمد الرسالة على `cartSnapshot` المحفوظة فقط؛ تغيير اسم المطعم أو الصنف لاحقًا لا يغيّر الرسالة التاريخية. Snapshots الأقدم التي لا تحتوي `orderDetails` تستمر في التنسيق بلا افتراض بيانات زبون؛ أما كائن تفاصيل موجود لكنه ناقص أو متناقض فيُرفض بخطأ مهيكل.

## تجربة الرسالة

يظهر اسم المطعم والزبون والهاتف والتسليم والعنوان/وقت الاستلام قبل الأصناف، وملاحظات الصنف بجوار صنفه وملاحظات الطلب بعد الإجمالي. تُعرض كل وحدة Linked ضمن موضعها في Combo مع رقم ترتيب بشري، من غير كشف `ORIGINAL`/`CUSTOM` أو Node IDs. تُعرض الأحجام، المجموعات المطلوبة/الاختيارية، الصوصات المتداخلة، المشمول، المجاني والمدفوع من بيانات Snapshot نفسها. الاختبارات وFixtures الجديدة تستخدم أسماء خيارات بشرية؛ إن كانت تسمية تاريخية مخزنة أصلًا تقنية، فلا يجوز للـFormatter اختراع ترجمتها أو استبدالها بصمت. تبقى علامات عزل اتجاه Unicode للنص المختلط، ويُرمَّز رابط المعاينة فقط دون فتحه أو الإرسال.

الأرقام المالية تبقى Decimal strings دقيقة مثل `530.000008 EGP`، من دون سياسة تقريب أو جمع بـfloating-point. ستحتاج طريقة العرض الملائمة للعملات ذات المنازل الست إلى اعتماد منفصل قبل التشغيل الحقيقي.

### مثال حقيقي من Snapshot بيتزا محفوظة في PostgreSQL مؤقتة

الكتلة التالية خرجت من اختبار HTTP/DB بعد إنشاء Order تجريبي، ثم قراءة `Order.cartSnapshot` وتمريرها للـFormatter؛ الأسماء والهاتف بيانات Fixtures وهمية فقط. حُذفت من العرض هنا علامات Unicode غير المرئية لعزل الاتجاه، ولم تتغير الكلمات أو الأسعار.

```text
🧾 طلب OrderSawa — معاينة
المطعم: Stage 6C Restaurant
اسم الزبون: Demo Customer
هاتف الزبون: 0000000000
طريقة الاستلام: توصيل
المنطقة: Demo district
بالقرب من: Park
بجانب: Gate

1. Pizza Margherita × 2
📏 Sizes — الحجم: Medium (200.000001 EGP للوحدة)
➕ Toppings (اختياري):
  • Cheese × 1 — مشمول
    ➕ Sauces (اختياري):
      • BBQ × 1 — 5.000001 EGP للوحدة
  • Cheese × 2 — 30.000001 EGP للوحدة
ملاحظة الصنف: No onion
سعر الوحدة: 265.000004 EGP
إجمالي الصنف: 530.000008 EGP

💵 إجمالي الطلب: 530.000008 EGP
ملاحظات الطلب: Pack sauce separately
```

### مثال حقيقي من Snapshot كومبو محفوظة في PostgreSQL مؤقتة

```text
🧾 طلب OrderSawa — معاينة
المطعم: Stage 6C Restaurant
اسم الزبون: Demo Guest
طريقة الاستلام: استلام من المطعم
موعد الاستلام: 6 PM

1. Combo × 1
➕ Slots (مطلوب):
  • Extra pizza × 1 — 3 EGP للوحدة
    ↳ صنف داخل المجموعة 1: Source Pizza
      📏 Pizza sizes — الحجم: Medium (7 EGP للوحدة)
  • First pizza × 1 — 10 EGP للوحدة
    ↳ صنف داخل المجموعة 2: Source Pizza
      📏 Source sizes — الحجم: Small (5 EGP للوحدة)
  • First pizza × 1 — 10 EGP للوحدة
    ↳ صنف داخل المجموعة 3: Source Pizza
      📏 Source sizes — الحجم: Large (8 EGP للوحدة)
سعر الوحدة: 43 EGP
إجمالي الصنف: 43 EGP

💵 إجمالي الطلب: 43 EGP
```

لطباعة المثالين مجددًا من Order محفوظ فعليًا: جهّز قاعدة Stage 6C disposable على `127.0.0.1:55440` باسم يبدأ `ordersawa_stage3_stage6c_` مع Baseline SQL وStage 6C Migration **داخلها فقط**، ثم شغّل `network-orders.integration.spec.ts` مع `NETWORK_ORDER_TEST_DATABASE_URL` لهذه القاعدة و`PRINT_NETWORK_ORDER_PREVIEW=1`. لا تستخدم `.env` حقيقيًا أو رقم هاتف حقيقيًا. أما CLI القديم `npm run preview:network-whatsapp -w @menu/api -- pizza ar` فهو Fixture في الذاكرة، وليس دليل الـSnapshot المحفوظ أعلاه.

## الملفات المتغيرة

- `apps/api/src/modules/orders/network-order-contract.ts` و`.spec.ts`: العقد والتحقق من بيانات الزبون/التسليم والملاحظات.
- `apps/api/src/modules/orders/network-orders.service.ts` و`network-orders.integration.spec.ts`: حفظ التفاصيل ضمن المسودة الموقعة والـSnapshot المختومة، واختبارات HTTP/DB والمعاينة الفعلية.
- `apps/api/src/modules/orders/network-order-whatsapp-formatter.ts` و`.spec.ts`: واجهة الرسالة، البيانات التاريخية، التوافق مع Snapshots الأقدم، والتحقق من النقص.
- `apps/api/src/modules/orders/network-order-whatsapp-demo.ts`: Fixtures بأسماء بشرية وبيانات زبائن وهمية.
- هذا التقرير و`CODEX_HANDOFF.md` للتوثيق.

## نتائج الاختبارات

PostgreSQL 16 مؤقتة جديدة في `../work/stage6d2a-postgres-data` على loopback `127.0.0.1:55440`، بقاعدتين جديدتين معزولتين (`ordersawa_stage3_stage6c_stage6d2a_orders` و`..._regression`). طُبّق Baseline SQL وStage 6C Migration عليهما فقط؛ لم تُستخدم قاعدة موجودة أو Production.
أُوقف خادم PostgreSQL المؤقت بعد إكمال الاختبارات؛ تبقى ملفات الاختبار خارج Git فقط.

- Shared: **21/21 ناجح**.
- API: **134/134 ناجح، 0 skipped**، منها HTTP/DB لاختبارات الطلبات وLegacy Regression. تشغيل مبدئي دون متغير قاعدة Regression أعطى 112 نجاحًا و21 skipped؛ أُعيد التشغيل الكامل بقاعدة ثانية فنجح الجميع.
- Web: **35/35 ناجح**.
- الإجمالي: **190/190**.
- Root Typecheck وBuild: ناجحان؛ Next.js ولّد 27/27 صفحة.
- `git diff --check` وفحص أسماء الملفات والأسرار: لا أخطاء أو `.env` أو Credentials أو Logs في الـCommit. تحذير CRLF من Git فقط.

## قرارات معلقة وحدود Stage 6D.2B

1. رقم طلب تجاري آمن للتزامن، وملاءمة `branchSlug` مع سياق Restaurant/Outlet: يحتاجان قرارًا/عملًا منفصلًا؛ لم أستخدم رقم Legacy المبني على `count + 1`.
2. سياسة إلزام اسم الزبون أو هاتفه للطلبات الحقيقية، والتحقق الهاتفي بحسب السوق: Legacy لا يفرضهما؛ لم أفرضهما هنا.
3. بيانات اللغات: Snapshot تحفظ تسمية تاريخية واحدة لكل عقدة. قاعدة Whole Translation-Record Fallback لا تسمح باختراع ترجمة أو مزج حقول؛ نقل سجل ترجمة كامل إلى Snapshot يحتاج تصميمًا واعتمادًا منفصلين.
4. سياسة عرض/تقريب العملة، حد رابط WhatsApp الطويل، HMAC متعدد العمليات، أمن endpoint الإنتاجي، وتدقيق Migration History الحقيقي ما زالت غير محسومة.
5. Stage 6D.2B المقترحة، بعد موافقة جديدة فقط: حسم هذه القرارات وتجهيز تجربة/تدفق الرسالة أو تفاصيل الطلب التالية بحسب تكليف مستقل. لا تُفتح Network Ordering ولا Stage 6D.3 تلقائيًا.

توقفت المرحلة دون Deployment أو Production DB أو WhatsApp send أو تعديل Legacy Checkout أو تفعيل طلبات حقيقية.
