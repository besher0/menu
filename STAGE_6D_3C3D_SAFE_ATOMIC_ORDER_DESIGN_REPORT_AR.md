# OrderSawa — تقرير Stage 6D.3C3D: تصميم إنشاء طلب ذري وآمن

## 1. الخلاصة وحدود النتيجة

**النتيجة التصميمية: ترشيح Design A للتنفيذ المستقبلي المشروط، ورفض نقل PoC السابق `POC_PENDING` إلى التطبيق.** يبدأ A بالتحقق من Draft والتوقيع داخل معاملة `Serializable`، ثم يُدرج Order تحتوي Snapshot كاملة، تليها OrderItems والختم داخل المعاملة نفسها، من دون استعلامي «عدم وجود المفتاح» قبل الإدراج. لا يحتاج A جدول Claim جديدًا. يلزمه **قيد اكتمال مؤجّل على مستوى PostgreSQL** قبل أي اعتماد تشغيلي، إلى جانب تحقق الخادم الحالي من السعر وRevision والتوافر والـCapability وتوقيع Acceptance. أثبتت التجربة أن القيد التجريبي يرفض Commit غير مكتمل؛ ولم تُنفّذ Migration تشغيلية أو تعديل Runtime.

هذه نتيجة PoC محلية، **وليست موافقة إطلاق** أو إثباتًا لسياسة إنتاجية مكتملة. `orderingEnabled:false` بقي كما هو. لا تستخدم النتائج بوصفها Production SLA أو بديلًا عن مراجعة Migration History وقرارات المؤسس المعلقة.

## 2. المراجع والفحص الفعلي

- الفرع: `feature/product-configuration-network`؛ شجرة Git كانت نظيفة قبل بدء العمل؛ Commit المرحلة السابقة `0d71615 poc(network): evaluate atomic order idempotency claims`.
- قُرئت `CODEX_HANDOFF.md`، وتقارير 6D.3C3C و6D.3C3B و6D.3C3، و`../work/product-network-pack/OrderSawa_Product_Network_Codex_Pack/AUTHORITATIVE_RULES/LATEST_FOUNDER_DECISION_LEDGER_V2_CURRENT.md` و`CURRENT_SUPERSESSION_AND_CONFLICT_RULES.md`.
- فُحصت الشيفرة الفعلية في `apps/api/src/modules/orders/network-orders.service.ts` و`network-order-contract.ts`، وعقود Shared وCatalog Resolver، و`apps/api/prisma/schema.prisma` و`apps/api/prisma/migrations/20261013000000_network_order_test_snapshot/migration.sql`.
- القواعد المرجعية: `configurationTree` مصدر التكوين القانوني، Sizes ذات أسعار كاملة، أصل السعر `null` ليس صفرًا، Linked ORIGINAL/CUSTOM، إعادة قبول العميل بعد تغير مؤثر، Snapshot نهائية غير قابلة للتعديل، وفقد Capability لا يغيّر البيانات. لم تُنفذ Business Catalog + Outlet Layer هنا.

## 3. Design A — Complete Order Insert Without Pre-Read

1. داخل `Serializable` نفسه: `lockRestaurant`، و`lockCatalog` الحالي مع `FOR SHARE`، و`buildDraft` الحالي المبني على Shared Engine، ثم التحقق من HMAC Acceptance وربطها بـRestaurant وDraft الحاليين. لا يُعتمد سعر أو Total من العميل.
2. بعد نجاح التحقق فقط: إدراج Order كاملة الحقول، بما فيها `requestHash` و`acceptanceTokenHash` و`idempotencyKey` وSnapshot التاريخية الدقيقة، باستعمال الفهرسين الفريدين الحاليين. لا يوجد `POC_PENDING` أو «حجز» Order ناقصة قبل التحقق.
3. إدراج كل OrderItems من Draft الموثوقة، ثم ختم Order داخل المعاملة نفسها. تجربة SQL أثبتت أن Triggers Stage 6C الحالية تسمح بهذا الترتيب: الإدراج قبل الختم، ثم منع تعديل Snapshot أو إدراج Items بعد الختم.
4. يتطلب الاعتماد المستقبلي قيد PostgreSQL مؤجّلًا يفحص عند Commit الختم، ظرف Snapshot، عدد Items، مجموعها الدقيق، ومطابقة `OrderItem.options` لمصفوفة `cartSnapshot.items`. ملف SQL المرفق نموذج تجريبي **فقط**.
5. بعد `P2002`/تعارض Serializable أو نتيجة Commit غير مؤكدة، يُجرى استعلام **داخل معاملة جديدة** وبنطاق Restaurant المستمد من slug الموثوق، لا من معرف العميل. لا تُعاد Order قديمة إلا إذا طابقت `restaurantId` و`idempotencyKey` و`requestHash` و`acceptanceTokenHash` و`source=NETWORK_TEST` والختم؛ وإلا 409. الاسترجاع بعد Commit ناجح لا يعيد التسعير التاريخي. إنشاء Order جديدة يعيد التحقق دائمًا.

