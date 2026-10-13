# تقرير Stage 6D.3A — استكمال Browser E2E وجودة عرض الطلب

التاريخ: 13 أكتوبر 2026. الفرع: `feature/product-configuration-network`. Commit الشيفرة: `2f1b18b`. هذه مرحلة اختبار وتنسيق داخل بيئة معزولة فقط؛ `orderingEnabled:false` باقٍ، ولا يوجد إرسال WhatsApp أو تفعيل Production.

## المرجعية والنطاق

قُرئ `CODEX_HANDOFF.md` وتقرير `STAGE_6D_2B_NETWORK_ORDER_FLOW_REPORT_AR.md` وسجل قرارات المؤسس الحالي وقواعد Supersession، وتُحقق من الفرع النظيف وCommitَي Stage 6D.2B (`184adee` و`5699779`). استُخدم Runner المتصفح نفسه ومكونات Network Cart وStage 6C Draft/Create وFormatter الحالية. لم يتغير Shared Pricing Engine أو Order Persistence أو Transaction/Idempotency Contract أو Legacy Checkout أو Prisma Schema.

## الملفات المعدلة

1. `scripts/stage6d2b-browser-e2e.mjs`: توسع من رحلة واحدة إلى 15 سيناريو مسماة، مع إعادة Cart بين السيناريوهات، واستعادة Product Tree/Version/Availability في `finally`، وعدّ النتائج الفعلية. يدعم `BROWSER_E2E_ONLY` للتشخيص و`GUARD_OFF_API_URL` لاختبار نسخة API بميزة اختبار مطفأة.
2. `apps/api/src/modules/orders/network-order-whatsapp-formatter.ts`: ترقيم موحّد لمكوّنات الطلب المرتبطة داخل الصنف، ووصف حجم Linked ذي مساهمة صفرية بأنه «دون تكلفة إضافية للحجم» بدل «مجاني». لا تغيير في الحساب أو Snapshot أو الأسعار المعروضة.
3. `apps/api/src/modules/orders/network-order-whatsapp-formatter.spec.ts` و`network-orders.integration.spec.ts`: Regression للتسميات والترقيم وسعر الحجم الصفري، مع استمرار التحقق من الرسائل التاريخية.
4. `apps/api/prisma/seed-stage6d2b-network-order-demo.ts`: السماح باسم قاعدة Stage 6D.3A disposable فقط ضمن الحارس، وإضافة `CART_ORDERING` إلى باقة Demo المعزولة لاختبار Legacy Checkout، وإنشاء قسم `all` مسبقًا لتجنب سباق تهيئة القسم أثناء طلبات الاختبار المتوازية. لا تغيير في باقات حقيقية.
5. هذا التقرير و`CODEX_HANDOFF.md`.

## معنى السعر وقرار التنسيق المحدود

في Shared Engine، سطر `OPTION` للمنتج المرتبط يمثل سعره المحلي داخل الأب؛ سعر المنتج المستقل لا يُورث تلقائيًا. سطر `SIZE` داخل Linked Configuration قد يكون `chargedAmount="0"` بينما خيار الربط نفسه مدفوع. `Included Quantity` يجعل وحدات الخيار الأب المحددة مشمولة، ولا يجعل فروعها التابعة مشمولة تلقائيًا. لذلك كان وصف الحجم الصفري داخل Combo بأنه «مجاني» مضللًا. الصياغة الجديدة تبيّن فقط أنه **لا توجد تكلفة إضافية للحجم**، دون افتراض أن المنتج كله مجاني أو مشمول في سعر آخر. بقي «مشمول» لسطر الخيار ذي `included:true` وبقي «مجاني» لخيار صفري حقيقي خارج سياق حجم Linked. Formatter يقرأ المبالغ التاريخية ويتحقق من اتساقها فقط؛ لا يعيد تسعير الطلب ولا يستعلم عن المنيو.

## سيناريوهات Browser E2E النهائية

شُغّل Chrome headless عبر CDP على `127.0.0.1`، مع PostgreSQL 16 disposable **جديدة** في `../work/stage6d3a-postgres-data` وقواعد منفصلة `..._demo` و`..._orders` و`..._regression` على `127.0.0.1:55440`. أُنشئت Schema الاختبار من Baseline SQL وStage 6C SQL على هذه القواعد فقط. لا توجد Fixtures متوازية تتشارك قاعدة: API integration suites تستخدم قاعدتين منفصلتين، وBrowser runner تسلسلي مع استعادة تعديلات الكتالوج بعد كل سيناريو.

