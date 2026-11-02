# OrderSawa — دليل استخدام المعاينة اليومية

التاريخ: 2 نوفمبر 2026. **السكربتات أُعدّت واختُبرت جزئيًا، لكن خدمات Windows لم تُثبّت بعد.** لا تشغّل أوامر `start/stop/restart/update` على أساس أن النظام الجديد يخدم الرابط الخارجي حاليًا. راجع `ORDERSAWA_PERSISTENT_PREVIEW_INSTALLATION_READY_AR.md` أولًا.

## الآن، قبل موافقة التثبيت

- `ops/demo/status-demo.ps1`: فحص قراءة فقط؛ من المتوقع أن تظهر الخدمات الخمس `NotInstalled`.
- `ops/demo/update-demo.ps1 -BuildOnly`: يبني مرشحًا ويفحصه دون تبديل المعاينة. قد ينشئ قاعدة PostgreSQL اختبار مؤقتة باسم مقيد، ويحذفها بعد الاختبار؛ لا ينفذ Seed/Reset لقاعدة Demo.
- `ops/demo/install-demo-services.ps1 -PreflightOnly -ReleaseId '20261101T235437Z-b4a1cb187de7'`: يفحص الشروط ويولّد XML معاينة فقط. لا يسجل خدمة ولا يوقف عملية.
- `ops/demo/test-demo-manifest.ps1 -ReleaseId '20261101T235437Z-b4a1cb187de7'`: يفحص manifest ويجرب التبديل والرجوع على مجلد اختبار.

المعاينة الحالية على `https://rydtest.ordersawa.com` ما زالت تعتمد على عمليات يدوية وموصل نفق يدوي. لا تشغّل نسخًا إضافية على 3210/3102/5001/55448، ولا توقف عمليات مستخدم آخر بالـPID. أَسْرار Cloudflare لا تُرسل في المحادثة.

## بعد التثبيت والقبول فقط

من داخل `menu-main`. فحص الحالة قراءة فقط؛ أوامر التحكم بالخدمات والتحديث/الرجوع تتطلب صلاحية Windows Administrator أو تفويضًا محددًا للخدمات، ولا تعني منح Codex صلاحية دائمة:

```powershell
& .\ops\demo\status-demo.ps1
& .\ops\demo\start-demo.ps1
& .\ops\demo\stop-demo.ps1
& .\ops\demo\restart-demo.ps1
& .\ops\demo\update-demo.ps1 -BuildOnly
& .\ops\demo\update-demo.ps1
& .\ops\demo\rollback-demo.ps1 -ReleaseId '<إصدار سابق مختبر>' -ConfirmRollback
```

ترتيب الصيانة الآمن: احتفظ باتصال بعيد مستقل عن المعاينة، افحص `status-demo`، ابنِ المرشح بـ`-BuildOnly` وراجع نتائجه، ثم شغّل التحديث العادي. التحديث يأخذ backup ويبدّل API/Web مع فحص الإصدار؛ لا يعيد PostgreSQL أو Cloudflare ولا يعيد Seed. إذا لم يتغير المصدر، لا يعيد تشغيل الخدمات. يستخدم الرجوع إصدار تطبيق سابقًا متوافقًا مع نفس Schema ولا يرجع قاعدة البيانات. إذا انقطع الإنترنت أو أُطفئ الكمبيوتر، فلن يتاح الرابط من 4G حتى تعود الطاقة والاتصال وتعمل الخدمات والنفق، حتى لو كانت مهيأة للبدء التلقائي.

اختبر دائمًا من هاتف مخوّل وراء Cloudflare Access: القائمة، الصور، Checkout، Dashboard، وعقد الرسالة. شاشة Access وحدها ليست إثبات صحة التطبيق. لا تُعد تشغيل Windows دون موافقة مستقلة، ولا تُنشر هذه السكربتات على Production.
