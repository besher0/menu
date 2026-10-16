# OrderSawa — تحقق Release Candidate المحلي (Stage 6F.4)

## الخلاصة

الميزات البرمجية الحالية موجودة ومترابطة في المصدر، وفحوص PostgreSQL 18.6 المحلية وShared/API/Web/Typecheck/Build أدناه نجحت ضمن حدودها. **هذا لا يثبت مطابقة Production `menu` ولا نجاح Restore، ولا يجيز نشرًا/ترحيلًا/تفعيلًا.** لم نتصل بقاعدة حقيقية أو Backup أو سيرفر ولم نستخدم `.env` حقيقية. لا Runtime أو Prisma Schema أو Migration رسمية عُدّلت في هذه المهمة.

## Source Verification — أين تعمل الميزة

| الوظيفة | مواضع المصدر المؤكدة | الحالة |
|---|---|---|
| عقود/Validation/Selection/Pricing Decimal-safe؛ Sizes كاملة، Nested، Included، Linked ORIGINAL/CUSTOM، Combos | `packages/shared/src/product-configuration/*`, `packages/shared/src/currency-policy.ts` | موجودة؛ Shared 25/25. `basePrice=null` ليس `0`. |
| Network setup الآمن، الحفظ الذري، Dependency index، Admin GET/PUT، Editor | `apps/api/src/modules/products/{network-setup-configuration,product-configuration.persistence,product-configuration.service,products.service,products.controller}.ts`, `apps/web/src/components/dashboard/product-configuration/*` | موجودة؛ اختبارات HTTP/PostgreSQL 24/24. Setup غير مكتمل لا يعود إلى Legacy pricing. |
| Public Menu/Configurator، Quote، Cart Legacy/Network | `apps/api/src/modules/public-menu/{public-product-configuration,public-product-quote,public-menu.service}.ts`, `apps/web/src/components/public/{product-configurator,cart-model}.tsx` / `.ts` | موجودة؛ تسعير Network من Shared Engine. |
| Trusted WhatsApp Network/Mixed، إعادة تحقق وقبول، Formatter/URL | `apps/api/src/modules/public-menu/public-whatsapp-checkout.{contract,service}.ts`, `apps/web/src/components/public/trusted-whatsapp-checkout.tsx`, `apps/api/src/modules/orders/network-order-whatsapp-formatter.ts` | موجودة؛ Flag OFF افتراضيًا؛ HTTP/PostgreSQL 13/13. لا يحفظ Network/Mixed Order ولا يرسل WhatsApp آليًا. |
| Legacy-only Checkout وOrder/Analytics | `apps/api/src/modules/public-menu/public-menu.service.ts` ومسار `POST /public/menus/:slug/orders/whatsapp` | باقٍ؛ Legacy-only لا يُمرر للـTrusted API، التي ترفضه `LEGACY_CHECKOUT_REQUIRED`. |
| عملة SYP بلا كسور وEUR/USD/AED عرض 2 `HALF_UP` فقط | `packages/shared/src/currency-policy.ts` واستدعاءاته API/Web/Formatter | موجودة، الدقة الداخلية 6؛ الأسعار القديمة الكسرية تُرفض ولا تُصلح بصمت. |
| Future foundation | `apps/api/src/modules/orders/network-orders.service.ts`، Stage 6C SQL، Candidate DB Guard، scripts PoC/benchmark | محفوظة، `NETWORK_TEST` محروسة و`orderingEnabled:false`؛ ليست WhatsApp العامة. |

## PostgreSQL 18.6 disposable — اختبار Candidate كامل

- أُنشئت Cluster **جديدة معزولة** على `127.0.0.1:55440` وقاعدة باسم `ordersawa_stage6f4_candidate`؛ لم تستخدم Volume/بيانات Production أو `.env`. استُخدمت Stage 0 Baseline اصطناعية مبنية من Schema القديم، ومصادر Stage 6F.3 التجريبية. طابقت counts البنيوية الواردة في التقرير المستلم (34 جدولًا/325 عمودًا/37 FK/93 فهرسًا)، **لا تعني DDL مطابقة للإنتاج**.
- أُضيفت Fixtures اصطناعية: مطعمان، أقسام ومنتجات Legacy، ProductOptionGroup/Option، Order/OrderItem، Analytics. أضيفت خمسة صفوف `_prisma_migrations` اصطناعية للاختبار فقط مع checksums ملفات Git، وليست تاريخ Production.
- نجح `apps/api/prisma/stage6f4-readonly-data-prechecks.sql`: الأنواع المالية الاصطناعية `numeric(10,2)`؛ 2 مطاعم/2 أقسام/3 منتجات/مجموعة وخيار واحد/Order وItem وAnalytics واحد؛ عدادات negative، >6 decimals، overflow، SYP fractional كانت صفرًا. استعلامات Aggregate لا تطبع PII أو سعرًا فرديًا.
- نجح `scripts/stage6f4-disposable-migration-candidate.sql` في تطبيق **Stage 2C ثم Stage 6C الرسميتين دون تعديل**؛ أعاد `STAGE6F4_DISPOSABLE_CANDIDATE_PASS`. إعادة تشغيله على القاعدة المحوّلة توقفت مقصودًا برسالة Baseline STOP؛ لا يكرر DDL.
- نجحت Assertions Stage 6F.3: بقاء منتجات/خيارات/Orders/Analytics Legacy، Base `null` مقابل `0`، Dependency صحيحة، منع Cross-tenant/Self-link، وإدراج Legacy WhatsApp Order جديدة. نجح `Prisma migrate diff` بعد الترحيل بنتيجة فارغة. نجح Prisma Client 5.22 في قراءة/كتابة Product Legacy وNetwork version 2 وLegacy Order/Item وAnalytics؛ لم يتغير Legacy Base `12500`؛ Network Base `0` محفوظة مستقلة عن `null`.
- Candidate DB Completeness Guard التجريبية **لم تُطبق** ولا تلزم WhatsApp العامة. قيود Stage 2C الخمسة كانت مفعلة ومتحققة؛ Stage 6C طبقت أعمدة التوافق وبنية `NETWORK_TEST` المحروسة.
- سلوك التراجع: Stage 2C SQL في Transaction؛ الاختبار السابق في Stage 6F.3 أثبت فشلها الذري مع Legacy Base سالبة، وأن Rollback المحروس ممكن قبل وجود Tree ويُحظر بعدها. في هذه المرحلة اختُبر STOP لإعادة التطبيق؛ **لم تُجرّب استعادة Backup حقيقية ولا Rollback إنتاجية**. بعد نشوء بيانات Network، forward-fix/Restore مراجعة بدل Down عمياء.

