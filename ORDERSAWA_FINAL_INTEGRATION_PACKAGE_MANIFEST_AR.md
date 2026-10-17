# OrderSawa — Manifest حزمة Stage 6F.4

| الحقل | القيمة |
|---|---|
| Archive | `ORDERSAWA_FINAL_INTEGRATION_PACKAGE.zip` |
| SHA-256 | `2D7524AC8DC1F87D43DDE54BA4DAD74CD81D0FEA00D45DA25E6B09D484E6D5A6` |
| الحجم | 10,214,775 bytes |
| عدد ZIP entries | 468 (375 files + directories) |
| Git branch | `feature/product-configuration-network` |
| **Exact source commit داخل ZIP** | `e74743624a8784fbb5988188b390af1a3438da84` |
| Baseline commit قبل Stage 6F.4 | `712c54a56724c6f4fd59d7bace3715e3d7566681` (Stage 6F.3) |
| طريقة البناء | `git -c core.autocrlf=false archive` من Source Commit أعلاه، مع استبعاد أرشيفات ZIP وManifests السابقة فقط لمنع تضمين الأرشيف داخل نفسه؛ 375/375 من ملفات المصدر/التوثيق الأخرى موجودة. بدون `.git` أو untracked work/test files. |

**تحقق:** احسب SHA-256 للـZIP المستلم وقارنه بالقيمة أعلاه قبل فكّه. هذا Manifest منفصل عن الأرشيف عمدًا، لأن وضع Hash الأرشيف داخله يغيّر Hash. مصدر التطبيق المجمد هو `e747436` حتى لو كان Commit حفظ ZIP/Manifest اللاحق مختلفًا. تقرير Production read-only بتاريخ 17 أكتوبر 2026 عُكست خلاصته في الوثائق، لكن JSON الخام غير مضمن في ZIP.

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

## إغلاق الاختبارات وتصحيح التغليف

الفحوص الجديدة: API **206/206** بلا فشل أو تخطٍّ على PostgreSQL 16 disposable؛ Product Configuration وTrusted WhatsApp HTTP **37/37** على PostgreSQL 18.6 disposable؛ Shared **25/25**، Web **43/43**، Browser ON **14** وOFF **4** checkpoints، Typecheck/Build PASS. الـ69 API tests التي تخطاها تقرير Stage 6F.4 شُغلت بقواعد معزولة وأعلام اختبار مناسبة؛ لا تعادل Browser checkpoints اختبارات مستقلة. راجع `ORDERSAWA_FINAL_RELEASE_VERIFICATION_AR.md` للمحاولات الأولية الفاشلة وحدود الدليل.

بصمات ملفات `migration.sql` الخمس التاريخية داخل هذا ZIP تطابق تقرير Production **5/5 حرفيًا**، وCRLF=0 لكل ملف. اختلاف ZIP السابق ناتج من `core.autocrlf=true` وقت التغليف؛ ملفات Git الأصلية تطابق التقرير ولم تُمس أوامر SQL/أسماء migrations/تاريخها. التغيير الآخر المقصود هو `DOMAIN_VERIFY_BYPASS="false"` في `.env.example` فقط. لا ملف JSON Production الخام داخل الحزمة، ولا إذن للاتصال/الترحيل/النشر ينتج من هذا Manifest.
