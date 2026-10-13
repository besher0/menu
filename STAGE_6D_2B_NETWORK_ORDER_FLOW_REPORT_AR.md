# تقرير Stage 6D.2B — رحلة طلب الشبكة المعزولة

التاريخ: 13 أكتوبر 2026. الفرع: `feature/product-configuration-network`. تنفيذ الشيفرة: `184adee`. هذه المرحلة **تجربة محلية فقط**؛ لم تُفعّل طلبات Network العامة، ولم تُرسل رسالة WhatsApp، ولم يُستخدم أي اتصال بقاعدة حقيقية.

## المرجعية والنطاق

رُوجعت ملفات `CODEX_HANDOFF.md` وتقارير 6B و6C و6D.1 و6D.2A وسجل المؤسس الحالي وقواعد التعارض، ثم فُحصت العقود المنفذة فعليًا. بقيت مراحل 6B/6C ومحرك Shared وFormatter هي مصادر الحقيقة؛ لم يُضف محرك تسعير أو Checkout أو Persistence موازٍ. لم يتغير `orderingEnabled:false` في الواجهة العامة أو حارس Legacy Checkout.

## الملفات المعدلة

- API: `apps/api/src/modules/orders/network-orders.controller.ts` و`network-orders.service.ts` و`network-orders.integration.spec.ts`؛ endpoint قراءة تاريخية جديد محمي، مع اختبار HTTP/DB.
- Fixture: `apps/api/prisma/seed-stage6d2b-network-order-demo.ts` و`apps/api/package.json`؛ مطعم ومنتجات تجريبية داخل قاعدة disposable مطابقة للاسم والمنفذ المسموحين فقط. يستخدم حافظة Stage 2C الذرية وDemo Stage 4.
- Web: `apps/web/src/app/m/[slug]/network-order-test/page.tsx`، `apps/web/src/components/public/network-order-test-{client.tsx,client.module.css,model.ts,model.test.ts}`، `apps/web/src/lib/network-order-test-guard.ts`، تعديل صغير في صفحة السلة و`globals.css` لإظهار مدخل التجربة عند السماح الخادمي فقط.
- Browser runner: `scripts/stage6d2b-browser-e2e.mjs`، متصفح Chrome headless عبر CDP محلي.
- هذا التقرير و`CODEX_HANDOFF.md` للتسليم.

## رحلة الطلب والعقود

من Public Configurator القائم تُضاف Pizza وCombo إلى Network Cart القائم. صفحة التجربة تقرأ السلة، لكنها ترسل للخادم فقط `productId` و`quantity` و`selection` و`items[].note` وتفاصيل الطلب المعتمدة (`customerName`, `customerPhone`, `fulfillmentType`, `deliveryArea`, `deliveryNear`, `deliveryBeside`, `pickupTime`, `orderNote`). لا يُرسل سعر أو اسم من React أو Local Storage كأساس لإنشاء الطلب. السلة المختلطة مرفوضة صراحة.

تستدعي الصفحة `POST /public/menus/:slug/orders/network-test/prepare` الموجود من 6C، وتعرض Draft الموقّعة وتفصيل السعر المحسوب على الخادم. لا يُسمح بالإنشاء دون checkbox موافقة صريحة. طلب الإنشاء يستخدم Acceptance Token وIdempotency Key عبر endpoint 6C نفسه. عند `409 NETWORK_ORDER_REQUIRES_NEW_ACCEPTANCE` تظهر Draft الجديدة، تُلغى الموافقة السابقة ويُطلب قبول جديد؛ أخطاء 409 الأخرى توقف الإنشاء إلى حين إعادة تكوين الاختيار. بعد الحفظ، تستدعي الصفحة endpoint الجديد:

`GET /public/menus/:restaurantSlug/orders/network-test/:orderId/preview`

هذا endpoint يرث `NetworkOrderLoopbackGuard` و`assertDisposableOnly`، ويتحقق من Tenant و`source=NETWORK_TEST` وختم Snapshot، ثم يمرر `Order.cartSnapshot` المحفوظة إلى `formatNetworkOrderWhatsappMessage`. الاستجابة: `orderId`, `message`, `totalAmount`, `currency`, `fromSealedSnapshot:true`, `orderingEnabled:false`. `Cache-Control: no-store`. لا يستعلم عن أسماء أو أسعار المنيو الحالية لصنع الرسالة؛ ولا يرسل WhatsApp أو يفتح `wa.me`.

