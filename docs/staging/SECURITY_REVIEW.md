# مراجعة الأمان — نطاق وحدود

هذه مراجعة للكود واختبارات محلية، وليست شهادة اختراق كاملة ولا إثبات خلو مطلق من الثغرات. تم حصر 13 Controller و109 handlers في المصدر. ملفات التشغيل الفعلية والتقارير الجديدة هي المرجع، وليس تقارير Preview القديمة.

## الإصلاحات المثبتة

| المستوى | المشكلة قبل الإصلاح | التصحيح | دليل منع الرجوع |
|---|---|---|---|
| HIGH | EMPLOYEE يملك product.update للتوفر، لكنه استطاع الوصول لمسار حذف الصنف دون فحص صلاحية الحذف | استخدام صلاحية product.create الموجودة للحذف؛ الاحتفاظ بتعديل التوفر | اختبار controller قبل DB + HTTP حقيقي 403 وبقاء deletedAt فارغًا |
| HIGH | مسارات قائمة الطلبات وoverview تسمح لكل عضو المطعم بقراءة بيانات تتجاوز analytics.view المعتمدة | تطبيق analytics.view على المسارين | اختبارات الأدوار مع منع استدعاء service، وHTTP overview/foreign tenant |
| HIGH | Sync يسمح لعضو منخفض الصلاحية بإنشاء/قراءة/retry حمولة تتضمن بيانات مطعم واسعة | restaurant.update الموجودة، أي Owner أو SuperAdmin | اختبارات رفض EDITOR/EMPLOYEE قبل القراءة/التعديل |
| MEDIUM | قراءة QR قد تنشئ QR افتراضيًا، ومسارات الإنشاء والتعديل لا تتحقق من صلاحية النشر | menu.publish على list/create/update/svg | اختبار رفض الموظف والحفاظ على المسموح |
| MEDIUM | مدخل analytics العام يقبل نوع event يحدده العميل، بما فيه أحداث الطلب التي يجب أن يصدرها الخادم | قبول MENU_VIEWED وPRODUCT_VIEWED فقط | خمسة أنواع مرفوضة قبل persistence؛ اختبارات نافذة الزيارة الأصلية |
| تحصين تشغيل | إعداد Staging غير منفصل صراحة عن البيئات الأخرى | تطابق DB URLs مع اسم/مضيف/منفذ صريح، دور غير superuser، HTTPS وCORS محددان وloopback API، منع flags الاختبار | اختبارات قبول/رفض config + تجربة runtime/migrate/bootstrap/backup/restore |

إصلاح responsive محدود: عند 360px بالإنجليزية كان مجموع عرض كلمة Language والكبسولة والمسافة يوسّع مسار Grid ويزيح الشعار؛ جرى تقليل gap إلى 8px فقط تحت 380px مع الحفاظ على اختبار التمركز الأصلي دون تخفيفه.

لا تغيير في schema أو Shared Pricing أو Server Quote أو Included Quantity أو Min/Max أو Cart Identity. لا تغيير في صلاحيات Import/Export المعتمدة.

## تغطية المراجعة

| المجال | ما فُحص وما تثبته الأدلة | حدود الإثبات |
|---|---|---|
| المصادقة | JWT HS256 ومفتاح بدء التشغيل، انتهاء token وcredential version، lookup الدور الحالي من DB، bcrypt، فشل الدخول وحدود IP | token في localStorage؛ logout يحذف الجلسة المحلية ولا يسحب JWT المسروق قبل انتهاءه/تغيير كلمة المرور |
| عزل المطاعم | RestaurantContextGuard ثم restaurantId في الاستعلامات؛ اختبارات IDs أجنبية وقراءة/كتابة/media/quote | SuperAdmin إدارة عامة مصرح بها؛ لا يوجد نموذج عضوية منفصل لكل outlet، النطاق الحالي للمطعم |
| الإدارة | guard عام SUPER_ADMIN للمسارات الإدارية؛ رفض Owner على /admin/restaurants في runtime Staging | لم تُختبر حسابات حقيقية أو مزود SSO خارجي |
| إدخال/API | ValidationPipe وDTO/schema validators؛ pricing وquantity وmoney overflow؛ Prisma parameterization؛ JSON limits؛ رسائل خطأ لا تسرب أسرار | لا ادعاء fuzzing شامل لكل تركيب من المدخلات |
| XSS/URLs | escaping في React، تنظيف المحتوى/ألوان الثيم، تحقق schemes وروابط الوسائط، عدم تنفيذ كود من وصف المنتج | لا CSP صارم جديد كاسر للثيمات؛ يلزم الحذر عند إضافة HTML حر مستقبلًا |
| CSRF | المصادقة Bearer صريحة وليست cookie تُرسل تلقائيًا؛ CORS مقيد | CORS ليس بديلًا عن auth؛ مسارات المنيو العامة متاحة عمدًا |
| SSRF/رفع | مزود الصور الحالي ووجهات upload المقيدة، byte signatures/decoder، geometry SVG، attestation للنماذج، ملكية MediaAsset وحجب pending/raw files | Cloudinary الفعلي وحساباته لم تُستخدم؛ لا تغيير المزود |
| Path traversal | أسماء ملفات ومسارات flat وامتدادات تحقق فعلية، GET uploads محدد، صلاحيات الحذف | يلزم حماية القرص/حساب التشغيل على السيرفر |
| الأسعار والطلبات | shared decimal engine، إعادة تسعير backend، HMAC-bound approval وidempotency/transactions وتوفر المنتجات | فتح wa.me لا يثبت إرسال رسالة أو تنفيذ طلب من المطعم |
| PWA/cache | service worker يستثني HTML/RSC/API/JSON/quotes/orders ويخزن assets ثابتة؛ offline failure صريح | لم يُختبر جهاز عميل فعلي في هذه المهمة؛ Mobile emulation موثق |
| التشغيل | startup fail-closed، graceful shutdown، /health مقابل /health/ready، انقطاع DB واستعادة الاتصال، قيود/indexes/restore | لا اختبار load طويل الأمد أو heap soak، ولا PM2/Nginx حي على Linux خارجي |
| analytics/bots | نافذة الزيارة 30 دقيقة، dedup/receipts، rate-limit بحد ذاكرة، رفض الأنواع غير الموثوقة | limiter محلي للعملية؛ PM2 مهيأ instance واحدة، لا ادعاء حماية DDoS موزعة |
| الأسرار | فحص المصدر والحزمة وcanaries في build/browser assets؛ env مثال دون قيم خاصة | لم تُدوّر مفاتيح حقيقية أو تُقرأ قواعد عملاء |

