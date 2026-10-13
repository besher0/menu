# OrderSawa — تقرير Stage 6D.3C3F: دمج إنشاء الطلب الذري التجريبي

التاريخ: 2026-10-13. الفرع: `feature/product-configuration-network`. هذه المرحلة تخص `NETWORK_TEST` المعزولة فقط؛ `orderingEnabled:false` باقٍ، ولم تُفعّل طلبات حقيقية أو إرسال WhatsApp أو Migration تشغيلية.

## 1. Changes Summary

طُبّق Design A داخل `NetworkOrdersService.create` بعد مراجعة `CODEX_HANDOFF.md` وتقارير 6D.3C3C/3D/3E وسجل قرارات المؤسس وقواعد التعارض والشيفرة وSQL الفعلية. لا توجد قراءة غياب `idempotencyKey` أو `acceptanceTokenHash` داخل معاملة الإنشاء قبل الإدراج. يستند التفرد إلى فهرسي Stage 6C الحاليين. لا `POC_PENDING` ولا Claim Table ولا محرك تسعير ثانٍ.

الملفات المتغيرة:

| الملف | الغرض |
|---|---|
| `apps/api/src/modules/orders/network-orders.service.ts` | إدراج كامل، ختم، فرض القيد المسمّى، تحقق مستقل بعد Commit، واسترجاع Replay آمن |
| `apps/api/src/modules/orders/network-order-db-guard.ts` | التحقق من قاعدة PostgreSQL التجريبية وتعريف حارس الاكتمال المتوقع قبل أي INSERT |
| `apps/api/src/modules/orders/network-orders.integration.spec.ts` | Regression لـ10/50 سطرًا وعقد فشل الحفظ المنظم |
| `apps/api/src/modules/orders/network-orders-atomic.integration.spec.ts` | HTTP/PostgreSQL وفشل Commit وFault Injection والتزامن والحارس المفقود/المزيف |
| `scripts/stage6d3c3e-network-order-completeness-candidate.sql` | توسيع قائمة أسماء قواعد الاختبار المؤقتة المسموح بها فقط؛ تعريف الحارس نفسه لم يتغير |
| `scripts/stage6d3c3-benchmark.mjs` | وضع Benchmark يدوي منفصل لـRuntime الحالي مع الحارس و10 سطور |
| `scripts/stage6d2b-browser-e2e.mjs` | تشخيص بدء Chrome ودعم IPv6 loopback في بيئة Windows؛ السيناريوهات نفسها |
| `CODEX_HANDOFF.md` وهذا التقرير | التسليم والسياق القادم |

لم تتغير Prisma Schema أو Migration History أو Shared Engine أو Stage 6C triggers أو Legacy Checkout أو Frontend التشغيلي.

## 2. Runtime Flow

الـController وحواجز `NODE_ENV != production` وloopback و`ENABLE_DISPOSABLE_NETWORK_ORDERS=1` والتحقق من هوية قاعدة الاختبار بقيت. داخل `Serializable` الحالي: تحقق الحارس → قفل المطعم والكتالوج بـ`FOR SHARE` → `buildDraft` الحالي باستخدام Shared Engine والبيانات الحية → التحقق من HMAC Acceptance وربط المطعم وHash الـDraft → إنشاء Order واحدة كاملة مع OrderItems وSnapshot من Draft الموثوقة → الختم → `SET CONSTRAINTS "Order_network_test_completeness_guard" IMMEDIATE`. ثم قراءة مستقلة بعد انتهاء المعاملة للتحقق قبل HTTP 201. عدد محاولات Serializable الحالي **3**؛ لا Backoff/Jitter جديد. `prepare` لم يتغير.

تستمر إعادة التحقق من السعر وRevision وAvailability وCapability وLinked Products داخل المعاملة. السعر المعاد للعميل ناتج من Draft الموثوقة ومبالغ `Decimal(24,6)`؛ لا استخدام لأرقام JavaScript في جمع الأموال.

## 3. DB Guard Integration

استُخدمت Candidate SQL الخاصة بـ6D.3C3E **فقط** على قواعد اختبار جديدة. قبل الإنشاء يتحقق Backend من PostgreSQL 16، اسم القاعدة الاختبارية، `127.0.0.1:55440`، ووجود Trigger deferred على `Order.source`، حالة تفعيله، وبصمات SHA-256 لتعريف Trigger ومتن دالتي الحارس والمال، وإعدادات `search_path`، ووجود Triggers Stage 6C الستة. مجرد وجود Trigger بنفس الاسم لا يكفي: اختبار Trigger مزيف بالاسم ذاته أعاد `503 NETWORK_ORDER_DB_GUARD_UNAVAILABLE` دون Order. القاعدة بلا حارس أعادت النتيجة نفسها. لا Fallback غير محمي، ولا تثبيت تلقائي للقيد على قاعدة موجودة.

