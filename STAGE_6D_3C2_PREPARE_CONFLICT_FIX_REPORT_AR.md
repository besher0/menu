# OrderSawa — تقرير Stage 6D.3C2: معالجة تعارض Prepare

التاريخ: 2026-10-13. الفرع: `feature/product-configuration-network`. هذه مرحلة إصلاح محدودة لمسار Network Order **التجريبي والمحمي**؛ `orderingEnabled:false` باقٍ ولم يحدث نشر أو ترحيل لقاعدة حقيقية.

## السبب الجذري والإصلاح

كانت `runSerializable` تعيد محاولة تعارضات Serializable المعروفة ثلاث مرات. عند فشل المحاولة الثالثة تعيد رمي خطأ Prisma الخام. يحوّل `NetworkOrdersService.create` هذا الخطأ بالفعل إلى HTTP 409 منظم، لكن `prepare` كان يتركه يخرج بلا تحويل، وهو العيب المثبت في تدقيق Stage 6D.3B.

أُضيفت `try/catch` حول استدعاء `runSerializable` في `prepare` فقط. تستخدم الدالة الموجودة `isSerializationConflict` للتعرف على `P2034` أو `P2010` الذي يحمل `meta.code` مساويًا `40001` أو `40P01`. لا يتحول غير ذلك إلى 409؛ يُرمى كما كان. لم تتغير الدالة المشتركة، عدد المحاولات الثلاث، مستوى `Serializable`، مهلة المعاملة، `FOR SHARE`، إعادة التسعير، توقيع Acceptance Token، أو منطق `create`/Idempotency. لا يُنشأ Order خلال Prepare، وتظل جميع آثار محاولة فاشلة داخل المعاملة قابلة للتراجع.

لم يُعدّل Frontend: واجهة التجربة الحالية تقرأ `DemoApiError.code` وتعرضه عند فشل Prepare وتتيح المحاولة مجددًا؛ الرمز الجديد بالنسبة إلى هذا المسار هو نفسه الرمز الموجود في `create`، ولا يتطلب عقد واجهة جديدًا.

## عقد HTTP

عند استنفاد تعارض Serializable في `POST /public/menus/:restaurantSlug/orders/network-test/prepare`:

```json
HTTP 409
{
  "error": "NETWORK_ORDER_CONCURRENT_UPDATE",
  "message": "Catalog changed concurrently; retry with a new quote."
}
```

لا تعاد `draft` أو `acceptanceToken` في الفشل، ولا يظهر Stack Trace أو SQL أو Prisma code أو معلومات اتصال. لا يتحول `P2003`، على سبيل المثال، إلى 409. يظل نجاح Prepare هو العقد السابق: Draft موثوق وAcceptance Token مع `requiresExplicitAcceptance:true` و`orderingEnabled:false`، من دون حفظ Order.

## الملفات المعدلة

| الملف | التغيير |
|---|---|
| `apps/api/src/modules/orders/network-orders.service.ts` | تحويل استنفاد تعارضات Prepare المحددة إلى 409 فقط. |
| `apps/api/src/modules/orders/network-order-prepare-conflict.integration.spec.ts` | اختبارات HTTP/Nest حقيقية مع PostgreSQL مؤقتة وحقن خطأ داخل المعاملة. |
| `apps/api/src/modules/public-menu/network-readiness.audit.integration.spec.ts` | تحويل إثبات الخلل التاريخي إلى Regression يتوقع 409 وثلاث محاولات. |
| `CODEX_HANDOFF.md` | تحديث حالة المشروع وقيود المتابعة. |
| هذا التقرير | توثيق العقد والأدلة والمخاطر. |

## نتائج Fault Injection وPostgreSQL

استُخدم PostgreSQL 16 جديد ومعزول في `../work/stage6d3c2-postgres-data` على `127.0.0.1:55440`، مع قواعد اختبار منفصلة لكل مجموعة تكامل. أُنشئت القواعد جديدة وطُبق عليها Test Baseline SQL وStage 6C SQL **داخل هذه القواعد المؤقتة فقط**. الاختبار الجديد يفحص اسم/عنوان/منفذ قاعدة البيانات الفعلية قبل أي كتابة Fixture. يمر الطلب عبر HTTP Controller الحقيقي وService وPrisma ومعاملة PostgreSQL حقيقية؛ حقن الخطأ يتم بعد تنفيذ callback وإدراج علامة اختبار داخل المعاملة، ثم يثبت الاختبار تراجع العلامة وعدم حفظ Order.

اختبار HTTP الجديد: **9/9 ناجحة، 0 فاشلة، 0 متخطاة**:

