# OrderSawa — تقرير Stage 6F.1: سياسة العملات

التاريخ: 2026-10-14. الفرع: `feature/product-configuration-network`. Commit التنفيذ والاختبارات: `0b3d283ef4a4afa6867e5676b9497f669cadf9a4`. هذا التقرير و`CODEX_HANDOFF.md` في Commit توثيق مستقل تالٍ؛ راجع `git log -2 --oneline` لمعرفة رقمه. لم تُستخدم قاعدة حقيقية، ولم يحدث نشر أو ترحيل أو تفعيل لعلم Checkout العام.

## القرار والمراجع

اعتمدنا قرار المؤسس الصريح في طلب Stage 6F.1: `SYP` دون كسور، و`EUR/USD/AED` بمنزلتين للعرض. راجعنا `CODEX_HANDOFF.md`، وتقارير Stage 6F.0 و6E.4، و`LATEST_FOUNDER_DECISION_LEDGER_V2_CURRENT.md` و`CURRENT_SUPERSESSION_AND_CONFLICT_RULES.md` داخل حزمة `AUTHORITATIVE_RULES`، بالإضافة إلى الشيفرة الفعلية. تسمية العملة السورية المحفوظة تاريخيًا في بعض صفوف Restaurant هي `ل.س`؛ تُعامل كمرادف `SYP` من دون تعديل بيانات. العملات غير الأربع المعتمدة لا تُمنح سياسة تقريب جديدة؛ Formatter الشبكة تعرض قيمتها العشرية الدقيقة، ورسالة Legacy تحتفظ بعرضها السابق بمنزلتين.

## المنفذ

- أضيفت سياسة مشتركة في `packages/shared/src/currency-policy.ts`: التحقق العشري النصي، عبور أسعار Base/Size/Option/size override/ORIGINAL override/CUSTOM snapshot والمجموعات المتداخلة، وتنسيق `HALF_UP` عشري بمنزلتين للعرض فقط باستخدام `BigInt`. `12500.000000` صالح للسوري، و`12500.50` مرفوض. `null` يبقى متميزًا عن `0`. لا تغيير لدقة Decimal الداخلية أو Shared Pricing Engine.
- أصبح Backend يتحقق من عملة المطعم المحفوظة، لا عملة يرسلها العميل، عند إنشاء/تعديل/سعر سريع/استيراد Legacy وعند حفظ Tree الذري. أبقى الاستيراد النص الأصلي للتحقق والكتابة كي لا يتحول سعر Excel عبر `Number` قبل الحفظ؛ القيمة الرقمية القديمة للـPreview بقيت للتوافق. ترفض الاستدعاءات المباشرة ذات السعر السوري الكسري قبل الكتابة.
- تعزل Public Menu منتجات SYP القديمة ذات السعر الكسري من العرض، وترفضها مسارات Legacy وTrusted Checkout بدل تقريبها أو تحويلها إلى صفر. ينطبق الفحص أيضًا على شبكة المنتج ومصادره المرتبطة وعلى الإجمالي الموثوق. لا تعديل آلي للبيانات القديمة.
- تستخدم شاشات Dashboard، Public Menu، Configurator، Cart، Preview سياسة عرض مشتركة. واجهة السعر غير الصالح تُظهر رسالة خطأ بدل رقم مضلل. حُسب إجمالي Legacy Checkout النصي باستخدام أدوات المال العشرية المشتركة بدل جمع JavaScript الكسري. بقي حفظ Legacy Order/Analytics ومساره الأصلي.
- يُنسق WhatsApp Snapshot Formatter وTrusted Draft وLegacy Message المبالغ حسب العملة. يظهر «فرق عرض التقريب» صراحةً إذا اختلف مجموع البنود المعروضة بعد تقريب كل بند عن الإجمالي الدقيق المعروض. لا تتغير قيم Quote أو Draft أو HMAC أو Snapshot ولا يعاد احتساب سعر من الرسالة.

## الملفات المتغيرة

| المنطقة | الملفات |
|---|---|
| Shared | `packages/shared/src/currency-policy.ts`, `currency-policy.test.ts`, `index.ts` |
| API Product | `apps/api/src/modules/products/products.service.ts`, `products-import.service.ts`, `import/product-import-parser.ts`, `product-configuration.persistence.ts` واختبارات Product/Configuration المرتبطة |
| API Public/Orders | `apps/api/src/modules/public-menu/public-menu.service.ts`, `public-product-configuration.ts`, `public-whatsapp-checkout.service.ts`, `apps/api/src/modules/orders/network-orders.service.ts`, `network-order-whatsapp-formatter.ts` واختبارات HTTP المرتبطة |
| Web | `apps/web/src/lib/currency-display.ts`, `apps/web/src/components/dashboard/product-form.tsx`, `restaurant-dashboard-client.tsx`, `product-configuration/configuration-preview.tsx`, `apps/web/src/components/public/product-configurator.tsx`, `public-menu-client.tsx`, `trusted-whatsapp-checkout.tsx`, `currency-display.test.ts` |
| Browser | `scripts/stage6e2-whatsapp-browser-e2e.mjs` — نقطة فحص سورية إضافية في Runner القائم |

