# خريطة المصدر للمبرمج

| عند تتبع مشكلة في | ابدأ هنا | حد المسؤولية |
|---|---|---|
| تشغيل التطبيق والمصادقة | `apps/api/src/main.ts`، `apps/api/src/modules/auth`، `apps/api/src/common`، `apps/web/src/lib/session.ts` | يبدأ Nest التحقق العام من الإدخال وCORS وحدود الطلب. افحص الـguards ثم عضوية المطعم قبل قراءة أو كتابة بيانات المستأجر. |
| صيغ الأسعار والتكوين | `packages/shared/src/currency-policy.ts`، `packages/shared/src/product-configuration` | عقود مشتركة بين الواجهة والخادم. يتحقق الخادم من صلاحية الاختيارات ويعيد التسعير قبل التأكيد. |
| حفظ صنف Legacy أو V2 | `apps/api/src/modules/products`، `packages/shared/src/product-editor.ts` | يتولى محرر المالك الحفظ الموحّد وتعارض النسخ. التكوينات والمكتبة والمنتجات المرتبطة مقيدة بهوية المطعم وصلاحيات المستخدم. |
| وصفة أو تفصيل وجبة | `apps/api/src/modules/media/product-library.service.ts`، `apps/api/src/modules/public-menu/public-menu.service.ts`، `apps/web/src/components/public/product-meal-details.ts` | تعرض المصفوفة المحفوظة أو حقول Legacy ذات القيمة فقط. للمصفوفة الفارغة دلالة المسح. لا تستنتج قيمًا غذائية من اسم الصنف أو صورته. |
| إعدادات أو بنر تغيّر بعد الحفظ | `apps/api/src/modules/dashboard/dashboard.service.ts`، `apps/api/src/modules/builder/builder.service.ts`، `packages/shared/src/banner-section.ts` | تحفظ تعديلات صغيرة داخل معاملة. راعِ المفاتيح القديمة غير الظاهرة في النموذج والصفحة المنزلية الصحيحة. |
| الرجوع والـRefresh والصور | `apps/web/src/components/public/restaurant-shell.tsx`، `public-history.ts`، `public-menu-client.tsx`، `public-image.tsx` في المجلد نفسه | تحتفظ الواجهة بما زاره المستخدم وتزامن القسم والتمرير. يستخدم العرض التدريجي مصغّر الصنف نفسه قبل الصورة الكبرى. تحقق من تغير الـURL أو حذف الصورة. |
| السلة والدفع | `apps/web/src/components/public/cart-model.ts`، `trusted-whatsapp-checkout.tsx`، `apps/api/src/modules/orders` و`public-menu` | السلة تخص المطعم. لا يعتمد الخادم إجمالي العميل. مسار Legacy مستقل، ومسار Network والمختلط يعتمد Quote وإعادة تحقق ومفتاح تكرار. فتح رابط واتساب ليس إيصال تسليم. |
| بنية القاعدة والترقية | `apps/api/prisma/schema.prisma`، `apps/api/prisma/migrations`، `scripts/staging.cjs` | PostgreSQL هو مصدر البيانات. افحص الهوية والنسخة قبل الترحيل. يجب مراجعة لقطة النقل المنقحة مقابل مصدر معتمد على مستوى الحقل. |
| اختلاف سلوك التشغيل عن التطوير | `deploy/staging`، `scripts/prepare-staging-runtime.cjs`، `scripts/verify-staging-runtime.cjs`، `.github/workflows/quality.yml` | يُثبّت Workspace بالتبعيات المقفلة، ويبني Shared قبل Web وAPI. تبقى الأسرار والوسائط وسجلات التشغيل خارج المصدر. |

صفحات Next في `apps/web/src/app`، وعميل API في `apps/web/src/lib`. اجعل أي تغيير عابر لهذه الحدود مصحوبًا باختبار في حزمة العقد واختبار للمسار الذي يستخدمه الزبون أو صاحب المطعم.