1. نجاح Prepare دون تعارض وبدون Order.
2. `P2034` مؤقت ثم نجاح المحاولة الثانية، مع Rollback للمحاولة الأولى.
3. استنفاد ثلاث محاولات `P2034`: 409 منظم.
4. استنفاد ثلاث محاولات `P2010`/`40001`: 409 منظم.
5. استنفاد ثلاث محاولات `P2010`/`40P01`: 409 منظم.
6. خطأ غير مرتبط `P2003`: لا إعادة محاولة ولا تحويل إلى 409.
7. بقاء معالجة `create` للتعارض والتراجع كما كانت.
8. بقاء Acceptance Token وIdempotent Replay في `create`.
9. رفض Prepare عند غياب علم التجربة، قبل دخول المعاملة.

في الحالات الثلاث المستنفدة تحققت الاختبارات من **ثلاث محاولات بالضبط** ومن خلو الاستجابة من تفاصيل Prisma/SQL ومن خلو قاعدة البيانات من Order أو علامة Transaction. اختبار التدقيق المُحدَّث نجح ضمن مجموعة API، وكذلك اختبارات Network Orders الأصلية **18/18** واختبارات Public Menu Race من Stage 6D.3C1 **8/8**. التشغيل النهائي الكامل: **156/156 اختبار API ناجحًا في 23 ملفًا، 0 متخطاة**. نجح Root `npm run typecheck` وRoot `npm run build`؛ أنتج Next.js **27/27** صفحة.

أول محاولة لتشغيل جميع اختبارات API بعد الاختبار الموجّه فشلت قبل تنفيذ اختبارات الملف الجديد لأن Fixture أنشأ المطعم نفسه مرتين في القاعدة المؤقتة؛ كانت النتيجة آنذاك 147 ناجحة و9 متخطاة داخل ملف فشل إعداده. أُضيف تنظيف محصور بقاعدة الاختبار المخصصة، بعد تحقق هويتها، ثم أعيد تشغيل المجموعة كاملة ونجحت **156/156**. هذا خلل قابلية إعادة تشغيل Fixture، وليس خللًا في إصلاح `prepare`.

فحص TypeScript الإضافي الذي يشمل مصادر اختبارات API ما زال يفشل عند الخطأين السابقين خارج النطاق: `network-orders.integration.spec.ts:316` و`product-import-parser.spec.ts:23`؛ لا توجد أخطاء جديدة. لم تُشغّل Shared/Web Tests مستقلة ولا Browser E2E لأن التغيير Backend/HTTP فقط؛ Root Typecheck/Build شمل بناء Shared وAPI وWeb، واختبارات API ذات الصلة شُغلت كاملة.

## Known Issues وProduction Blockers الباقية

لا يُعدّ أي مما يلي محلولًا بسبب هذا الإصلاح:

- `DashboardService.ensureAllCategory` مسار مستقل قد يحتاج تدقيق سباق مشابهًا؛ لم نعدله.
- تحميل Catalog المطعم كاملًا لكل Quote، وقفل جميع Product Rows بـ`FOR SHARE` أثناء Prepare/Create؛ لم نغيرهما.
- يلزم Benchmark مستقل للتزامن، وطلبات 50-line، و10k Products، والتعقيد العميق لـNested/Linked قبل تقييم التوسع.
- خطآ TypeScript القديمان في مصادر الاختبارات المذكوران أعلاه.
- جميع موانع Production في تقرير Stage 6D.3B: سياسة تقريب/عرض العملة، إدارة HMAC متعددة النسخ والتدوير، Authentication/Authorization وحماية PII للإطلاق الحقيقي، Rate Limits، رقم الطلب التجاري، إلزامية هاتف الزبون، رسوم التوصيل/الضرائب/الخصومات، Snapshot متعدد اللغات، تدقيق Migration History الفعلي، Business/Outlet Context، Service Mode/Scheduling، وتدفق إرسال WhatsApp. كلها تحتاج قرارات أو أعمالًا مستقلة؛ لم يُحسم أي قرار مالي أو معماري هنا.

لم يُستخدم `.env` الحقيقي أو Production أو قاعدة موجودة أو بيانات زبائن حقيقية، ولم تُطبَّق Migration/Backfill على بيئة حقيقية. لم يُرسل WhatsApp ولم يُفعّل Network Ordering.

## Git ونقطة التوقف

حُفظ الإصلاح والاختبارات والتقرير في Commit مستقل بعنوان `fix(api): map exhausted Network Prepare conflicts to 409` على الفرع المذكور. **Git Commit Hash النهائي** وحالة Git النهائية يردان في تسليم Codex النهائي ويمكن التحقق منهما محليًا بـ`git log -1 --format=%H` و`git status --short`. لا يمكن وضع Hash الـCommit النهائي ثابتًا داخل ملف هو نفسه جزء من ذلك الـCommit دون تغيير الـHash. توقفت المرحلة هنا؛ لا Stage 6D.3C3 ولا تفعيل أو نشر.
