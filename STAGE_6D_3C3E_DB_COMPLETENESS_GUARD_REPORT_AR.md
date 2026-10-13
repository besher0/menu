# OrderSawa — تقرير Stage 6D.3C3E: حارس اكتمال Network Order في PostgreSQL

## 1. النتيجة والنطاق

أُعدّت واختُبرت SQL مرشحة لتصميم **A فقط** في `scripts/stage6d3c3e-network-order-completeness-candidate.sql`، خارج تاريخ Migrations. ترفض قاعدة الاختبار Commit لطلب `NETWORK_TEST` غير مختوم أو ناقص أو مختلف عن Snapshot. التسلسل المسموح هو `Order INSERT → OrderItems INSERT → Seal → Commit` في المعاملة نفسها. لا توجد Claim Table أو `POC_PENDING`، ولم تتغير `NetworkOrdersService` أو Shared Engine أو Prisma Schema أو Triggers Stage 6C الموجودة.

**القيد ليس جاهزًا للتطبيق على قاعدة حقيقية.** أثبت PostgreSQL سلامة التراجع، لكن اختبار Prisma 5.22.0 أثبت أن قيمة callback قد تُعاد رغم تراجع Commit المؤجّل. لذلك يظل منع HTTP 201 الكاذب شرطًا إلزاميًا في Stage 6D.3C3F، فضلًا عن عبء Commit الملحوظ عند 50 سطرًا. `orderingEnabled:false` باقٍ، ولا يوجد تفعيل أو Deployment.

## 2. المراجع والفحص

- الفرع `feature/product-configuration-network` نظيف في البداية، وCommit السابق `2ed64dd poc(network): design safe atomic order creation`.
- قُرئت `CODEX_HANDOFF.md`، تقريرا 6D.3C3D و6D.3C3C، وسجل قرارات المؤسس الحالي و`CURRENT_SUPERSESSION_AND_CONFLICT_RULES.md` من `../work/product-network-pack/OrderSawa_Product_Network_Codex_Pack/AUTHORITATIVE_RULES/`.
- فُحص `apps/api/prisma/schema.prisma`، وSQL Stage 6C في `apps/api/prisma/migrations/20261013000000_network_order_test_snapshot/migration.sql`، و`NetworkOrdersService.create`، وعقد `Order.cartSnapshot`، وFormatter، و`Order`/`OrderItem`، وSQL التجريبية لمرحلة 6D.3C3D. Prisma و`@prisma/client` الفعليان **5.22.0**؛ PostgreSQL التجريبية **16.15**.
- تعتمد Snapshot الحالية على `cartSnapshot.items[]`، وتخزن كل `OrderItem.options` نسخة JSON تاريخية مطابقة لعنصرها. `OrderItem` لا يملك عمود ترتيب، لذلك تُقارن **المجموعات متعددة التكرار** من JSONB؛ لا يُفترض أن تكرار Combo يساوي عنصرًا واحدًا.

## 3. Final Candidate SQL Design

الملف المرشح يحتوي حارس تنفيذ يرفض أي قاعدة غير اسمي الاختبار الصريحين أو أي عنوان/منفذ غير `127.0.0.1:55440` أو قاعدة تحتوي Orders مسبقًا. **لا يُنسخ الحارس ولا SQL كاملة تلقائيًا إلى Migration رسمية**؛ يحتاج ذلك مراجعة مستقلة وتدقيق تاريخ الترحيل.

1. دالة `network_order_guard_money(jsonb)` تقبل **سلسلة عشرية غير سالبة** ضمن `DECIMAL(24,6)` فقط، وتعيد PostgreSQL `numeric` أو `NULL` عند الخطأ. لا يستخدم التحقق `JavaScript Number` ولا يفرض سياسة تقريب.
2. `require_complete_network_test_order()` تقرأ الحالة النهائية من صف `Order` عند تشغيل Deferred Constraint Trigger، وتعمل فقط عندما يكون `source='NETWORK_TEST'`.
3. Trigger مسمّى `Order_network_test_completeness_guard` يعمل بعد `INSERT` أو تغيير `source`، وهو `DEFERRABLE INITIALLY DEFERRED`. يُجدول **حدث واحد** عند إنشاء Order؛ ويقرأ بعد إدراج العناصر والختم الحالة النهائية داخل المعاملة. تغيير Status العادي لا يعيد فحص طلب تاريخي بلا سبب.
4. تستمر Triggers Stage 6C الحالية بمنع تغيير بيانات Order/OrderItem التاريخية، أو حذفها، أو إدراج Item بعد الختم. لم تُستبدل أو تُعطّل. تسمح بإدراج Items قبل الختم.
5. يمكن لاحقًا تنفيذ `SET CONSTRAINTS "Order_network_test_completeness_guard" IMMEDIATE` **بالاسم فقط** بعد الختم وقبل عودة callback. لم تستخدم الأداة `SET CONSTRAINTS ALL IMMEDIATE`، حتى لا تغيّر توقيت قيود أخرى بلا ضرورة.