لوحظ في اختبار سلبي أن Prisma interactive `$transaction` قد تعيد قيمة callback رغم تراجع PostgreSQL عند فشل Deferred Constraint وقت Commit. لذلك استخدم PoC `SET CONSTRAINTS ALL IMMEDIATE` في نهاية callback كي يظهر فشل القيد قبل اكتمالها، ثم قراءة مستقلة مؤكدة للـOrder المختومة قبل إرسال 201. هذه **ملاحظة تنفيذية واجبة الفحص مع إصدار Prisma الفعلي** في مرحلة التنفيذ؛ لا يُستنتج من انتهاء callback وحده أن Commit نجح.

## 4. Design B — Separate Atomic Claim Table

جرّبنا جدولًا منفصلًا `PoCOrderClaim` يحجز `(restaurantId,idempotencyKey)` و`(restaurantId,acceptanceTokenHash)` بفهرسين فريدين، ويحتفظ بـ`requestHash` وربط فريد بـ`orderId`. `INSERT ... ON CONFLICT DO NOTHING` لا يحل `Serializable` تلقائيًا: سُجلت `P2010:40001` و`P2034` أثناء ضغط التجربة. بعد تجهيز Order والختم، يُربط Claim بها قبل نهاية المعاملة.

لإبطال «Claim ملتزمة بلا Order»، أضافت التجربة **داخل قاعدة B المؤقتة فقط** Deferred Constraint Triggers ثنائية الاتجاه: Claim يجب أن تشير إلى Order مختومة مطابقة لكل المفاتيح، وكل Order تجريبية يجب أن تكون لها Claim مطابقة. كما يمنع Trigger تغيير هوية Claim أو حذفها. رُفض Commit لـClaim وحدها، وOrder بلا Claim، وربط Claim بـOrder غير مطابقة. إذن B قابل للحماية بنيويًا، لكنه يحتاج جدولًا وفهارس وTriggers إضافية، وله حالات استرجاع أكثر تعقيدًا، وأظهر Retries أكثر من A في التجربة النهائية. لا يُوصى به ما لم يظهر عيب مستقل في A.

## 5. ضمانات قاعدة البيانات مقابل ضمانات التطبيق

| الثابت | ما أثبته SQL التجريبي | ما يبقى على التطبيق |
|---|---|---|
| Order ناقصة أو `POC_PENDING` | القيد التجريبي يرفض Network Order بلا ختم/Snapshot/Items؛ A لا يدرج حالة Pending أصلًا | عدم تجاوز ترتيب التحقق والإنشاء |
| تكرار Idempotency أو Token | الفهارس الفريدة الحالية تمنع صفين بالمفتاح نفسه داخل المطعم | ربط المفتاح بـ`requestHash`، وتحديد Replay مقابل 409 دون كشف بيانات مطعم آخر |
| سلامة Snapshot المالية والبنيوية | فحص Total وCurrency وItems والحقول والأسعار الدقيقة وتطابق نسخة Items التاريخية | لا تستطيع القاعدة إثبات أن السعر ناتج من Shared Engine أو أن اختيارًا صالحًا دون إعادة حساب دلالية |
| Acceptance Token | تخزين Hash وفردانية الاستخدام فقط | التحقق من HMAC والـDraft الحالي وRestaurant والـRevision داخل `Serializable`؛ لا يوجد إثبات HMAC بقاعدة البيانات |
| Claim في B | قيد مؤجّل ثنائي الاتجاه يمنع Claim يتيمة أو Order بلا Claim | فحص Payload واسترجاع النتيجة الموثوقة بعد Conflict |
| Tenant Isolation | المفاتيح والفهارس والنطاق مرتبطة بـRestaurant | استنتاج Tenant من سياق موثوق، وتقييد كل قراءة Replay وفحص Linked Sources |

