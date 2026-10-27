# OrderSawa — Checkout Card ورسوم التوصيل ومعاينة WhatsApp

التاريخ: 2026-10-27. النطاق: Checkout الحالي فقط، دون تغيير Prisma Schema أو Shared Pricing Engine أو إرسال WhatsApp أو نشر Production.

## النتيجة

- بقيت بطاقات Checkout، الصورة المربعة، أزرار الكمية، شريط الخيارات، ملاحظات الأصناف، Stepper وزر Legacy «التالي» من العمل السابق. اللوحة السفلية المصغّرة تعرض العدد وأسماء أول صنفين فقط؛ أُزيلت عبارة «العناصر المختارة» وسعر الأصناف منها. تظهر أسعار الأسطر وسعر الأصناف عند توسيعها. نُقل زر معاينة Network/Mixed إلى نموذج الخطوة الثالثة ليبقى ارتفاع اللوحة المصغّرة على 390×844 نحو 224px، أي أقل من الثلث. لم تعد رسالة «راجع خيارات الأصناف المتغيرة» ثابتة في اللوحة؛ تظهر عند محاولة المتابعة باختيارات تحتاج مراجعة.
- رسوم التوصيل محفوظة ضمن `RestaurantThemeSettings.settings.dashboardSettings.deliveryFee`، بلا Migration: `null`/حقل فارغ = «تُحدّد حسب المنطقة»، `0` = «مجاني»، والقيمة الموجبة = رسوم ثابتة. يتحقق Backend من نص Decimal غير سالب ومن سياسة عملة المطعم (SYP بلا كسر)، ويعيد القيمة الموحّدة إلى Dashboard وPublic Menu. لا تُضاف رسوم إلى Pickup.
- Legacy Checkout الأصلي ما زال يحفظ `Order` و`OrderItem` وAnalytics ويولّد الرسالة من بيانات الخادم. عند رسوم ثابتة، يُحفظ الإجمالي شاملًا الرسوم في `Order.totalAmount` وتُحفظ تفاصيل الرسوم/مجموع الأصناف في `cartSnapshot`. عند الرسوم غير المحددة، يُحفظ مجموع الأصناف فقط ولا تُطبع عبارة «إجمالي الطلب» النهائية المضللة في الرسالة. إذا كانت الأسعار مخفية، لا تُظهر رسالة Legacy مبلغ الرسوم.
- Network/Mixed لا ينشئان Order. `TrustedDraft` أصبح يحتوي `itemsSubtotal` و`deliveryFee` و`totalAmount`؛ الأخير `null` فقط إذا كانت Delivery ورسومها غير محددة. تدخل الرسوم والإجمالي في HMAC الخاص بالقبول. يعيد Confirm القراءة من PostgreSQL ويرفض الرمز القديم إذا تغيرت الرسوم. لا يؤخذ أي مبلغ رسوم من المتصفح.
- معاينة Network/Mixed الحالية تستخدم رسالة `prepare` الموثوقة، بلا إرسال أو حفظ Order. معاينة Legacy الفعلية جُمعت من استجابة Endpoint الطلب الأصلي في قاعدة الاختبار المعزولة؛ هذه العملية **أنشأت Order وAnalytics تجريبيتين** كما يفعل Legacy فعلًا. لم يُضف زر Preview جديد لمسار Legacy العام كي لا ينشئ طلبًا مزدوجًا أو يغيّر سلوكه المعتمد.

## مقتطفات رسائل فعلية من HTTP محلي على بيانات تجريبية

**Legacy Delivery، رسوم غير محددة (HTTP 201؛ Order تجريبي محفوظ):**

```text
طلب جديد من Pizza Restaurant
رقم الطلب: 007
الزبون: Demo customer
طريقة الاستلام: توصيل دليفري
المنطقة: Demo area
قريب من: Demo landmark
جانب: Demo address
العناصر:
1- 1x Legacy Salad
ملاحظة: Demo: no onion
السعر: 12.00 EGP
مجموع الأصناف: 12.00 EGP
رسوم التوصيل: تُحدّد حسب المنطقة
```

**Network Delivery، رسوم ثابتة (Trusted Prepare HTTP 200؛ بلا Order):**

```text
🧾 طلب جديد — OrderSawa
المطعم: ⁨Pizza Restaurant⁩
طريقة الاستلام: توصيل
المنطقة: ⁨Demo area⁩
بالقرب من: ⁨Demo landmark⁩
بجانب: ⁨Demo address⁩

1 × ⁨Source Pizza⁩ — ⁨Small⁩
إجمالي الصنف: 100 EGP
━━━━━━━━━━━━━━

مجموع الأصناف: 100 EGP
رسوم التوصيل: 10 EGP
💵 إجمالي الطلب: 110 EGP
```