## اختبارات هذه المرحلة — أعداد فعلية

| المجموعة | النتيجة | ملاحظات |
|---|---:|---|
| Product Configuration HTTP/PostgreSQL Integration | 24/24 ناجح | قاعدة disposable منفصلة `ordersawa_stage3_stage6f4_api`. الرفض البنيوي لـLinked source على PG18 عاد من Prisma 5.22 كـUnknownRequestError/SQLSTATE `23001` لا `P2003`؛ عُدّل **تأكيد الاختبار فقط** ليتحقق من كلا التغليفين وبقاء المصدر. أول تشغيل 23 ناجح/1 فشل assertion، ثم 24/24. لا تعديل Runtime. |
| Trusted Network/Mixed WhatsApp HTTP/PostgreSQL | 13/13 ناجح | قاعدة disposable منفصلة `ordersawa_stage3_stage6e2_checkout`؛ Pizza/Combo/ORIGINAL/CUSTOM/reacceptance/Flag/Legacy guard. |
| API suite كاملة بالأعلام المتاحة | 137 ناجح، 69 متخطّى، 0 فشل (21 files ناجحة، 5 files متخطاة) | المجموعات المتخطاة تتطلب قواعد/أعلام disposable خاصة لم تُفعّل في تشغيل suite العام؛ لا تُحسب نجاحًا. المجموعتان أعلاه شُغّلتا منفصلتين بإعداداتهما. |
| Shared | 25/25 ناجح | أول محاولة على Windows أعادت EPERM بمجلد TEMP الافتراضي قبل تنفيذ الاختبارات؛ أُعيد التشغيل بـ`TEMP/TMP` مؤقتين داخل `../work/` ونجحت. |
| Web | 43/43 ناجح | اختبارات Component/Integration الحالية. |
| Root Typecheck | ناجح | Shared + API + Web. |
| Root Build | ناجح | Nest وNext 15.5.19؛ 27 صفحة Next. |
| Prisma generate + validate | ناجح | Client 5.22.0؛ URL محلية مؤقتة للعملية، بلا اتصال Production. |
| Browser E2E جديد في 6F.4 | **لم يُشغّل** | HTTP/PostgreSQL + Web شُغّلا؛ آخر Browser فعلي موثق من Stage 6F.1 هو 14/14 checkpoints على بيئة محلية أقدم (PG16)، **ليس إثباتًا على PG18 أو Production**. يجب إعادة Chrome/Nest/Next على Restore/Staging قبل الموافقة بالتفعيل. |
| Restore Production / Staging مماثلة | **لم تُشغّل** | Backup الحقيقية ممنوعة في هذه المهمة؛ تأكيد Restore قيد انتظار المبرمج. |

## ما تغير في Stage 6F.4

- ملفات SQL مراجعة/اختبار فقط: `apps/api/prisma/stage6f4-readonly-data-prechecks.sql`, `scripts/stage6f4-disposable-history.sql`, `scripts/stage6f4-disposable-migration-candidate.sql`.
- تعديل اختبار واحد فقط: `apps/api/src/modules/products/product-configuration.integration.spec.ts` لقبول تغليف PostgreSQL 18/Prisma الصحيح لـFK RESTRICT، مع إثبات عدم حذف المصدر.
- تقارير/دليل/قائمة موانع/حزمة تسليم و`CODEX_HANDOFF.md`. **لا** تعديل Pricing/Checkout/Order Runtime أو Prisma Schema/Migrations، ولا Production connection، أو Deployment، أو Feature Flag.

## حدود الدليل والمخاطر

الأصل الموثق من `menu` ليس Dump؛ unknown numeric typmods، History checksums، enum labels، check/index/trigger definitions، `db push` drift، أحجام البيانات والقيم السورية التاريخية. لذلك Candidate SQL **مشروطة** ومقفلة على disposable. `P2022` خطر حقيقي إذا نُشر Prisma Client الجديد قبل أعمدة Stage 6C؛ لا يفترض أن Production لديها هذه الأعمدة. Public WhatsApp flag تبقى OFF؛ Legacy فقط يجب اختباره على Restore قبل أي Deployment. Full catalog loading و`FOR SHARE` وRate Limit in-memory دين أداء/تشغيل؛ لا تُحذف الضمانات لأجل سرعة محلية. لم يُختبر PM2 أو Proxy أو Secret Store الحقيقي.

تقرير الموافقات وما يلزم من المبرمج: `ORDERSAWA_RELEASE_BLOCKERS_AND_APPROVALS_AR.md`. خطوات PM2: `ORDERSAWA_PM2_DEPLOYMENT_GUIDE_AR.md`. خطة SQL: `ORDERSAWA_PRODUCTION_MIGRATION_PLAN_AR.md`.
