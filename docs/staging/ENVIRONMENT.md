# بيئة Staging

القالب التنفيذي الوحيد: `.env.staging.example`. الملف المكتمل يبقى خارج المصدر بصلاحية 600. لا تستخدم أسرار Production.

| المتغيرات | القيمة/الدور |
|---|---|
| ORDERSAWA_ENV / NODE_ENV | staging / production |
| ORDERSAWA_RELEASE_ID | staging- ثم SHA الإصدار؛ لا تستخدم شكل معرف Preview |
| STAGING_DB_HOST / PORT / NAME | هوية قاعدة منفصلة؛ افتراضي loopback:5432 وordersawa_staging |
| DATABASE_URL / DIRECT_URL | نفس هوية Staging، مستخدم غير superuser وكلمة مرور جديدة؛ URI-encode للأجزاء الخاصة. يمكن إضافة connection_limit=5 وpool_timeout=10. المستخدم يملك schema لهذه القاعدة فقط |
| JWT_SECRET | عشوائي مستقل 32 bytes أو أكثر |
| PUBLIC_WHATSAPP_CHECKOUT_HMAC_KEY | عشوائي مستقل 32 bytes بصيغة hex؛ مختلف عن JWT |
| INTERNAL_RESTAURANT_REWRITE_SECRET | قيمة عشوائية مستقلة؛ لا تدخل المتصفح |
| ENABLE_PUBLIC_NETWORK_WHATSAPP_CHECKOUT | 1 لتفعيل المسار الموثوق |
| DOMAIN_VERIFY_BYPASS | false |
| API_HOST / PORT / WEB_PORT | 127.0.0.1 / 5000 / 3000؛ القالب Nginx يطابقها |
| TRUST_PROXY | 127.0.0.1 فقط؛ Nginx يعيد كتابة رؤوس المصدر |
| WEB_ORIGIN / NEXT_PUBLIC_WEB_URL | https://STAGING_HOST دون slash أخير |
| API_ORIGIN | https://STAGING_HOST/api |
| CORS_ORIGINS | WEB_ORIGIN نفسها؛ الكود يدعم فروع المطاعم الصحيحة تحت ROOT_DOMAIN |
| ROOT_DOMAIN / NEXT_PUBLIC_ROOT_DOMAIN | STAGING_HOST دون https أو path |
| NEXT_PUBLIC_API_URL | /api؛ هذا متغير عام آمن |
| ORDERSAWA_PREVIEW_INTERNAL_API_URL | http://127.0.0.1:5000؛ الاسم تاريخي، ويستخدمه SSR في Staging أيضًا. ليس URL المعاينة الحالية |
| NEXT_TELEMETRY_DISABLED | 1 |
| ORDERSAWA_DEMO_UPLOADS_DIR | المسار الدائم /srv/ordersawa-staging/shared/uploads؛ الاسم تاريخي للصور المحلية |
| MAX_UPLOAD_MB / REQUEST_BODY_LIMIT_KB | 75 / 256؛ حدود حالية مع تحقق النوع الفعلي |
| CLOUDINARY_* | اختياري: حساب Staging للمزود الحالي. لا تغيير مزود التخزين؛ اترك مفاتيحه فارغة للاختبار المحلي، وبعض وظائف 3D تحتاجه |
| STAGING_SMOKE_EMAIL / PASSWORD / RESTAURANT_SLUG | هوية Owner تجريبية ومطعمها، كلمة مرور 16–72 bytes؛ تستخدم محليًا في smoke |
| STAGING_BOOTSTRAP_ADMIN_EMAIL / PASSWORD | أدمين اصطناعي لتهيئة قاعدة فارغة مرة واحدة |
| STAGING_SMOKE_WHATSAPP_PHONE | رقم اختباري بصيغة دولية؛ لا يرسل bootstrap أو smoke رسالة |

PM2 لا يمرر كلمات مرور bootstrap وsmoke إلى عمليات التطبيق. احذف مفاتيح bootstrap من الملف الخاص بعد التهيئة إن لم تعد تحتاجها. لا تطبع env أو تسجل JWT. لا تضبط SEED_DEMO_RESTAURANT أو ENABLE_DISPOSABLE_NETWORK_ORDERS.
