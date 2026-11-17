# الاختبارات وإعادة التحقق

التقرير النهائي في حزمة التسليم هو مرجع النتائج الفعلية، بما فيها المحاولات الفاشلة والاختبارات غير المنفذة. لا تعتبر أوامر هذه الصفحة نتائج ناجحة بحد ذاتها.

```bash
npm ci --include=dev
npm run prisma:generate
npm run typecheck
npm run build
```

المستودع لا يعرّف أمر lint مستقلًا؛ لا نختلق نتيجة Lint PASS. Build وTypeScript يتحققان مما هو مضبوط حاليًا.

فحص secrets من Git index: `python3 scripts/scan-source.py`. في نسخة ZIP بلا .git: `python3 scripts/scan-source.py --snapshot`. فحص عدم تسرب canaries الخادم: `python3 scripts/build-with-credential-check.py` داخل بيئة اختبار نظيفة؛ لا تستخدمه لتكوين Artifact Staging النهائي لأنه يستبدل قيم الخادم بعلامات اختبار مؤقتة.

قبول V2: `PG_BIN=/path/to/pg16/bin PLAYWRIGHT_MODULE=/path/to/playwright V62_BROWSER_EXECUTABLE=/path/to/chromium QA_OUTPUT=/private/qa python3 scripts/test-release-v2.py` من بيئة خالية من أسرار التطبيق. يحتاج Build مسبقًا مع NEXT_PUBLIC_API_URL=/api. الاختبار يهيئ قواعد جديدة فقط، ولا يقرأ .env. استخدم حساب نظام غير root لتشغيل initdb.

المدخل `scripts/test-isolated.py` دون --operations-only يحيل الآن إلى بوابة `test-release-v2.py` الكاملة. تشمل كل ملفات integration الحالية بالاسم، وتفشل عند اكتشاف ملف غير مغطى أو نتيجة pending/failed. ملفات V1 الأصلية مؤرشفة مع SHA وجدول 90 حالة؛ لا skip أو PASS وهمي لها. تتضمن البوابة أيضًا staging rehearsal وbrowser-smoke، وتحتاج المتغيرات الأربعة المذكورة أعلاه. لا تشغل مسارين معًا على المنفذ 55440.

بعد النشر استخدم أوامر HTTP/Browser في PROGRAMMER_START_HERE. الـBrowser smoke لا يرسل طلبًا أو رسالة. اختبار الطلب الكامل المحلي يستخدم قاعدة اصطناعية ويمنع شبكة WhatsApp الخارجية قبل خروج الطلب.

أضيف مسار إدارة الجدول إلى test-release-v2 (السحب، السعر، Import/Export الفعليان)، وتجربة Staging المعزولة إلى CI. ملف quality.yml يبقى بصلاحية contents:read، checkout بلا credentials محفوظة، وActions مثبتة بـSHA. لم يُشغّل GitHub Actions عن بُعد ولم يُنفذ push؛ جرى تشغيل المكونات محليًا.

فحص التبعيات: `npm ls --all`، `npm audit --json`، و`npm audit --omit=dev --json`؛ لا تعتبر الفحص الأخير بديلًا عن gate الكامل. فشل التنبيه الجديد موثق في SECURITY_REVIEW.

## Runtime-only rehearsal and Maps

After the build, prepare a new runtime outside the builder with `node scripts/prepare-staging-runtime.cjs /absolute/new/runtime` (set npm_execpath to the installed npm CLI on Linux). Then run `PG_BIN=/path/to/pg16/bin QA_OUTPUT=/private/runtime-qa STAGING_RUNTIME_ROOT=/absolute/new/runtime python3 scripts/test-staging.py` from the builder. It creates another fresh loopback database, executes the unchanged staging identity/migration/backup gates and additionally runs production API/Next twice, uploads/retrieves a synthetic image, tests auth/tenant/SSR/static/image optimization, validates PM2 configuration and rejects unsafe environment. test-staging-matcher.cjs records the fixed patterns supplied to Next's bundled matcher. No real deployment or external Linux claim.

The official ordering browser suite invokes test-about-maps.cjs: all eight description/address/maps combinations × AR/EN × 360/390/430/1280, plus four invalid URL rejections. Screenshots cover Maps-only, description+Maps and full address. Existing social/feedback/accordion suites remain enabled. UI unit regressions cover independent blocks, unsafe links and unchanged city prefix.