لا تغيير لـPrisma Schema أو Migration History أو محرك التسعير أو عقود Network Order/Idempotency/DB Guard أو أعلام التفعيل.

## نتائج الاختبارات الفعلية

استخدمت PostgreSQL 16.15 مؤقتة على `127.0.0.1:55440` وقواعد اختبار جديدة فقط؛ جُهزت Stage 2C Product CHECKs الخمسة من Migration الرسمي وStage 6C SQL التجريبي حيث لزم. بيانات الاعتماد تجريبية محلية في بيئة العملية فقط، ولم تُقرأ ملفات `.env` الحقيقية.

| الفحص | النتيجة |
|---|---:|
| Shared | 25/25 ناجح |
| Web | 43/43 ناجح |
| Full API مع جميع قواعد الاختبار وأعلامها المعزولة | 206/206 ناجح، 0 متخطٍ، 26 ملفًا |
| إعادة اختبار Parser + Product HTTP + Checkout HTTP بعد آخر تغيير | 47/47 ناجح، 0 متخطٍ |
| اختبارات API الوحدوية الموجهة | 33/33 ناجح |
| Root Typecheck | ناجح |
| Root Build بعد Commit التنفيذ | ناجح؛ 27 صفحة Next.js |
| Chrome/Nest/Next Browser E2E | 14/14 checkpoints ناجحة، منها SYP Size وعرض RTL بعرض 390px |
| Stage 6F.0 metadata-only preflight SQL على disposable | نفّذ ونجح؛ `_prisma_migrations` غائب كما هو متوقع في Test Baseline |

حدثت محاولة Browser أولى وصلت إلى 13 checkpoints ثم فشل انتظار Trusted Draft عند خطوة الإضافة الجديدة؛ إعادة التشغيل في البيئة نفسها نجحت 14/14. لا نعد هذه المحاولة نجاحًا، ولا ندّعي أن Checkpoints المتصفح اختبارات مستقلة لكل حالة. اختبار API موجه شُغّل مرة بلا متغيرات DB فظهر 13 متخطياً؛ أُعيد بالقواعد الصحيحة ونجح 47/47. محاولة تشغيل `npm test` قبل ضبط `TEMP/TMP` أخفقت بسبب منع الكتابة في Windows Temp؛ ضبطناهما داخل `../work/tmp` وأعيد الاختبار بنجاح. لم تُرسل رسالة WhatsApp حقيقية؛ رابط الاختبار اعترضه Chrome.

## الدقة والتوافق والمخاطر

`HALF_UP` سياسة عرض فقط. مثلًا `0.005 + 0.005 USD`: يُعرض كل بند `0.01 USD`، والإجمالي الدقيق `0.01 USD`، وتظهر ملاحظة فرق العرض `-0.01 USD`؛ لا يُعدل الإجمالي لكي يساوي مجموع النصوص المقربة. تخزين المال وTrusted Quote وAcceptance يبقى بدقة ست منازل. أسعار SYP الكسرية التاريخية لا تُصحح تلقائيًا: تُحجب/تُرفض حتى تدقيق مستقل وإصلاح بموافقة. سجل Analytics النصي للـLegacy يحتفظ بإجمالي دقيق كسلسلة بدل قيمة JavaScript عددية؛ لا يوجد مستهلك لهذا المفتاح في الشيفرة الحالية، لكن أي مستهلك خارجي غير معروف يحتاج تدقيقًا قبل الإنتاج. Preview استيراد Excel القديم يبقى Numeric للتوافق وقد يعرض أرقامًا ضخمة بدقة أقل، بينما الكتابة تحفظ النص الصحيح؛ هذه فجوة عرض غير مانعة لأسعار النطاق المعتاد وتحتاج عقد Preview منفصلًا إن ظهرت قيم كبيرة.

لم يتم تدقيق قاعدة Production أو Migration History الفعلية. ما زالت موانع Stage 6F.0: مطابقة Schema الحقيقية، خطة Backup/Rollback، إعداد HMAC الآمن، حدود الطلبات/الـProxy/CORS، أرقام WhatsApp الرسمية، والتحقق من بيانات SYP القديمة. علم `ENABLE_PUBLIC_NETWORK_WHATSAPP_CHECKOUT` يبقى OFF افتراضيًا؛ `orderingEnabled:false` وحواجز `NETWORK_TEST` باقية. لا استنتاج جاهزية نشر من نجاح الاختبارات المحلية.

## Git والتوقف

Commit التنفيذ: `0b3d283ef4a4afa6867e5676b9497f669cadf9a4` (`feat(currency): enforce SYP whole prices and unify display`). Commit التقرير/التسليم التالي موثق في سجل Git. تحقق نهائيًا بـ`git status --short` و`git log -2 --oneline`. **التوقف بعد Stage 6F.1؛ لا Stage 6F.2 ولا نشر أو Migration أو اتصال Production دون موافقة جديدة.**