| # | السيناريو | النتيجة |
|---|---|---|
| 1 | Pizza Large + Extra Cheese + BBQ وسعر Quote الخادم | نجح |
| 2 | Combo بنسختَي Pizza مرتبطتين واختيارات/instance IDs مستقلة | نجح |
| 3 | بقاء Pizza وCombo في Network Cart بعد Reload | نجح |
| 4 | تغيّر السعر، منع الطلب بموافقة قديمة، قبول جديد، Order محفوظة وSnapshot تاريخية | نجح |
| 5 | تغيّر Configuration Revision بعد المسودة يمنع الحفظ | نجح |
| 6 | تغيّر Availability بعد المسودة يمنع الحفظ | نجح |
| 7 | Selection غير صالحة تُرفض بطلب `prepare` مرسل من سياق المتصفح، دون Order | نجح |
| 8 | ضغط سريع متكرر على إنشاء الطلب يُنتج Order واحدة | نجح |
| 9 | إعادة POST بنفس Idempotency Key من سياق المتصفح تعيد الطلب نفسه | نجح |
| 10 | Delivery مع العنوان وملاحظات الطلب والصنف في Snapshot والرسالة | نجح |
| 11 | Pickup مع موعد الاستلام في Snapshot والرسالة | نجح |
| 12 | سلة Legacy + Network تُرفض في واجهة التجربة ولا تفتح Legacy send | نجح |
| 13 | طلب API تجريبي من سياق المتصفح إلى خادم flag-off مستقل يرجع HTTP 403 | نجح |
| 14 | منتج Legacy يُضاف من واجهته ويظهر Legacy Checkout؛ لم يُضغط زر الإرسال | نجح |
| 15 | RTL وعرض Mobile ‏390px دون overflow | نجح |

**Browser E2E النهائي: 15 ناجح، 0 فاشل، 0 متخطى.** السيناريوهات 7 و9 و13 ترسل HTTP `fetch` من داخل المتصفح للتحقق من عقود الخادم؛ ليست تفاعلات DOM خالصة. حارس إخفاء صفحة Next عند إطفاء flag مغطى باختبار Web unit من Stage 6D.2B، لكنه لم يُشغّل كصفحة Browser منفصلة بعملية Next flag-off؛ لا ندّعي ذلك. لم يُرسل WhatsApp في أي سيناريو.

أثناء التطوير فشلت أربعة سيناريوهات أولية بسبب انتظار Hydration غير كافٍ في Runner ونقص `CART_ORDERING` في Demo Fixture؛ بعد التصحيح نجح التشغيل الكامل أعلاه. لوحظ أيضًا سباق قديم في `PublicMenuService.ensureAllCategory` عند أول طلبات Public Menu المتوازية؛ هيأ Fixture قسم `all` مسبقًا لتثبيت الاختبار، ولم نعدّل سلوك الخدمة العام خارج نطاق هذه المرحلة.

## رسالة Combo فعلية من Snapshot محفوظة

المقتطف التالي خرج من `GET .../preview` بعد إنشاء Order تجريبية فعلية والتحقق من `Order.cartSnapshot` في PostgreSQL، بإجمالي `423.5 EGP`. حُذفت فقط علامات Unicode غير المرئية لعزل اتجاه النص وخطوط الفصل للقراءة هنا؛ الأسماء والمبالغ والترتيب من الرسالة الفعلية:

```text
🧾 طلب OrderSawa — معاينة
المطعم: OrderSawa Local Demo
اسم الزبون: Demo Customer
طريقة الاستلام: استلام من المطعم

1. Pizza Margherita × 1
📏 حجم البيتزا — الحجم: كبير (155 EGP للوحدة)
  ➕ الإضافات (اختياري):
    • جبنة إضافية × 1 — 22.5 EGP للوحدة
  ➕ الصوصات (اختياري):
    • باربكيو × 1 — 6 EGP للوحدة
ملاحظة الصنف: No onion
سعر الوحدة: 183.5 EGP
إجمالي الصنف: 183.5 EGP

2. Family Combo × 1
➕ مكونات الكومبو المطلوبة (مطلوب):
  • البيتزا الأولى — Pizza Margherita × 1 — 100 EGP للوحدة
    ↳ اختيارات المكوّن 1: Pizza Margherita
      📏 حجم البيتزا — الحجم: صغير (دون تكلفة إضافية للحجم)
  • البيتزا الثانية — Pizza Margherita × 1 — 100 EGP للوحدة
    ↳ اختيارات المكوّن 2: Pizza Margherita
      📏 حجم البيتزا — الحجم: كبير (دون تكلفة إضافية للحجم)
  • اختيار مخصص — Legacy Demo × 1 — 40 EGP للوحدة
    ↳ اختيارات المكوّن 3: Legacy Demo
سعر الوحدة: 240 EGP
إجمالي الصنف: 240 EGP

💵 إجمالي الطلب: 423.5 EGP
```

