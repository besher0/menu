# OrderSawa — تدقيق المتطلبات النهائي والإصلاحات المحدودة

التاريخ: 2026-11-01. الفرع: `feature/product-configuration-network`. نقطة البدء: `760b907`. هذا تقرير عن الكود المحلي وبيئة Demo، وليس شهادة قبول Production. لم تُغيَّر قاعدة Demo أو Prisma أو Shared Pricing Engine، ولم تُرسل رسالة WhatsApp أو يحدث نشر.

## النتيجة والخلل المصوَّر

أظهرت صورة المؤسس من `rydtest.ordersawa.com` رفض Delivery رغم إدخال «المنطقة» و«قريب من»، برسالة Backend إنجليزية تطلب `beside` وتذكر `pickupTime`. المقارنة المباشرة لنفس الطلب بين عمليتي الـAPI المحليتين أثبتت اختلاف النسختين:

| المسار | النتيجة |
|---|---|
| API المعاينة الخارجية على `127.0.0.1:5001` | HTTP 400 `INVALID_NETWORK_ORDER_DETAILS`: النص القديم `Delivery requires area, near and beside; pickupTime is not applicable.` |
| API الاختبار المحلي على `127.0.0.1:5002` | تجاوز تحقق Delivery دون `beside`، ثم HTTP 400 `INVALID_QUOTE_SELECTION` بسبب حجم منتج متروك عمدًا بلا اختيار. هذا يثبت الوصول إلى تحقق المنتج، لا نجاح Checkout لهذا الطلب الاصطناعي. |
| مصدر Backend الحالي | `network-order-contract.ts:78`: يتطلب `deliveryArea` و`deliveryNear` فقط؛ `deliveryBeside` اختياري. |
| مصدر Frontend الحالي | `trusted-whatsapp-checkout.tsx`: يبني Delivery بالمنطقة و«قريب من» فقط؛ لا يرسل `pickupTime` القديم. |

السبب الحقيقي للخطأ المصوَّر هو أن عملية API على 5001 بدأت قبل تحديث الكود وبقيت تخدم العقد القديم؛ ليس خطأ بيانات أدخلها الزبون. أُضيف اختبار انحدار لبناء الطلب مع State قديم، ورسائل عربية/إنجليزية آمنة تعتمد Error Code بدل عرض `error.message` الخام. **إصلاح تجربة الرابط الخارجي لم يكتمل بعد**: لم يمكن إيقاف PID 19680 من صلاحيات الجلسة (`Access denied`)، ولذلك لم أُعد تشغيله أو أدّعِ أن الصورة لم تعد قابلة للتكرار على 4G. ينبغي إيقاف هذه العملية بإذن مالكها ثم تشغيل API 5001 بالكود الحالي، وإعادة فحص الرابط بعد ذلك.

## مصفوفة القرارات

الرموز: **متحقق** = Implemented & Verified باختبار مذكور؛ **كود فقط** = Implemented but Not Verified في سيناريو قبول كامل؛ **تعطل** = Failed / Regression؛ **ناقص** = Missing؛ **مستبدل** = Superseded by Later User Decision. المراجع الأخيرة: `ORDERSAWA_COMPREHENSIVE_FINAL_FIX_REPORT_AR.md`، `ORDERSAWA_FINAL_DELIVERY_FEE_MOBILE_ACCEPTANCE_AR.md`، `ORDERSAWA_FINAL_CHECKOUT_DELIVERY_FEE_REPORT_AR.md`، و`ORDERSAWA_APPROVED_CHECKOUT_DESIGN_REVIEW_AR.md`. تقارير الجولات القديمة سياق قرارات، وليست دليل تشغيل للنسخة الخارجية الحالية.

### المنيو العام وبطاقات Checkout

