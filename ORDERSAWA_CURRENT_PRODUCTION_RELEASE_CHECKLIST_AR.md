# OrderSawa — قائمة جاهزية إصدار المنيو الحالي وWhatsApp (Stage 6F.2)

**للمسؤول عن السيرفر والنشر؛ قائمة مراجعة لا تصريح تنفيذ.** الفرع `feature/product-configuration-network`، نقطة الشيفرة المفحوصة `76e593d` (Stage 6F.1؛ Currency implementation `0b3d283`). Commit هذه القائمة يُستخرج بعد حفظها بـ`git log -1 --format=%H`. **لا اتصال Production أو SQL أو Migration أو Deploy أو تغيير Flag بموجب هذه الوثيقة.** يجب الحصول على موافقة جديدة منفصلة للقراءة من القاعدة، ثم للترحيل/النشر/التفعيل كلٌّ في نطاقه. لا تضع بيانات اعتماد أو مخرجات تحوي PII في Git.

## القرار التشغيلي المختصر

الميزة **مكتملة وظيفيًا في اختبارات محلية معزولة، غير جاهزة للتفعيل على سيرفر OrderSawa الحقيقي قبل استكمال البوابات أدناه**. الخدمة الحالية هي Electronic Restaurant Menu وفتح WhatsApp برسالة جاهزة يرسلها الزبون. لا يلزم Business/Outlet، POS، Kitchen، Dispatch، Network Order Persistence، ولا Candidate DB Completeness Guard لتشغيل هذا المسار العام. لكن الـPrisma Client الحالي قد يتطلب أعمدة Order المضافة في Stage 6C حتى لو لم تُحفظ Network/Mixed Orders؛ غياب `Order.idempotencyKey` في قاعدة disposable أحدث `P2022` عند قراءة Order. وضع Production **مجهول**.

| نوع السلة | العلم العام OFF | العلم ON بعد موافقة مستقلة | أثر الحفظ |
|---|---|---|---|
| Legacy-only | Checkout قديم | Checkout قديم | Order/OrderItem وAnalytics حدث واحد؛ Trusted API المباشرة ترفض `400 LEGACY_CHECKOUT_REQUIRED` |
| Network-only | محجوب | Trusted Prepare/Confirm ثم رابط `wa.me` | لا Order في DB؛ الزبون يرسل بنفسه |
| Mixed | محجوب | Trusted Prepare/Confirm نفسه | لا Order في DB؛ Legacy line لا يمر عبر Legacy endpoint منفصل |

## A. بوابات حظر التفعيل — يطلب دليل وموافقة، لا افتراض