## المكتبات — نتائج التدقيق والاستثناء المحدود

تحديث 17 نوفمبر — إغلاق مانع NestJS:

- core/common/platform-express: **10.4.22 → 11.2.10**؛ config **3.3.0 → 4.0.4**؛ jwt **10.2.0 → 11.0.2**؛ Express **4.22.3 → 5.2.1**. أزيل override خاص بـcommon 10 لأن common 11 يجلب file-type 21.3.4 أصلًا. بقيت Overrides الأمنية الأخرى.
- مرجع الإصلاح: [GHSA-36xv-jgw5-4q75](https://github.com/advisories/GHSA-36xv-jgw5-4q75)، و[دليل Nest 11](https://docs.nestjs.com/v11/migration-guide). لا ترقية Nest 12 ولا force ولا legacy-peer-deps.
- حافظ bootstrap على extended query parser السابق؛ لا مسارات controller wildcard أو optional غير متوافقة مكتشفة. Middleware الآمن وCORS وValidationPipe كما هي. اختبارات HTTP الخاصة بالترقية تشمل ترتيب middleware وquery arrays/objects ومنع prototype pollution وتحويل DTO و400/404. اختبارات التطبيق المعزولة تتحقق من auth/RBAC/tenant/upload/orders/startup/shutdown/readiness.
- تقرير المهمة السابقة كان 2 Moderate. إعادة تدقيق نفس lock القديم بالنشرات الحالية تعطي **2 Moderate + 6 High**؛ بعد الترقية **0 Moderate + 6 High**. الستة ليست ست ثغرات مستقلة؛ هي أثر تنبيه واحد عبر سلسلة picomatch/fdir/tinyglobby/vite/@vitest/mocker/vitest. `npm audit --omit=dev`: **صفر**. OSV المستقل يجد تنبيهًا واحدًا/نسخة واحدة.
- [GHSA-fc5q-39xc-vjpf](https://github.com/advisories/GHSA-fc5q-39xc-vjpf): picomatch <=4.0.7، لا نسخة مصححة منشورة. التعرض المثبت هو مطابقة glob في أدوات التطوير/الاختبار؛ لا استيراد picomatch/micromatch مكتشف في تطبيق API/Web، ولا مسار يقبل glob من زبون إلى هذه الأدوات. هذا يحد نطاق التعرض لكنه لا يحوّل بوابة HIGH إلى PASS.
- Full audit remains FAIL; Production remains BLOCKED. The follow-up task permits assessing a private Staging-only exception. See PRIVATE_STAGING_EXCEPTION.md: it records evidence, expiration, operator conditions and the additional Next bundled matcher path, without disabling audit/OSV or CI.
- إصلاح uuid/ExcelJS السابق (override 11.1.1) محفوظ؛ اختبارات CJS/UUID/Excel import-export تبقى ضمن البوابة. لا تغيير لحساب السعر أو قاعدة بيانات منشورة.

## Follow-up: runtime reachability correction

The earlier dev-only statement applies to npm dependency entries, not all bundled code. Next includes a vendored matcher at runtime. Fixed repository image-policy patterns, not HTTP/user fields, reach makeRe; the exact input boundary and limits are documented in PRIVATE_STAGING_EXCEPTION.md. Runtime-only install and restart/upload/SSR tests are required; absence of a direct app import is not the proof.
