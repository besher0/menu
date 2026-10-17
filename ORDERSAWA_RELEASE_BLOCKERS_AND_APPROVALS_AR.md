# OrderSawa — موانع الإصدار وسجل الموافقات المنفصلة

**الحالة: Release Candidate برمجية محلية، غير معتمدة للإنتاج.** الهدف الحالي فقط منيو مطاعم إلكتروني + WhatsApp يفتحه الزبون؛ لا POS أو Kitchen أو Business/Outlet. وصل تقرير تدقيق Production read-only من المبرمج في 17 أكتوبر 2026؛ حللناه دون أن نتصل نحن بـ`menu` أو نستخدم Backup أو ننفذ ترحيلًا/نشرًا/تفعيلًا.

## مانع قبل ترحيل قاعدة البيانات أو نشر Binary الجديدة

| الأولوية | المانع الفعلي | الدليل/المطلوب من المبرمج |
|---|---|---|
| STOP | استعادة Backup غير مؤكدة | المؤسس ذكر أن Backup أُنشئت وأن Restore قيد التحقق. مطلوب إثبات استعادة وفحص Schema/بيانات في بيئة معزولة وخطة RPO/RTO/مالك التراجع. |
| STOP | Drift خارج نطاق تدقيق Production المرفق | ملف 17 أكتوبر أثبت `numeric(10,2)` و**5/5 Checksums مطابقة** وغياب Stage 2C/6C في الأعمدة المفحوصة؛ لكنه ليس Dump لجميع التعريفات، و`db push` السابق قد أحدث drift آخر. قارن Restore كاملة مع Git/Prisma، وأعد فحص History قبل DDL. لا `migrate resolve` أو `db push` تلقائيًا. |
| STOP مشروط | أسعار تاريخية قد تتغير أو Legacy Options غير مفحوصة | عدادات أربعة حقول كانت صفرًا للكسور/السالب/>6/overflow وقت Snapshot؛ **لم يشمل الفحص `ProductOption.priceDelta`**. أعد Aggregate read-only قبيل DDL وراجع Legacy Options. أي حالة جديدة غير متوافقة تحتاج قرار معالجة، لا تعديل صامت. |
| STOP | توافق Prisma Client مع DB | Stage 2C Product/Dependency وStage 6C أربعة Order columns لازمة للنسخة الحالية؛ غياب Stage 6C أعاد `P2022` سابقًا. جرّب Binary وLegacy Order/Analytics على Restore بعد DDL. |
| STOP | نتيجة بروفة Restore وSQL النهائية | الاختبار الاصطناعي PG18 نجح لكنه لا يثبت `menu`. نفذ Rehearsal على Restore حقيقية أو staging مكافئة، مع مراقبة locks، diff، smoke وrollback/forward-fix. يلزم اعتماد الإجراء النهائي بعد رؤية النتائج. |
| STOP للتفعيل العام | Secrets/PM2/Proxy/Rate | توثيق عدد API/Web processes، process IDs/paths، TLS/Proxy/IP الحقيقي، `TRUST_PROXY`، CORS، rate limiting per-process. HMAC random ≥32 byte hex متطابق على API instances في Secret Store، لا في ZIP. إن كان متعدد النسخ، راجع حماية Rate Limit؛ لا تفترض Single-instance. |
| STOP للتفعيل العام | إعدادات المطعم والباقات وWhatsApp | رقم WhatsApp الرسمي/إعدادات `publicUi.whatsappOrderingEnabled`، اشتراك ACTIVE/TRIALING وCapabilities `PRODUCT_CONFIGURATION`, `CART_ORDERING`, `WHATSAPP_ORDERING` للمطاعم المختارة؛ تحقق بصلاحيات مناسبة دون مشاركة رقم عميل/سر. |
| STOP للتفعيل العام | قبول تجربة Staging وسلوك Legacy | Flag OFF/ON، Legacy-only يحفظ Order/Analytics مرة واحدة، Network/Mixed لا يحفظان Order حاليًا، 400 للـLegacy في Trusted API، إعادة قبول تغير السعر، العزل، SYP whole، رابط WhatsApp، RTL/mobile وBrowser. لا يجوز تفعيل Network/Mixed إذا فشلت. |

