# OrderSawa — تقرير Stage 6D.3B: تدقيق الأمان والأداء والجاهزية

التاريخ: 2026-10-13. النطاق: Product Configuration Network في الشيفرة الحالية فقط. الفرع: `feature/product-configuration-network`؛ نقطة البداية النظيفة `6b61506` بعد كود Stage 6D.3A في `2f1b18b`. **لم تُفعّل الطلبات الحقيقية؛ `orderingEnabled:false` باقٍ.** هذا تدقيق وليس اعتمادًا للإطلاق.

## 1. Executive Summary

- لم يثبت في الاختبارات الموجهة تجاوز للسعر الموثوق، أو إنشاء طلب مكرر، أو قراءة Snapshot من مطعم آخر، أو ثغرة بين إعادة التحقق والحفظ. هذا لا يثبت أمان نشر المسار التجريبي للعامة.
- ثبت عيب توافر في `PublicMenuService.ensureAllCategory`: أول طلبين متزامنين يسببان `P2002` لأحدهما، كما أن قسم `all` المحذوف منطقيًا يسبب الخطأ نفسه باستمرار. لم يُصلح سلوك Public Menu في مرحلة التدقيق.
- ثبت عيب موثوقية محدود: بعد ثلاث حالات `P2034` في `prepare` يخرج خطأ Prisma غير مترجم إلى HTTP 409 منظم. `create` يترجم الخطأ؛ لا يوجد دليل على حفظ طلب خاطئ بسبب ذلك.
- قياس محلي صغير/متوسط/كبير يؤكد نمو تكلفة قراءة وقفل الكتالوج كله. لا توجد بيانات Production أو اختبار ضغط متعدد العملاء، لذا لا يجوز اشتقاق SLA أو سعة إنتاجية من الأرقام.
- موانع الإطلاق الأساسية ما زالت: سياسة العملة، مفاتيح HMAC الإنتاجية، Auth/Rate Limits، هوية الطلب التجارية، بيانات الزبون، الفروع/السياق، Migration History، وآلية إرسال WhatsApp. لا يتجاوز أي منها هذا التقرير.

المراجع: `CODEX_HANDOFF.md`؛ تقارير Stage 6A/6B/6C/6D.3A؛ `AUTHORITATIVE_RULES/LATEST_FOUNDER_DECISION_LEDGER_V2_CURRENT.md` (الأقسام الحالية E–I وL–M)؛ `CURRENT_SUPERSESSION_AND_CONFLICT_RULES.md`. الأولوية للقواعد الحالية لا للنص التاريخي المتعارض. راجعت الشيفرة الفعلية في `apps/api/src/modules/{public-menu,orders}` و`apps/web/src/components/public` و`packages/shared/src/product-configuration`، لا التقارير وحدها.

## 2. Security Findings