البصمات مرتبطة بتعريف مرشح 6D.3C3E على PostgreSQL 16؛ تغيير SQL أو إصدار PostgreSQL يحتاج مراجعة وتحديثًا صريحين. فحص Stage 6C يتحقق من أسماء Triggers وتفعيلها، وليس بصمات أجسامها؛ يظل تدقيق Migration History/التعريفات الإنتاجية مانعًا منفصلًا.

## 4. Prisma Commit Handling

أعيد إثبات سلوك Prisma 5.22.0: قد تُحل نتيجة callback عند فشل Deferred Constraint وقت Commit، مع Rollback فعلي. لذلك يُفرض **القيد المسمّى فقط** `IMMEDIATE` بعد الختم، ثم تُقرأ Order في عملية مستقلة للتحقق من `restaurantId` و`idempotencyKey` و`requestHash` و`acceptanceTokenHash` و`source=NETWORK_TEST` و`status=VALIDATED_TEST` والختم وSnapshot وOrderItems. لا يُرجع HTTP 201 عندما يتعذر تأكيد النتيجة. عند فقد الاستجابة بعد Commit يمكن إعادة الطلب نفسه واسترجاع Order المختومة.

العقود الجديدة للعميل: `503 NETWORK_ORDER_DB_GUARD_UNAVAILABLE` عند غياب/اختلاف الحارس؛ `503 NETWORK_ORDER_COMMIT_UNCONFIRMED` عندما لا يمكن تأكيد Commit؛ `503 NETWORK_ORDER_PERSISTENCE_FAILED` للأخطاء غير المصنفة دون كشف SQL/Prisma؛ و`503 NETWORK_ORDER_UNRESOLVED_UNIQUE_CONFLICT` عندما لا يثبت تعارض فريد أنه Replay. تعارض Serializable المستنفد يبقى `409 NETWORK_ORDER_CONCURRENT_UPDATE`، ومفتاح مختلف Payload يعيد `409 IDEMPOTENCY_KEY_REUSED`، وإعادة استخدام Token بمفتاح آخر تعيد `409 ACCEPTANCE_TOKEN_ALREADY_USED`. فشل التحقق التجاري/المالي الحالي يحتفظ بعقوده السابقة.

## 5. Idempotency Safety

التفرد البنيوي `(restaurantId,idempotencyKey)` و`(restaurantId,acceptanceTokenHash)` لم يتغير. لا يُعاد Order بعد P2002 أو Commit غامض إلا بقراءة جديدة بعد المعاملة ونطاق المطعم نفسه، وتطابق Hash الطلب وToken ووجود Snapshot مختومة وعناصرها. لا تُكشف Order مطعم آخر. Replay المطابق لطلب محفوظ يُسمح به حتى لو تغيّر السعر أو Capability لاحقًا؛ **إنشاء طلب جديد** يخضع دائمًا لإعادة التحقق وموافقة جديدة. تغيير Payload للمفتاح نفسه وتكرار Token بمفتاح آخر يُرفضان. لا تُعد أخطاء DB الأخرى Replay.

## 6. Negative Commit Results

اختبارات HTTP الحقيقية مع Fault Injection على PostgreSQL مؤقتة: حذف Item، حذف Snapshot، حذف الختم، اختلاف الإجمالي، اختلاف `OrderItem.options`، تخطي فرض القيد حتى COMMIT، فشل Finalization بـ`P2010:23514`، والخروج قبل Commit؛ جميعها رفضت الحفظ ولم تترك Order جزئية، ثم نجحت إعادة المحاولة بعد Rollback. فشل القراءة بعد Commit أعاد 503 رغم وجود Order مختومة؛ Replay اللاحق أعاد Order نفسها. فقدان الاستجابة بعد Commit استُرجع دون تكرار. `P2034` و`P2010:40001/40P01` بعد استنفاد المحاولات أعادت 409 منظمًا، بينما `P2002` غير المرتبط و`P2003` لم يتحولا إلى Replay. اختبارات Stage 6D.3C3E المنفصلة: **25/25** حالات سلبية/تراجع، صفر صفوف جزئية؛ Legacy Order ظل مقبولًا.