**مهم:** يمكن لكاتب قاعدة بيانات ذي صلاحية كافية إنشاء Snapshot مزورة لكنها متسقة حسابيًا وبنيويًا؛ لا توجد DB Constraint تُثبت دلالة Shared Engine أو توقيع القبول. السلامة الكاملة مركبة من DB invariants وتحقق تطبيق داخل المعاملة. لا ندّعي ضمان DB لما لا تختبره القيود.

## 6. بيئة التجربة والمنهج

- PostgreSQL **16.15** جديد عند `127.0.0.1:55440`، بمجلد بيانات `../work/stage6d3c3d-postgres-data` وقاعدتين فارغتين مستقلتين، تنتهيان `_a` و`_b`. تتحقق الأداتان من اسم القاعدة والعنوان والمنفذ والوضع غير Production و`ENABLE_DISPOSABLE_NETWORK_ORDERS=1` ومن فراغ القاعدتين قبل زرع Fixtures. لا تقرأ `.env` الحقيقي.
- طُبّق Baseline SQL الاختباري وSQL Stage 6C على هاتين القاعدتين فقط، ثم `scripts/stage6d3c3d-disposable-invariants.sql` التجريبية خارجة عن Migration History. لا `migrate deploy` أو `db push` على قاعدة موجودة.
- أنشأ ملف DDL المشترك جدول Claim التجريبي فارغًا حتى في قاعدة A لأجل تعريف Row Type للدالة؛ **لم يستخدم A الجدول ولم تُركب عليه Triggers الخاصة بـB**. تصميم A المقترح لا يتطلب هذا الجدول مستقبلًا.
- أداة `scripts/stage6d3c3d-safe-order-poc.mjs` تستعمل NetworkOrdersService الفعلية لـ`lockRestaurant` و`lockCatalog` و`buildDraft`، والعقد والتوقيع الفعليين؛ المقارنة الحالية عبر Nest HTTP، وA/B عبر خادم HTTP محلي مستقل. **Latency بين Nest والـPoC ليست مقارنة عادلة لإنتاج.** جهزت Fixtures وPrepare خارج موجات Create المقيسة. نُفذت موجتان لكل حجم 1/5/10/25 مع المفاتيح المختلفة، في مطعم واحد ثم خمسة مطاعم، بالإضافة إلى موجات Duplicate.
- لم يُنشأ Pricing Engine بديل. لم يتغير `apps/` أو `packages/` أو `schema.prisma` أو Migration تشغيلية.

## 7. اختبارات Commit السلبية وسلامة التسعير

في كل من A وB: رفض القيد أو تراجعت المعاملة عند Order مختومة بلا Snapshot، Snapshot بلا Items، اختلاف Total، اختلاف محتوى Item عن Snapshot، الخروج المبكر بعد Order وقبل Items، فشل إدراج Item، والخروج قبل الختم. اختُبرت إعادة المحاولة بعد Timeout قبل Commit، وإعادة الطلب بعد نجاح Commit وفقد الاستجابة. وفي B كذلك رُفض Commit لـClaim فقط، والخروج قبل ربط Claim، وClaim تشير إلى Order غير مطابقة، وOrder مكتملة بلا Claim. فحصت الأداة عدد Orders/Claims قبل كل محاولة فاشلة وبعدها: **صفر صفوف جزئية ملتزمة وصفر Claims معلقة**. التحقق النهائي المقروء من القاعدتين وجد 0 Order تجريبية غير مختومة؛ A فيها 0 Claim وB فيها 0 Claim بلا `orderId`.