| ID | الشدة / التصنيف | الدليل والحكم |
|---|---|---|
| S1 | HIGH — Demonstrated Risk / Production Blocker | `NetworkOrdersController` لا يفرض مصادقة إنتاجية؛ هذا مقصود **لمسارات الاختبار فقط**. الحواجز الحالية: loopback socket، `NODE_ENV` غير Production، flag صريح، والتحقق من اسم/عنوان/منفذ قاعدة PostgreSQL الفعلية في `NetworkOrdersService.assertDisposableOnly`. اختبارات Stage 6C الحالية ترفض غياب flag وProduction وغير-loopback/DB غير معزولة. يحظر إعادة استخدام endpoints التجريبية كواجهة إنتاجية. `preview` يحمل بيانات زبون لكنه محصور بهذه الحواجز ومقيد بـ`restaurantId`؛ اختبار مطعم آخر أعاد 404. |
| S2 | HIGH — Demonstrated Risk / Production Blocker | مفتاح HMAC يولد `randomBytes(32)` وقت تحميل `network-order-contract.ts`. الرمز يربط `restaurantId` وSHA-256 للـDraft وتنتهي صلاحيته بعد 10 دقائق، وتتحقق المقارنة توقيتيًا. لكن أي restart أو instance أخرى تملك مفتاحًا مختلفًا، فلا يصلح ذلك لتوزيع Production. يلزم تصميم secret مشترك، rotation ونسخ مفاتيح دون وضعه في Git. |
| S3 | MEDIUM — Demonstrated Risk | Quote عامة، وتحميلها لكل منتجات المطعم يضاعف كلفة الطلبات غير الموثقة. `main.ts` يضع حد body افتراضي 256 KB، وparser/Shared يحدان العمق والعقد والكميات، لكن `rateLimitMiddleware` يعتمد ذاكرة العملية ومفتاح IP عام للكتابة؛ لا يضع ميزانية تكلفة/مطعم/منتج، ولا يتشارك حالته بين instances. الخطر DoS/تنافس موارد قبل الإطلاق، لا استغلال مثبت هنا. |
| S4 | LOW — Verified Boundary | Network Cart تحفظ بياناتها في Local Storage غير الموثوق؛ نموذج الطلب يرسل `selection` والكمية فقط ولا يستخدم أسماءها أو أسعارها كسلطة. `productQuote` لا يقبل سوى `selection`، و`parsePublicQuoteSelection` يرفض حقول الأسعار المضافة في أي عمق. `parseNetworkOrderRequest` يرفض totals/prices المرسلة. `prepare/create` يعيدان تحميل السعر من Prisma ويستدعيان Shared Engine. الاختبارات الموجهة رفضت التلاعب والسلة المختلطة. |
| S5 | LOW — Verified Boundary | كتالوج Quote وOrder محصور بـ`restaurantId` من slug المطعم؛ `preview` يضيف `restaurantId` للاستعلام. اختبارات DB/HTTP ترفض منتجًا أو Linked Source من مطعم آخر وتعيد 404 عند قراءة Order من سياق آخر. لا يوجد Business/Outlet Differential بعد؛ هذا قيد سياق لا دليل على تسرب عابر للمطاعم. |

الـAcceptance Token ليس تصريحًا ماليًا مستقلًا: عند `create` يعاد بناء Draft من البيانات الحية وتتم مقارنة توقيعه؛ قيد فريد `(restaurantId, acceptanceTokenHash)` يمنع استعماله بطلب ثانٍ. إعادة نفس `idempotencyKey` والطلب تعيد الـOrder نفسه حتى بعد تغيّر Capability، وهذا **retry مقصود لطلب سبق حفظه** لا إنشاء جديد. قيد فريد `(restaurantId, idempotencyKey)` مع `requestHash` يمنع تغيير payload. الاختبار المتزامن أعاد Order واحدًا. لا توجد آلية مصادقة Production لهذه المسارات أصلًا، لذلك لا يصح وصفها آمنة للإطلاق.

## 3. Transaction & Consistency Findings

| ID | الشدة / التصنيف | الدليل والحكم |
|---|---|---|
| T1 | LOW — Verified Boundary | `prepare/create` داخل Prisma Serializable. تقفل Restaurant وRestaurantSubscription وSubscriptionFeature وكل Product rows للمطعم بـ`FOR SHARE` قبل قراءة الكتالوج والتسعير. `create` يخزن Order وOrderItems وSnapshot وختمه داخل Transaction واحدة. اختبارات HTTP/DB القائمة غطت تحديث Product أو Linked Source أو Availability أو Capability أثناء الإنشاء؛ لم يُحفظ Order عند السباق. اختبار فشل إدراج OrderItem أثبت rollback. |
| T2 | MEDIUM — Confirmed Bug | `runSerializable` يعيد المحاولة ثلاث مرات لـ`P2034`/`40001`/`40P01`، لكنه يرمي الخطأ الخام بعد المحاولة الأخيرة. `create` يترجمه إلى 409؛ `prepare` لا تفعل. اختبار التدقيق الجديد حقن ثلاث `P2034` وأثبت وصول Prisma error الخام. Nest سيعرض فشلًا عامًا بدل conflict منظم. لا يمس السعر أو الذرية. |
| T3 | MEDIUM — Theoretical Risk | قفل **كل** منتجات المطعم أثناء Draft/Order، لا سلسلة الاعتماد فقط، قد يؤخر تحديثات منتجات غير مرتبطة ويزيد زمن الانتظار في الكتالوج الكبير. لم يُجر اختبار ضغط متزامن كافٍ لإثبات حجم الأثر. لا تغيّر استراتيجية القفل دون اختبار تنافس يثبت الحفاظ على اتساق Linked Sources والأسعار. |

