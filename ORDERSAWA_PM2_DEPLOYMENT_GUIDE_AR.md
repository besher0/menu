# OrderSawa — دليل المبرمج لنشر Release Candidate بواسطة PM2

**دليل تحضيري، لا إذن نشر.** النظام الفعلي PM2 وقاعدة PostgreSQL خارجية 18.6 باسم `menu` بحسب المؤسس؛ لم نفحص السيرفر. لا نعرف أسماء PM2 processes أو المسارات أو عدد النسخ أو Reverse Proxy أو طريقة حقن الأسرار. عيّن القيم أدناه من السيرفر دون إرسال credentials أو `.env` إلى Git/Codex. لا تنفذ أي Migration/Deployment/Flag ON قبل بوابات الموافقة المنفصلة في `ORDERSAWA_RELEASE_BLOCKERS_AND_APPROVALS_AR.md`.

## مدخلات يحددها المبرمج

`<CURRENT_RELEASE_DIR>`، `<NEW_RELEASE_DIR>`، `<API_PM2_ID>`، `<WEB_PM2_ID>`، `<API_PORT>`، `<WEB_PORT>`، `<PROXY_CONFIG>`، `<SECRET_STORE>`، `<STAGING_DATABASE>`، `<RESTORE_EVIDENCE>`، `<MAINTENANCE_WINDOW>` و`<ROLLBACK_OWNER>`. تحقّق هل PM2 يشغّل `npm start` أو `dist` مباشرة أو ecosystem file، وهل API/Web نسخة واحدة أم أكثر. لا تعتمد على `docker-compose.yml` المحلي فهو يعرّف PostgreSQL تطويرية فقط وليس نشر PM2.

## 1. مطابقة الكود قبل أي استبدال

1. على السيرفر، احصل على نسخة/Hash/`git status` للكود الحالي إن كان Git موجودًا، وعلى `pm2 ls` و`pm2 describe <API_PM2_ID>` و`pm2 describe <WEB_PM2_ID>` (لا تشارك مخرجات env/secrets). إن لم يكن Git موجودًا، قارن checksums وقائمة الملفات المهمة خارج مجلدات `.env` وuploads؛ لا تفترض أن GitHub يحتوي تعديلات Codex.
2. تحقق من `ORDERSAWA_FINAL_INTEGRATION_PACKAGE_MANIFEST_AR.md` المرسل **بجانب** ZIP: SHA-256 للأرشيف، branch، source commit، baseline commit. استخرج ZIP إلى `<NEW_RELEASE_DIR>` جديد، لا فوق النسخة الحية. قارن تغييرات السيرفر المحلية وملفات config/uploads والصور قبل التبديل؛ أي تعارض يحتاج Merge/مراجعة، لا overwrite صامتًا.
3. احتفظ بنسخة Binary الحالية ومخطط Restart/Proxy، واعرف من يقرر التراجع. لا تضع Backup قاعدة البيانات في مجلد الإصدار أو الأرشيف.

## 2. تجهيز build بعيدًا عن Production traffic

- استخدم Node.js وnpm الموافقين لقيود `package.json`/`package-lock.json` ولإصدار السيرفر المجرب؛ تحقق من النسختين فعلًا. نفّذ `npm ci` داخل `<NEW_RELEASE_DIR>`؛ **لا** تستخدم `npm install` لتغيير lockfile أثناء النشر. إذا احتاج build متغيرات public، اضبط قيم staging/production المعتمدة دون طباعة أسرار.
- من Secret Store/آلية السيرفر الحالية، جهّز `DATABASE_URL` و`DIRECT_URL` بعد تدقيق الاتصال/SSL والصلاحيات؛ لا تنسخ `.env` الحقيقية إلى ZIP. في الإصدار الجديد شغّل `npm run prisma:generate`، ثم `npm run typecheck` و`npm run build`. `prisma generate` لا يرحّل قاعدة البيانات؛ **لا** تشغّل `prisma db push` أو `migrate deploy` ضمن build script.
- افحص `apps/api/package.json` و`apps/web/package.json` وPM2 configuration الفعلي لتحديد أمر start الصحيح؛ لا تفترض أسماء executables أو ports من هذا الدليل. حافظ على uploads/media وCDN/Cloudinary والروابط والدومينات كما هي.
- راجع متغيرات `.env.example` كقائمة أسماء فقط: `JWT_SECRET`, DB URLs, API/Web/Root origins, `CORS_ORIGINS`, `TRUST_PROXY`, rate-limit values، `NEXT_PUBLIC_API_URL`/`NEXT_PUBLIC_WEB_URL`, Cloudinary. `ENABLE_PUBLIC_NETWORK_WHATSAPP_CHECKOUT=0` أولًا. `PUBLIC_WHATSAPP_CHECKOUT_HMAC_KEY` hex عشوائي لا يقل عن 32 byte عند قرار ON؛ لا تطبع قيمته أو بصمته العامة، وزّعه بالتساوي على API instances عبر Secret Store. لا تستخدم مفتاح الاختبارات. أبقِ `ENABLE_DISPOSABLE_NETWORK_ORDERS` غير مفعّل.

