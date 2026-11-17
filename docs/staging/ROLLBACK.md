# الرجوع

قبل التحديث احتفظ بمجلد Runtime المحضّر للإصدار السابق وبمجلد Builder المحمي ونسخة قاعدة Staging وصورها ونسخة ملف بيئتها في مكان خاص. لا تعيد استخدام مجلد إصدار قديم للبناء.

عند فشل الإصدار الجديد، أوقف عمليتيه فقط:

```bash
pm2 stop ordersawa-staging-web ordersawa-staging-api
cd /srv/ordersawa-staging/runtime/PREVIOUS_RELEASE_ID
export STAGING_ENV_FILE=/srv/ordersawa-staging/shared/PREVIOUS_PRIVATE_ENV_FILE
node --env-file="$STAGING_ENV_FILE" scripts/staging.cjs check
pm2 delete ordersawa-staging-web ordersawa-staging-api
pm2 start deploy/staging/ecosystem.config.cjs
curl --fail http://127.0.0.1:5000/health/ready
node --env-file="$STAGING_ENV_FILE" scripts/staging.cjs smoke
pm2 save
```

استبدل المسارين بمعرفات نسخة Staging سابقة تم تشغيلها والتحقق منها وتحتوي أدوات deploy/staging. HEAD الأساسي وحده لا يحتوي أدوات Staging الجديدة، فلا تعتبره Artifact رجوع جاهزًا بهذه الأوامر. هذا الإصدار لم يغير schema، لذلك لا يحتاج rollback للقاعدة عند الرجوع إلى HEAD الأساسي. لا تستخدم migrate reset أو حذف migrations أو تعديل `_prisma_migrations`.

إذا كانت هناك تغييرات بيانات لاحقة تستلزم الاستعادة، استعد النسخة في **قاعدة جديدة** من نمط `ordersawa_staging_*`، وتحقق من هويتها ومحتواها وفق DATABASE.md، ثم غيّر متغيرات هوية Staging وDSN في ملف خاص جديد وأعد تشغيل النسخة المطابقة. لا تستعد فوق قاعدة عاملة. أي فقد محتمل لكتابات أحدث يحتاج قرار مالك البيانات؛ توقف عن تلك العملية فقط.

على سيرفر جديد بلا إصدار سابق: أوقف التطبيق واترك النسخة المرفوعة متاحة للفحص؛ لا تحذف القاعدة لتجاوز المشكلة.
