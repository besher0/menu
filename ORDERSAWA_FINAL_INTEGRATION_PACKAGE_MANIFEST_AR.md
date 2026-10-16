# OrderSawa — Manifest حزمة Stage 6F.4

| الحقل | القيمة |
|---|---|
| Archive | `ORDERSAWA_FINAL_INTEGRATION_PACKAGE.zip` |
| SHA-256 | `CA429F80B22F7CCCA00DED77E3C3B72A7107CC9E2E49BAAAEECE23387431C5C9` |
| الحجم | 10,210,935 bytes |
| عدد ZIP entries | 468 (تشمل directories) |
| Git branch | `feature/product-configuration-network` |
| **Exact source commit داخل ZIP** | `ede378cc8fff9d880f1fecc14a5732ec929c5d21` |
| Baseline commit قبل Stage 6F.4 | `712c54a56724c6f4fd59d7bace3715e3d7566681` (Stage 6F.3) |
| طريقة البناء | `git archive --format=zip HEAD` من Source Commit أعلاه؛ بدون `.git` أو untracked work/test files. |

**تحقق:** احسب SHA-256 للـZIP المستلم وقارنه بالقيمة أعلاه قبل فكّه. هذا Manifest منفصل عن الأرشيف عمدًا، لأن وضع Hash الأرشيف داخله يغيّر Hash. مصدر التطبيق المجمد هو `ede378c` حتى لو كان Commit حفظ ZIP/Manifest اللاحق مختلفًا.

## الوحدات المهمة داخل الحزمة

- Backend: `apps/api/src/`، Admin Product Configuration، Public Quote/Trusted WhatsApp، Legacy Checkout وFuture guarded Network Order foundation.
- Frontend: `apps/web/src/`، Dashboard Product Editor/Setup، Public Configurator، Cart وCheckout الحالي.
- Shared: `packages/shared/src/`، عقود/Validation/Pricing Decimal وCurrency Policy.
- Database: `apps/api/prisma/schema.prisma`، جميع `apps/api/prisma/migrations/` الرسمية ومنها Stage 2C وStage 6C، SQL metadata/aggregate read-only، و`scripts/stage6f4-disposable-migration-candidate.sql` المقفلة على الاختبار.
- Build/config: `package.json`، `package-lock.json`، manifests الخاصة بالـworkspaces، `.env.example` ذات placeholders فقط، TypeScript/Next/Nest config.
- Integration docs: `CODEX_HANDOFF.md`، `ORDERSAWA_RELEASE_PACKAGE_README_AR.md`، وخطط الترحيل/PM2/التحقق/الموافقات، والتقارير السابقة.

## متطلبات وموانع قبل النشر

PostgreSQL 18.6 الحقيقي باسم `menu` **لم يُفحص مباشرةً**؛ نجاح Restore للـBackup لم يُؤكَّد. لا نشر قبل موافقات **منفصلة** للقراءة فقط، بروفة Restore، Production Migration، Deployment بعلم `ENABLE_PUBLIC_NETWORK_WHATSAPP_CHECKOUT=0`، ثم تفعيل العلم. يلزم مطابقة SQL Schema/Migration checksums وnumeric typmods والأسعار السورية التاريخية، بناء Prisma Client، ومراجعة PM2/Proxy/CORS/rate/HMAC/رقم WhatsApp. Candidate DB Completeness Guard ليست جزءًا من Production Migration الحالية. لا `db push`/`migrate deploy`/`migrate resolve` تلقائيًا.

**تنبيه للمبرمج:** قد تحتوي نسخة السيرفر أو GitHub تغييرات لا توجد في هذا ZIP. قارنها وادمجها بعد مراجعة؛ لا تستبدل ملفات أو `.env` أو uploads/Backup بصمت. الأرشيف لا يحتوي كلمات مرور، مفاتيح API، credentials، `.env` حقيقية، `node_modules`، قواعد اختبار أو بيانات عملاء. فحص مسارات الأرشيف ونمط المفاتيح الخاصة لم يجد ملفات حساسة؛ `.env.example` تحوي placeholders فقط.