## 3. تسلسل قاعدة البيانات والنشر — موافقات منفصلة

A. تأكيد نجاح Restore للـBackup بواسطة المبرمج وإثبات إمكانية استخدامها، لا مجرد وجود ملف.

B. راجع تقرير read-only المرفق بتاريخ 17 أكتوبر 2026: **5/5 migration checksums مطابقة** و`numeric(10,2)` للأعمدة الأربع و0 تعارض مالي في الحقول المفحوصة. لا تعُد إلى فرضية أن checksums مجهولة، لكن التقرير ليس Dump ولا يشمل Legacy Option money. أي إعادة فحص مباشرة من `menu` تحتاج إذنًا منفصلًا؛ أعد metadata/Aggregate قبل DDL ولا تعرض PII. **STOP** عند drift أو بيانات تغيرت أو غير متوافقة.

C. بروفة الترحيل على Restore معزولة من القاعدة نفسها، مقارنة Prisma، وتجربة Legacy Order/Analytics وDashboard/Network/Mixed، مع خطة forward-fix/rollback.

D. مراجعة النتائج والحصول على **موافقة Production Migration مستقلة**. الإجراء SQL لا يُؤخذ تلقائيًا من script disposable؛ لا db push/migrate resolve آليًا، ولا Candidate DB Completeness Guard.

E. بعد الترحيل الموافق عليه، تحقق من الأعمدة/القيود والفهارس والدقة وPrisma Client وLegacy smoke، ثم احصل على **موافقة Deployment منفصلة**.

F. انشر `<NEW_RELEASE_DIR>` باستخدام آلية PM2 الفعلية. إذا كانت تعريفات PM2 تشير إلى symlink للإصدار، بدّل symlink وفق Runbook السيرفر ثم `pm2 reload <API_PM2_ID> --update-env` و`pm2 reload <WEB_PM2_ID> --update-env` مع ترتيب/health check يحدده المبرمج. إن كانت التعريفات تشير إلى path ثابت أو ecosystem file، اتبع إعداد السيرفر بدل تنفيذ هذه الأوامر حرفيًا. لا تفترض zero-downtime من اسم `reload`؛ افحص instance count وProxy وتوافق DB/Binary.

G. والعلم `OFF`: اختبر Login/Dashboard القديم، Public Menu، Legacy-only cart→WhatsApp، إنشاء `Order`/`OrderItem` وحدث Analytics، الأسعار السورية الصحيحة، عدم ظهور Network setup ناقص، ورفض Network/Mixed بأمان. اختبر `/orders/network-test/*` مرفوضة من الوصول العام. راقب 400/403/409/429/500 و`P2022` وDB connections دون تسجيل PII أو token أو URL فيها بيانات عميل.

H. فقط بعد موافقة تفعيل مستقلة: اضبط علم WhatsApp العام `ON` وفق آلية السيرفر، أعد تحميل PM2 بالتدرج، واختبر Network-only وMixed باستخدام مطعم تجريبي مصرح به، رقم WhatsApp رسمي/اختباري مناسب، وبيانات عميل غير حقيقية؛ تحقق من Quote/Prepare/Confirm وإعادة قبول تغير السعر وURL. الزبون يرسل بنفسه، لا إرسال آلي. راقب الأخطاء والأداء وRate Limit.

## التراجع العملي

1. أول خطوة: أعد `ENABLE_PUBLIC_NETWORK_WHATSAPP_CHECKOUT=0` وأعد تحميل API/Web حسب topology، ثم تحقق من Legacy. هذا لا يحذف بيانات Network أو يلغي SQL.
2. إذا تعطل Binary الجديد، ارجع إلى `<CURRENT_RELEASE_DIR>` بعد إثبات توافقه مع Schema التي ترحّلت. لا تُرجع schema عمياء: `basePrice=NULL` وTree/Dependency وStage 6C أعمدة قد تجعل Binary القديم غير متوافق. استخدم Restore كاملة فقط ضمن موافقة منفصلة مع تقدير فقد البيانات، أو forward-fix مراجَع.
3. حافظ على logs محدودة الاحتفاظ ومنزوعة PII، وسجّل توقيت التدخل، version/hash، الأعراض، schema checks، قرار التراجع ومسؤول الموافقة. لا تضع قيم `DATABASE_URL` أو HMAC أو أرقام الزبائن في التذكرة.