| # | فحص يجب إغلاقه | دليل القبول قبل أي ON | الحالة عند تسليم 6F.2 |
|---:|---|---|---|
| 1 | **قاعدة البيانات الفعلية وتاريخها** | موافقة صريحة على **قاعدة محددة ودور Read-only**؛ Metadata من `apps/api/prisma/stage6f0-readonly-preflight.sql` أو تصدير موثوق مماثل؛ مقارنة `schema.prisma` وCHECK/FK/index/enum/trigger و`_prisma_migrations` checksums؛ قرار مصالحة مكتوب | **غير مفحوصة**؛ SQL اختُبرت على disposable فقط |
| 2 | **مخطط متوافق قبل Binary الحالية** | إثبات Stage 2C Product Tree/Version/nullable Base وDependency FK/index/checks، دقة `DECIMAL(24,6)`، وتوافق أعمدة Order الأربع Stage 6C مع Prisma Client؛ تجربة Legacy Order create/read على Staging مماثلة | **غير مثبت في Production**؛ تجربة ناقصة أعادت `P2022` |
| 3 | **Backup / Restore / Rollback** | Backup متسق قبل أي DDL، Restore مجرّب مع RPO/RTO ونافذة صيانة؛ خطة رجوع تطبيق/Flag منفصلة عن SQL؛ لا rollback يمحو Network data أو يقرب الأسعار | **لا دليل عن بيئة Production** |
| 4 | **Topology والـProxy والبيئة** | عدد API/Web instances، Proxy/TLS/Ingress ودومينات فعلية و`TRUST_PROXY` وCORS وAPI origins موثقة؛ تحقق من أن Rate Limiter per-process مناسب أو خطة حماية بديلة قبل ON | **مجهول**؛ `docker-compose.yml` يصف PostgreSQL محليًا فقط، لا يثبت نشرًا أحاديًا |
| 5 | **مفتاح قبول السعر العام** | `PUBLIC_WHATSAPP_CHECKOUT_HMAC_KEY` عشوائي سري hex ≥32 byte، مخزن في Secret Store لا Git، متطابق آمنًا بين API instances، خطة تدوير تحترم Token 10 دقائق؛ افحص الوجود/الطول أو بصمة غير قابلة للاسترجاع، **لا تطبع المفتاح** | Placeholder فارغ في `.env.example`، لا إعداد Production مدقق |
| 6 | **رقم المطعم/القدرات** | الوجهة الدولية الرسمية لرقم WhatsApp من Restaurant/Branch، Capability `PRODUCT_CONFIGURATION` لما فيه Network و`WHATSAPP_ORDERING`/`CART_ORDERING`، Subscription نشط/تجريبي، `publicUi.whatsappOrderingEnabled`؛ مطاعم الاختبار محددة | **لم تُفحص بيانات المطاعم الحقيقية** |
| 7 | **عملة وأسعار تاريخية** | جرد مأذون به لعملات المطاعم ولأسعار SYP/`ل.س` الكسرية القديمة (دون عرض/تعديل بيانات العملاء) وخطة معالجة معتمدة؛ تحقق `12500.000000` صالح و`12500.50` مرفوض؛ EUR/USD/AED منزلتان وفرق تقريب العرض واضح | سياسة الشيفرة منفذة في 6F.1؛ البيانات الحقيقية **مجهولة** |
| 8 | **Legacy Analytics والأثر الجانبي** | اختبار Staging يؤكد Legacy-only، مع Flag OFF وON، يحفظ Order/Items وحدث `WHATSAPP_ORDER_CLICKED` مرة واحدة؛ مراجعة أي مستهلك خارجي لـAnalytics `totalAmount` الذي صار Decimal string | اختبارات disposable نجحت؛ المستهلكون الخارجيون مجهولون |
| 9 | **Staging مطابق وSmoke تشغيلية** | DB/Prisma/migrations متوافقة، أسرار اختبار معزولة، Flags OFF ثم ON بتفويض، سيناريوهات §D، مراقبة 400/403/409/429/503 دون PII؛ خطة تراجع مجرّبة | لم تُنفذ على Staging موثوقة |
| 10 | **موافقة التفعيل النهائي** | سجل من وافق، الوقت/المطاعم المقصودة، مسؤول مراقبة/إيقاف، نتيجة Gates 1–9 وقرار Flag؛ لا رفع العلم بمجرد نجاح Build | **غير ممنوحة**؛ `ENABLE_PUBLIC_NETWORK_WHATSAPP_CHECKOUT=0` يبقى |

لا تتصل بقاعدة Production لتنفيذ Query القائمة تلقائيًا. Query القراءة فقط موجودة وجُرّبت على PostgreSQL disposable في Stage 6F.1، لكنها لا تثبت صلاحيات الدور أو تاريخ Production. المستودع يفتقد Initial CREATE Migration؛ لا تستخدم `prisma db push` أو `migrate deploy` أو `migrate resolve` على قاعدة موجودة اعتمادًا على تسلسل Git وحده. Stage 2C وStage 6C SQL في Git بحاجة مقارنة تاريخ/مخطط القاعدة الفعلية وخطة مصالحة منفصلة. Candidate `scripts/stage6d3c3e-network-order-completeness-candidate.sql` **خاصة باختبار `NETWORK_TEST` وليست Migration إنتاجية أو شرط WhatsApp العام**.

