# بدء العمل على OrderSawa

هذا المرشح مبني فوق `25b5946e530b929fe7da9716e54523e3eef822f4` من `besher0/menu`، فرع `feature/product-configuration-network`. يضيف إصلاحات حفظ الإعدادات والبنرات وصور المنيو والرجوع وتفاصيل الوجبات. مصدر التطبيق المتغير طُوبق بإصدار Staging المسمى `meal-details-3015f66b19bb`. اقرأ حكم الجاهزية وManifest المرفقين بالتسليم لمعرفة ما اختُبر. إصدار الفرع الحالي وحده لا يتضمن كامل هذا المرشح.

## الحصول على المصدر والتشغيل محليًا

1. استخدم مجلد المصدر في التسليم. بعد رفع الإصدار بموافقة المؤسس يمكنك جلبه بالأوامر التالية ومقارنة SHA بالإصدار المعتمد عند الرفع.

   ```bash
   git clone --branch feature/product-configuration-network --single-branch https://github.com/besher0/menu.git
   cd menu
   git rev-parse HEAD
   ```

2. ثبّت Node 24.19.0 وnpm 11.17.0 وPython 3.11+ وأدوات PostgreSQL. يستخدم CI PostgreSQL 16. وفّر قاعدة تطوير خاصة على loopback ودورًا مخصصًا لها. للاختبارات الكاملة يلزم توفر أدوات الخادم بما فيها initdb وpg_ctl وpg_dump وpg_restore.
3. من جذر المصدر، انسخ `.env.example` إلى ملف خاص خارج Git، واضبط فيه عناوين التطوير وبيانات قاعدة التطوير، وJWT عشوائيًا. راجع إعدادات Checkout ومتغيرات الواجهة في المثال. ابنِ القيم NEXT_PUBLIC_* لبيئة الوجهة. تستخدم بيئة Staging مثالها المنفصل `.env.staging.example`. الأوامر التالية لـBash على Linux، مع استبدال مسار البيئة بمسارك الخاص.

   ```bash
   export DEV_ENV_FILE="$HOME/.config/ordersawa/development.env"
   npm ci --no-audit --no-fund
   npm ls --all
   npm run prisma:generate
   node --env-file="$DEV_ENV_FILE" node_modules/prisma/build/index.js migrate status --schema apps/api/prisma/schema.prisma
   ```

4. تحقّق من المضيف والقاعدة والدور في ملفك الخاص. عند البدء بقاعدة تطوير فارغة مؤكدة الهوية أو ترقية نسخة اختبار احتفظت بنسختها الاحتياطية، طبّق الترحيلات من الجذر. على Staging استخدم preflight المحروس في قسم التشغيل أدناه. إذا كشف عن تكوين V1 محفوظ، أوقف الترحيل واطلب قرار تحويل بيانات منفصلًا.

   ```bash
   node --env-file="$DEV_ENV_FILE" node_modules/prisma/build/index.js migrate deploy --schema apps/api/prisma/schema.prisma
   node --env-file="$DEV_ENV_FILE" "$(command -v npm)" run build
   npm run typecheck
   node --env-file="$DEV_ENV_FILE" "$(command -v npm)" run dev
   ```

   يطلق dev خادمي Web وAPI. افحص `http://localhost:5000/health` و`http://localhost:5000/health/ready` وصفحة `http://localhost:3000/login`. يبني أمر build وحدات Shared ثم API ثم Web.

## اختبار المرشح

ابدأ من جذر نسخة نظيفة. تحقّق من فحوص TypeScript بما فيها ملفات اختبارات API، وفحوص الاعتمادات والأسرار. يقرأ ماسح Git الفهرس؛ لفحص مجلد تسليم غير مفهرس استخدم خيار `--snapshot`.

```bash
npm run typecheck
npx --no-install tsc -p apps/api/tsconfig.json --noEmit
python scripts/test-credential-scan.py
python scripts/scan-source.py
npm audit --audit-level=high --registry=https://registry.npmjs.org
```