## Smoke matrix مختصر

| الحالة | المتوقع |
|---|---|
| Flag OFF؛ Legacy-only | Checkout القديم، Order/Items/Analytics مرة واحدة؛ رسالة WhatsApp وURL صحيحان. |
| Flag OFF؛ Network/Mixed | رفض/إخفاء آمن؛ لا مرور إلى Legacy endpoint ولا Order تجريبية. |
| Flag ON؛ Legacy-only | المسار القديم نفسه؛ direct trusted endpoint يرد `400 LEGACY_CHECKOUT_REQUIRED`. |
| Flag ON؛ Network/Mixed | Shared Quote وTrusted Prepare/Confirm؛ رسالة كاملة؛ لا Order محفوظة حاليًا؛ تغير السعر/Revision يطلب موافقة جديدة. |
| أي حالة | المطعم والعُملة والرقم الرسمي صحيحون؛ لا PII/Prisma internals في Logs؛ `NETWORK_TEST` محجوبة. |

هذا الدليل لا يحل محل تفاصيل السيرفر الحقيقية. عليه أن يملأ placeholders، يفحص النسخة الحالية، ويعرض نتائج Restore/metadata/staging على المؤسس قبل كل موافقة.

## أوامر تشغيل مرشحة للمبرمج — Linux/POSIX فقط وبعد الموافقات المحددة

هذه الأوامر **تعليمات مستقبلية**؛ لم تُنفذ على السيرفر. إن لم يكن نظام السيرفر Linux/POSIX أو لم تُعرف مسارات PM2/Secret Store/Restore، **STOP** وأرسل هذه المعلومات للمؤسس بدل تعديل الأوامر تخمينًا. جميع المتغيرات بين `<...>` يحددها المبرمج من السيرفر؛ لا ترسل قيم DB/HMAC، ولا تنقل `.env` أو uploads إلى ZIP. لا تستخدم حساب Production في خطوات Restore.

### 1 — فحص الحزمة والنسخة الحالية، دون تغيير الخدمة

```sh
export PACKAGE_ZIP='<ABSOLUTE_PATH_TO_ORDERSAWA_FINAL_INTEGRATION_PACKAGE.zip>'
export CURRENT_RELEASE_DIR='<CURRENT_PM2_SOURCE_DIRECTORY>'
export NEW_RELEASE_DIR='<NEW_EMPTY_RELEASE_DIRECTORY>'
sha256sum "$PACKAGE_ZIP"
unzip -t "$PACKAGE_ZIP"
mkdir -p "$NEW_RELEASE_DIR"
unzip -q "$PACKAGE_ZIP" -d "$NEW_RELEASE_DIR"
pm2 ls
pm2 describe '<ACTUAL_API_PM2_ID>'
pm2 describe '<ACTUAL_WEB_PM2_ID>'
git -C "$CURRENT_RELEASE_DIR" status --short --branch
git -C "$CURRENT_RELEASE_DIR" rev-parse HEAD
```

**Expected:** SHA-256 يساوي Release Manifest المرسل بجانب ZIP، `unzip -t` بلا خطأ، PM2 يحدد المسارات والنسخ الفعلية. **PASS:** المصدر الحالي معروف ونسخته/تعديلاته موثقة، ولا يتداخل `NEW_RELEASE_DIR` مع `.env`/uploads الحية. **STOP:** hash مختلف، أرشيف ناقص، مصدر سيرفر مختلف غير مراجع، PM2 topology غير مفهومة أو Git غير موجود دون جرد بديل. **Next:** أرسل مقارنة الملفات/الاختلافات للمؤسس؛ لا تستبدلها بصمت. `.env.example` الجديدة فقط تغيّر `DOMAIN_VERIFY_BYPASS` الافتراضي إلى `false`؛ لا تغيّر `.env` الحية دون موافقة مستقلة.

### 2 — بروفة على Restore منفصلة، لا على `menu`

أثبت نجاح Restore أولًا بإجراء المبرمج المعتمد على قاعدة **جديدة ومعزولة** ثم أدخل URL من Secret Store دون عرضه في الأوامر أو logs. لا تستخدم حساب Production في البروفة. أدناه أوامر الفحص على Restore فقط:

