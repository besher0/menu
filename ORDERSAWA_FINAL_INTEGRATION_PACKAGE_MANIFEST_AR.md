# OrderSawa — Manifest حزمة Stage 6F.4

| الحقل | القيمة |
|---|---|
| Archive | `ORDERSAWA_FINAL_INTEGRATION_PACKAGE.zip` |
| SHA-256 | `8BEFB5AE657FF14EAFEF53F2A0B37E6373BA74B00EF5B083235BE2D6B08061A1` |
| الحجم | 10,214,087 bytes |
| عدد ZIP entries | 468 (375 files + directories) |
| Git branch | `feature/product-configuration-network` |
| **Exact source commit داخل ZIP** | `9ef10e2656488eee38f94a3b874c8150d9a0e384` |
| Baseline commit قبل Stage 6F.4 | `712c54a56724c6f4fd59d7bace3715e3d7566681` (Stage 6F.3) |
| طريقة البناء | `git archive` من Source Commit أعلاه، مع استبعاد أرشيفات ZIP وManifests السابقة فقط لمنع تضمين الأرشيف داخل نفسه؛ 375/375 من ملفات المصدر/التوثيق الأخرى موجودة. بدون `.git` أو untracked work/test files. |

**تحقق:** احسب SHA-256 للـZIP المستلم وقارنه بالقيمة أعلاه قبل فكّه. هذا Manifest منفصل عن الأرشيف عمدًا، لأن وضع Hash الأرشيف داخله يغيّر Hash. مصدر التطبيق المجمد هو `9ef10e2` حتى لو كان Commit حفظ ZIP/Manifest اللاحق مختلفًا. تقرير Production read-only بتاريخ 17 أكتوبر 2026 عُكست خلاصته في الوثائق، لكن JSON الخام غير مضمن في ZIP.

## الوحدات المهمة داخل الحزمة

- Backend: `apps/api/src/`، Admin Product Configuration، Public Quote/Trusted WhatsApp، Legacy Checkout وFuture guarded Network Order foundation.
- Frontend: `apps/web/src/`، Dashboard Product Editor/Setup، Public Configurator، Cart وCheckout الحالي.
- Shared: `packages/shared/src/`، عقود/Validation/Pricing Decimal وCurrency Policy.
- Database: `apps/api/prisma/schema.prisma`، جميع `apps/api/prisma/migrations/` الرسمية ومنها Stage 2C وStage 6C، SQL metadata/aggregate read-only، و`scripts/stage6f4-disposable-migration-candidate.sql` المقفلة على الاختبار.
- Build/config: `package.json`، `package-lock.json`، manifests الخاصة بالـworkspaces، `.env.example` ذات placeholders فقط، TypeScript/Next/Nest config.
- Integration docs: `CODEX_HANDOFF.md`، `ORDERSAWA_RELEASE_PACKAGE_README_AR.md`، وخطط الترحيل/PM2/التحقق/الموافقات، والتقارير السابقة.

## متطلبات وموانع قبل النشر

لم نتصل نحن بقاعدة `menu`، لكن ملف الفحص المرفق يؤكد `numeric(10,2)` للحقول الأربعة و5/5 migration checksums مطابقة و0 تعارض في أموالها التاريخية المفحوصة **وقت Snapshot**. نجاح Restore للـBackup لم يُؤكَّد، وDDL الكامل/`db push` drift خارج نطاق الفحص غير محسوم. لا نشر قبل موافقات **منفصلة** لإعادة فحص القراءة عند اللزوم، بروفة Restore، Production Migration، Deployment بعلم `ENABLE_PUBLIC_NETWORK_WHATSAPP_CHECKOUT=0`، ثم تفعيل العلم. يلزم أيضًا فحص Legacy Options وبناء Prisma Client ومراجعة PM2/Proxy/CORS/rate/HMAC/رقم WhatsApp. Candidate DB Completeness Guard ليست جزءًا من Production Migration الحالية. لا `db push`/`migrate deploy`/`migrate resolve` تلقائيًا.

**تنبيه للمبرمج:** قد تحتوي نسخة السيرفر أو GitHub تغييرات لا توجد في هذا ZIP. قارنها وادمجها بعد مراجعة؛ لا تستبدل ملفات أو `.env` أو uploads/Backup بصمت. الأرشيف لا يحتوي كلمات مرور، مفاتيح API، credentials، `.env` حقيقية، `node_modules`، قواعد اختبار أو بيانات عملاء. فحص مسارات الأرشيف ونمط المفاتيح الخاصة لم يجد ملفات حساسة؛ `.env.example` تحوي placeholders فقط.