تشغّل البوابة التالية اختبارات Shared وWeb وAPI وقواعد PostgreSQL وHTTP ومتصفحًا على بيانات اصطناعية. نفّذها من مستخدم عادي له حق تشغيل initdb. استخدم مسارًا جديدًا لنواتج كل جولة. تفاصيل الأدوات والإصدارات في `.github/workflows/quality.yml`.

```bash
export QA_OUTPUT="$(mktemp -d)"
export PG_BIN="$(pg_config --bindir)"
export NEXT_PUBLIC_API_URL=/api NEXT_TELEMETRY_DISABLED=1
export ORDERSAWA_RELEASE_ID="20000101T000000Z-$(git rev-parse --short=12 HEAD)"
npm install --prefix "$QA_OUTPUT/browser-tools" --no-package-lock --no-fund playwright@1.62.1
node "$QA_OUTPUT/browser-tools/node_modules/playwright/cli.js" install --with-deps chromium
export PLAYWRIGHT_MODULE="$QA_OUTPUT/browser-tools/node_modules/playwright"
export V62_BROWSER_EXECUTABLE="$(node -p 'require(process.env.PLAYWRIGHT_MODULE).chromium.executablePath()')"
python scripts/build-with-credential-check.py
python scripts/test-release-v2.py
```

للتشخيص، افتح `checks.json` وملف المرحلة التي توقفت داخل QA_OUTPUT. اختبارات V1 التاريخية مصنفة في `docs/staging/V1_CASE_DISPOSITION.json`. لا تُحسب الحالات المؤرشفة كاختبارات ناجحة. في Staging استخدم `pm2 logs ordersawa-staging-api --lines 60 --nostream` وسجل الويب المقابل. احذف البيانات الشخصية من أي مقتطف تسلّمه للدعم.

## التحديث والرجوع

- دليل خادم Staging يشرح إعداد Nginx وTLS وPM2 والملف الخاص، وفصل Builder عن Runtime. وصف الاستثناء الأمني المؤرخ في ذلك الدليل سجل تاريخي. استخدم فحص التبعيات الحالي وتقرير هذه الحزمة للحكم الجديد. [دليل الخادم](docs/staging/PROGRAMMER_START_HERE.md)
- قبل التحديث، سجّل نسختي Web وAPI الفعليتين بصورة مستقلة، وخذ نسخة قاعدة ووسائط قابلة للاستعادة. شغّل `node --env-file="$STAGING_ENV_FILE" scripts/staging.cjs check` على Staging المقصودة. لا توجد Migration جديدة في فرق هذا المرشح. لا تُعد seed ولا تنقل بيانات Staging إلى Production. [الترحيلات والاستعادة](docs/staging/DATABASE.md)
- جهّز الإصدار في مجلد جديد، وابنه بالقيم الصحيحة ثم نفّذ فحص الـRuntime وفق دليل الخادم. بعد ترخيص النشر افحص readiness والمنيو والسلة ودخول المالك. إذا احتاج الفحص صنف bootstrap، استخدم بيئة اختبار تحتوي تلك العينة. لا تُعِد إنشاء صنف تجريبي في كتالوج مطعم.
- عند إخفاق الإصدار أعد تشغيل مجلدي التشغيل السابقين وإعدادات كل خدمة. استعادة بيانات التشغيل إجراء مستقل قد يزيل كتابات أحدث. [دليل الرجوع](docs/staging/ROLLBACK.md)
- نظام أنواع المنيو الثلاثة وربط التخطيط بفتح Popup/Page مسؤولية المبرمج الأساسي. تُراجع تغييرات الأسعار والصلاحيات وهوية المطعم ونقل البيانات مع المؤسس. قرارات الصور المؤجلة D-009 وD-010 وD-011 موضحة في [سجل القرارات](docs/decisions/DEFERRED_FEATURES.md). [خريطة المصدر](docs/engineering/INTEGRATION_ARCHITECTURE.md)
