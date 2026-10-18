# OrderSawa — إصلاح حماية `showPrices=false` في Trusted WhatsApp Checkout

## الخلل والإصلاح

كانت واجهة الزبون تمنع إتمام طلب Network عند إخفاء الأسعار، لكن استدعاء HTTP مباشرًا إلى Trusted Prepare أو Confirm كان يتجاوز قيد الواجهة. أضيف فحص لقيمة `dashboardSettings.showPrices` المخزنة في `RestaurantThemeSettings` الخاصة بالمطعم، داخل `buildDraft` الخادمية التي تستدعيها العمليتان. عند القيمة `false` تعود الاستجابة `HTTP 403` مع الرمز المستقر `WHATSAPP_PRICES_HIDDEN` ورسالة مفهومة، بلا Draft أو Acceptance Token أو رابط WhatsApp. يعاد الفحص عند Confirm، لذلك لا ينفع Token صدر قبل تغيير الإعداد.

لم يتغير Checkout القديم: طلب Legacy-only على المسارين Trusted يبقى مرفوضًا بـ`LEGACY_CHECKOUT_REQUIRED`، ومسار Legacy WhatsApp المنفصل يستمر في حفظ Order وAnalytics حتى عند إخفاء الأسعار. عند `showPrices=true` يستمر Network-only وMixed في Prepare/Confirm.

## الملفات والفروقات

- `apps/api/src/modules/public-menu/public-whatsapp-checkout.service.ts`: فحص إعداد المطعم وخطأ 403 محدد.
- `apps/api/src/modules/public-menu/public-whatsapp-checkout.integration.spec.ts`: اختبارات HTTP لـNetwork/Mixed، Token قديم، Legacy، وعدم الآثار الجانبية؛ إتاحة قاعدة Disposable جديدة مع الإبقاء على هدف الاختبار القديم.
- هذا التقرير فقط. لم تُعدّل ملفات Frontend أو CSS أو Prisma Schema أو Migrations أو Shared Engine أو العقود العامة.

مقارنةً مع Commit البداية `21af3f6`: تعديلا الشيفرة والاختبار = 70 سطرًا مضافًا و4 محذوفة، فضلًا عن إضافة هذا التقرير. الفرع: `feature/product-configuration-network`.

## التحقق الفعلي

استخدم الاختبار PostgreSQL 18.6 محلية جديدة على `127.0.0.1:55447` باسم `ordersawa_stage3_showprices_guard`. أنشئ مخطط الاختبار داخلها فقط، وأضيفت قيود `Product` الخمس من Stage 2C نفسها؛ لم تُستخدم قاعدة أو بيانات Production. لم يفتح الاختبار رابط WhatsApp ولم يرسل رسالة.

| التحقق | النتيجة |
| --- | --- |
| HTTP Integration الخاصة بـTrusted Checkout | 17 ناجحة، 0 فاشلة |
| مجموعة API كاملة بالأعلام المتاحة | 117 ناجحة، 93 متخطاة لحواجز قواعد/أعلام اختبارات أخرى، 0 فاشلة |
| Shared Tests | 25 ناجحة |
| Web Tests | 48 ناجحة |
| Root Typecheck | ناجح |
| Root Build | ناجح |

اختبر HTTP مباشرةً رفض Prepare لـNetwork-only وMixed عند إخفاء الأسعار، ورفض Confirm لـToken أصدر قبل إخفائها، وعدم إعادة URL أو تسجيل Order/Analytics في المسارات المرفوضة. اختبر كذلك نجاح Network/Mixed عند إظهار الأسعار واستمرار حفظ Legacy Order وAnalytics عند إخفائها. الاختبارات المتخطاة ليست محسوبة ضمن الناجحة.

## الحدود

هذا إصلاح Backend محدود؛ لا يتضمن Deployment أو تفعيل Feature Flag أو تعديل حزمة الإصدار السابقة. لم يُختبر على Production. قاعدة الاختبار Disposable لا تحل محل تحقق Staging والإطلاق المعتمدين منفصلًا.