بعد حفظها أُعيد سعر الكتالوج إلى قيمته الأصلية، ثم أعاد Preview **النص نفسه تمامًا** من Snapshot؛ لم يتغير حجم أي نسخة Linked أو سعرها التاريخي. لا يوجد حساب مالي جديد أثناء العرض، سوى فحص اتساق المبالغ المخزنة الموجود مسبقًا.

## نتائج Regression والبناء

- Shared: **21/21** ناجح.
- API: **135/135** ناجح، 0 skipped؛ تشمل اختبارات Formatter الجديدة وتكامل PostgreSQL/HTTP، على قاعدة Order مستقلة عن قاعدة Product regression.
- Web: **39/39** ناجح، 0 skipped.
- مجموع Unit/Integration: **195/195**، منفصل عن **15/15 Browser E2E**.
- Root Typecheck وBuild: ناجحان؛ Next.js أكمل توليد 27/27 صفحة ثابتة والمسارات الديناميكية. `git diff --check` ناجح.
- لم تُستخدم `.env` حقيقية، ولم تُشغّل Migration أو Backfill على قاعدة موجودة، ولم يحدث Deployment.

## إعادة التشغيل الآمنة

أنشئ Cluster PostgreSQL جديدة على loopback ‏`127.0.0.1:55440`، وقواعد UTF-8 منفصلة بأسماء `ordersawa_stage3_stage6c_stage6d3a_demo` و`..._orders` و`..._regression`. طبّق **Baseline SQL الاختباري** و`apps/api/prisma/migrations/20261013000000_network_order_test_snapshot/migration.sql` داخل هذه القواعد المؤقتة فقط. شغّل seed بعد تعيين `DATABASE_URL=DIRECT_URL` إلى قاعدة demo و`ENABLE_DISPOSABLE_NETWORK_ORDERS=1` و`NODE_ENV=development`:

```powershell
npm run seed:stage6d2b-network-order-demo -w @menu/api
```

شغّل API على `127.0.0.1:5000` وNext على `127.0.0.1:3000` مع `NEXT_PUBLIC_API_URL=http://127.0.0.1:5000` و`WEB_ORIGIN/CORS_ORIGINS=http://127.0.0.1:3000`. لتغطية السيناريو 13، شغّل نسخة API محلية ثانية على `127.0.0.1:5001` مع `ENABLE_DISPOSABLE_NETWORK_ORDERS=0`، ثم:

```powershell
# بعد تعيين DATABASE_URL إلى قاعدة demo المؤقتة وENABLE_DISPOSABLE_NETWORK_ORDERS=1:
$env:GUARD_OFF_API_URL='http://127.0.0.1:5001'
node scripts/stage6d2b-browser-e2e.mjs
```

إذا لم تُشغّل نسخة flag-off، سيظهر السيناريو 13 `skipped` صراحةً. يمكن تشخيص سيناريو واحد بـ`BROWSER_E2E_ONLY=04` مثلًا. لا تستخدم قاعدة Production أو `.env` المشروع أو رقم هاتف حقيقي.

## المتبقي وموانع Production

- سباق إنشاء قسم `all` في أول قراءة Public Menu العامة يحتاج إصلاحًا مستقلاً إذا أُريد ضمانه خارج Fixture؛ لم يُغيّر هنا لأنه ليس خلل عرض الطلب المقصود.
- لم تُختبر صفحة Next نفسها في متصفح منفصل مع flag مطفأ، ولا أُرسلت رسالة Legacy/Network؛ إخفاء الصفحة مغطى بوحدة Web، وAPI flag-off مغطاة بالمتصفح.
- قرارات Currency rounding/display، HMAC متعدد المثيلات، Production auth/rate limits، الرقم التجاري، Branch/Outlet، ترجمة Snapshot التاريخية، Migration History الحقيقي، ورسوم/ضرائب/خصومات الطلب لم تُحسم. لا يجوز استنتاج جاهزية الإطلاق من 15 اختبارًا ناجحًا.
- Stage 6D.3B وProduction Ordering وWhatsApp الحقيقي وDeployment ممنوعة إلى حين موافقة جديدة صريحة.
