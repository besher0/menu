import type { ConfigurationIssue, ProductConfigurationV2 } from "@menu/shared";
import { issueNode, locate, type Ref } from "./v62-model";

const messages: Record<string,string> = {
 EMPTY_OPTIONS_GROUP:"مجموعة الخيارات فارغة. أضف خيارًا واحدًا على الأقل أو احذف المجموعة.",
 EMPTY_SIZE_GROUP:"مجموعة الأحجام فارغة. أضف حجمًا واحدًا على الأقل أو احذف المجموعة.",
 REQUIRED_TEXT:"أدخل اسمًا لهذا العنصر.", INVALID_MONEY:"أدخل سعرًا صالحًا. الصفر مسموح، والحقل الفارغ ليس صفرًا.",
 INVALID_AMOUNT:"أدخل سعرًا صالحًا.", NEGATIVE_MONEY:"السعر لا يمكن أن يكون سالبًا.", CURRENCY_SCALE_EXCEEDED:"عدد المنازل العشرية لا يوافق عملة المطعم.",
 INVALID_MIN:"أدخل حدًا أدنى صحيحًا.",INVALID_MAX:"أدخل حدًا أقصى صحيحًا أو اختر بدون حد.",
 GROUP_MIN_EXCEEDS_MAX:"الحد الأدنى للمجموعة أكبر من الحد الأقصى. عدّل أحد الحدّين.",
 OPTION_MIN_EXCEEDS_MAX:"الحد الأدنى للخيار أكبر من الحد الأقصى. عدّل أحد الحدّين.",
 OPTION_MAX_EXCEEDS_GROUP_MAX:"الكمية القصوى للخيار أكبر من حد مجموعته.",
 INCLUDED_EXCEEDS_GROUP_MAX:"الكمية المشمولة تتجاوز الحد الأقصى للمجموعة.", INCLUDED_EXCEEDS_CAPACITY:"الكمية المشمولة أكبر من الخيارات المتاحة.",
 OPTION_MINIMA_EXCEED_GROUP_MAX:"مجموع الاختيارات الإلزامية يتجاوز حد المجموعة.",
 INVALID_SIZE_PRICING_SCOPE:"اختر مجموعة أحجام متاحة في هذا الفرع لتسعير الخيار.",UNKNOWN_SIZE_PRICE_OVERRIDE:"أعد اختيار الحجم الذي يرتبط به هذا السعر.",
 LINK_TARGET_NOT_FOUND:"الصنف المرتبط غير موجود أو غير متاح لهذا المطعم. اختر مصدرًا صالحًا.",
 SELF_LINK:"لا يمكن ربط الصنف بنفسه. اختر صنفًا آخر.", LINK_CYCLE:"هذا الربط ينشئ حلقة بين الأصناف. أزل الرابط المسبب لها.",
 INLINE_CONFIGURATION_CYCLE:"هذا الفرع ينشئ حلقة. أزل الربط المسبب لها.",
 GROUP_LEVEL_LIMIT:"تجاوز الفرع ثلاثة مستويات من المجموعات. انقل المجموعة إلى مستوى أعلى.",
 SIZE_AFTER_SIZE:"لا يمكن وضع مجموعة أحجام داخل مسار أحجام آخر. غيّر موضع المجموعة.",
 MISSING_CUSTOM_CONFIGURATION:"أعد اختيار مصدر الصنف المرتبط لاستعادة فروعه.",
 UNSATISFIABLE_CONFIGURATION:"لا تكفي الخيارات المتاحة لتحقيق الحدود المطلوبة. راجع الحدود والتوفر.",
 PRODUCT_CONFIGURATION_PERMISSION_DENIED:"ليس لحسابك صلاحية تعديل شبكة الخيارات.",
 PRODUCT_CONFIGURATION_CAPABILITY_UNAVAILABLE:"ميزة شبكة الخيارات غير مفعلة لهذا المطعم.",
 MEDIA_NOT_OWNED:"الصورة غير متاحة لهذا المطعم. اختر صورة من مكتبته أو ارفع صورة جديدة.",
 INVALID_MEDIA_REFERENCE:"تعذر استخدام هذه الصورة. اختر صورة مسموحة من مكتبة المطعم.",
 PRODUCT_VERSION_CONFLICT:"تغير الصنف في جلسة أخرى. أعد فتحه قبل الحفظ؛ مسودتك محفوظة هنا.",
 CONFIGURATION_VERSION_CONFLICT:"تغيرت شبكة الخيارات في جلسة أخرى. أعد فتح الصنف قبل الحفظ.",
};
export type DisplayIssue={code:string;label:string;message:string;ref?:Ref;path:string};
export function configurationEditorIssues(config:ProductConfigurationV2|null,issues:readonly {code?:string;path:string;message:string}[]):DisplayIssue[]{
 const seen=new Set<string>();return issues.flatMap(issue=>{
  const ref=config?issueNode(config,issue.path):undefined,location=config&&ref?locate(config,ref):undefined;
  const name=location?.node.label?.trim();
  let label=name || (location?.kind==='size'?'حجم بلا اسم':location?.kind==='option'?'خيار بلا اسم':'إعدادات الصنف');
  // Structural positions distinguish identically named/anonymous nodes without JSON paths.
  const positions=[...issue.path.matchAll(/(?:groups|children|options|sizes|choices)\[(\d+)\]/g)].map(x=>Number(x[1])+1);
  if(positions.length)label+=' · '+positions.join(' ← ');
  const code=issue.code??'';let message=messages[code];
  if(code==='REQUIRED_TEXT'&&/price|basePrice/.test(issue.path))message=messages.INVALID_MONEY;
  if(!message&&/MONEY|AMOUNT|PRICE/.test(code))message=messages.INVALID_MONEY;
  if(!message&&/MIN|MAX|QUANTITY/.test(code))message='راجع حدود الكمية وأدخل أعدادًا صحيحة ضمن الحدود المسموحة.';
  if(!message&&/LINK|SOURCE/.test(code))message=messages.LINK_TARGET_NOT_FOUND;
  message??='راجع بيانات هذا العنصر وأكمل الحقول المطلوبة قبل الحفظ.';
  const key=[ref?.id,ref?.path.join('/'),message].join('|');if(seen.has(key))return [];seen.add(key);
  return [{code,label,message,ref,path:issue.path}];
 });
}
export function safeProductSaveMessage(error:unknown):string{
 const e=error as {status?:number;message?:string;issues?:ConfigurationIssue[]};
 if(e?.status===409)return messages.PRODUCT_VERSION_CONFLICT;
 if(e?.status===401)return 'انتهت جلسة الدخول. سجّل الدخول مجددًا ثم أعد المحاولة.';
 if(e?.status===403)return 'ليس لحسابك صلاحية تنفيذ هذا التعديل أو استخدام الملف المحدد.';
 if(e?.issues?.length)return 'يرجى إكمال إعدادات الصنف قبل الحفظ.';
 // Known locally authored messages can retain their actionable Arabic wording.
 if(e?.status===0&&e.message?.startsWith('تعذر تأكيد الحفظ'))return e.message;
 return 'تعذر حفظ الصنف. بقيت مسودتك محفوظة هنا؛ راجع البيانات والاتصال ثم حاول مجددًا.';
}
