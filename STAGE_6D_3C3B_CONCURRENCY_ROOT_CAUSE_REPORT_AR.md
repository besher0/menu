# OrderSawa — تقرير Stage 6D.3C3B: تشخيص تعارضات إنشاء Network Orders

## 1. Results Summary

**السبب المثبت في قاعدة الاختبار:** داخل `Serializable`، يفحص `NetworkOrdersService.create` غياب مفتاح `(restaurantId,idempotencyKey)` ثم غياب `(restaurantId,acceptanceTokenHash)` قبل إدراج Order. قراءات الغياب تضع PostgreSQL `SIReadLock`/predicate locks على فهارس Order، ثم تتقاطع إدراجات المعاملات المتزامنة، حتى عندما تكون المفاتيح مختلفة. يُجهض PostgreSQL بعض المعاملات بـSQLSTATE `40001`؛ يراها Prisma `P2034`. بعد محاولات `runSerializable` الثلاث تُرجع خدمة Create HTTP 409 `NETWORK_ORDER_CONCURRENT_UPDATE`، لا Order خاطئًا.

هذا ليس استنتاجًا من الترابط فقط: في تجربة Serializable منفصلة **بلا تحميل Catalog، بلا Product `FOR SHARE`، وبلا Shared Engine**، نجح إدراج Order مباشرة 25/25، ونجحت قراءتا الغياب دون كتابة 25/25، لكن قراءة الغياب ثم الإدراج أجهضت **22/25** بـ`P2034`. فحص أيٍّ من الفهرسين وحده ثم الإدراج أجهض **22/25** أو **21/25**. أظهر `pg_locks` قفل `SIReadLock` بمستوى relation على فهرس `Order_restaurantId_acceptanceTokenHash_key` أثناء قراءة مفتاح مفقود. لذلك فالتحميل/قفل Product ليسا سببًا *لازمًا* لارتفاع 409، وإن كانت مدة المعاملة التي يضيفانها قد تزيد فرصة التداخل ولم تُعزل كميًا هنا.

لم يُرصد خطأ إجمالي موثوق، Order مكرر، Snapshot ناقصة في الطلبات المقاسة، تسرب مطاعم، أو قبول Revision قديم. النتائج محلية ومحدودة وليست SLA. **لم يُعدّل مسار التشغيل أو استراتيجية المعاملات أو الفهارس.**

## 2. Reproduction Method والنطاق

- البداية: branch `feature/product-configuration-network`، Git نظيف، وCommit Stage 6D.3C3 محفوظ `6fff6a5`. قُرئ `CODEX_HANDOFF.md` وتقريرا Stage 6D.3C3 وStage 6D.3B وسجل قرارات المؤسس الحالي وقواعد التعارض. روجع التنفيذ الفعلي في `network-orders.service.ts` و`network-order-contract.ts` وQuote/Resolver وShared Engine وPrisma Schema.
- PostgreSQL `16.15` **جديدة** داخل `../work/stage6d3c3b-postgres-data` على `127.0.0.1:55440`، قاعدة اختبار محصورة `ordersawa_stage3_stage6c_stage6d3c3_bench`. طُبّق Baseline الاختباري وStage 6C SQL عليها فقط. أُعيد إنشاء هذه القاعدة المؤقتة بين الجولات بعد فحص اسمها وعدم وجود اتصالات. لا `.env` حقيقي، ولا قاعدة قائمة أو Production. أُوقف الخادم المؤقت بعد التشخيص. سجلات PostgreSQL محلية خارج Git وتضم Fixtures صناعية فقط.
- وُسعت **أداة المرحلة السابقة نفسها** `scripts/stage6d3c3-benchmark.mjs` بوضعَي `STAGE6D3C3_DIAG=1` لموجات HTTP و`STAGE6D3C3_DIAG=probe` لتجارب عزل SQL على قاعدة جديدة فارغة. الحراسة الأصلية ترفض Production، Flag الغائب، قاعدة غير مطابقة، أو قاعدة تحوي Restaurant سابقًا. الاختبارات الثقيلة يدوية فقط.
- شغلت الأداة Controllers/Services الحالية عبر Nest HTTP loopback. لكل Create تحضّر Acceptance Token خارج نافذة القياس، بمفتاح idempotency فريد لكل طلب عادي. قيست 1/5/10/25 طلبًا عند كتالوج 100 و1,000 لكل مطعم، مع warm-up مستقل. خمسة مطاعم في سيناريو التوزيع؛ عند التزامن 25 توجد خمسة طلبات لكل مطعم، وعند 5 طلبات يوجد طلب واحد لكل مطعم. اختُبرت نفس Pizza، 25 Product مختلفًا في المطعم، ثلاثة اختيارات أحجام مختلفة للصنف نفسه، ومطاعم مختلفة. لم تُكرر جولة 10,000.
- جميع النسب أدناه من جولة تشخيص واحدة لكل حالة، وليست تقديرًا احتماليًا مستقراً. مقياس `P2034` يعد **محاولات معاملة** فاشلة، وHTTP 409 يعد **طلبات** استنفدت إعادة المحاولة؛ لا تجمعهما كنسبة واحدة.