القيود الفريدة وSQL triggers في Migration Stage 6C تمنع تعديل/حذف أدلة `NETWORK_TEST` التاريخية بعد الختم، وتمنع إضافة OrderItem متأخرة. اختبارات DB الحالية أثبتت رفض تعديلات Order/OrderItem. لا يُستنتج من ذلك سلامة Migration History على قاعدة حقيقية؛ لم تُفحص.

## 4. Performance Measurements

أضفت `apps/api/src/modules/public-menu/network-readiness.audit.integration.spec.ts`، وقست `PublicMenuService.productQuote` و`NetworkOrdersService.prepare` فعليًا على PostgreSQL 16 **مؤقتة جديدة** عند `127.0.0.1:55440`، قاعدة مخصصة باسم `ordersawa_stage3_stage6c_stage6d3b_audit`. طبقت Baseline SQL وStage 6C SQL هناك فقط. العينة: Pizza Network واحدة مع Size، وبقية المنتجات Legacy اصطناعية؛ دعوة warm-up ثم 5 قياسات متسلسلة لكل حجم. زمن الخدمة يشمل Prisma/قاعدة البيانات/Shared Engine، لا شبكة HTTP أو عرض المتصفح. RSS للـprocess تراكمي وغير معزول لكل طلب.

| عدد منتجات المطعم | Quote median / max ms | Prepare median / max ms | Process RSS MB بعد العينة |
|---:|---:|---:|---:|
| 10 | 2.68 / 3.40 | 8.57 / 9.58 | 89.2 |
| 100 | 3.57 / 4.84 | 7.44 / 10.64 | 90.4 |
| 1000 | 18.76 / 25.99 | 30.76 / 37.90 | 106.2 |

السبب المباشر الظاهر في الشيفرة: `configurationCatalogProducts` تجلب الكتالوج كاملًا لكل Quote؛ `resolvePublicProductConfiguration` يبني خريطة كل المنتجات ويفحص بنية كل Network source؛ `lockCatalog` يقفل كل صفوف Product ثم يحملها. `buildDraft` يعيد resolver لكل line، وبالتالي تكلفة الطلب ذي 50 line قد تكون أعلى كثيرًا؛ لم تُقَس هنا. Included Quantity ترتب وحدات المجموعة حسب السعر (`sort` ثم `slice`) فتتزايد كلفتها مع عدد الوحدات داخل المجموعة، والـNested/Linked يتطلبان اجتيازًا متكررًا؛ حدود Shared (عمق 12، 1000 عقدة، 500 instance، 20,000 حالة minimum، و100 وحدة للمجموعة) تحد المدخلات. لم يُقَس أسوأ تركيب Linked عميق أو ضغط concurrent؛ هذا **Missing Test Coverage**، وليس حكمًا بفشل الأداء. لا Cache ولا Pricing Engine ثانٍ مقترحان دون قياس موجّه.

## 5. Public Menu Race Condition

`ensureAllCategory` تنفذ `findFirst({restaurantId, slug:'all', deletedAt:null})` ثم `create`. فهرس Prisma فريد على `(restaurantId,slug)` حتى مع soft delete. اختبار PostgreSQL الجديد أوقف طلبين بعد القراءة: كلاهما رأى عدم وجود صف؛ إدراج واحد نجح والثاني فشل `P2002`، وبقي صف واحد. وفي اختبار مستقل، صف `all` محذوف منطقيًا لم يظهر في `findFirst`، ثم فشل `create` بـ`P2002` دون تزامن. الأثر: خطأ عام/HTTP 500 محتمل عند أول زيارة متزامنة، أو تكراره دائمًا بعد soft delete، وقد يفشل تحميل المنيو لزبون. Stage 6D.3A seed الذي ينشئ `all` مسبقًا يخفي السباق في Demo ولا يصلحه.