### DB invariants المثبتة

| المجال | فحص الحارس |
|---|---|
| الظرف والختم | ختم غير `NULL`؛ Snapshot كائن بإصدار 1، mode=`NETWORK`، locale مدعومة، تفاصيل طلب بنيوية، Currency مطابقة، 1–50 سطرًا |
| المال | Total بنص عشري دقيق يساوي `Order.totalAmount`؛ مجموع Line Totals يساوي Order؛ `unitPrice × quantity = lineTotal` بـ`numeric`؛ مجموع `chargedAmount` يساوي Unit Price؛ Included لا يُحصّل ثانية |
| عناصر Order | عدد وسعر `OrderItem` مطابقان؛ `options` غير فارغة ومطابقة للبيانات المباشرة في الصف؛ JSONB multiset تطابق جميع Snapshot items، بما فيها النسخ المتكررة |
| هوية المنتج | `productId` وName وRevision/Configuration/Selection متطابقة بنيويًا داخل Snapshot والصف، والمنتج الأساسي من المطعم نفسه |
| كميات وحدود | 1–100 لكل سطر، وحد إجمالي 100 وحدة مطابق للعقد الخادمي الحالي |
| مفاتيح الطلب | صيغة Idempotency Key وSHA-256 Hashes محفوظة؛ الفهارسان الفريدان Stage 6C يبقيان مانعي التكرار |

هذه ضمانات **اتساق أدلة مخزنة** وليست إثباتًا دلاليًا للسعر أو صحة HMAC أو Availability/Capability/Revision أو صحة Linked Graph. تبقى تلك مسؤولية Backend وShared Engine داخل Serializable. قد يصنع كاتب DB ذو صلاحية كافية Snapshot مزورة ومتسقة حسابيًا؛ لا نزعم غير ذلك.

## 4. PostgreSQL Negative Commit Results

على قاعدة Guard المؤقتة، نجحت **25 حالة رفض/تراجع موجهة** مع صفر Orders جزئية ملتزمة: بلا Snapshot؛ بلا ختم؛ بلا Items؛ Snapshot فيها Item زائدة أو ناقصة؛ اختلاف Total أو Currency؛ اختلاف `options` مع بقاء صف Item متسقًا داخليًا؛ اختلاف Product Identity أو كمية؛ منتج من مطعم آخر؛ فشل FK عند إدراج Item؛ فشل تحديث الختم؛ خروج مبكر؛ Commit قبل Finalization؛ خلل Breakdown؛ غياب Selection؛ SnapshotVersion خاطئة؛ مال يتجاوز 6 منازل؛ غياب Locale؛ Hash قبول غير صحيح؛ ثم فحص Rollback قبل Retry، ورفض تعديل/حذف/إضافة Item بعد الختم.

اختبار `COMMIT` المباشر بواسطة PostgreSQL عند Order مختومة بلا Item أعاد **SQLSTATE 23514** ولم يُبقِ صفًا. إعادة المحاولة بعد Rollback بالمفتاح نفسه نجحت. كما نجحت Orders كاملة: Pizza مع Nested/Included بسعر `265.000004 EGP`، Combo مع نسختي ORIGINAL مستقلتين وCUSTOM بسعر `43 EGP`، ثم 10 أسطر (`2650.00004`) و50 سطرًا (`13250.0002`). هذه الأسعار أنتجها `NetworkOrdersService.buildDraft` ومحرك Shared الفعلي؛ لم تُبنَ آلة تسعير جديدة. فحص القراءة النهائي وجد **0 Network Orders غير مختومة**.

