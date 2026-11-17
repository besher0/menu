# OrderSawa — Staging Security Resolution + Google Maps

الحكم: **CONDITIONALLY ACCEPTABLE FOR PRIVATE STAGING** فقط، بعد تحقق المبرمج من تقييد الوصول وهوية البيئة وموافقة النشر المنفصلة. ليس READY عامًا؛ **Production BLOCKED**. صلاحية التقييم حتى 2026-11-24 UTC أو توفر إصلاح/تغير التعرض/فشل بوابة، أيها أسبق.

## الأمن وما الذي أُصلح

لا يوجد إصدار picomatch مصحح رسميًا وقت فحص 17 نوفمبر؛ npm registry latest = 4.0.7 و[النشرة الرسمية GHSA-fc5q-39xc-vjpf](https://github.com/advisories/GHSA-fc5q-39xc-vjpf) بلا patch. لم تتغير dependencies أو lockfile في هذه المهمة. الثغرة لم تُغلق؛ الاستثناء المقترح ضيق ومشروط، وليس تغييرًا لبوابة التدقيق العامة.

- Full npm audit: **FAIL، 6 High، 0 Critical، 0 Moderate**، أثر تنبيه واحد عبر Vite/Vitest وتوابعهما.
- OSV المباشر: فُحصت 517 توليفة package/version؛ تطابق واحد picomatch 4.0.7 مع النشرة نفسها. لم تُخفَ النتائج.
- Runtime audit للـlock وللتثبيت الفعلي: **0 تنبيهات**. npm dependency tree ناجح.
- أدوات Vite/Vitest/tinyglobby/fdir/picomatch المستقلة وtsx/TypeScript لا تُحل من runtime. Prisma CLI يبقى كـoptional peer رسمي لـ@prisma/client؛ ليس أداة اختبار أو خادم تطوير.
- تصحيح مهم لادعاء dev-only السابق: Next يتضمن matcher مدمجًا في runtime دون version معلن في manifest المصغر. لا ندّعي خلوه من الثغرة. فحص الكود واستدعاء الدوال الفعلية أثبتا أن makeRe يستقبل أنماط public-image-policy الثابتة فقط؛ URL الطلب واسم الملف هما النص المراد مطابقته، وليس النمط. لم يُكتشف مسار مدخل غير موثوق إلى pattern في هذا الإعداد. الأدلة وحدودها في PRIVATE_STAGING_EXCEPTION.md وملفات matcher/chain المرفقة.
- لم يتغير CI أو npm audit أوOSV أوحدود High/Critical. أي تنبيه جديد أو تغير لمسار الأنماط يلغي القبول المشروط.

## البناء والتشغيل

Builder خاص: npm ci ثم Prisma generate ثم Build مع NEXT_PUBLIC_API_URL=/api وبيئة Staging المعتمدة. أداة prepare-staging-runtime تنشئ مجلدًا جديدًا خارج builder، بتبعيات production فقط وبدون lifecycle scripts، وتنسخ ملفات runtime والثابتة وPrisma المولد لنفس النظام. PM2 يرفض tree غير محضّرة ويشغّل Nest compiled وNext start على loopback. لا npm dev/watch/test في تشغيل الخدمة.

اختبار فعلي محلي على Windows: تشغيل الحزمة دون أدوات التطوير، فتح منيو SSR وملفات Next وصورة محسّنة، تسجيل الدخول ورفض anonymous/foreign tenant، رفع صورة واسترجاعها، Health/Readiness، رفض endpoints التطوير، إيقاف العمليتين وإعادة تشغيلهما وتكرار الفحص، رفض إعداد بيئة خاطئ، وتحميل إعداد PM2: **PASS**. نسخ/استعادة PostgreSQL وتحقق migrations وpreflight V1: PASS. البناء والتشغيل الخارجيان على Linux لم يُنفذا؛ يجب إعادة البناء على نفس نظام السيرفر، والحزمة المسلمة مصدر وليست binaries Windows.

## Google Maps — من نحن

السبب: زر Maps كان داخل شرط about.address. فُصل ظهور كتلة الموقع إلى address أوmapsUrl، مع بقاء العنوان والنبذة اختياريين. عند وجود رابط فقط تظهر الدائرة الحالية مع تسمية «عرض الموقع على خرائط Google»/View location on Google Maps؛ دون عنوان وهمي أو كتلة فارغة. العنوان يبقى نصًا مستقلًا، والزر 44px ومحاذاته بمنتصف كتلة العنوان. لا تعديل CSS/Drawer أوDB أوحقول Dashboard أوShared URL validation. المدينة تُضاف دائمًا عند وجودها، حتى في «حلب - حلب الجديدة».

حالات الحقول الثماني × لغتين × أربعة عروض 360/390/430/1280، واختبارات رفض روابط javascript/http/host spoof/credentials، إضافة إلى اختبارات اجتماعية وتقييمات وAccordion القائمة: PASS. صور Maps-only والنبذة+Maps والعنوان+Maps مرفقة لكل عرض ولغة. الوجهات الخارجية اعترضها المتصفح ولم تُرسل رسائل.

## النتائج

**971 اختبارًا فريدًا PASS؛ 0 Failed، 0 Skipped، 0 Not Executed ضمن المجموعة النشطة النهائية**. إعادة suite المحرر لا تُعد مرتين. **272 فحص متصفح ضمن اختبارات التكامل، لا تُضاف إلى الإجمالي**. منها 68 حالة About الجديدة. تفاصيل كل تشغيل في ملفات JSON.

Clean npm ci، dependency tree، monorepo build، Typecheck وAPI tests Typecheck: PASS. بوابة test-release-v2 ذات المراحل التسع كاملة: PASS. 79 browser assets بلا server canaries. Runtime الإضافي: دورتا تشغيل ناجحتان، وإعداد خاطئ مرفوض. لا حاجة لإعادة تدقيق أمني شامل أو تغيير Product Configuration/الطلبات/merchant home؛ لم تُعدّل هذه الوظائف.

## المشكلات التي ظهرت وكيف عولجت

1. نموذج Staging bootstrap السابق أنشأ مطعمًا دون themeSettings، فكشف تشغيل المنيو خطأ null colors. أُضيف الثيم الحالي ABO_MALEK_THEME داخل معاملة bootstrap الفارغة نفسها؛ لا تحديث لأي مطعم قائم، ولا seed لبيئة قائمة. أثبت الاختبار نجاح المنيو والنسخ/الاستعادة بعد التصحيح.
2. أول build للاختبار لم يحدد NEXT_PUBLIC_API_URL، ففشل اختبار المحرر لأن طلبات API ذهبت للوجهة الافتراضية. صُحح إعداد عملية البناء إلى /api وأُعيد build/typecheck والبوابة كاملة؛ لا تخفيف assertion أو تعديل التطبيق لأجل الاختبار.
3. تحقق runtime الأول اعتبر Prisma ممنوعًا؛ npm explain أثبت أنه optional peer رسمي لتبعية التشغيل. صُحح التصنيف وأبقيت أدوات التطوير الفعلية ممنوعة، ثم أُعيد إنشاء runtime واختباره كاملًا.
4. Browser Smoke القديم اعتمد مسار Demo مفتوحًا من إعداد CI؛ بناء Staging الصحيح رفضه. أُصلحت أداة الفحص لتستعمل secret داخليًا مؤقتًا للخادم المحلي وتنقل CDP صريحًا؛ لم تتغير حماية التطبيق. نجح الاختبار منفردًا ثم أُعيدت البوابة الرسمية كاملة.
5. sandbox منع pg_ctl من إنشاء restricted token؛ أُعيد الاختبار المصرح به خارج sandbox على قاعدة جديدة معزولة. npm احتاج cache قابلًا للكتابة. لا إخفاق وظيفي مُخفى.

## ما لم يُنفذ وما بقي للمبرمج

لم يُنفذ نشر Production/Preview/Staging خارجي أوPush/Merge أوتغيير بيانات قائمة. لم يُختبر Linux الخارجي أوNginx/TLS/DNS/PM2 daemon الحقيقي أوحساب Cloudinary أوإرسال WhatsApp حقيقي أوload test طويل. الاختبارات المحلية لا تثبت هذه البيئات.

قبل التشغيل الخارجي: تحقق من هوية السيرفر والـSHA، اقرأ الاستثناء ومدته وسجل قبول المالك وتقييد الدخول (VPN/بوابة هوية أوما يعادلها)، استخدم بيانات اصطناعية فقط، وابنِ المصدر وPrisma على Linux في builder خاص. تحقق من تدقيق runtime ومن عدم ظهور advisory جديدة، ثم check/backup/migrate على DB مستقلة بدور محدود. bootstrap مرة واحدة على DB فارغة فقط. جهّز runtime الجديد، شغّل smoke ثم restart/restore، واضبط Nginx/TLS والوصول المقيد. إذا فشل شرط فتوقف؛ Production خارج الاستثناء دائمًا. أوامر تفصيلية في PROGRAMMER_START_HERE وROLLBACK.

المصدر الأساسي: c612148564c586ba7cf980777441ac99d7e082cb. Commit النهائي وبصمة الملفات في RELEASE_MANIFEST وFILE_SHA256؛ بصمة ZIP في الملف المجاور. كل الملفات المعدلة في CHANGED_FILES.txt.
