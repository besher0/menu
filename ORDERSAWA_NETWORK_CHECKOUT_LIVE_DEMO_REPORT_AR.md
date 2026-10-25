# OrderSawa — إصلاح Checkout وربط معاينة Dashboard بالمنيو

التاريخ: 25 أكتوبر 2026. الفرع: `feature/product-configuration-network`. نقطة البداية: `9d3a33298cbd6bda4436f47d125457bb48ac11ab`، والكود المعتمد السابق `9634b19a627eb666ecc8cf414f661bc8efa2cc23`. هذا تقرير لبيئة Demo معزولة، وليس إثباتًا على خادم أو قاعدة Production.

## السبب الجذري والإصلاح

على HTTP المحلي، كان غياب `crypto.randomUUID()` يجعل الواجهة تنشئ `lineId` من `Math.random()` نصيًا، مثل `network-1792338246815-0.37320218145277184`. سجّل Proxy التشخيصي **المعرّفات فقط** من طلب متصفح LAN، وأعاد Backend الخطأ `INVALID_WHATSAPP_CHECKOUT_LINE` / `Invalid line 0`؛ عقده الحالي يقبل فقط `[A-Za-z0-9:_-]` بحد 128 حرفًا. أُزيل تسجيل التشخيص من Proxy قبل التسليم.

أصبح مولّد معرّف سطر Network يستخدم مقاطع base36 آمنة مع عدّاد وتسلسل وفحص تصادم مع أسطر السلة الحالية. عند استعادة سلة قديمة، تُستبدل المعرّفات غير الصالحة أو المكررة لمكوّنات Network فقط؛ تبقى `selection` و`identity` والكمية والملاحظة وترتيب الأسطر كما هي، ولا تُدمج تكوينات مستقلة. لم يتغير Backend أو عقد المعرّفات أو محرك الأسعار أو أمان Trusted Checkout.

## الربط التجريبي الفعلي

PostgreSQL 18.6 التجريبية `ordersawa_unified_interactive_preview` على `127.0.0.1:55448`، وAPI على `127.0.0.1:5001`، وNext.js المعزول على `127.0.0.1:3101`. Proxy محلي على `192.168.178.69:3200` يوصل Dashboard والمنيو و`/api` إلى هاتين العمليتين، ويمنع `/orders/network-test`. Dashboard يتطلب تسجيل دخول. لا يوجد Tunnel عام ولا رقم عميل حقيقي؛ رقم WhatsApp التجريبي `12025550100`. علم Trusted Network WhatsApp مفعّل في عملية Demo فقط.

العنوانان من الجهاز نفسه، ويحتاج الهاتف شبكة Wi‑Fi نفسها، مع إعادة فحص IPv4 إذا تغيرت الشبكة:

- Dashboard: `http://192.168.178.69:3200/login`
- المنيو: `http://192.168.178.69:3200/m/preview-ordersawa/menu?category=demo-products&display=list`

بيانات دخول Demo تُسلّم للمؤسس في المحادثة فقط، ولا تُحفظ في هذا التقرير أو في Public Menu. لم تُشغّل Seed أثناء هذه المهمة كي لا يُستبدل منتج أو سعر أضافه المستخدم. قاعدة Demo محفوظة في `../work/ordersawa-unified-preview-pg18-data`؛ إعادة تشغيل Frontend وحده لم تمسها.

## ما تحقق عمليًا

- أُنشئ من Dashboard الحقيقي منتج `بيتزا أربعة أجبان — اختبار Demo` (`d18adbfc-63c5-42ae-932b-5d499abdd099`) من نوع `NETWORK_SETUP`، ثم حُفظت شبكة بحجم صغير 9000، وسط 12000، كبير 15000، مع جبنة إضافية 2000 وخيار متداخل للتحمير 500. خرجت الشبكة في الإصدار 2، وظهر المنتج في Public Menu API والمنيو بعد تفعيله يدويًا، وسعّره Configurator بـ14500 للوسط مع الإضافتين.
- عُدّلت بيتزا Demo الموجودة من Dashboard: سعر الوسط 110→112 (الإصدار 2) ثم تسمية الجبنة ضمن الوسط (الإصدار 3). ظهرت البيانات الجديدة في Configurator بعد إعادة التحميل. بقيت منتجات Legacy وCombo وIncluded Quantity والبيتزا الأصلية موجودة.
- تعطيل توافر المنتج الجديد من Dashboard أخفاه من المنيو بعد التحديث؛ إعادة تفعيله أعاد ظهوره. بقي `isAvailable=true` في قاعدة Demo في نهاية الفحص.
- استعادة سلة Browser قديمة أصلحت 7 معرّفات Network منقوطة/مكررة دون خسارة 8 وحدات أو دمج الأسطر. أكمل Mixed Checkout بعدها إلى رابط WhatsApp، دون خطأ `Invalid line 0`.
- Network-only أنتج رابط WhatsApp تجريبيًا بإجمالي 14500 ل.س. Mixed (بيتزا جديدة + Legacy + Combo بتكرار Linked Pizza بحجمين مستقلين) أنتج إجمالي 14800 ل.س، مع ملاحظتي الصنف والطلب. فُحص نص الرابط ورقم الاختبار؛ لم تُرسل رسالة.
- Legacy-only استعمل المسار القديم: زاد عدد `Order` التجريبية من 3 إلى 4، وعدد أحداث `WHATSAPP_ORDER_CLICKED` إلى 4. لم تحفظ تجربتا Network/Mixed طلبات `NETWORK_TEST`.
- عند تغيير سعر Legacy التجريبي 60→65 بعد بناء سلة Mixed، أظهر Checkout نافذة موافقة صريحة بالإجمالي الجديد 14565 بدل 14560؛ ولم يظهر رابط السعر الجديد إلا بعد اختيار «أوافق وأفتح WhatsApp». أُعيد سعر Legacy في قاعدة Demo المعزولة إلى 60 بعد الاختبار. عند تغيير Revision لبيتزا Demo أُبطلت أسطر السلة القديمة بدل إرسال سعر قديم.
- `GET` للداشبورد والمنيو وPublic Menu API عبر LAN أعاد 200، ومسار Network Test المحظور عبر Proxy أعاد 404.

