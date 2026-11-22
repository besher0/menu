# OrderSawa — ابدأ من هنا

هذه تعليمات سيرفر **Staging مستقل**. لا تنفذها على Production أو Preview الحالية. اقرأ قرار الإصدار في الحزمة أولًا: **BLOCKED يعني STOP قبل النشر**. لا يشير نجاح التجربة المحلية إلى نجاح سيرفر خارجي.

تبدأ مراجعة المرشح الحالي من [دليل المبرمج](../../PROGRAMMER_START_HERE.md) وتقرير الاعتماد المرافق لنسختك. يسجل PRIVATE_STAGING_EXCEPTION.md قرارًا مؤرخًا بشأن استثناء سابق. تحقّق من حالة النشرات ومن حكم Production الخاص بالإصدار المراد نشره.

## REQUIRED_FROM_SERVER_OWNER

1. سيرفر Linux مستقل، مستخدم تشغيل غير root، وصلاحية مسؤول لتثبيت Node/PostgreSQL/Nginx وTLS.
2. نطاق Staging مستقل وشهادة TLS للنطاق وفروعه `*.STAGING_HOST`؛ وضبط DNS الخاص بهذا السيرفر بواسطة المالك. لا تستخدم `rydtest.ordersawa.com` أو نطاق Production.
3. قاعدة جديدة `ordersawa_staging` ومستخدم خاص بها دون SUPERUSER/CREATEDB/CREATEROLE؛ أسرار جديدة خاصة بـStaging.
4. مكان دائم للصور والنسخ الاحتياطية، وحسابات تجريبية وبريدها ورقم واتساب اختباري. لا تستورد بيانات العملاء. إعدادات Cloudinary تجريبية فقط إن أردت اختبار المزود الحالي.

**PASS → CONTINUE. FAIL → STOP.** لا تستخدم `db push` أو `seed` أو `npm audit fix --force`.

## 1 — تجهيز التشغيل

الإصدارات المختبرة: Node **24.19.0**، npm **11.17.0**، PostgreSQL **16.15**. إعداد PM2 المرفق يستخدم عملية API واحدة وعملية Web واحدة، مع Nginx أمامهما. ثبت PM2 7.1.2. أدوات الإدارة التالية ينفذها مسؤول السيرفر:

```bash
node --version
npm --version
psql --version
sudo npm install -g pm2@7.1.2
sudo install -d -o ordersawa -g ordersawa -m 750 /srv/ordersawa-staging/releases /srv/ordersawa-staging/shared /srv/ordersawa-staging/shared/uploads /srv/ordersawa-staging/shared/backups
sudo -u postgres createuser --no-superuser --no-createdb --no-createrole --pwprompt ordersawa_staging_app
sudo -u postgres createdb --owner=ordersawa_staging_app ordersawa_staging
```

توقف إذا كانت القاعدة أو هوية السيرفر ليست جديدة ومخصصة لهذه المهمة. لا تحذف قاعدة موجودة كي ينجح الأمر.

## 2 — المصدر والبيئة الخاصة

ارفع محتوى `02_Application` إلى مجلد إصدار جديد داخل `releases`، واعمل كمستخدم `ordersawa`. مثال المسار `releases/RELEASE_ID`؛ استبدل RELEASE_ID بمعرف الحزمة، ولا تستخدم مجلد إصدار سابق.

```bash
cd /srv/ordersawa-staging/releases/RELEASE_ID
umask 077
cp .env.staging.example /srv/ordersawa-staging/shared/staging.env
chmod 600 /srv/ordersawa-staging/shared/staging.env
```

لا تنفذ النسخ فوق ملف بيئة موجود عند تحديث إصدار. حرّر الملف الخاص محليًا باستخدام `ENVIRONMENT.md`. أنشئ ثلاث قيم عشوائية مستقلة، قيمة لكل مفتاح، بالأمر التالي داخل طرفية خاصة، ولا تضعها في تذكرة أو Git:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

## 3 — التثبيت والبناء

```bash
export STAGING_ENV_FILE=/srv/ordersawa-staging/shared/staging.env
npm ci --include=dev
node --env-file="$STAGING_ENV_FILE" node_modules/prisma/build/index.js generate --schema apps/api/prisma/schema.prisma
node --env-file="$STAGING_ENV_FILE" "$(command -v npm)" run build
node --env-file="$STAGING_ENV_FILE" scripts/staging.cjs check
```

متوقع: Build ناجح و`PASS staging configuration and DB identity`. ملفات `.next` و`dist` تُبنى على السيرفر، ولا تأتي من Windows. لا تتجاهل خطأ identity أو صلاحيات القاعدة. يفحص check وmigrate جميع configurationTree المحفوظة (حتى المحذوفة منطقيًا)، ويوقفان التنفيذ عند schemaVersion غير 2 أو شكل غير مدعوم. تصريح عدم وجود بيانات V1 لا يلغي هذا الفحص؛ لا تحذفها أو تحولها إذا وجدها. يمنع فحص Staging اسم قاعدة غير مخصص أو Origin الخاص بالإنتاج/المعاينة المعروفة؛ لكنه لا يستطيع إثبات ملكية سيرفر مجهول، لذلك تحقق إداريًا من هويته أيضًا.