**Network Delivery مجانية:** نفس المسودة أعادت `رسوم التوصيل: مجاني` و`💵 إجمالي الطلب: 100 EGP`. **Pickup:** لم تُظهر سطر رسوم، والإجمالي `100 EGP`. **Network/Mixed برسوم غير محددة:** أعاد Prepare نص الرسوم «تُحدّد حسب المنطقة» ولم يُظهر إجماليًا نهائيًا. اختبرت Mixed مع بيتزا بحجم وسط وخيارات Cheese/BBQ وLegacy Salad؛ بقيت تفاصيل الخيارات وسعر كل صنف ومجموع الأصناف، بلا أسعار منفصلة لكل إضافة.

هذه الرسائل أمثلة تقنية من Fixture بعملة EGP لا تمثل بيانات مطعم فعليًا. يظل عرض SYP خاضعًا لسياسة الأعداد الصحيحة المعتمدة.

## التحقق

| الفحص | النتيجة |
|---|---|
| PostgreSQL 18.6 جديدة على `127.0.0.1:55440`، DB `ordersawa_stage3_stage6e2_checkout`، Prisma Schema + قيود CHECK الخمس من Stage 2C | نجح، معزول عن Demo وProduction |
| Trusted Checkout HTTP Integration | 23/23 نجحت؛ ثابت/صفر/فارغ، تغيّر الرسوم بعد Prepare، حفظ/إعادة قراءة Dashboard، Legacy Persistence |
| API Unit المرتبطة | 12/12 نجحت |
| مجموعة API العامة | 112 نجحت، 116 متخطاة لأنها تتطلب قواعد/أعلام اختبار منفصلة؛ لم تُحسب نجاحًا |
| Web Tests | 66/66 نجحت |
| Root Typecheck وRoot Build | نجحا |
| Browser عبر معاينة LAN الموجودة، Mixed Cart، تصغير/توسيع، خطوة Delivery، 390×844 | نجح العرض؛ اللوحة المصغّرة 224px، وظهرت «تُحدّد حسب المنطقة» دون إجمالي نهائي |

لقطات المتصفح عُرضت مباشرة في محادثة Codex: الكارد المصغّرة والموسّعة، Delivery pending، وحقل Dashboard. لم تُحفظ كملفات مستقلة لأن أداة المتصفح في هذه الجلسة لا توفر مسار تصدير للّقطة. معاينة LAN الموجودة استخدمت Frontend المعدّل لكنها **لم تكن متصلة بعملية Backend الجديدة على 5000**؛ لذلك لا تُعد لقطاتها إثباتًا بصريًا لرسوم ثابتة/مجانية. إثبات هاتين الحالتين من HTTP/PostgreSQL والاختبارات. محاولة تشغيل Next منفصل على 3102 مُنعت بسياسة البيئة رغم السماح باتصال loopback؛ لا يُدّعى Browser E2E كامل للحالتين.

## ملفات التعديل

`apps/api/src/modules/public-menu/delivery-fee.ts` واختباره؛ `apps/api/src/modules/dashboard/dashboard.service.ts` وDTO واختباره؛ `apps/api/src/modules/public-menu/public-menu.service.ts`؛ `apps/api/src/modules/public-menu/public-whatsapp-checkout.service.ts` واختبارات الرسالة وHTTP؛ `apps/web/src/components/dashboard/restaurant-dashboard-client.tsx`؛ `apps/web/src/components/public/public-menu-client.tsx` و`trusted-whatsapp-checkout.tsx` واختباره؛ `apps/web/src/lib/api.ts`؛ `apps/web/src/app/globals.css`.

## الحدود والمتبقي

- لا يوجد Preview مستقل بلا آثار جانبية لمسار Legacy العام. اختباره الفعلي على Demo ينشئ Order وAnalytics؛ لو طُلب زر معاينة Legacy بلا حفظ، يحتاج عقدًا منفصلًا وموافقة واضحة.
- `Order.totalAmount` لدى Legacy يشمل الرسوم الثابتة بينما مجموع `OrderItem.totalPrice` لا يشملها؛ Snapshot تحفظ الفرق. ينبغي للوحة Analytics المستقبلية الفصل بين مبيعات الأصناف ورسوم التوصيل بدل افتراض التطابق.
- عند رسوم Delivery غير محددة، ليس هناك إجمالي نهائي قبل معرفة المنطقة؛ لا تُخترع قيمة ولا تُجمع الرسوم كصفر. لا يوجد تسعير حسب المناطق في هذا التغيير.
- لم تتغير `.env` أو Prisma Schema أو Migration History أو الباقات أو إعدادات Production. لم يُنشر شيء ولم تُرسل رسالة WhatsApp.
- يتوفر ملف `ORDERSAWA_FINAL_CHECKOUT_DELIVERY_FEE.patch` للمراجعة سطرًا بسطر؛ يتضمن تغييرات الشيفرة والاختبارات فقط، ولا يشمل ملف التقرير أو الملف غير المرتبط بالمهمة.