## B. إعدادات البيئة — مراجعة الحالة دون طباعة أسرار

| الإعداد/المجال | قاعدة التحقق |
|---|---|
| `ENABLE_PUBLIC_NETWORK_WHATSAPP_CHECKOUT` | **OFF افتراضيًا**؛ لا يُضبط `1` في Production قبل الموافقة وبوابات A. عند OFF يبقى Legacy-only شغالًا، وتُحجب Network/Mixed |
| `PUBLIC_WHATSAPP_CHECKOUT_HMAC_KEY` | Secret Store فقط؛ صيغة hex وطول ≥64 حرفًا، تصنيف السر وتوزيعه وتدويره؛ عند غيابه مع ON يرد 503، لا سر في سجلات/CLI |
| `DATABASE_URL`, `DIRECT_URL` | هوية البيئة والدور/SSL/Pool صحيحة عبر قناة آمنة؛ لا تنسخ URL أو Password إلى تقرير أو Git؛ لا تعتمد على `.env` التطويرية |
| `API_ORIGIN`, `WEB_ORIGIN`, `CORS_ORIGINS`, `ROOT_DOMAIN`, `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_WEB_URL` | تطابق TLS وHost/Proxy/Routes المتاح فعليًا؛ لا CORS `*` بلا مراجعة |
| `TRUST_PROXY`, `RATE_LIMIT_*` | تأكد من IP الحقيقي وخطأ 429 خلف Proxy؛ الافتراضي الحالي عام 300/دقيقة/IP وكتابة 120/دقيقة/IP **لكل process**، ليس نظامًا موزعًا. تعدد النسخ/الحركة العالية يحتاج قرارًا تشغيليًا مستقلًا |
| `PRODUCT_CONFIGURATION`, `WHATSAPP_ORDERING`, `CART_ORDERING` | راجع إسناد الميزات داخل Subscription المطعم وحالة الباقة؛ فقد Network Capability لا يمحو Tree ولا يحولها إلى Legacy |
| رقم WhatsApp و`publicUi.whatsappOrderingEnabled` | تحقق من مطعم/فرع الوجهة، الصيغة الدولية، والعلم التجاري؛ لا تعرض رقم عميل حقيقي في Logs/Checklist عامة |
| `ENABLE_DISPOSABLE_NETWORK_ORDERS` | ليس علم المسار العام. أبقه غير مستخدم Production؛ `/orders/network-test/*` تتطلب loopback وnon-Production وDB disposable وحارسًا مطابقًا، ولا تفعل `orderingEnabled` |

بيانات العميل والملاحظات تظهر في Draft وURL النهائي؛ راجع سجلات Reverse Proxy وAPM والاحتفاظ بها، ولا تسجل Token أو URL كاملًا أو رقم هاتف/ملاحظات في Debug. قبول السعر العام مدته الحالية **10 دقائق**؛ بعد انتهاء Token أو تغير السلة/السعر/Revision/Availability/Linked source ترد 409 ومسودة جديدة، ولا يجوز فتح رابط قديم. بعد فتح WhatsApp وقبل إرسال الزبون قد تتغير المنيو؛ هذا حد تشغيلي معروف لمسار لا يحفظ Order، لا يُخفى عن مسؤول التشغيل.

## C. خطوات مراجعة الترحيل والإصدار — محطات موافقة منفصلة