أنتج Shared Engine الفعلي Pizza بالحجم والإضافات المتداخلة وIncluded Quantity بسعر دقيق `265.000004 EGP`، وCombo بثلاث نسخ Linked مستقلة (ORIGINAL مرتان باختيارين مختلفين، CUSTOM مرة) بسعر `43 EGP`. في A وB: تغيّر السعر/Revision بعد Prepare رفض Acceptance القديمة، وتغيّر Availability رفض الطلب، وفقد Capability أعاد 403، وTenant آخر أعاد 404، وتوقيع مفبرك رفض 409. نجح Replay بعد تغيّر المنيو التاريخية **لنفس Order المختومة وSnapshot الأصلية**. لم يحدث تقريب أو تحويل مالي بـfloating-point في التسعير.

## 8. نتائج التزامن — قياسات مباشرة

الجدول الآتي مجموع **موجتين** لكل حجم ولكل توزيع؛ الخانة «Order جديدة / HTTP 409»، وRetries محاولات PoC الداخلية فقط (لا يوفر Current عدادًا مماثلًا). الـ`409` في موجات المفاتيح المختلفة تعارضات تقنية، لا رفض Payload مقصود.

| Concurrent | المطعم الواحد: Current | A | B | خمسة مطاعم: Current | A | B |
|---:|---:|---:|---:|---:|---:|---:|
| 1 | 2 / 0 | 2 / 0، 0 Retry | 2 / 0، 0 Retry | 2 / 0 | 2 / 0، 0 Retry | 2 / 0، 0 Retry |
| 5 | 6 / 4 | 10 / 0، 1 Retry | 10 / 0، 3 Retries | 6 / 4 | 10 / 0، 0 Retry | 10 / 0، 2 Retries |
| 10 | 6 / 14 | 20 / 0، 0 Retry | 20 / 0، 7 Retries | 7 / 13 | 20 / 0، 0 Retry | 20 / 0، 14 Retries |
| 25 | 25 / 25 | 50 / 0، 0 Retry | 50 / 0، 26 Retries | 19 / 31 | 50 / 0، 3 Retries | 50 / 0، 17 Retries |

في موجات 5/10/25 مع **المفتاح نفسه وPayload نفسها**: طلب جديد واحد والباقي Replay لنفس Order، بلا 409. مع **المفتاح نفسه وPayload مختلفة**: Order واحدة والباقي 409. ومع **Token نفسها ومفاتيح مختلفة**: Order واحدة والباقي 409. ينطبق ذلك على A وB؛ فُحصت أعداد الصفوف والـSnapshot والـTrusted Total بعد كل موجة. كان إجمالي المقارنة **72 موجة HTTP**، منها 48 للمفاتيح المختلفة و24 للتكرار، بجانب SQL probe منفصل من 50 عملية. الموجة السابقة قبل تشديد قيد مطابقة Items أظهرت تذبذبًا أكبر لـB عند 25؛ لا نستنتج تفوقًا مطلقًا من تشغيل محلي واحد.

**SQL Probe منفصل عن HTTP:** read-before-insert نجح `12/25` وتعارض `13/25 P2034`، في مقابل insert-only نجح `25/25`. هذه تجربة تشخيصية تستخدم `source=DIAGNOSTIC` ولا تعادل طلبًا نهائيًا. في محاولة A النهائية رُصدت داخليًا `P2002` في موجات المفاتيح المتطابقة، و`P2010:40001` ثلاث مرات و`P2034` مرة؛ B سجّل `P2010:40001` 90 مرة و`P2034` 39 مرة عبر جميع موجاته، بما فيها موجات Duplicate؛ هذه **أعداد محاولات داخلية لا أعداد HTTP 409**. لم نرصد `40P01` في هذه التجارب، ولا نزعم تغطية Deadlock حقيقي. `P2010/40P01` يبقى ضمن تصنيف Retry المعتمد في Runtime؛ يلزمه اختبار fault injection مستقل إذا تغيّر Runtime.

## 9. قرار التصميم وتغييرات Schema اللازمة مستقبلًا

**A هو المرشح المشروط** لأنه لا يخزن Claim أو Pending قبل التحقق، ويحافظ على الفهارس الفريدة واستراتيجية `Serializable`/`FOR SHARE` الموجودة، ويحتاج تغيير DB أصغر: Deferred Completeness Constraint للـNetwork Order، مع اختبارات تحقق ضد كل أنماط الكتابة المسموحة. يجب صقل نموذج `scripts/stage6d3c3d-disposable-invariants.sql` قبل أي Migration رسمية، خصوصًا صلاحية JSON/Types، ترتيب Deferred Trigger و`SET CONSTRAINTS ALL IMMEDIATE`، أثر القيد على PostgreSQL/Prisma، وفحص الأداء والـLegacy. لا يُنقل SQL التجريبي كما هو إلى تاريخ Migrations. لا يتطلب A جدول Claim.