| البند | المسؤول/الدليل الحالي | الحالة والإجراء |
|---|---|---|
| «ابتداءً من» قبل المبلغ في RTL | `public-menu-client.tsx:2444`؛ AX للمنيو أظهر «ابتداءً من 9000 ل.س» | متحقق محليًا؛ فحص Android بصري نهائي متبقٍ. |
| حساب Starting Price دون تعديل | `productPrice` و`ProductPrice`؛ لم يتغير محرك الأسعار، واختبارات Shared 25/25 | كود فقط بالنسبة لكل تكوينات Dashboard؛ لا تغيير مطلوب الآن. |
| عدم ظهور «تكوين آخر» غير المرغوب | مسار `renderProduct` في `public-menu-client.tsx`؛ AX أظهر أزرار +/− لا عبارة زائدة | متحقق للمنتجات الخمسة المعروضة محليًا؛ فحص بقية الأصناف لاحقًا. |
| زر + مع سطر واحد/عدة تكوينات | `public-menu-client.tsx` و`network-cart.ts`؛ اختبار الوحدة للهوية، AX أظهر تحكم الكمية | كود فقط للسيناريو الكامل متعدد التكوينات في المتصفح الحالي. |
| عدم دمج تكوينين مختلفين | `network-cart.ts` واختبارات السلة؛ `lineId`/selection منفصلان | متحقق باختبار وحدة؛ إعادة تجربة Dashboard-to-cart اختيارية. |
| الحفاظ على ProductQuickViewModal | `public-menu-client.tsx:2322`؛ فتح بطاقة Network نقل إلى تفاصيل المنتج فعلًا | متحقق من وجوده ومسار البطاقة؛ استخدام Quick View لكل نوع لم يُختبر. |
| صورة 1:1 بلا تشويه | `globals.css:8720` و`:12599` | كود فقط؛ صور Demo الحالية placeholders فلا تثبت عدم تشويه صورة حقيقية. |
| توسيط الاسم والسعر والمسافات | `globals.css:12588-12715`؛ لقطة السلة المحلية 390px | متحقق بصريًا على 390؛ 360/430 بلا لقطة محفوظة حديثة. |
| توحيد Legacy/Network والخطوط والألوان | CSS الكاردات العامة؛ لقطة Mixed محلية | متحقق للحالة الفاتحة، غير متحقق لكل ألوان المطاعم. |
| إزالة الأيقونة الزائدة بجانب السهم | `public-menu-client.tsx`/CSS؛ لقطة Mixed | كود فقط؛ يحتاج مقارنة Baseline موثقة. |
| ملاحظات الأصناف | `public-menu-client.tsx`، Formatter واختباراته | متحقق في اختبارات Formatter ومعاينة Mixed محلية. |
| محرر Network واستعادة التكوين | `public-menu-client.tsx:2897-3140`، اختبارات السلة | كود فقط؛ دورة التعطيل من Dashboard لم تنفَّذ على Demo. |
| «قد يعجبك أيضاً» | AX لصفحة منتج Network أظهر العنوان و4 روابط/أزرار | متحقق محليًا. |
| زر «التالي» الأصلي | `public-menu-client.tsx`؛ لقطة Checkout المحلية | متحقق بصريًا محليًا؛ لا إعادة تصميم. |

### Network Validation واللوحة السفلية

| البند | المسؤول/الدليل الحالي | الحالة والإجراء |
|---|---|---|
| تكوين صالح، تغيّر سعر، Popup قبول دون فقده | `public-menu-client.tsx` وTrusted hook؛ اختبارات وحدة/جولات سابقة | كود فقط لهذه الجولة؛ يحتاج قاعدة Disposable لتغيير سعر فعلي. |
| تعطيل خيار، Popup مراجعة، إطار أحمر واحد | `reviewModalLineIds` و`network-cart-needs-review` في TSX/CSS | كود فقط؛ لم أغيّر بيانات Demo عمدًا. |
| فتح المحرر، بديل صالح، إعادة Quote، إزالة التحذير | `saveNetworkEdit` و`retryNetworkLine` | كود فقط؛ سلسلة قبول كاملة غير مثبتة. |
| عدم إخفاء Invalid محليًا بلا إصلاح | `reviewedLineIds` ومسار إعادة التحقق | كود فقط؛ يحتاج تكامل PostgreSQL معزول. |
| المصغّرة: سعر الأصناف/الرسوم/الإجمالي دون أسماء | `public-menu-client.tsx`، لقطة محلية 390px | متحقق بصريًا محليًا. |
| الموسعة: أسماء يمين/أسعار يسار، بلا صور | لقطة محلية وقياس DOM عند 360/390/430 | متحقق على Browser Emulation؛ أعمدة الأسعار بقيت 73.06 و53.49px، دون overflow أفقي. |
| لون موحد للأسطر والإجمالي بلون الثيم | `globals.css` ولقطة محلية | متحقق للحالة الفاتحة؛ ثيمات أخرى لم تُختبر هنا. |
| ارتفاع المصغّرة قرابة الثلث ومؤشر التوسيع | CSS/لقطة 390px | متحقق بصريًا محليًا، لا قياس Android فعلي. |
| السحب من مناطق مناسبة، تتبع الإصبع، Snap | `invoice-sheet-motion.ts` واختباراته | كود فقط؛ محاولة drag الآلية لم تثبت حركة Touch كاملة. |
| عدم انضغاط النص بعد الإفلات | قياس DOM في الأبعاد الثلاثة ولقطة expanded | متحقق لثبات العرض بعد الاستقرار؛ **غير مثبت أثناء الحركة/الإفلات الفعلي**. |
| Scroll الداخلي وعدم تعارضه/Scrollbar | `globals.css` وحاوية الفاتورة | كود فقط؛ يحتاج Android Touch وسلال 10/20 صنفًا. |