## الحماية وبيئة التشغيل

جميع مسارات API التجريبية تتطلب بيئة غير Production و`ENABLE_DISPOSABLE_NETWORK_ORDERS=1` وطلب HTTP loopback وقاعدة PostgreSQL **الفعلية** على `127.0.0.1:55440` باسم يبدأ `ordersawa_stage3_stage6c_`. صفحة Next ومدخلها يتطلبان أيضًا Host محليًا وAPI URL محليًا عبر فحص خادمي، لا إخفاء زر React. Fixture والـBrowser runner يرفضان اسم/مضيف/منفذ قاعدة غير مطابقين لـStage 6D.2B. لم تُنسخ `.env` حقيقية؛ لا توجد كلمات مرور أو سجلات تشغيلية في Git. أسطر تشغيل الاختبار التالية تستعمل اتصال PostgreSQL disposable محليًا بلا أسرار مخزنة.

لإعادة التشغيل، أنشئ PostgreSQL 16 **جديدة ومعزولة** على `127.0.0.1:55440` وقاعدة باسم `ordersawa_stage3_stage6c_stage6d2b_demo`، وطبّق Baseline SQL الاختباري وStage 6C Migration في هذه القاعدة وحدها، كما هو موضح في تقرير 6C. لا تستخدم `migrate deploy` أو `db push` أو أي قاعدة موجودة. عيّن مؤقتًا `DATABASE_URL` و`DIRECT_URL` إلى القاعدة نفسها، و`ENABLE_DISPOSABLE_NETWORK_ORDERS=1` و`NODE_ENV=development`، ثم:

```powershell
npm run build -w @menu/shared
npm run build -w @menu/api
npm run seed:stage6d2b-network-order-demo -w @menu/api
# نافذة محلية: API_HOST=127.0.0.1, WEB_ORIGIN=http://127.0.0.1:3000, CORS_ORIGINS=http://127.0.0.1:3000
node apps/api/dist/main.js
# نافذة محلية ثانية: NEXT_PUBLIC_API_URL=http://127.0.0.1:5000, ENABLE_DISPOSABLE_NETWORK_ORDERS=1
npm run dev -w @menu/web -- -H 127.0.0.1
# نافذة ثالثة بعد ضبط DATABASE_URL لنفس demo disposable:
node scripts/stage6d2b-browser-e2e.mjs
```

افتح `http://127.0.0.1:3000/m/s6d2b-demo/menu` واختر قسم Demo Menu، أو مباشرةً `/m/s6d2b-demo/product/pizza` و`/product/combo`. بعد الإضافة افتح `/m/s6d2b-demo/cart` ثم رابط «تجربة الطلب المعزولة». الهاتف `0000000000` في Fixture خيالي. قد تحتاج Windows sandbox إلى `TEMP/TMP` ضمن `../work` وruntime preload الموثق في تقرير 6D.2A لتشغيل `tsx`؛ لا تحفظ تلك الملفات داخل المستودع.

## الاختبار الفعلي والنتائج

استُخدم Cluster PostgreSQL 16 جديد في `../work/stage6d2b-postgres-data`، على loopback فقط، مع قواعد demo/orders/api-regression منفصلة. طُبق Baseline SQL الاختباري وMigration 6C على القواعد الثلاث فقط. في البداية تداخلت Suites تكامل API عندما وُجهت خطأً إلى قاعدة واحدة؛ فشلت عشرة اختبارات بسبب Fixture truncation المتوازي. أُعيد التشغيل بقواعد منفصلة فنجحت **134/134 API، صفر skipped**. هذا خلل في إعداد التشغيل الأول، لا في المنتج.

