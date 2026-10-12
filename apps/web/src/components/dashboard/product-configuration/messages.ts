import type { ConfigurationIssue } from "@menu/shared";

const ISSUE_MESSAGES: Record<string, string> = {
  INVALID_CONFIGURATION_SHAPE: "بنية شبكة التكوين غير صحيحة.",
  CONFIGURATION_PRODUCT_MISMATCH: "معرّف الصنف داخل الشبكة لا يطابق الصنف المفتوح.",
  INVALID_NEXT_REVISION: "نسخة التكوين التالية غير صحيحة. أعد التحميل ثم حاول مجددًا.",
  DUPLICATE_NODE_ID: "يوجد معرّف ثابت مكرر داخل الشبكة.",
  EMPTY_GROUP: "يجب أن تحتوي المجموعة على عنصر واحد على الأقل.",
  INVALID_MONEY: "قيمة السعر غير صحيحة. استخدم رقمًا عشريًا موجبًا بحد أقصى 6 منازل.",
  INVALID_MONEY_SCALE: "السعر يتجاوز 6 منازل عشرية.",
  INVALID_GROUP_MIN: "الحد الأدنى للمجموعة غير صحيح.",
  INVALID_GROUP_MAX: "الحد الأقصى للمجموعة غير صحيح.",
  INVALID_INCLUDED_QUANTITY: "الكمية المجانية يجب أن تكون ضمن حدود المجموعة.",
  INVALID_OPTION_QUANTITY: "حدود كمية الخيار غير صحيحة.",
  OPTION_MAX_EXCEEDS_GROUP_MAX: "الحد الأقصى للخيار يتجاوز حد المجموعة.",
  SIZE_AFTER_SIZE: "لا يمكن إضافة مجموعة أحجام أسفل مسار دخل بالفعل في حجم.",
  MAX_DEPTH_EXCEEDED: "تجاوز التداخل الحد الأقصى المعتمد (12 مستوى).",
  MAX_NODES_EXCEEDED: "تجاوزت الشبكة الحد الأقصى لعدد العقد.",
  SELF_LINK: "لا يمكن ربط الصنف بنفسه.",
  LINK_CYCLE: "الرابط ينشئ دورة مباشرة أو عميقة بين الأصناف.",
  LINK_TARGET_NOT_FOUND: "الصنف المرتبط غير موجود أو غير متاح في هذا المطعم.",
  CROSS_CATALOG_LINK: "لا يمكن ربط أصناف من مطاعم مختلفة.",
  MISSING_CUSTOM_CONFIGURATION: "وضع CUSTOM يحتاج لقطة تكوين صريحة.",
  ORIGINAL_LINKED_SOURCE_REQUIRES_NETWORK_CONFIGURATION: "وضع ORIGINAL يحتاج مصدرًا محفوظًا بنظام Network.",
  LINKED_PRODUCT_UNAVAILABLE: "الصنف المرتبط غير متاح حاليًا.",
  LINKED_PRODUCT_NOT_ORDERABLE: "الصنف المرتبط غير قابل للطلب حاليًا.",
  MISSING_GROUP_SELECTION: "هذه المجموعة المطلوبة لم تُستكمل.",
  GROUP_MIN_NOT_MET: "لم يتم استيفاء الحد الأدنى للمجموعة.",
  GROUP_MAX_EXCEEDED: "تم تجاوز الحد الأقصى للمجموعة.",
  OPTION_QUANTITY_OUT_OF_RANGE: "كمية الخيار خارج الحدود المسموحة.",
  MISSING_LINKED_SELECTION: "أكمل اختيارات الصنف المرتبط.",
  STALE_CONFIGURATION_REVISION: "المعاينة مبنية على نسخة قديمة من التكوين. أعد ضبطها."
};

export function issueMessage(issue: ConfigurationIssue) {
  return ISSUE_MESSAGES[issue.code] ?? issue.message;
}

export function apiErrorMessage(status: number, code?: string) {
  if (status === 403 && code === "FEATURE_LOCKED") return "ميزة شبكة تكوين الأصناف غير متاحة في الباقة الحالية. بياناتك المحفوظة لم تُحذف.";
  if (status === 403) return "لا تملك الصلاحية اللازمة لتعديل شبكة هذا الصنف.";
  if (status === 409) return "تغيّرت الشبكة في جلسة أخرى. احتفظنا بمسودتك؛ أعد تحميل النسخة الحالية ثم راجع الاختلافات.";
  if (status === 400) return "تعذر الحفظ لأن الشبكة تحتوي على أخطاء تحقق.";
  return "تعذر حفظ شبكة التكوين. حاول مرة أخرى.";
}