## 7. HTTP/DB Regression

قاعدة PostgreSQL **16.15** جديدة بمعزل عن أي بيانات قائمة، على loopback `127.0.0.1:55440`، وUTF-8؛ قواعد اختبار منفصلة لأسماء `..._atomic`, `_no_guard`, `_fake_guard`, `_integration`, `_guard`, `_control`, `_bench2`, `_demo` وغيرها من اختبارات API. طُبّق عليها Test Baseline وStage 6C SQL، ثم Candidate Guard فقط على القواعد المصرّح لها. لم تُستخدم `.env` الحقيقية. نتائج التشغيل النهائي:

| الفحص | النتيجة |
|---|---:|
| Atomic Nest HTTP/PostgreSQL suite | 28/28، بلا تخطٍ |
| Network Order integration بما فيه Pizza/Combo/Linked/10/50 سطرًا وتغير السعر/Revision/Capability/Availability | 20/20 |
| Prepare-conflict HTTP regression | 9/9 |
| API كاملة بعد ضبط Test Flag وقواعدها المنفصلة | 186/186 في 24 ملفًا، صفر تخطٍ |
| Shared tests | 21/21 |
| Web tests | 39/39 |
| Browser E2E فعلية | 15/15، صفر فشل/تخطٍ |
| Root Typecheck | ناجح |
| Root Build | ناجح؛ Next.js 27/27 صفحة |
| Stage 6D.3C3E DB guard verifier | 25/25 حالات سلبية، ونجحت الحالات الإيجابية وLegacy |

Browser E2E شغّلت Backend وNext.js فعليين محليًا مع قاعدة Demo تجريبية، وغطت Pizza/Combo Linked مستقلين، حفظ السلة، تغير السعر وإعادة الموافقة، Revision، Availability، اختيار غير صالح، الضغط المكرر، Retry، Delivery/Pickup، السلة المختلطة، غياب Test Flag، Legacy Checkout، RTL و390px. قرأت رسالة Combo من Snapshot محفوظة في DB؛ لم تُرسل WhatsApp. اختبارات API الأولى لم تكتمل لأن Flag عام كان غائبًا في Audit suite؛ أعيد تشغيلها بعزل القواعد والـFlag وانتهت **186/186**. اختبار Shared الأول توقف بسبب مسار TEMP خارج مساحة الكتابة؛ أُعيد بمجلد عمل آمن وانتهى **21/21**. لا نعد المحاولتين الأوليين نجاحًا.

## 8. Concurrency Measurements

Benchmark يدوي عبر Nest HTTP الحقيقي على كتالوج **1000 Product** بعد Warm-up، موجتان لكل مستوى، Fixture خارج القياس (**182.72ms**). Windows/8 logical CPUs/15.89GB RAM، PostgreSQL 16.15، Node 24.19. العينات صغيرة؛ P95 فقط عند 20 عينة أو أكثر. أرقام Create تشمل أثر الحارس والقراءة المستقلة؛ لا تمثل Production SLA.

| Concurrent | عدد الطلبات | 201 | 409 | تعارضات داخلية قبل Retry | Median HTTP | P95 HTTP |
|---:|---:|---:|---:|---:|---:|---:|
| 1 | 5 | 5 | 0 | 0 | 46.73ms | غير محسوب |
| 5 | 10 | 10 | 0 | 1 | 100.44ms | غير محسوب |
| 10 | 20 | 20 | 0 | 14 | 256.68ms | 345.59ms |
| 25 | 50 | 49 | 1 | 26 | 382.79ms | 605.43ms |

المقارنات الموجهة الأخرى: 25 طلبًا بالمفتاح وPayload نفسهما عادت كلها إلى Order واحدة مختومة؛ Token واحدة مع مفاتيح مختلفة أعطت Order واحدة ورفض الباقي؛ توزيع الطلبات على مطعمين حافظ على العزل؛ موجات منفصلة عند 25 داخل مطعم واحد تراوحت 21–25 نجاحًا و0–4 تعارضات 409، وعلى مطعمين 24–25 نجاحًا و0–1 تعارض. لم تظهر Orders مكررة أو Snapshot خاطئة. مقارنة Stage 6D.3C3 القديمة عند 1000/25 (**33/50 نجاحًا، 17/50 409، median/P95 604.45/774.09ms**) اتجاهية فقط: البيئة وقاعدة الاختبار والحارس والFixture ليست متطابقة، فلا نعلن تحسنًا رقميًا سببيًا مثبتًا.