اختبارات Stage 6C الفعلية ضد قاعدة ثالثة جديدة تحمل القيد: **18/18 API HTTP/Integration**؛ شملت الطلبات الحقيقية التجريبية، Combo، بيانات الزبون، Idempotency، Legacy path، وRollback عند فشل إدراج Item. هذه تغطية توافق مع Runtime الموجود، **وليست تطبيقًا لتصميم A داخل Runtime**.

## 5. Prisma Commit Behavior وHTTP 201

في Prisma **5.22.0**، عدة معاملات ناقصة أعادت قيمة `$transaction` callback دون Exception، بينما أثبتت قراءة منفصلة عدم التزام أي Order. تأكدنا أيضًا باستعلام PostgreSQL مباشر من أن Commit نفسه فشل بـ`23514`. إذن نجاح Promise/Callback **ليس دليل Commit موثوقًا في هذا المسار المؤجّل**.

عند فرض القيد المسمّى وحده إلى `IMMEDIATE` قرب نهاية معاملة ناقصة، ظهر الخطأ داخل callback كـ`P2010` مع SQLSTATE `23514`، وتراجعت المعاملة. المعاملة المكتملة نجحت مع الفرض المسمّى. في HTTP loopback تجريبي، أُعيدت **409 عند فشل Finalization** و**201 بعد نجاح القيد وقراءة Order المختومة في معاملة جديدة**. لم يتغير أي Controller أو Service تشغيلي. Stage 6D.3C3F يجب أن يضع المعالجة fail-closed داخل `NetworkOrdersService.create`، مع تأكيد مستقل للـCommit مطابق للمطعم والمفتاح وHashes والختم قبل 201؛ كما يجب اختبار سلوك Prisma عند كل تحديث إصدار أو Driver.

## 6. Legacy Compatibility

حُفظ Legacy `WHATSAPP` Order مع Item و`cartSnapshot=NULL` بنجاح ودون إلزامها بـNetwork Snapshot. محاولة تحويل Legacy Order ناقصة إلى `NETWORK_TEST` رُفضت، وبقي صفها `WHATSAPP`. لم يتغير Legacy Checkout ولا بيانات Orders القديمة. لأن Trigger المرشح يستجيب لإدراج أو تغيير `source` فقط، فهو **لا يدقق بأثر رجعي** أي Network Orders قديمة، ولا يعترض تغييرات Status الطبيعية؛ يلزم تدقيق بيانات ما قبل التطبيق في Migration مستقبلية منفصلة.

## 7. Performance Measurements — قياسات مباشرة

البيئة: PostgreSQL 16.15 محلي على Windows، قاعدتا Guard/Control جديدتان في cluster واحد، Baseline + Stage 6C متطابقتان؛ الفارق الوحيد هو SQL المرشحة في Guard. قِيس زمن أمر `COMMIT` نفسه بواسطة `pg` بعد تحضير `INSERT Order → Items → Seal`، مع تبادل ترتيب القاعدتين، **5 Warm-ups و30 عينة لكل حالة ولكل قاعدة**. تجهيز Shared Draft/Fixtures خارج الزمن المقاس. القيم بالمللي ثانية:

| الحالة | عدد الأسطر | Guard Median / P95 | Control Median / P95 | فرق Median المرصود |
|---|---:|---:|---:|---:|
| Pizza سطر واحد | 1 | 2.180 / 4.161 | 0.632 / 0.975 | +1.548 |
| Pizza عشرة أسطر | 10 | 6.928 / 11.153 | 0.524 / 1.042 | +6.404 |
| Pizza خمسون سطرًا | 50 | 28.760 / 36.762 | 0.758 / 1.213 | +28.002 |
| Combo Linked | 1 | 2.061 / 3.552 | 0.557 / 0.827 | +1.504 |

**الخمسون سطرًا كلفة مرتفعة، وليست جاهزة لاعتماد إنتاجي بلا ميزانية أداء.** SQL يفحص كل سطر وكل Price Line، ويستعلم هوية Product لكل `OrderItem` ويقارن JSONB متعدد التكرار. `EXPLAIN (ANALYZE, BUFFERS)` لاستعلام المطابقة متعدد التكرار على Order ذات 50 سطرًا سجل **3.701ms Execution Time** في عينة واحدة و81 shared-buffer hits؛ لا يفسر وحده كامل فرق الـ28ms، لذا لا ننسب البقية لجزء محدد دون Profiling إضافي. لقطة 50 سطرًا كانت مخزنة بضغط PostgreSQL بحجم `pg_column_size=3827` بايت، ومتوسط `OrderItem.options` نحو 1374 بايت. لا يُستنتج Production SLA أو P99 من هذه العينة المحلية؛ لا نخفف ضمانات القيد من أجل تحسين الرقم.