```sh
cd "$NEW_RELEASE_DIR"
read -r -s -p 'Isolated restored DB URL: ' DATABASE_URL; printf '\n'
export DATABASE_URL
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -f apps/api/prisma/stage6f0-readonly-preflight.sql
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -f apps/api/prisma/stage6f4-readonly-data-prechecks.sql
npx prisma migrate status --schema apps/api/prisma/schema.prisma
```

**Expected:** PostgreSQL 18.6، خمس migrations سابقة مكتملة ببصمات Manifest، أربعة أعمدة مالية `numeric(10,2)`، غياب Stage 2C/6C، لا drift غير متوقع، ولا قيم مالية غير متوافقة في counts الإجمالية بما فيها Legacy Options. **PASS:** تطابق الحالة الفعلية مع التقرير السابق أو توثيق فرق مفهوم ومراجع؛ لا PII أو أسعار فردية في المخرجات. **STOP:** اختلاف checksum/DDL، قيمة سالبة أو SYP كسرية أو >6 منازل/overflow، Restore غير مثبتة، أو أي خطأ `psql`/Prisma. **Next:** أرسل التقرير المُنقح للمؤسس؛ لا تُصلح بيانات أو تاريخ migrations من تلقاء نفسك.

فقط إن كانت الخمس القديمة مطبقة ولا توجد تغييرات أخرى معلقة سوى Stage 2C ثم Stage 6C، جرّب على Restore المنفصلة:

```sh
npx prisma migrate deploy --schema apps/api/prisma/schema.prisma
npx prisma migrate status --schema apps/api/prisma/schema.prisma
npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel apps/api/prisma/schema.prisma --exit-code
npm run prisma:generate
npm run typecheck
npm run build
```

**Expected:** تطبيق Migrationَي `20261012000000_product_configuration_network` و`20261013000000_network_order_test_snapshot` فقط؛ diff فارغ (exit 0)؛ build/typecheck ناجحان. **PASS:** Legacy Order/OrderItem/Analytics باقية، Product Option القديمة باقية، Product Tree/Dependency وPrisma Client تعمل، Smoke Legacy/Network/Mixed على Restore ناجح، وخطة rollback/forward-fix موثقة. **STOP:** أي migration ثالثة/فشل/Drift/P2022، بيانات قديمة تغيّرت، أو فشل اختبار؛ لا `db push` ولا `migrate resolve` ولا Candidate DB Guard. **Next:** أرسل نتائج البروفة ووقت الأقفال/التوقف للمؤسس واطلب موافقة Production Migration **مستقلة**.

### 3 — تنفيذ Production بعد موافقات منفصلة فقط

بعد موافقة مكتوبة على ترحيل Production وتثبيت Backup/Restore، أعِد read-only metadata/counts على `menu` بدور معتمد وبإذن القراءة المحدد، ثم بدور الترحيل الموافق عليه نفّذ **فقط** أمر Prisma الرسمي أعلاه موجّهًا إلى `menu` وفق Runbook/نافذة الصيانة الموافق عليها. **Expected/PASS:** Stage 2C و6C فقط، Prisma status متسق، diff فارغ، Legacy smoke ناجح. **STOP:** أي اختلاف عن البروفة؛ أبقِ API القديمة بعيدًا عن Schema غير المتوافقة واطلب قرار rollback/forward-fix، ولا تعدّل `_prisma_migrations` يدويًا. **Next:** موافقة Deployment منفصلة.

بعد موافقة Deployment، ابنِ المصدر الجديد في مجلد مستقل كما في §2، واجعل `ENABLE_PUBLIC_NETWORK_WHATSAPP_CHECKOUT=0` في إعدادات العملية الرسمية (ليس تعديل `.env` صامتًا)، ثم استخدم عملية التبديل/`pm2 reload '<ACTUAL_ID>' --update-env` **فقط بعد** التحقق من تعريف PM2 وعدد النسخ والـProxy. **Expected/PASS:** API/Web healthy، Legacy Checkout يحفظ Order/Analytics مرة واحدة، Network/Mixed محجوبتان، `NETWORK_TEST` محجوبة، لا P2022/5xx غير متوقع. **STOP:** خلل Legacy أو تضارب Binary/Schema؛ أعد العلم OFF، أوقف تحويل المرور أو ارجع Binary فقط إن ثبت توافقها مع Schema، وأرسل الحالة للمؤسس. **Next:** موافقة تفعيل Network/Mixed منفصلة؛ بعدها اختبر مطعمًا تجريبيًا وOfficial WhatsApp URL دون إرسال تلقائي أو بيانات عميل حقيقية، وراقب الأخطاء. لا تعني موافقة الترحيل موافقة النشر أو التفعيل.