### التوصيل والطلب والأخطاء

| البند | المسؤول/الدليل الحالي | الحالة والإجراء |
|---|---|---|
| Delivery يتطلب المنطقة و«قريب من» فقط | `network-order-contract.ts:78` واختبار Contract وHTTP 5002 | متحقق على الكود الحالي؛ **تعطل خارجيًا** بسبب API 5001 القديم. |
| تبديل Pickup/Delivery مع State قديم | `buildTrustedCheckoutRequest` واختباره الجديد | متحقق Unit: لا يرسل `pickupTime` في Delivery ولا حقول Delivery في Pickup. Reload ببيانات قديمة لم يُختبر Browser. |
| Legacy-only دون تغيير قواعده | `public-menu.service.ts` واختبارات Legacy؛ لم تُعدَّل آلية الحفظ | متحقق Unit؛ لم أُنشئ Order جديدًا على Demo في هذه الجولة. |
| Network/Mixed Prepare/Confirm | Trusted hook وخدمة API؛ معاينة Mixed من Browser على 5002 نجحت | متحقق للـPrepare/Preview المحلي؛ Confirm كامل للنسخة الحالية لم يُنفذ. |
| رسائل أخطاء عربية/إنجليزية غير تقنية | `trusted-whatsapp-checkout.tsx` واختباره (6 حالات) | متحقق Unit؛ الرابط الخارجي يحتاج إعادة تشغيل API لاختبارها مع خطأ حقيقي. |
| `null`/`0`/موجب لرسوم Delivery | `delivery-fee.ts` و`public-whatsapp-checkout.service.ts:306` واختبارات الرسوم السابقة | كود فقط لهذه الجولة؛ لا تعديل لقيم المطعم المحفوظة. |
| Pickup بلا رسوم؛ لا إجمالي نهائي مجهول | الخدمة نفسها؛ Browser Preview المحلي عرض «تُحدّد حسب المنطقة» دون إجمالي وهمي | متحقق للرسوم المجهولة؛ الثابتة/المجانية مثبتة باختبارات سابقة لا الحالية. |
| حفظ رسوم المطعم الصحيح وتغير السعر | Dashboard service وTrusted Confirm؛ تقارير/اختبارات سابقة | كود فقط لهذه الجولة؛ يحتاج اختبار Disposable متكامل. |
| عدم تسعير حسب الأحياء | لا يوجد مسار تسعير مسافة/حي جديد | متحقق بمراجعة التغييرات. |
| Stepper خطوتان بدل ثلاث | `public-menu-client.tsx:3262`؛ آخر تقرير `ORDERSAWA_COMPREHENSIVE_FINAL_FIX_REPORT_AR.md` وثّق قرار الخطوتين | متحقق؛ الثلاث القديمة **مستبدلة** بقرار أحدث. لا تغيير. |

### WhatsApp والثيم