## 8. Required Future Migration وStage 6D.3C3F

قبل أي Migration تشغيلية: تدقيق Migration History الحقيقي بإذن قاعدة مستقل؛ فحص Network Orders الموجودة قراءةً فقط وتحديد حالة أي سجل غير مكتمل؛ مراجعة أسماء الدوال والقيود وإصدار PostgreSQL وصلاحيات الإنشاء؛ صياغة Migration/Rollback رسمية **بموافقة جديدة**؛ ثم اختبارات على PostgreSQL disposable مستقلة، بما فيها توافق بيانات تاريخية وقياس أداء. ملف هذه المرحلة ذو حارس اسم قاعدة تجريبية وليس Migration.

متطلبات Stage 6D.3C3F المقترحة، **غير منفذة هنا**:

1. تطبيق Design A داخل `create` بعد إعادة التحقق الحالي من Shared/HMAC/Revision/Capability، دون `POC_PENDING` أو قراءة غياب المفتاح قبل INSERT، مع الحفاظ على Serializable و`FOR SHARE` وRetry الحالي.
2. بعد `Order → Items → Seal`، فرض **القيد المسمّى** `IMMEDIATE` فقط؛ عدم إصدار 201 قبل تأكيد Commit بقراءة جديدة Tenant-scoped ومطابقة `idempotencyKey` و`requestHash` و`acceptanceTokenHash` والختم وSnapshot.
3. معالجة `P2002`/`P2034`/`P2010:40001`/`40P01` و`23514` بصورة آمنة، واسترجاع Replay من معاملة جديدة فقط عند تطابق الطلب، دون كشف بيانات مطعم آخر أو تفاصيل Prisma.
4. اختبار HTTP/DB للفشل عند Finalization، لفقد الاستجابة بعد Commit، والسعر/Revision/Capability المتغيرة، و50 سطرًا وLinked/Combo، مع فحص تكلفة القيد وإمكان تقليلها **دون إزالة فحص اكتمال**. أي تغيير تصميمي يتطلب موافقة منفصلة.

## 9. المخاطر والملفات وحالة Git

- Prisma deferred-Commit behavior مانع موثوقية حتى تُبنى معالجة صريحة؛ اختبار 18/18 الحالي يثبت توافق المسار السليم فقط.
- كلفة 50 سطرًا وJSONB كبيرة محليًا؛ يلزم Profiling/تحسين محافظ قبل الاعتماد. صلاحية HMAC والتسعير الدلالي والـTenant authorization تبقى في Backend لا DB.
- جميع موانع Stage 6D.3B باقية: السياسة المالية وعرض العملة، HMAC Production، Auth/Rate Limits، رقم الطلب، الهاتف/الرسوم، الترجمة التاريخية، Migration History، Business/Outlet وسير WhatsApp. لم يُفعّل الطلب الحقيقي.
- الملفات: SQL المرشحة في `scripts/stage6d3c3e-network-order-completeness-candidate.sql`؛ أداة الاختبار اليدوية `scripts/stage6d3c3e-db-guard-verify.mjs`؛ هذا التقرير؛ تحديث `CODEX_HANDOFF.md`.
- التحقق: أداة DB مكتملة بلا فشل، API Integration **18/18**، Shared **21/21**، Root Typecheck **نجح**، Root Build **نجح** (27/27 routes)، و`node --check` **نجح**. لم يُشغّل كامل API/Web/Browser E2E لأن Runtime والواجهة لم يتغيرا. أُوقف خادم PostgreSQL المؤقت بعد الاختبارات. لا قاعدة حقيقية أو `.env` حقيقية أو Migration/Backfill/Deployment.
- Commit مستقل لهذه الملفات فقط. لا يمكن تضمين Hash الالتزام نفسه داخل الملف دون تغيير Hash؛ سيُذكر Hash النهائي في رد التسليم، ويمكن قراءته بـ`git log -1 --format=%H`. حالة Git النهائية تُراجع بعد Commit.

**نقطة التوقف:** Stage 6D.3C3E فقط. لا يبدأ 6D.3C3F أو أي Migration تشغيلية دون موافقة جديدة.