1. **تفويض قراءة فقط:** حدد قاعدة Production بالاسم والجهة والدور Read-only ومكان حفظ Metadata؛ نفّذ Preflight فقط بعد موافقة مستقلة، دون استخراج صفوف Products/Orders/Customers أو logs من `_prisma_migrations`.
2. **مطابقة التاريخ والمخطط:** تحقق من PostgreSQL version، Initial Baseline الفعلي، أسماء/Checksums وحالة كل Migration، `convalidated/indisvalid`، أعمدة Product/Dependency/Order/OrderItem والـEnum. إذا كان التاريخ غائبًا/متشعبًا أو Schema drift، **توقف** وضع خطة مصالحة، لا تعِد كتابة history.
3. **خطة SQL منفصلة ومراجعة:** بناءً على القراءة، حدد ما يلزم من Stage 2C وStage 6C لتوافق Binary، أثر الأقفال والدقة والقيود على Legacy والبيانات القديمة، ترتيب التغيير وإجراءات Backup/Restore والتراجع. لا تدرج Candidate Guard التجريبية تلقائيًا.
4. **Staging مماثلة:** اختبر Schema diff وPrisma Client وأخطاء P2022 المحتملة، Legacy Order/Analytics، Network Setup/GET/PUT، Public Configurator/Quote، ثم Trusted Prepare/Confirm والعلم OFF/ON؛ لا بيانات عميل حقيقية دون سياسة/إذن.
5. **نشر/تفعيل لاحقان بتفويض جديد:** نشر متدرج مع العلم OFF، Smoke Legacy وقراءات Public، مراقبة؛ فقط بعد موافقة نهائية فعل العلم لمطاعم محددة إن كانت البنية تدعم ذلك، ثم Smoke Network/Mixed. إذا لا يوجد تحكم per-restaurant، وثّق blast radius قبل التفعيل.
6. **تراجع:** عند مشكلة مالية/PII/409 واسعة/فشل Legacy، أوقف العلم أولًا (Network/Mixed تُحجب وLegacy يستمر)، أعد Binary/الإعداد وفق خطة مختبرة. لا تُرجع أعمدة أو دقة SQL إذا أصبحت تحتوي بيانات جديدة إلا بعد تحليل عدم فقد البيانات. لا تمسح Order/Analytics صحيحة أو Network Trees.

هذه **خطوات مقترحة للمراجعة** وليست أوامر تشغيل. لا يوجد في Git ما يثبت عدد نسخ API/Web أو TLS/Proxy/Backup/Deploy/Secret Store الحقيقي؛ اطلب هذه المعلومات من المشغّل بدل افتراض Single-instance.

## D. Smoke/Regression المطلوبة على Staging قبل طلب الإذن بالتفعيل

| حالة | نتيجة متوقعة |
|---|---|
| Flag OFF، Legacy-only | السلة وCheckout القديمان؛ Order/Items وAnalytics مرة واحدة؛ السعر/الاسم/الرقم الصحيح؛ لا fallback بسعر المتصفح |
| Flag OFF، Network-only أو Mixed | منع واضح؛ Trusted Prepare/Confirm ترد 403؛ لا Legacy endpoint ولا WhatsApp URL |
| Flag ON، Legacy-only | يبقى Checkout القديم وحفظه؛ طلب HTTP مباشر إلى Trusted Prepare **وConfirm** يرد `400 LEGACY_CHECKOUT_REQUIRED` |
| Flag ON، Network-only | Pizza Size كامل، Options/Nested/Included/Overrides؛ Quote/Prepare/Confirm Decimal صحيحة ورسالة مفصلة ورقم مطعم صحيح؛ **لا Order** |
| Flag ON، Mixed | Legacy بسعر DB وNetwork من Shared، إجمالي موثوق واحد، ملاحظات/عميل/توصيل أو استلام، لا Order مكررة ولا `NETWORK_TEST` |
| Linked/Combo | ORIGINAL مصدر Network محفوظ، CUSTOM Snapshot، نسخ متكررة مستقلة، منع مصدر مفقود/غير متاح أو مطعم آخر ودورة عميقة |
| تغير السعر/Revision/Availability/Capability | HTTP 409/403 منظم، Draft جديدة عند الحاجة، قبول جديد، **لا فتح WhatsApp عند الفشل** |
| طلب HTTP معدّل/Token منتهية | رفض حقول سعر/إجمالي دخيلة، ربط Token بالمطعم والطلب والمسودة، لا تسرب Prisma/SQL/PII؛ لا رابط قديم |
| Currency | SYP صحيح بلا كسر ورفض القديم الكسري؛ EUR/USD/AED عرض منزلتين HALF_UP مع فرق العرض الصريح؛ الأرقام الدقيقة ثابتة في الحساب |
| Dashboard Setup | إنشاء Network `basePrice=null,version=1,isAvailable=false`، رفض التفعيل المبكر، حفظ أول Tree 1→2، Reopen/Publish يدوي، Legacy Base `0` لا يتحول |
| RTL/Mobile ورسالة WhatsApp | 390px، لغة مختلطة، كل Size/Options/Linked/Notes وTotal، رفض URL فوق حد 8192 بلا قطع؛ في Staging اعترض الرابط ولا ترسل إلى رقم حقيقي إلا بإذن اختبار محدد |
| Infrastructure | `NETWORK_TEST` غير قابلة للجمهور، Rate/Proxy/CORS صحيح، Monitoring دون PII، لا تغيّر أسعار Legacy أو Analytics |