| البند | المسؤول/الدليل الحالي | الحالة والإجراء |
|---|---|---|
| RTL للأرقام والكميات/الأحجام وفواصل الأصناف | `network-order-whatsapp-formatter.ts`، اختبارات Formatter | متحقق نصيًا؛ عرض WhatsApp على Android لم يُفحص آليًا. |
| فاصل بعد بيانات المطعم وحذف الفرع | `public-whatsapp-checkout.service.ts`، `public-menu.service.ts` واختباراتهما | متحقق Unit. |
| حذف «مطلوب/اختياري» من رسالة التحضير | تعديل `network-order-whatsapp-formatter.ts:176` واختبار محدث | متحقق Unit؛ لم يُغيَّر وصف الخيارات داخل واجهة التكوين. |
| بقاء المنتجات/الأحجام/الخيارات والكميات بلا أسعار إضافات فردية أو حجم مكرر | Formatter واختباراته، Preview Mixed المحلي | متحقق نصيًا محليًا؛ API الخارجي القديم لم يُحدَّث بعد. |
| ملاحظة الصنف وطلبه عريضتان، الطلب قبل المجاميع | تعديل Formatter وLegacy/Trusted services، 27 اختبار Formatter ناجح | متحقق Unit؛ تنسيق WhatsApp Android يحتاج تأكيد الهاتف. |
| بيانات الزبون بعد الإجمالي | Legacy/Trusted formatter واختباراته | متحقق Unit. |
| Legacy/Network/Mixed وPreview/Copy بلا إرسال | اختبارات Formatter وBrowser Mixed Preview، لا إرسال | متحقق للمعاينة Mixed؛ الإرسال/Confirm الكامل لم يُختبر بهذه الجولة. |
| رقم مطعم Demo `+963937325860` | Public API/تقارير Demo السابقة؛ لم يُعدَّل رقم محفوظ | كود فقط لهذه الجولة؛ لم أكتب على DB. |
| إزالة Dark Mode من الإعدادات/المتغيرات | بحث المصدر وجد `color-scheme: light` فقط في CSS، بلا مفتاح Dark Mode صريح ضمن الملفات المفحوصة | كود فقط؛ لا يكفي لإثبات حذف كل المسارات القديمة. لا أحذف شيئًا بلا تحليل اعتماد أوسع. |

## نتائج الاختبارات الفعلية

| الفئة | النتيجة |
|---|---|
| Unit Shared | 25/25 ناجحة. |
| Unit Web | 75/75 ناجحة في 13 ملفًا، بينها بناء payload ورسائل الخطأ. |
| Unit API | 115 ناجحة في 22 ملفًا؛ 116 متخطاة في 7 ملفات تتطلب قواعد اختبار خاصة. المتخطاة ليست نجاحًا. |
| Formatter الموجّه | 27/27 ناجحة بعد تحديث التوقعات. |
| Root Typecheck | نجح. |
| API وWeb Build | نجحا؛ Next ولّد 27 صفحة. |
| `git diff --check` | نجح. |
| HTTP API محلي | 5001 أعاد العقد القديم؛ 5002 قبل Delivery بلا `beside` ووصل لتحقق التكوين. |
| Browser على `127.0.0.1:3211` | فتح منتج Network، عرض «قد يعجبك أيضاً»، سلة Mixed، Delivery ببيانات صحيحة، معاينة Trusted WhatsApp ظهرت دون خطأ `beside`. لا رسالة أُرسلت. |
| Browser 360/390/430 | قياس DOM للفواتير الموسعة: لا تجاوز أفقي، أعمدة السعر ثابتة بعد الاستقرار؛ Touch خلال Snap غير مثبت. |
| Android/4G | صورة المؤسس تثبت الخطأ القديم فقط. لم أختبر جهازه أو دخوله إلى Cloudflare Access. |
| PostgreSQL Disposable للتغييرات المدمرة | لم يكتمل: قاعدة الاختبار المطلوبة غير متاحة بهوية PostgreSQL صالحة؛ لم أشغّل اختبارات قد تحذف صفوفًا على Demo. |

## الأدلة البصرية وحدودها