## حدود التحقق وملاحظة تشغيلية

اختبارات المتصفح أعلاه جرت عبر متصفح Codex بعروض 360 و390 و430 وDesktop، **وليست اختبارًا على هاتف فعلي**. فُتح رابط WhatsApp التجريبي في صفحة المشاركة فقط دون الضغط على الإرسال. لم تُختبر كل الصور لأن بعض منتجات Demo بلا صور أصلًا.

بعد تشغيل Root Build بينما كان Next dev يستخدم مجلد `.next` ذاته ظهرت حالة تحميل مؤقتة في Configurator. عُزل Next الخاص بالمعاينة في `.next-preview-demo` عبر متغير `ORDERSAWA_PREVIEW_DIST_DIR`، وعاد Configurator والاقتباس للعمل. نقرات أتمتة Dashboard الأولى بعد إعادة التشغيل لم تُصدر `PATCH` قبل اكتمال تهيئة الصفحة؛ أُعيد سعر Legacy 65→60 بتحديث SQL محدود على **صف Demo نفسه فقط**. بعد تنقل كامل داخل الداشبورد، نجح Toggle للمنتج الجديد إيقافًا وإعادة تشغيل، ونجح حفظ نموذج Legacy بالسعر الأصلي 60؛ لم يبق خلل Dashboard مثبت من هذا العرض المؤقت. هذا لا يغني عن تجربة المؤسس على هاتفه/كمبيوتره.

لم تُختبر كاميرا/رفع صورة، ولا اتصال هاتف Wi‑Fi الفعلي من داخل أدوات Codex. الروابط محلية لشبكة الجهاز، وقد تتوقف العمليات إذا أُغلقت جلسة Codex أو تغير IPv4؛ لا يُعاد Seed فوق قاعدة Demo المحفوظة.

## الاختبارات والملفات

| الفحص | النتيجة |
| --- | --- |
| Shared Tests | 25/25 ناجحة |
| Web Tests | 64/64 ناجحة، منها اختبارات إنشاء المعرّف وترميم السلة |
| API Suite | 108 ناجحة، 113 متخطاة بشروطها الخاصة؛ ليست نجاحًا |
| Root Typecheck | ناجح |
| Root Build | ناجح |
| Browser LAN | Legacy-only وNetwork-only وMixed وCombo وتغير السعر والرابط التجريبي: النتائج أعلاه؛ لا إرسال فعلي |
| Production/هاتف حقيقي | لم يُختبر؛ ممنوع استخدام Production في هذه المهمة |

الملفات البرمجية: `apps/web/src/components/public/cart-model.ts`، `cart-model.test.ts`، `public-menu-client.tsx`. عزل المعاينة فقط: `apps/web/next.config.mjs`، `apps/web/tsconfig.json`، `.gitignore`. لم يتغير Backend أو Prisma أو Shared Engine أو Release Package القديمة. صور الفحص المحلية في `../work/network-checkout-live-demo-2026-10-25/`، وأهمها `public-menu-390.png` و`dashboard-products-390.png` و`network-sizes-360.png` و`network-cart-390.png` و`mixed-checkout-390.png` و`price-change-acceptance-390.png`.

لتشغيل Frontend دون مسح البيانات: شغّل قاعدة Demo الموجودة وAPI بإعداداتهما التجريبية المعزولة، ثم Next من جذر المستودع مع `ORDERSAWA_PREVIEW_DIST_DIR=.next-preview-demo` و`NEXT_PUBLIC_API_URL=http://<CURRENT_LAN_IP>:3200/api` على المنفذ 3101، ثم `../work/ordersawa-lan-full-demo-proxy.cjs` بعد تحديث IP عند تغيره. لا تُشغّل Seed إلا بعد مراجعة تأثيرها؛ بيانات المستخدم التجريبية محفوظة في PostgreSQL وليست داخل Next. الإيقاف يكون بإيقاف جلسات Next/Proxy/API/PostgreSQL التجريبية فقط، دون لمس PM2 أو Production.