## 3. Conflict Classification — HTTP الفعلي

كل موجات Prepare أدناه نجحت كاملة، دون `P2034` أو HTTP 409. Create استعملت القفل والتسعير والحفظ الفعليين. الجدول يعرض `نجاح/409`، ومعه عدد محاولات `P2034` داخل Create بين قوسين.

| Products لكل مطعم | النمط | 1 | 5 | 10 | 25 |
|---:|---|---:|---:|---:|---:|
| 100 | نفس المنتج/الاختيار | 1/0 (0) | 3/2 (9) | 3/7 (23) | 8/17 (58) |
| 100 | منتجات مختلفة | 1/0 (0) | 3/2 (9) | 3/7 (23) | 8/17 (58) |
| 100 | اختيارات أحجام مختلفة | 1/0 (0) | 3/2 (9) | 3/7 (23) | 8/17 (58) |
| 100 | خمسة مطاعم | 1/0 (0) | 3/2 (9) | 5/5 (20) | 16/9 (40) |
| 1,000 | نفس المنتج/الاختيار | 1/0 (0) | 5/0 (5) | 7/3 (14) | 17/8 (36) |
| 1,000 | منتجات مختلفة | 1/0 (0) | 5/0 (4) | 9/1 (12) | 18/7 (35) |
| 1,000 | اختيارات أحجام مختلفة | 1/0 (0) | 5/0 (1) | 9/1 (9) | 20/5 (28) |
| 1,000 | خمسة مطاعم | 1/0 (0) | 5/0 (4) | 7/3 (12) | 16/9 (41) |

عند 100 منتج/25 Create للصنف نفسه: وسيط HTTP **399.17 ms** وP95 **475.19 ms**؛ متوسط المحاولات **2.64** وPeak connections **10**. Prepare لنفس الحجم/التزامن: وسيط **114.16 ms** و0 تعارض. عند 1,000/25: Create وسيط **784.17 ms** وP95 **941.53 ms**، وPrepare وسيط **196.21 ms** بلا تعارض؛ Peak connections **18**. هذه مدد محلية مع إعادة محاولات. عدم ازدياد نسبة 409 رتيبًا من 100 إلى 1,000 يُظهر تأثير الجدولة والتوقيت؛ لا يصح استنتاج أن كتالوجًا أكبر يخفض التعارض.

في موجة 100/25 Create للصنف نفسه، سجّل الالتقاط **58 `P2034`**: ‏33 قبل نهاية callback و25 عند/بعد رجوع callback (غالبها أثناء إنهاء المعاملة). هذا يوافق سجلات PostgreSQL التي أظهرت `40001` على `INSERT Order` و`INSERT OrderItem` وبعض قراءات/تحديثات Order و`COMMIT`. لم يُرصد `P2010` أو `40P01` في عدادات هذه الموجات؛ دعم الخدمة لهذه الرموز يبقى قائمًا. لم تُرصد `P2002`/`23505` مع المفاتيح الفريدة المختلفة في التجارب الموجهة؛ الرفض المقاس ليس تصادم Unique فعليًا. `pg_stat_activity` لم يرصد انتظار Lock في موجات HTTP العادية بعينة 25 ms؛ هذا **لا** ينفي الانتظار القصير. اختبار Stage 6D.3C3 المنفصل أثبت أن Product `FOR SHARE` يؤخر كاتبًا غير مرتبط عند إبقاء القفل مفتوحًا.

## 4. PostgreSQL Evidence وتجربة العزل

الفهارس الحقيقية في القاعدة المؤقتة تشمل:

