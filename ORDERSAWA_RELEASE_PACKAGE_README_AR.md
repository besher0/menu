# حزمة مصدر OrderSawa المستقلة — Stage 6F.4

هذه الحزمة Snapshot كاملة من Git commit محدد، تشمل `apps/api` و`apps/web` و`packages/shared` و`apps/api/prisma/schema.prisma` وملفات Migrations الرسمية و`package.json`/`package-lock.json` و`.env.example` والتقارير/أدوات SQL المرشحة. **لا تحتوي `.git` ولا `.env` حقيقية ولا `node_modules` ولا Backup أو بيانات مطاعم.**

استلم مع ZIP ملف `ORDERSAWA_FINAL_INTEGRATION_PACKAGE_MANIFEST_AR.md` الخارجي وتحقق من SHA-256 المذكور فيه قبل فك الأرشيف. Hash الأرشيف لا يمكن تضمينه داخله دون تغيير الأرشيف نفسه؛ لذلك يظهر في Manifest منفصل بجانبه، أما هذا الدليل فهو داخل ZIP. إذا غاب Manifest أو لم يطابق Hash، أوقف النشر واطلب نسخة موثقة.

ابدأ بـ`ORDERSAWA_RELEASE_BLOCKERS_AND_APPROVALS_AR.md` ثم `ORDERSAWA_PRODUCTION_MIGRATION_PLAN_AR.md` و`ORDERSAWA_PM2_DEPLOYMENT_GUIDE_AR.md` و`ORDERSAWA_FINAL_RELEASE_VERIFICATION_AR.md`. تم تحديث هذه الملفات بنتيجة تدقيق Production read-only المرفق في 17 أكتوبر 2026: Checksums الخمس مطابقة وtypmods الأربعة `numeric(10,2)`، لكن Restore وDDL الكامل غير مثبتين. ملف JSON الخام لا يدخل الحزمة. للمعمارية الكاملة اقرأ `ORDERSAWA_PRODUCT_CONFIGURATION_FINAL_HANDOFF_AR.md` و`CODEX_HANDOFF.md` وFounder Ledger/Supersession المعتمدين خارج هذه الحزمة؛ **الأرشيف لا يحل محل الموافقات الأصلية**.

لا تفترض أن GitHub أو نسخة السيرفر تطابق هذا المصدر. قارنها أولًا ولا تستبدل أي تعديل محلي دون مراجعة. لا تشغّل `db push` أو `migrate deploy` أو Candidate SQL التجريبية على `menu`. استخدم `.env.example` لقائمة أسماء المتغيرات فقط، وضع القيم السرية في آلية السيرفر. أبقِ `ENABLE_PUBLIC_NETWORK_WHATSAPP_CHECKOUT=0` و`NETWORK_TEST` محجوبة إلى موافقات مستقلة.
