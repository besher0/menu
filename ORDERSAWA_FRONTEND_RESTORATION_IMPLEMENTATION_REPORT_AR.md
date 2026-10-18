# OrderSawa — تقرير استعادة الواجهة ودمج شبكة التكوين

**الفرع:** `feature/product-configuration-network`

**مرجع التصميم:** Baseline المستودع `f876c6077ba07c06e788fcbc6c9cc1c386ff896f`، وليس نسخة Production مثبتة.

**حالة ما قبل الإصلاح:** `558b6b48b751c14b450a350cd866935eff6b8c64`

**Commit شيفرة الإصلاح:** `c316d746b543c6f86fe2fca5345e859668a47c79`
**Backup Git:** `backup/frontend-restoration-pre-20261018` عند حالة ما قبل الإصلاح.

## النتيجة

نُقلت وظائف Network إلى تجربة المنتج والسلة والدفع الأصلية دون تغيير Backend أو Shared أو Prisma أو عقود API. بقي Legacy-only على مسار حفظ Order/Analytics القديم، وNetwork/Mixed على Trusted Prepare/Confirm. **لم تُفعَّل الميزة للعامة ولم يحدث نشر.** لا يجوز اعتبار هذا العمل موافقة على الإطلاق: كشف اختبار HTTP مستقل مانعًا أمنيًا موضحًا أدناه.

## الملفات المعدّلة

| الملف | التغيير |
|---|---|
| `apps/web/src/components/public/public-menu-client.tsx` | ترتيب أقسام المنتج، استعادة بنية السعر/العملة، وصل سلة Network/Mixed بخطوات التحقق وبطاقة الدفع وحقول التوصيل/الاستلام الأصليتين، حجب السعر والطلب بحسب إعدادات المطعم، إخفاء رموز التشخيص عن الزبون. |
| `apps/web/src/components/public/product-configurator.tsx` | شريط المنتج الأصلي لكمية التكوين والإضافة بعد Server Quote، دعم لغة المنيو وإخفاء الأسعار وحالة تعطيل الطلب. |
| `apps/web/src/components/public/product-configurator.module.css` | ربط لون التكوين بـ`--color-primary` الخاص بثيم المطعم. |
| `apps/web/src/components/public/cart-model.ts` | حفظ كمية التكوين المحددة مع إبقاء هوية الأسطر ودمج التكوينات المتطابقة فقط. |
| `apps/web/src/components/public/trusted-whatsapp-checkout.tsx` | إبقاء Prepare/Confirm والتحقق وإعادة القبول في Hook داخل واجهة Checkout الأصلية؛ لا فتح WhatsApp قبل نجاح Confirm. |
| `apps/web/src/app/globals.css` | أنماط محصورة لشريط Network ونافذة تغيّر السعر، وإزالة بطاقة Trusted Checkout الموازية. |
| `apps/web/src/components/public/cart-model.test.ts` | اختبارات كمية التكوين واستقلال التكوينات المختلفة. |
| `apps/web/src/components/public/product-configurator.test.tsx` | اختبارات اللغة والهيكل/الشريط والثيم. |
| `apps/web/src/components/public/trusted-whatsapp-checkout.test.ts` | مقارنة Draft الخادم بالفاتورة المعروضة بدقة Decimal، ورفض اختلاف المصدر/الهوية. |

**Git Diff للشيفرة:** 9 ملفات، 553 سطرًا مضافًا و245 محذوفًا. لا ملفات Backend/Prisma/Shared معدلة. راجع Commit أعلاه للتفاصيل سطرًا بسطر.

## معالجة تعارضات تدقيق الواجهة

| # | النتيجة |
|---|---|
| 1 الشريط السفلي | عاد غلاف `product-bottom-cart` لمنتجات Network في القوالب غير Vertigo. `+`/`−` يعدلان كمية Draft، والزر يطلب Quote ثم يضيف التكوين، مع رابط منفصل وواضح للسلة. لا شريط جديد في Vertigo. |
| 2 بطاقات السعر | عادت عناصر القيمة `<span>` والعملة `<small>` وترتيب `priceFirst` دون تغيير حساب السعر. أضيفت ترجمة «ابتداءً من» للإنجليزية. |
| 3 خطوات Checkout | `CheckoutSteps` ذي التسميات الثلاث وبطاقة `.cart-checkout-card` الأصليان يُستخدمان لجميع أنواع السلة؛ بقيت حالتا `review/confirm` الأصليتان دون خطوة رابعة. |
| 4 Delivery/Pickup | تُستخدم أزرار الأيقونات والحقول الأصلية؛ اسم الزبون وهاتفه اختياريان فقط في Network/Mixed بحسب العقد القائم. |
| 5 تعطيل WhatsApp | عادت سياسة Legacy الأصلية: لا دخول للسلة عند التعطيل، ولا سلة محفوظة أو زر عائم؛ يظل Configurator للاستعراض. |
| 6 موضع/لغة/ثيم Network | صار بعد المكونات والتفاصيل وقبل الاقتراحات؛ لا يظهر للـLegacy. يعتمد RTL/LTR ولون ثيم المطعم؛ أسماء الخيارات تبقى كما وردت من المصدر دون اختراع ترجمة. |
| 7 `showPrices=false` | الواجهة تخفي أسعار Network وتمنع إضافتها وإرسالها. **Backend لا يفرض الحجب على HTTP المباشر؛ مانع إطلاق مثبت، لا إصلاح ضمن صلاحية هذه المهمة.** |
| 8 نصوص السلة | أُخفيت Revision وأكواد Issues التقنية مع بقاء المعلومات في Cart Model للتحقق، واستُخدمت رسائل بشرية. |
| 9 Mobile/RTL | تمت مراجعة بصرية جزئية للبيتزا والشريط؛ لم تكتمل مصفوفة Desktop/390px/ثيمات ولم تثبت مطابقة Pixel-perfect. |
| 10 Dashboard | لم يُعدَّل؛ اختبارات Web الخاصة بمحرره ناجحة، لكن لم تُجرَ مقارنة Screenshots للداشبورد هنا. |
| 11 Fallback القديم | لم يُستعد إرسال WhatsApp بسعر محلي عند فشل API؛ بقي المنع الأمني. |