- `Order_restaurantId_idempotencyKey_key` — unique btree على `(restaurantId,idempotencyKey)`.
- `Order_restaurantId_acceptanceTokenHash_key` — unique btree على `(restaurantId,acceptanceTokenHash)`.

أظهر `EXPLAIN` استخدام كل فهرس لاستعلام غياب المفتاح المقابل. أثناء Transaction Serializable قرأت مفتاحًا مفقودًا في كل منهما ثم أُبقيت المعاملة مفتوحة لفحص `pg_locks` من اتصال آخر؛ رُصد `SIReadLock` من نوع `relation` على فهرس acceptance-token. هذا شاهد مباشر على predicate read footprint في هذه القاعدة الصغيرة؛ لا يثبت أن قفل relation هو دائمًا مستوى القفل في كل حجم بيانات أو خطة تنفيذ.

تجارب عزل 25 معاملة Serializable متزامنة، بمفاتيح مختلفة، **دون استخدام Service أو Product Catalog**. تنشئ صفوفًا صناعية `source=DIAGNOSTIC` في القاعدة المؤقتة فقط؛ لا تدّعي أنها طلبات Network صالحة ولا تدخل في عدّ Orders المختومة:

| عملية التشخيص | نجاح | `P2034` | الدلالة |
|---|---:|---:|---|
| قراءة غياب المفتاحين دون كتابة | 25 | 0 | القراءة وحدها لا تُجهض هنا |
| Order INSERT دون فحص سابق | 25 | 0 | الإدراج وحده لا يفسر معدل الفشل |
| فحص غياب idempotency ثم Order INSERT | 3 | 22 | هذا المسار كافٍ لإعادة إنتاج SSI |
| فحص غياب acceptance token ثم Order INSERT | 4 | 21 | هذا المسار كافٍ أيضًا |
| فحص المفتاحين ثم Order INSERT | 3 | 22 | يطابق نمط القراءة/الكتابة في Create جزئيًا |
| Order + OrderItem INSERT دون فحص | 25 | 0 | OrderItem ليس شرطًا لازمًا في هذه Fixture |
| فحص المفتاحين ثم Order + OrderItem | 3 | 22 | إضافة OrderItem لم تغير النتيجة في الجولة |

عند توزيع تجربة «الفحصين ثم الإدراج» على **خمسة مطاعم**، أُجهض 4/5 عند طلب واحد لكل مطعم، و22/25 عند خمسة طلبات لكل مطعم. هذا يثبت أن اختلاف `restaurantId` لا يزيل تعارض SSI في هذه القاعدة الصغيرة؛ لا يعني تسرب بيانات أو تداخل مفاتيح المطاعم. Relation-level predicate lock على فهرس مشترك تفسير متوافق مع الشاهد، لكن لم تُعزل كل internal rw-dependency في PostgreSQL transaction graph؛ لا ننسب كل Abort إلى فهرس بعينه.

## 5. الأسباب المثبتة والفرضيات غير المثبتة

| فرضية | التصنيف | الدليل والحد |
|---|---|---|
| A — قراءة Catalog كامل | **ليست شرطًا لازمًا**؛ عامل مدة محتمل | Probe بلا Catalog أعاد `P2034` بكثافة؛ لم تُقَس مساهمة زمن Catalog السببية في نسبة 409 بتجربة A/B مكافئة آمنة. |
| B — قفل كل Product rows | **ليس شرطًا لازمًا**؛ أثر آخر مثبت | Probe بلا Product `FOR SHARE` أعاد التعارض. Stage 6D.3C3 أثبت حجب كاتب Product B غير المرتبط. لا يجوز إزالة القفل استنادًا إلى ذلك. |
| C — Order/OrderItem writes | **Order INSERT جزء لازم في Probe**؛ OrderItem غير لازم | read-only 25/25 وOrder-only 25/25؛ read-before-Order 3/25. OrderItem لا يغير النتيجة في العينة. لا نستنتج أن كل Write آخر عديم الأثر. |
| D — Serializable والفهارس | **سبب رئيسي مثبت محليًا** | استعلامات الغياب على unique btree، `SIReadLock` مرصود، `40001`/`P2034`، وAbort عند read-before-insert؛ `40P01` غير مرصود. |
| E — Idempotency/Token | **existence probes تسهم**؛ Unique violation غير مثبت | فحص كل مفتاح منفردًا يعيد التعارض، رغم فريدة المفاتيح. إعادة نفس المفتاح تُعيد نفس Order؛ Token مستعمل بمفتاح آخر يُرفض عمدًا. |
| F — Connection Pool والتوقيت | **عامل غير معزول** | التعارض ظهر عند 5 اتصالات تقريبًا؛ Pool ليس شرطًا وحيدًا. تغيّر حجم الكتالوج والجدولة غيّر نسبة الرفض غير رتيبًا؛ لم تُجرَ تجربة تغيير pool size لضبط السبب. |