التصنيف: **HIGH — Confirmed Bug**. الإصلاح التقني المحدود المقترح للمرحلة التالية: استعمال المفتاح الفريد مباشرةً في عملية atomic/upsert أو معالجة `P2002` بإعادة القراءة؛ وحسم كيفية استعادة `all` المحذوف منطقيًا بما يتفق مع كونه قسمًا نظاميًا. أضف HTTP concurrent regression وسيناريو soft-delete بعد الإصلاح. لم أعدل Public Menu الآن لأن هذه مرحلة Audit.

## 6. WhatsApp & Snapshot Findings

- `formatNetworkOrderWhatsappMessage` يستقبل `Order.cartSnapshot` فقط، بلا استعلام live Product. اختبار DB يغير اسم المطعم بعد الحفظ ويؤكد بقاء الاسم التاريخي في الرسالة؛ `preview` لمطعم آخر 404. الاختبارات تعرض Pizza وCombo مع ORIGINAL/CUSTOM ونسخ مستقلة، Size وNested Options وIncluded/Free/Paid وملاحظات وUnicode.
- يفحص Formatter envelope/revision، كل PriceLine مستخدم مرة، `unitPrice = sum(chargedAmount)`، `lineTotal = unitPrice × quantity`، و`orderTotal = sum(lines)` باستخدام عمليات Shared decimal-safe، دون JavaScript floating-point أو إعادة تسعير من المنيو. يفشل عند نقص اسم/سطر/مصدر بدل تخمينه. صياغة Size صفرية داخل Combo تعني «دون تكلفة إضافية للحجم» لا «المنتج مجاني».
- النص الطويل لا يُقطع بصمت؛ رابط preview الاختياري يرفض تجاوز 8192 حرف URL محليًا. لا يعني ذلك ضمان قبول WhatsApp خارجي. لا توجد رسالة فعلية مرسلة، وLegacy formatter/Checkout لم يتغير.
- Snapshot تحفظ label تاريخيًا واحدًا لكل عقدة، وليس سجل ترجمات متعدد اللغات؛ اختيار لغة بديلة بعد الطلب لا يمكن توليده دون تصميم منفصل متوافق مع قاعدة whole-record fallback. **Pending Founder Decision / Production Blocker**.

## 7. Production Blockers

| الموضوع | الحالة والمالك |
|---|---|
| Currency rounding وdisplay | **Pending Founder Decision**: التخزين `DECIMAL(24,6)` دقيق، لكن سياسة عرض/تقريب لكل عملة غير معتمدة. ممنوع اختراعها. |
| HMAC key | **HIGH تقني + سياسة تشغيل**: per-process عشوائي حاليًا؛ يحتاج مفتاحًا مُدارًا، نسخًا/rotation وتهيئة multi-instance. |
| Production Auth/Authorization | **HIGH تقني وتصميم صلاحيات**: endpoints الحالية اختبارية بلا هوية زبون/سياسة وصول إنتاجية؛ preview يحتوي PII. لا يُرفع test gate كما هو. |
| Rate limits / abuse budget | **MEDIUM/HIGH تقني**: حد IP في الذاكرة عام، لا تكلفة Quote/Restaurant أو توزيع instances. يلزم قياس وسياسة مناسبة قبل الإطلاق. |
| Commercial Order Number | **Pending Founder Decision + تنفيذ تقني**: Network test ليس له رقم تجاري؛ لا تعاد طريقة Legacy `count+1` غير المضمونة بالتزامن. |
| Customer phone requirements | **Pending Founder Decision**: اختياري في العقد التجريبي تبعًا للوضع Legacy؛ لا فرض جديد دون اعتماد. |
| Delivery fees/taxes/discounts | **Pending Founder Decision**: لا يضيفها Network flow؛ حدّد التوافق التجاري قبل الإنتاج. قرار UAE القديم يجعل سعر المنيو نهائيًا لكنه لا يحدد رسوم Delivery هنا. |
| Multilingual snapshot | **Pending design/decision**: label تاريخي واحد، لا translation record كامل. |
| Migration History | **HIGH unresolved**: لا نسخة موثوقة من تاريخ قاعدة OrderSawa، ولا Initial Migration في المستودع. يلزم تدقيق read-only بإذن مستقل؛ لم نتصل بقاعدة موجودة. |
| Branch/Outlet context | **HIGH scope gap**: التنفيذ الحالي Restaurant-scoped، بينما القرار الحالي يطلب Business Catalog + Outlet Differential؛ لا يجوز افتراض جاهزية ذلك أو بناؤه في مرحلة التدقيق. |
| WhatsApp sending flow | **Pending Founder Decision + security design**: preview نسخ فقط؛ لا قرار معتمد بشأن الإرسال، الطول، إعادة المحاولة أو هوية الوجهة. |
| Service Mode / schedule / operational context | **HIGH scope gap**: Public response يصرح `serviceModeApplied:false` و`productScheduleApplied:false`؛ لا تعامل التجربة كطلب حي كامل. |