B ممكن نظريًا لكن يحتاج Claim table وفهرسين فريدين وربط Order ومجموعة Triggers تمنع Claim اليتيمة وOrder بلا Claim؛ هذا سطح أعطال أكبر ولم يثبت فائدة تقابل تعقيده. لا يُعتمد B افتراضيًا. التصميمان يحتاجان التحقق الدلالي الحالي من Shared Engine/HMAC داخل المعاملة؛ القيد البنيوي ليس بديلًا له.

## 10. مخاطر متبقية وخطوات صغيرة مقترحة — غير منفذة

1. **موافقة منفصلة:** صياغة قيد اكتمال production-grade ومراجعة Migration History الحقيقية قراءةً فقط بعد إذن قاعدة مستقل، ثم اختبار Migration/Rollback على PostgreSQL disposable. لا تغيير Schema موجودة الآن.
2. **موافقة منفصلة:** تطبيق A داخل `NetworkOrdersService.create` مع الحفاظ على توقيع القبول، Retry=3، Serializable و`FOR SHARE`، ثم اختبارات HTTP/DB لكل `P2002/P2034/P2010` وCommit غير المؤكد وReplay بعد Timeout. لا يُطبق تلقائيًا بناءً على هذا التقرير.
3. اختبارات مقارنة Production-like على قواعد مؤقتة تشمل 50 line، تعقيد Linked/Nested، تغير Capability/Availability أثناء المعاملة، تعدد نسخ التطبيق ومفاتيح HMAC، وأداء القيد المؤجّل. نتائج PoC الخفيف ليست ضمان Latency، و25-way/10k لم يُختبر هنا.
4. تبقى جميع موانع Stage 6D.3B: سياسة عرض/تقريب العملة، مصادقة وإذن Production، Rate Limits، HMAC مشترك وآمن، رقم الطلب التجاري، حقول الهاتف/الرسوم والضرائب والخصومات، Snapshot متعددة اللغات، Migration History، Business/Outlet/Service Mode/Schedule، وتدفق WhatsApp. تبقى كذلك `DashboardService.ensureAllCategory` وخطآ TypeScript القديمان خارج النطاق.

## 11. الملفات والتحقق وGit

- أضيف `scripts/stage6d3c3d-safe-order-poc.mjs` (أداة يدوية محروسة، بلا Runtime change).
- أضيف `scripts/stage6d3c3d-disposable-invariants.sql` (DDL تجريبي مقيّد باسم DB/host/port، خارج Migrations).
- أضيف هذا التقرير؛ حُدث `CODEX_HANDOFF.md`.
- نجح `node --check` للأداة. فُحص رفض التشغيل بلا URLs صريحة. اكتملت تجارب SQL وHTTP وCommit والتسعير والعزل المذكورة أعلاه على قاعدتين جديدتين؛ لم تُستخدم بيانات زبائن أو هواتف حقيقية.
- لم تُعد اختبارات Shared/API/Web العامة أو Typecheck/Build؛ لا توجد تعديلات Runtime، وطلب هذه المرحلة اختبارات PoC موجهة فقط. لا Browser E2E ولا Production DB.
- Commit هذا التقرير والأدوات مستقل عن Commit المرحلة السابقة. **لا يمكن تضمين Hash الالتزام الذي يحتوي هذا السطر داخل محتوى الالتزام نفسه دون تغيير Hash**؛ استخرج النهائي بـ`git log -1 --format=%H`، وتُذكر قيمته في التسليم النهائي للمستخدم. حالة Git النهائية تُراجع بعد الالتزام.

**التوقف:** لا تنفيذ للتصميم في التطبيق، لا Migration تشغيلية، لا تشغيل Network Ordering، لا Deployment أو WhatsApp. الانتقال لأي مهمة لاحقة يتطلب موافقة جديدة.