## سلوك التأكيد النهائي

- ضغطة «إرسال» في واجهة التحقق الأصلية تجري Prepare. إذا طابق Draft سعر كل سطر وإجمالي الفاتورة وهوية السلة ولم يتغير المصدر، يجري Confirm ويفتح رابط `wa.me` الناتج من الخادم دون نافذة موافقة إضافية.
- إذا تغيّر السعر، لا يُفتح WhatsApp؛ تظهر نافذة «تم تحديث الأسعار» بسعر الخادم الجديد وخياري القبول أو العودة. القبول يستخدم Token الصادر عن Prepare، ويعيد Confirm التحقق. تغيّر جديد يلغي الفتح ويطلب مراجعة جديدة.
- اختلاف المصدر أو اختيار غير صالح أو فشل API لا ينتج رابطًا قديمًا أو fallback محليًا. لم تتغير HMAC أو سياسة السعر في Backend.

## الاختبارات والأدلة

| الاختبار | النتيجة |
|---|---|
| Web Vitest | 10 ملفات، **48 ناجحة**، 0 فاشلة. |
| Shared Vitest | ملفان، **25 ناجحة**. |
| API Vitest بلا ربط DB | **100 ناجحة، 106 متخطاة** ضمن 26 ملفًا؛ لا تُعدّ المتخطاة نجاحًا. |
| Root Typecheck | ناجح؛ Shared وAPI وWeb. |
| Root Build | ناجح؛ Shared وAPI وNext.js. وأُعيد Web Build بعد تعديل ترجمة السعر ونجح. |
| Browser QA جزئية | في Preview محلي: تحقق موضع «تفاصيل الوجبة → التكوين → الاقتراحات»، تغيير الحجم، خيار متداخل، وكمية Draft في الشريط. التُقطت معاينة مرئية داخل جلسة المتصفح، لكن لم تُحفظ لقطة قابلة للتنزيل. تعذر إكمال سيناريو Checkout/مصفوفة 390px بعد توقف خدمة Preview المحلية؛ لا ندعي E2E كاملة أو تطابق Production بصريًا. |
| HTTP `showPrices=false` | PostgreSQL **18.6 Disposable جديدة** على `127.0.0.1:55446` وقاعدة `ordersawa_frontend_showprices_probe`، مع `Prisma db push` على القاعدة المؤقتة فقط وFixture وهمية. `GET` أعاد `showPrices=false`؛ `POST prepare` أعاد **200**؛ `POST confirm` أعاد **200** ورابط WhatsApp. **لم يُفتح الرابط أو تُرسل رسالة.** |

لم تُستخدم `.env` حقيقية أو قاعدة Production أو Backup أو بيانات زبائن. سكربت HTTP المؤقت وقاعدة الاختبار خارج Git والحزمة؛ لا تغيير Backend/Prisma/API. لم تُشغّل Browser E2E كاملة أو مجموعات API المعتمدة على قواعدها وأعلامها الخاصة.

## مانع التفعيل والخطوة التالية

**مانع أمني مثبت:** إذا كانت أسعار مطعم مخفية، يمكن استدعاء Trusted Network/Mixed `prepare` و`confirm` مباشرة عبر HTTP والحصول على رابط رسالة يعرض السعر، رغم حجب واجهة React. لا يكفي Frontend Gate، ولا يجوز تفعيل `ENABLE_PUBLIC_NETWORK_WHATSAPP_CHECKOUT=1` لمطعم `showPrices=false` قبل إصلاح Backend واختباره بموافقة المؤسس المنفصلة. لم يُنفذ إصلاحه احترامًا للحدود الصريحة. تظل اختبارات Browser E2E ولقطات مقارنة واجهة Production/390px مطلوبة قبل قبول التطابق البصري أو الإطلاق.

لا يوجد تغيير في حزمة الإصدار السابقة أو بيانات/مخطط Production. حالة Git بعد Commit التوثيق تُراجع بـ`git status --short`؛ Hash Commit التوثيق يُسلَّم مع رابط التقرير.