## 8. Founder Decisions Required

1. سياسة تقريب وعرض مبالغ SYP/USD/AED وغيرها ضمن Business currency، مع إبقاء التاريخ الدقيق.
2. هل اسم/هاتف الزبون مطلوب في أي سوق أو نمط استلام؟ وكيف تُعالج الرسوم والخصومات والضرائب وأرقام الطلب التجارية؟
3. تصميم Snapshot multilingual التاريخية وفق whole-record fallback، واللغة المستخدمة في رسالة المطعم.
4. مجال Business/Outlet وService Mode/Scheduling المطلوب قبل السماح بالطلب الحقيقي.
5. UX وطريقة إرسال WhatsApp، حدود الرسالة الطويلة، المرسل/المستلم، وما يحدث عند الفشل.

هذه الأسئلة لا تعطل **إصلاح العيبين التقنيين المحدودين** في قسم `all` وخرائط تعارض `prepare` إذا تمت الموافقة على مهمة إصلاح مستقلة.

## 9. Recommended Fixes by Priority — مهام صغيرة مستقلة

1. **P0 — Public Menu `all`**: إصلاح atomic للإنشاء/soft-delete مع اختبارات HTTP مزدوجة وعودة المنيو، دون تغيير باقي المنيو.
2. **P0 — Prepare conflict mapping**: تحويل استنفاد Serializable إلى 409 structured، مع unit/HTTP fault-injection يثبت 3 retries وعدم إنشاء Order.
3. **P0 — قرار الإطلاق المالي**: اعتماد currency rounding/display وحقول الهاتف/الرسوم ورقم الطلب قبل أي activation (قرار مؤسس، لا تعديل تلقائي).
4. **P1 — Auth وpreview privacy**: تصميم endpoint إنتاجي جديد بصلاحيات واضحة وعزل tenant/PII؛ لا ترفع `network-test` gates.
5. **P1 — HMAC**: secret مُدار متعدد instances، key ID/rotation، replay/expiry tests؛ لا secrets في Git.
6. **P1 — Rate/budget**: قياس ضغط Quote/Prepare المتزامن، تحديد quota موزعة ومحددة السياق مع body/complexity budgets.
7. **P1 — Catalog/locks**: Benchmark 50-line، Linked عمق قريب من الحدود، 1k/10k Product، وكتابة غير مرتبطة أثناء Prepare؛ بعد الدليل صمّم تحميل/قفل dependency closure مع اختبار الاتساق.
8. **P1 — Migration History**: تدقيق read-only بتفويض منفصل، ثم خطة نشر/تراجع مستقلة؛ لا migrate على بيانات حقيقية الآن.
9. **P2 — Snapshot/WhatsApp**: اعتماد multilingual history وsending UX، ثم اختبارات historical/retry/long-message دون إرسال فعلي في هذه المرحلة.