- Shared: **21/21** ناجح.
- Web: **39/39** ناجح، منها 4 لاختبار تحويل السلة ورفض المختلطة/عزل Tenant/عملة/حارس الصفحة وتجديد الموافقة.
- API: **134/134** ناجح، مع HTTP/DB Preview من Order محفوظة، منع Tenant آخر، وفشل الوصول عند غياب flag. تغطي اختبارات Stage 6C أيضًا Revision/Availability/Capability/Linked Sources وIdempotency والتزامن.
- المجموع: **194/194**، صفر skipped. Root Typecheck وBuild ناجحان؛ Next.js أكمل توليد الصفحات الثابتة 27/27 وبنى المسار الديناميكي الجديد. `git diff --check` ناجح. لم يُستخدم أي DB حقيقي.
- Browser E2E محلي قابل للإعادة: **سيناريو متكامل واحد ناجح** في Chrome headless. تحقق من Pizza Large + Extra Cheese + BBQ، Combo فيه نسختا Pizza ORIGINAL مستقلتان وLegacy CUSTOM، بقاء Network Cart بعد التنقل، RTL وعرض 390px بلا overflow، بيانات زبون، Draft موثوقة، تغيير سعر Large داخل قاعدة الاختبار من 145 إلى 155، HTTP 409 وإلغاء الموافقة ومنع كتابة Order، موافقة ثانية، حفظ Order واحدة فقط بإجمالي `423.5 EGP`، قراءة Snapshot من PostgreSQL، Preview من endpoint، وثبات الرسالة التاريخية بعد إعادة سعر الكتالوج. لم يكتفِ بـFixture في الذاكرة.

### رسالة فعلية من Order محفوظة

```text
🧾 طلب OrderSawa — معاينة
المطعم: OrderSawa Local Demo
اسم الزبون: Demo Customer
هاتف الزبون: 0000000000
طريقة الاستلام: استلام من المطعم

1. Pizza Margherita × 1
📏 حجم البيتزا — الحجم: كبير (155 EGP للوحدة)
  ➕ الإضافات (اختياري):
    • جبنة إضافية × 1 — 22.5 EGP للوحدة
  ➕ الصوصات (اختياري):
    • باربكيو × 1 — 6 EGP للوحدة
سعر الوحدة: 183.5 EGP
إجمالي الصنف: 183.5 EGP

2. Family Combo × 1
➕ مكونات الكومبو المطلوبة (مطلوب):
  • اختيار مخصص — Legacy Demo × 1 — 40 EGP للوحدة
    ↳ صنف داخل المجموعة 1: Legacy Demo
  • البيتزا الأولى — Pizza Margherita × 1 — 100 EGP للوحدة
    ↳ صنف داخل المجموعة 1: Pizza Margherita
      📏 حجم البيتزا — الحجم: صغير (مجاني)
  • البيتزا الثانية — Pizza Margherita × 1 — 100 EGP للوحدة
    ↳ صنف داخل المجموعة 2: Pizza Margherita
      📏 حجم البيتزا — الحجم: كبير (مجاني)
سعر الوحدة: 240 EGP
إجمالي الصنف: 240 EGP

💵 إجمالي الطلب: 423.5 EGP
```

النص أعلاه نُسخ من استجابة Preview بعد حفظ Order فعلية في القاعدة المؤقتة، مع حذف علامات Unicode غير المرئية لعزل اتجاه النص وخطوط الفصل الزخرفية فقط. لم تُرسل الرسالة.

## التغطية الناقصة وموانع الإنتاج

اختبار المتصفح يغطي الرحلة الرئيسية وتغير السعر وRTL/mobile، لكنه **لا** يغطي عبر المتصفح نفسه جميع حالات الطلب: تغيير Availability/Revision، الاختيار غير الصالح، محاولة الإرسال المكرر، Delivery، السلة المختلطة، أو إطفاء flag. هذه مغطاة في اختبارات API/Web بدرجات مختلفة، وتحتاج سيناريوهات Browser إضافية قبل الادعاء بقبول E2E كامل. لم يُجرَ اختبار مرئي مقارن مع Prototype أو اختبار Legacy Checkout كامل في المتصفح؛ Tests الانحدار وغياب رابط WhatsApp لسلة Network نجحا. `deliveryFee` في Legacy UI يساوي صفرًا حاليًا، ولا توجد رسوم Network معتمدة؛ يجب مراجعة أي سياسة رسوم/ضريبة/خصم لاحقًا قبل الإنتاج. بقيت سياسة تقريب العملات معلقة.

لا تزال موانع الإنتاج: تدقيق Migration History على قاعدة حقيقية بإذن منفصل، سياسة التقريب والعرض المالي، HMAC متعدد المثيلات، حراسة ومعدل طلبات Production، رقم الطلب التجاري، Branch/Outlet، دلالات الاسم والهاتف، الترجمة التاريخية، واتخاذ قرار WhatsApp الفعلي/الرسائل الطويلة. لا يحول هذا الاختبار `previewOnly` إلى طلب عام. لم يبدأ Stage 6D.3.