## 9. Legacy Compatibility

لم يُعدل Legacy Checkout أو رسائل WhatsApp أو المنتجات القديمة. اختبار Legacy Order في DB وLegacy Browser Checkout نجحا. لا يزال رفض السلة المختلطة قائمًا. `orderingEnabled:false` في عقد Draft/Response، ومسارات الاختبار ترفض غياب Flag أو عدم loopback أو Production/قاعدة غير disposable؛ لا API عامة جديدة.

## 10. Performance Impact

في HTTP تسلسلي: Pizza بسطر واحد 9 عينات median **48.23ms**؛ Combo Linked 7 عينات **51.48ms**؛ 10 أسطر 7 عينات **92.43ms**؛ 50 سطرًا 3 عينات **254.37ms**. لا P95 لهذه العينات الصغيرة. مقارنة COMMIT المباشر مع الحارس/بدونه (30 عينة لكل حالة، 5 Warm-up): سطر واحد median/P95 **2.085/3.445 مقابل 0.664/1.522ms**؛ 10 أسطر **6.635/8.701 مقابل 0.477/0.754ms**؛ 50 سطرًا **29.924/39.831 مقابل 0.851/1.218ms**؛ Combo **2.154/2.616 مقابل 0.695/0.776ms**. هذه تكلفة محلية مثبتة؛ لم تُخفف ضمانات القيد. قفل Product B غير المرتبط خلال طلب A مع تأخير اصطناعي 250ms أوقف تحديث B نحو **326.91ms** بطلب واحد و**277.30ms** بخمسة طلبات؛ Full Catalog `FOR SHARE` باقٍ.

## 11. Remaining Risks

- عند 25 طلبًا متزامنًا ما زال ممكنًا استنفاد Serializable وإرجاع 409؛ Full Catalog loading/locking و50-line guard cost يحتاجان Profiling وتصميمًا منفصلًا، لا تغييرا تلقائيًا.
- البصمات مربوطة بـPostgreSQL 16 والمرشح الحالي؛ لا اعتماد على قواعد حقيقية. Stage 6C trigger bodies وتاريخ الترحيل الحقيقي غير مدققين.
- `P2002` غير القابل لتأكيد Replay يعيد 503 fail-closed. فقدان الاتصال مع عدم إمكان قراءة مستقلة يعيد 503؛ على العميل إعادة المحاولة بنفس المفتاح بعد استعادة الاتصال.
- لا اختبار متصفح متعدد الخوادم أو شبكة عامة أو 10k/deep worst-case في هذه المرحلة. Dashboard `ensureAllCategory` والتشخيصان القديمان في test-source TypeScript ما زالت ملاحظات منفصلة.

## 12. Production Blockers

مرشح SQL ليس Migration رسمية، وStage 2C/6C Migration History الحقيقية لم تُدقق بإذن مستقل. يلزم قرار مؤسس لسياسة تقريب/عرض العملة، رقم الطلب التجاري، بيانات الهاتف والرسوم/الضريبة/الخصومات، والترجمة التاريخية، ومسار WhatsApp. ويلزم تصميم إنتاجي مستقل لـAuthentication/Authorization وRate Limits ومفتاح HMAC مشترك مع rotation وحماية PII وBusiness Catalog + Outlet Layer. لا ينبغي رفع Test Flag أو تشغيل Endpoint التجريبي للعامة. لا يوجد تصريح بأن هذه المرحلة تجعل النظام جاهزًا للإنتاج.

## 13. Git Commit Hash

Commit مستقل لهذا التقرير والكود والاختبارات وملف التسليم: يُستخرج بـ`git log -1 --oneline` بعد الحفظ؛ تجنب وضع hash متوقع داخل الملف قبل إنشائه. الـCommit السابق المؤكد: `5f812ab` (Stage 6D.3C3E).

## 14. Git Status ونقطة التوقف

رُوجع `git diff` و`git diff --check` وقائمة الملفات بحثًا عن `.env` وCredentials وLogs وبيانات عملاء؛ الملفات المحفوظة Source/SQL مرشحة/اختبارات/توثيق فقط. يجب التحقق من `git status --short --branch` بعد الـCommit. أُوقفت خوادم API/Next المحلية؛ تُوقف PostgreSQL المؤقتة قبل التسليم النهائي. **توقف هنا. لا Stage 6D.3C3G، ولا Migration أو Production Database أو Deploy أو Network Ordering حقيقي أو إرسال WhatsApp دون موافقة جديدة.**