## 10. Tests & Evidence

- PostgreSQL 16 مؤقتة **جديدة** داخل `../work/stage6d3b-postgres-data`، loopback `127.0.0.1:55440`. قاعدتان منفصلتان: `ordersawa_stage3_stage6c_stage6d3b_tests` لاختبارات Stage 6C و`..._audit` للتدقيق/Benchmark. Baseline وStage 6C SQL طُبقا على هاتين القاعدتين فقط. لا `.env` حقيقي ولا اتصال أو Migration/Backfill على قاعدة موجودة.
- الاختبار الجديد: **4/4** (race، soft-delete، Serializable retry exhaustion، Benchmark). محاولة أولى فشلت **بسبب غياب flag التجريبي** كما ينبغي؛ إعادة التشغيل مع `ENABLE_DISPOSABLE_NETWORK_ORDERS=1` نجحت. الاختبار نفسه يتحقق من اسم/عنوان/منفذ قاعدة البيانات الفعلية قبل أي حذف Fixture.
- Stage 6C HTTP/DB الموجه: **18/18** (أعيد ثم ضُم إلى تشغيل API النهائي)؛ Quote + Contract + Formatter مع Stage 6C: **44/44** في 4 ملفات؛ Shared **21/21**؛ Web **39/39**. الإجمالي المنفذ في التشغيلات النهائية غير المتداخلة: **108/108** (`4 + 44 + 21 + 39`)، صفر skipped في هذه التشغيلات.
- Root `npm run typecheck`: نجح. Build مستقل لم يُشغّل لأن التغيير Tests/Docs فقط؛ Typecheck يبني Shared. `npx tsc -p apps/api/tsconfig.json --noEmit` الإضافي فشل في مصدر اختبار **سابق**: `network-orders.integration.spec.ts:316` (possibly undefined) و`product-import-parser.spec.ts:23` (Buffer generic mismatch). لم تظهر أخطاء من ملف التدقيق الجديد؛ build/typecheck الرسمي لا يشمل ملفات الاختبار.
- لم أشغّل كامل API suite أو Browser E2E أو Load Test متعدد المستخدمين؛ آخر تغطية Stage 6D.3A كانت 135/135 API و15/15 Browser، لكنها ليست نتيجة جديدة لهذه المرحلة. لا ندّعي اكتمال تغطية الأداء أو الأمن الإنتاجي.

إعادة التشغيل المسموح بها فقط بعد إنشاء قاعدة disposable بالاسم المحدد وتطبيق SQL الاختباري عليها:

```powershell
$env:NETWORK_READINESS_AUDIT_DATABASE_URL='<disposable PostgreSQL URL ending /ordersawa_stage3_stage6c_stage6d3b_audit>'
$env:ENABLE_DISPOSABLE_NETWORK_ORDERS='1'
npm run test -w @menu/api -- src/modules/public-menu/network-readiness.audit.integration.spec.ts --silent=false --reporter=verbose
```

لا تستخدم URL أو Volume من بيئة حقيقية. الاختبار يرفض الاسم/المضيف/المنفذ غير المتوقعين.

## 11. Git Status وحدود التسليم

الملفات الجديدة/المحدثة في Stage 6D.3B: هذا التقرير؛ `apps/api/src/modules/public-menu/network-readiness.audit.integration.spec.ts`؛ `CODEX_HANDOFF.md`. لم أعدل Shared Pricing Engine أو Order Persistence أو Currency Policy أو Public Menu runtime أو Legacy Checkout. راجعت Git Diff وغياب `.env` وCredentials وLogs قبل Commit. Commit مستقل لهذه المرحلة؛ احصل على hash الفعلي عبر `git log -1 --oneline` بعد الحفظ. لا Deployment، لا اتصال Production، لا إرسال WhatsApp، ولا تغيير `orderingEnabled:false`. **توقف هنا حتى الموافقة على مهمة إصلاح منفصلة.**