**الخلاصة السببية المقيدة:** صيغة read-before-write على فهارس Order تحت SSI كافية لإنتاج نوع التعارض المقاس، بل مع مطاعم مختلفة، وهي أقوى تفسير مثبت لموجات Create. لا نعرف نسبة كل نقطة فشل داخل Graph الحقيقي في كل حمل؛ الإنتاج لديه أيضًا قراءة Catalog وقفل Product وكتابة Snapshot/OrderItem. لذلك لا نقول إن index وحده يفسر *كل* 409، ولا ندعي أن حذف أي خطوة آمن.

## 6. Correctness Results

- كل استجابة Create ناجحة في موجات HTTP طابقت Decimal-string trusted total المتوقع. تحققت الأداة من زيادة عدد `NETWORK_TEST` Orders بعد كل موجة بمقدار النجاحات فقط، تفرّد Order IDs، `Order.totalAmount` و`cartSnapshot.totalAmount`، ختم Snapshot، وعدد OrderItems. 409 لا تحمل Order ID. احتفظت Fixtures Linked/Combo في أداة المرحلة السابقة بفحص instances مستقل؛ موجة التشخيص هذه ركزت على Pizza وأسعار الأحجام المختلفة.
- اختلاف Product في المطعم نفسه واختلاف Size Selection حُسب كل منهما بإجمالي خاص لكل طلب، ولم يظهر cross-pricing أو fallback. Quote منتج مطعم آخر أعاد 404؛ اختيار Revision غير حالي في Prepare أعاد 409. الاستجابات الناجحة أبقت `orderingEnabled:false`.
- إعادة إرسال طلب مكتمل بنفس مفتاح idempotency أعادت HTTP 201 مع `replayed:true` ونفس Order ID؛ طلبان متزامنان بنفس المفتاح أعادا 201/201 للـOrder نفسه في الجولة، وإعادة لاحقة أعادت replay، والزيادة في Orders كانت 1. إعادة استخدام Acceptance Token نفسها **بمفتاح مختلف** أعادت `ACCEPTANCE_TOKEN_ALREADY_USED` 409.
- بعد تحضير Draft، غُيّر سعر Size وRevision في القاعدة المؤقتة، ثم استُخدمت Acceptance Token القديمة: HTTP 409 `CONFIGURATION_REVISION_CHANGED`، و**0** Orders جديدة. لم تُجرَ طفرة السعر هذه داخل موجة 25 متزامنة؛ يبقى اختبار سباق تحديث Product/Capability المباشر عند حمل 25 معزولًا ناقصًا، مع تغطية وظيفية سابقة في Stage 6C.
- لم نثبت سلامة كل حالات السباق أو بيانات Production من اختبار محدود. لا يُعد انخفاض 409 المحتمل في أي Probe ترخيصًا بإضعاف Validation أو Snapshot immutability.

## 7. Recommended Fixes — تصميم فقط، لا تنفيذ