## 4 — الترحيلات والبيانات التجريبية

للتثبيت الأول:

```bash
node --env-file="$STAGING_ENV_FILE" scripts/staging.cjs migrate
node --env-file="$STAGING_ENV_FILE" scripts/staging.cjs bootstrap
```

ينشئ bootstrap حساب أدمين وحساب Owner ومطعمًا وصنفًا تجريبيين فقط، ويرفض وجود مستخدمين أو مطاعم أو باقات مسبقًا. كلمات المرور من الملف الخاص، ولا يطبعها. لا تعاود bootstrap عند التحديث. تفاصيل النسخ والترحيلات في `DATABASE.md`.

## فصل Builder عن Runtime قبل التشغيل

نفّذ check/migrate وbootstrap الأول فقط من builder بعد النسخ الاحتياطي والتحقق من الهوية. لا تشغّل PM2 من builder. على Linux نفسه وبعد نجاح البناء والاختبارات:

```bash
npm_execpath="$(realpath "$(command -v npm)")" node scripts/prepare-staging-runtime.cjs /srv/ordersawa-staging/runtime/RELEASE_ID
cd /srv/ordersawa-staging/runtime/RELEASE_ID
node scripts/verify-staging-runtime.cjs
npm audit --omit=dev
```

المجلد يجب أن يكون جديدًا وخارج builder. لا تنقل runtime مبنيًا على Windows إلى Linux؛ الحزمة تسلم المصدر وlock فقط. التثبيت لا يشغّل lifecycle scripts، وPrisma client/engine من نفس builder. Prisma CLI قد يبقى كـpeer رسمي للعميل؛ Vite/Vitest/TypeScript غير موجودة. احتفظ بـbuilder محميًا لأدوات migrations فقط، ولا تعرّضه على الشبكة. راجع الاستثناء لتفاصيل Next bundled matcher.

## 5 — التشغيل وTLS

```bash
cd /srv/ordersawa-staging/runtime/RELEASE_ID
pm2 start deploy/staging/ecosystem.config.cjs
pm2 status
pm2 logs ordersawa-staging-api --lines 60 --nostream
pm2 logs ordersawa-staging-web --lines 60 --nostream
curl --fail http://127.0.0.1:5000/health/ready
```

لا تستخدم `pm2 env` ولا تنشر dump البيئة. اقتصر على مستخدم تشغيل واحد واحمِ مجلد `.pm2` بصلاحية 700. راجع النسخة من `deploy/staging/nginx.conf.example` بعد استبدال STAGING_HOST ومسارات شهادة هذا السيرفر. ثبّتها كـserver مستقل:

```bash
sudo nginx -t
sudo systemctl reload nginx
pm2 save
```

فعّل استعادة PM2 بعد الإقلاع بواسطة `pm2 startup` واتبع الأمر الذي يولده لحساب `ordersawa` تحديدًا. المنافذ 3000 و5000 و5432 داخلية فقط؛ افتح 443 وSSH المقيد للمسؤول. لا تعدّل Cloudflare أو إعدادات مضيف Production.

## 6 — Smoke بعد النشر

```bash
node --env-file="$STAGING_ENV_FILE" scripts/staging.cjs smoke
npm install --prefix /srv/ordersawa-staging/shared/smoke-tools --no-save playwright@1.62.1
/srv/ordersawa-staging/shared/smoke-tools/node_modules/.bin/playwright install chromium
export PLAYWRIGHT_MODULE=/srv/ordersawa-staging/shared/smoke-tools/node_modules/playwright
node --env-file="$STAGING_ENV_FILE" scripts/staging-browser-smoke.cjs
```

متوقع: PASS من HTTP ومن Browser بعرض 390 و1280، وصور داخل `dist/staging-smoke`. الفحص يستخدم الصنف `staging-test-product` الذي أنشأه bootstrap؛ يحظر إرسال الطلبات وواتساب. إذا احتاج Chromium حزم Linux، ثبت متطلبات نظام Chromium المعلنة من Playwright كمسؤول، ثم أعد الفحص.

رابط Dashboard: `https://STAGING_HOST/login`. رابط المنيو: `https://STAGING_SMOKE_RESTAURANT_SLUG.STAGING_HOST/`. لا تستخدم مسار Preview `/m/...` مباشرة في Staging؛ هذا المسار الداخلي محمي.

## 7 — تأكيد الإصدار أو الرجوع

سجّل Commit، HTTP readiness، نتائج Browser، نجاح صورة الصنف والصلاحيات، ثم أعد تشغيل عمليتي PM2 وافحص readiness مرة أخرى. لا تعلن نجاح النشر قبل هذه الخطوة. عند الفشل: أبقِ الوصول الخارجي مغلقًا واتبع `ROLLBACK.md`؛ لا تصلح الخطأ بتعطيل auth أو تخفيف تحقق الأسعار.
