# الترحيلات والنسخ

لا توجد Migration جديدة في إصلاحات هذا الإصدار، ولا تعديل لتاريخ migrations. طبق جميع ملفات `apps/api/prisma/migrations` باستخدام `scripts/staging.cjs migrate` الذي يفحص هوية القاعدة والدور أولًا. تم اختبار تاريخ الترحيلات على قاعدة فارغة وتجربة ترقية بيانات اصطناعية وفحص drift.

ترقية قاعدة تحتوي `configurationTree.schemaVersion=1` ليست مدعومة تلقائيًا: migration `20261114000000_unified_product_editor` تتوقف عمدًا دون تحويل أو حذف. اختبار الرفض المعزول يتوقع هذا الفشل ويتحقق أن أعمدة الترحيل لم تُضف. أضيف preflight إلى check/migrate قبل أي ترحيل: يفحص جميع التكوينات المحفوظة ويوقف التنفيذ عند schemaVersion غير 2 أو شكل غير كائن، دون تعديل الصفوف. البيانات العادية القديمة ثم تكوينات V2 الجديدة اجتازت الترقية والاستعادة. لا تستخدم الحزمة لترقية قاعدة V1 محفوظة قبل معالجة مستقلة مع المالك؛ Staging الجديدة الفارغة لا تحتوي هذه الحالة.

قبل كل تحديث على Staging موجودة:

```bash
umask 077
export STAGING_ENV_FILE=/srv/ordersawa-staging/shared/staging.env
node --env-file="$STAGING_ENV_FILE" scripts/staging.cjs check
node --env-file="$STAGING_ENV_FILE" scripts/staging.cjs backup "/srv/ordersawa-staging/shared/backups/pre-release-$(date -u +%Y%m%dT%H%M%SZ).dump"
```

نسخ الصور المحلية:

```bash
tar -czf "/srv/ordersawa-staging/shared/backups/uploads-$(date -u +%Y%m%dT%H%M%SZ).tar.gz" -C /srv/ordersawa-staging/shared uploads
```

النسخ بصلاحية 600 ولا تدخل ZIP التسليم. في Cloudinary استخدم سياسة نسخ خاصة بحساب Staging نفسه؛ dump قاعدة البيانات لا ينسخ الصور الخارجية.

تجربة استعادة على قاعدة **جديدة** باسم مخصص؛ لا تستخدم --clean فوق قاعدة موجودة:

```bash
sudo -u postgres createdb --owner=ordersawa_staging_app ordersawa_staging_restore_check
pg_restore --exit-on-error --no-owner --host=127.0.0.1 --username=ordersawa_staging_app --dbname=ordersawa_staging_restore_check /ABSOLUTE/PATH/VERIFIED-STAGING-BACKUP.dump
psql --host=127.0.0.1 --username=ordersawa_staging_app --dbname=ordersawa_staging_restore_check -c 'SELECT current_database(), count(*) FROM "_prisma_migrations" GROUP BY current_database();'
```

أدخل كلمة المرور عبر prompt أو `.pgpass` خاص 600؛ لا تضعها في سطر الأوامر. قارن أعداد الصفوف والجداول والقيود مع مصدر النسخة الخاص بـStaging. لا تعتبر مجرد خروج pg_restore بصفر دليلًا على تطابق البيانات.

إعادة تجربة محلية آلية: `PG_BIN=/path/to/postgresql/bin QA_OUTPUT=/private/test-output python3 scripts/test-staging.py`. تنشئ cluster جديدًا، دورًا غير superuser وقاعدتين، وتفحص منع الهدف الخاطئ وإعادة bootstrap ثم تطابق عدد المستخدمين والمطاعم والأصناف بعد الاستعادة. لا تقرأ `.env` ولا تستخدم قاعدة موجودة. الملفات تحتوي بيانات اصطناعية فقط وتبقى خارج المصدر.

أكّد المؤسس عدم وجود تكوينات V1/V2 تجارية في الإنتاج؛ لم نفحص الإنتاج أو نعدّلها. هذا التصريح لا يلغي preflight على قاعدة الهدف الفعلية مستقبلًا.