| أولوية | فكرة تحتاج تصميم/موافقة واختبارًا | الأثر المتوقع | صعوبة/خطر |
|---|---|---|---|
| P1 | إعادة تصميم فحص idempotency وsingle-use Acceptance ليعتمد على claim/write ذري وفهارس Unique، مع قراءة ما بعد التعارض واستعادة الرد الموثوق، **دون إسقاط requestHash أو ربط Token بالـDraft أو القيد داخل المعاملة** | قد يقلل predicate read-before-insert و409؛ هذا استنتاج يحتاج A/B | عالٍ؛ خطر replay/duplicate/تجاوز قبول العميل إن أخطئ. يلزم برهان SQL/HTTP تحت Serializable ومع تحديث السعر. |
| P1 | اختبار بدائل آمنة محدودة لفصل فحص المفتاحين/مسار replay عن نافذة التسعير والكتابة، دون TOCTOU أو إنشاء Order قبل إعادة التحقق | يحصر مصدر SSI ويخفف التداخل نظريًا | عالٍ؛ يستلزم حفظ Atomicity وIdempotency وSnapshot sealing. لا يُنفذ بقرار benchmark وحده. |
| P2 | Backoff محدود مع jitter عند `40001`، أو سياسة UX واضحة لإعادة تقديم 409 بقبول جديد عند الحاجة | قد يقلل استنفاد المحاولات عند دفعات متزامنة | متوسط؛ يزيد latency/الحمل، ولا يعالج السبب الجذري؛ لا يجوز إعادة قبول سعر تغيّر تلقائيًا. |
| P2 | Dependency Closure Loading/Locking بدل Full Catalog بعد برهان التكافؤ | يقلل زمن Quote/Prepare واحتجاز Product B، وربما نافذة تعارض Create | عالٍ؛ **لن يحل بالضرورة SSI على Order indexes**. يجب حفظ cycles، SAME-tenant/Outlet effective source، ORIGINAL/CUSTOM، Capability، Serializable consistency، وحدود Shared Engine. |
| P3 | دراسة scope/index/predicate-lock footprint أو partitioning مستقبلًا عند تصميم Business Catalog + Outlet Layer | قد يخفف تضارب مطاعم مختلفة عند حجم أكبر | عالٍ جدًا ومهاجر؛ لا تُغيَّر الفهارس أو Migration History هنا. اختبر على بيانات اصطناعية متعددة الأحجام أولًا. |

لا توصية بإزالة `FOR SHARE` أو تخفيف `Serializable` أو حذف فحص Single-use مباشرةً. أي حل يجب أن يثبت **صحة السعر والنسخة والـTenant وIdempotency والـSnapshot**، لا انخفاض 409 فقط. أصغر تجربة إضافية قبل اختيار تصميم P1: نسخة SQL اختبارية في disposable فقط تقارن claim/write ذريًا مع read-before-insert تحت 5/10/25 وبنفس فهارس Order، مع تدوير تغيير السعر وToken replay؛ لا تعديل للإنتاج دون موافقة.

## 8. Remaining Performance Risks والتغطية

لم يُعد قياس 10,000؛ مرحلة C3 أثبتت نمو Quote/Prepare واحتجاز Product B. لم تُختبر 25×10,000 أو أسوأ عمق Linked/Nested أو Multi-instance Backend أو CPU/IO أو اختلاف حجم/تجزؤ فهارس Order على المدى الطويل. قفل `FOR SHARE` لجميع Product rows ما زال يؤخر تعديل B. تحميل Catalog كامل لكل Quote/Prepare ما زال مكلفًا. `DashboardService.ensureAllCategory`، خطآ TypeScript القديمان في مصادر الاختبارات، وكل موانع Production من Stage 6D.3B (المالية، Auth/Rate/HMAC، Migration History، Business/Outlet، WhatsApp وغيرها) ما زالت مفتوحة. `orderingEnabled:false` باقٍ.

## 9. Tests وGit Status

نجحت جولتا HTTP/SQL التشخيصيتان على PostgreSQL المؤقتة (الملخصات أعلاه، `stopped:null`)، مع إعادة جولة probe بعد إضافة فحص Acceptance/Idempotency. نجح `node --check` للأداة، Shared **21/21**، API Quote/Resolver/Order Contract الموجهة **16/16**، وRoot Typecheck. لم تُشغّل Full API/Web suites أو Browser E2E أو Root Build: لا تغيير في Product runtime، والأداة اليدوية تستخدم Build Stage 6D.3C3 الحالي. لم تُجرَ Migration أو Backfill على قاعدة حقيقية، ولم يحدث Deployment أو WhatsApp send.

ملفات هذه المرحلة فقط: تعديل أداة `scripts/stage6d3c3-benchmark.mjs`، هذا التقرير، و`CODEX_HANDOFF.md`. لا تغييرات في `apps/` أو `packages/` أو Prisma/SQL. حالة Git قبل الحفظ: الفرع `feature/product-configuration-network`، Parent `6fff6a5`؛ بعد الحفظ يُتحقق من Hash عبر `git log -1 --oneline` ويُذكر في التسليم النهائي (لا يمكن كتابة Hash الملف داخل Commit نفسه دون تغيير Hash). خادم PostgreSQL المؤقت متوقف وبياناته الصناعية خارج Git. **توقف بعد Stage 6D.3C3B؛ لا تحسينات دون موافقة مستقلة.**