- [صورة المؤسس من الهاتف: خطأ Delivery على الرابط الخارجي](<C:/Users/khale/Desktop/WhatsApp Image 2026-11-01 at 4.38.48 PM.jpeg>) — دليل الخلل قبل إعادة تشغيل API، لا دليل الإصلاح.
- [سلة Mixed محلية 390px](../work/ORDERSAWA_FINAL_MIXED_CART_390.png)، [لوحة الفاتورة الموسعة](../work/ORDERSAWA_FINAL_INVOICE_EXPANDED_NEW_API_390.png)، [Delivery محلي على API الأحدث](../work/ORDERSAWA_FINAL_DELIVERY_390_NEW_API.png) — لقطات QA محلية محفوظة سابقًا؛ لا تمثل رابط 4G بعد الإصلاحات الأخيرة.
- عرضت جلسة Browser الحالية منتج Network و«قد يعجبك أيضاً» وPreview Mixed؛ لم تُصدَّر لها صور جديدة إلى ملفات. لا أقدّم اللقطات الأقدم على أنها مقارنة Before/After للنسخة الخارجية.

## حالة الخدمات والرابط

وقت الفحص: PostgreSQL Demo يستمع على 55448، API الخارجي 5001 (PID 19680)، Web الخارجي 3102 (PID 10232)، Proxy 3210 (PID 14348)، API المحلي 5002، Web المحلي 3103، Proxy 3211؛ عملية `cloudflared` موجودة. فتح الرابط خارجيًا من Browser بلا جلسة حوّل إلى صفحة Cloudflare Access، مما يثبت وجود بوابة وصول، **ولا يثبت** صلاحيات البريد أو مدة 24 ساعة أو سلامة الصفحة بعد تسجيل الدخول. رقم Commit الذي بُنيت عليه العمليات القديمة لا يمكن استنتاجه بثقة من PID؛ توقيت بدء 5001 ونتيجة HTTP يثبتان أنه لا يطابق عقد Backend الحالي. لم أغيّر DNS أو Access أو Tunnel أو قاعدة Demo. الرابط `https://rydtest.ordersawa.com` **غير جاهز للاعتماد الآن** حتى يُعاد تشغيل 5001 وتُجرى تجربة Delivery من الهاتف.

## الملفات المعدلة ضمن هذه الجولة

- `apps/web/src/components/public/trusted-whatsapp-checkout.tsx` واختباره: فصل بناء الطلب، اختبار تبديل الحالة، عرض أخطاء محلية آمنة.
- `apps/api/src/modules/orders/network-order-whatsapp-formatter.ts` واختباره: إزالة وصف مطلوب/اختياري من الرسالة وتغليظ ملاحظات Network.
- `apps/api/src/modules/public-menu/public-whatsapp-checkout.service.ts` واختباره: ملاحظات الطلب مستقلة قبل المجاميع؛ ملاحظات Legacy في Mixed عريضة.
- `apps/api/src/modules/public-menu/public-menu.service.ts` واختباره: ملاحظات Legacy وتوزيع الفواصل والمجاميع مع عزل نصوص المستخدم.
- هذا التقرير. لم تُدرج التغييرات المسبقة في `apps/web/src/lib/api.ts` أو `apps/web/tsconfig.json` ولا ملف التقرير غير المرتبط أو مجلدات `.next-*` ضمن إصلاحات هذه الجولة.

## المتبقي قبل القبول

1. إيقاف API 5001 القديم بصلاحيات مالكه، ثم تشغيله من الكود الحالي **مع إعدادات Demo نفسها**؛ إعادة فحص Network/Mixed Delivery وWhatsApp Preview عبر `https://rydtest.ordersawa.com`. لا تُشغّل Seed ولا تغيّر Cloudflare Access/DNS.
2. إعداد PostgreSQL Disposable منفصلة ثم تنفيذ دورة تغيّر الأسعار وتعطيل الخيارات/إصلاح التكوين، ورسوم `null/0/موجب` وLegacy/Network/Mixed Confirm بلا لمس Demo.
3. اختبار Android فعلي لحركة Bottom Sheet، 10/20 صنفًا، وعرض Markdown العريض داخل WhatsApp، ثم تأكيد المؤسس للوصول من 4G واستمرار جلسة Access.

لم يُنفذ Merge أو Production Deployment. لا يجوز وصف الإصدار بأنه مطابق نهائيًا قبل هذه الأدلة.