**ليس مانعًا للمنيو الحالي:** Business Catalog/Outlet Differential، POS، Kitchen/Dispatch، `NETWORK_TEST` DB Completeness Guard المرشحة، أو تفعيل Network Order persistence. تبقى في المصدر للمستقبل ومحروسة. توصيات مراقبة الأداء: Full Catalog Loading و`FOR SHARE` لجميع Product rows أثناء trusted prepare/confirm، تكلفة جولتين، SSI conflicts في نظام الطلبات التجريبي، وRate Limit in-memory؛ قيّمها بحسب topology وحجم 6–7 مطاعم دون افتراض SLA من benchmark المحلي.

## بوابات الموافقة — لا تُدمج

1. **إذن قراءة فقط** لقاعدة `menu`، يحدد الدور، الاستعلامات المرفقة، وقت التنفيذ والمخرجات المسموح مشاركتها. لا يجيز SQL كتابة.
2. **موافقة بروفة Restore** بعد إثبات نجاح الاستعادة واختيار بيئة معزولة. لا تستخدم Backup داخل Codex أو ZIP. التقرير الجديد لا يثبت نجاح Restore.
3. **موافقة Production Migration مستقلة** بعد عرض audit وdiff وbatches/locks والنتائج وخطة الرجوع، مع تحديد SQL النهائية/وقت الصيانة. لا تنشأ تلقائيًا من نجاح Disposable.
4. **موافقة Deployment مستقلة** بعد إثبات schema compatibility وPM2/Proxy/Secrets، مع Flag `OFF` واختبار Legacy.
5. **موافقة Feature Activation مستقلة** بعد Staging وLegacy/network/mixed smoke، HMAC/Rate/WhatsApp review؛ عندها فقط يمكن `ENABLE_PUBLIC_NETWORK_WHATSAPP_CHECKOUT=1`. لا يفتح ذلك `NETWORK_TEST` أو إرسالًا آليًا.

كل بوابة تحتاج توقيع/قرارًا واضحًا من المسؤول، وحالة PASS/STOP، وتوقيتًا ونسخة الكود/Schema؛ النجاح في بوابة لا يفوض التي تليها. **Backup موجودة لا تعني Restore ناجحة، وRestore ناجحة لا تعني موافقة Migration أو Deployment أو Flag.**

## على المبرمج إعادته قبل قرار النشر

- تأكيد Restore ونسخة PostgreSQL الحقيقية ووقت الاستعادة؛ نتائج metadata/aggregate مجمّعة بلا PII أو أسعار فردية؛ فحص migration checksums وdiff الفعلي؛ ملخص drift إن وجد.
- PM2 topology (عدد API/Web، مسارات startup/Proxy/TLS/health checks) دون environment values؛ سياسة Secret Store/HMAC وRate Limit، CORS/Origins، WhatsApp settings/Capabilities للمطاعم المقصودة.
- نتائج بروفة DDL وPrisma/Legacy/Network/Mixed/Browser على Restore معزولة، وخطة rollback/forward-fix وزمن downtime.
- مقارنة مصدر السيرفر الحالي بأرشيف Stage 6F.4؛ أي تعديلات محلية أو GitHub أحدث يجب مراجعتها ودمجها، لا استبدالها.

## جواب الجاهزية

**وظيفيًا في Source Code: نعم، ضمن الاختبارات المحلية المعلنة. للإنتاج الآن: لا.** الموانع المباشرة هي Restore غير مؤكدة، مجهولات Schema/History/الأسعار التاريخية، بروفة على Restore، topology/secret/rate/WhatsApp، ثم ثلاث موافقات تنفيذ منفصلة للترحيل والنشر والتفعيل. لا تُعامل حزمة ZIP بوصفها سكربت نشر تلقائي.