أدلة سابقة **محلية فقط**: Stage 6F.1 API 206/206، Shared 25/25، Web 43/43، Chrome/Nest/Next 14/14 checkpoints، Root Typecheck/Build، وPreflight SQL على disposable. Stage 6E.4 API 202/202 وBrowser ON 13/OFF 4/Dashboard 6. هذه ليست نتائج Staging أو Production ولا تُسقط أي صف من الجدول أعلاه.

## E. تحسينات موصى بها وFoundation المستقبلية — ليست شروط إطلاق مطلقة

- **قياس وتحسين:** Checkout العام يحمل Catalog المطعم كاملًا ويقفل كل Product `FOR SHARE` في Prepare وConfirm؛ قد يحبس تحديث Product غير مرتبط. قِس على حجم المطعم الحقيقي قبل التعميم، ولا تُسقط Revalidation لتقليل الزمن. Dependency Closure loading/locking مجرد تصميم مؤجل. Rate Limit متعددة النسخ قد تصبح مانعًا إذا أكدت topology ذلك.
- **دين مستقبلي لنظام Orders:** `NETWORK_TEST` Design A، Idempotency، Acceptance، sealed Snapshot، SQL Stage6C وCandidate DB Guard، Historical WhatsApp Formatter، Benchmarks؛ محفوظة داخل المستودع ومعزولة. لا تربطها بالـWhatsApp العام ولا تطبق Guard المرشحة أو تفعّل `orderingEnabled` ضمن هذا الإصدار.
- **غير مطلوب حاليًا:** Business Catalog/Outlet Differential/Market Service Modes/Scheduling، POS/Kitchen/Delivery Dispatch، Order Number تجاري لـNetwork، إرسال WhatsApp تلقائيًا، أو رسوم/ضرائب/خصومات جديدة. هذه تحتاج قرارات ومشاريع مستقلة ولا تمنع المنيو الحالي لمجرد أنها مستقبلية.

## F. نموذج قرار الإطلاق الذي يجب ملؤه لاحقًا

| بند | المسؤول/الدليل/تاريخ الموافقة |
|---|---|
| قاعدة البيانات المحددة ونتيجة Read-only audit | **معلّق** |
| Schema reconciliation/Backup/Restore/Staging | **معلّق** |
| عدد النسخ والـProxy/CORS/Rate والـSecrets | **معلّق** |
| المطاعم/العملات/الأرقام/Capabilities/بيانات SYP القديمة | **معلّق** |
| نتيجة Smoke Legacy وNetwork/Mixed والـRollback | **معلّق** |
| تصريح نشر ثم تصريح تبديل العلم | **غير ممنوح في Stage 6F.2** |

الملف التقني المكمل: `ORDERSAWA_PRODUCT_CONFIGURATION_FINAL_HANDOFF_AR.md`. وثيقة Stage 6F.0 تفصّل Metadata SQL ومخاطر الهجرة، وStage 6F.1 تفصّل قرار العملة ونتائج اختباره. **توقف بعد Stage 6F.2؛ لا تنفيذ على السيرفر أو قاعدة Production تلقائيًا.**
