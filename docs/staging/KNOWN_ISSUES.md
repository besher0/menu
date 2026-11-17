# الملاحظات المتبقية

1. **HIGH unresolved — private Staging only, conditional**: NestJS fixed at 11.2.10; picomatch 4.0.7 still has no official patch. Full audit remains FAIL; runtime audit zero. See PRIVATE_STAGING_EXCEPTION.md for the exact seven-day scope, Next bundled matcher limitation, operator prerequisites and Production BLOCKED status.
2. **غير مختبر خارجيًا**: السيرفر الجديد وDNS وTLS وPM2/Nginx الحقيقيان وحساب Cloudinary غير متاحين. الملفات والأوامر وsmoke جاهزة؛ تنفيذها على هوية Staging الجديدة واجب بعد رفع مانع الاعتماد.
3. **جلسات حالية**: تخزين JWT في localStorage وlogout محلي فقط. تغيير كلمة المرور يبطل credential version. الانتقال إلى cookie/session revocation تصميم منفصل، ولم تُختلق طبقة جديدة ضمن المهمة.
4. **Maps-only fixed**: Drawer About now renders a valid independent Maps link even without address/description; existing URL allowlist and city formatting remain unchanged.
5. **الأداء**: قياسات API محلية وchecks responsive لا تساوي قياسات إنترنت موبايل أو اختبار تحمل طويل. حماية المعدل الحالية على عملية واحدة؛ لا توسيع PM2 instances دون تصميم rate-limit مشترك.

6. **V1 — قرار نهائي**: لا دعم تحويل تجاري. صُنفت الحالات الـ90 في V1_CASE_DISPOSITION.md؛ الاختبارات الحصرية للتنفيذ الملغى محفوظة byte-for-byte في tests/archive/configuration-v1. المدخل الرسمي يغطي جميع ملفات integration الحالية ويرفض أي failed/pending. حارس migration الأصلي باقٍ، وأضيف preflight read-only قبل migrate.
