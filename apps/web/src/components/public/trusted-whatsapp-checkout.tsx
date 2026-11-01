"use client";

import { useEffect, useRef, useState } from "react";
import { compareMoney, multiplyMoney, sumMoney } from "@menu/shared";
import {
  confirmPublicWhatsappCheckout, preparePublicWhatsappCheckout, PublicWhatsappCheckoutError,
  type PublicWhatsappCheckoutDraft, type PublicWhatsappCheckoutRequest
} from "@/lib/api";
import type { CartItem } from "./cart-model";

type Locale = "ar" | "en";
type Details = {
  customerName: string; customerPhone: string; fulfillmentType: "pickup" | "delivery";
  deliveryArea: string; deliveryNear: string;
  pickupTime: string; orderNote: string;
};

export function trustedCheckoutErrorMessage(error: unknown, locale: Locale, details: Details): string {
  const ar = locale === "ar";
  if (!(error instanceof PublicWhatsappCheckoutError)) {
    return error instanceof TypeError
      ? ar ? "تعذر الاتصال بخدمة التحقق. تحقق من الاتصال وحاول مجددًا." : "Could not reach checkout verification. Check your connection and retry."
      : ar ? "حدث خطأ أثناء التحقق. حاول مجددًا." : "An error occurred during verification. Try again.";
  }
  if (error.code === "INVALID_NETWORK_ORDER_DETAILS") {
    if (details.fulfillmentType === "delivery") {
      if (!details.deliveryArea.trim()) return ar ? "يرجى إدخال منطقة التوصيل." : "Enter the delivery area.";
      if (!details.deliveryNear.trim()) return ar ? "يرجى إدخال أقرب معلم للتوصيل." : "Enter a nearby landmark for delivery.";
      return ar ? "تعذر التحقق من عنوان التوصيل. راجع بياناته وحاول مجددًا." : "Could not verify the delivery address. Review it and try again.";
    }
    return ar ? "راجع بيانات الاستلام وحاول مجددًا." : "Review the pickup details and try again.";
  }
  if (["INVALID_QUOTE_SELECTION", "CONFIGURATION_NOT_ORDERABLE", "WHATSAPP_PRODUCT_UNAVAILABLE",
    "WHATSAPP_PRODUCT_TYPE_CHANGED", "WHATSAPP_SNAPSHOT_PRICE_MISMATCH", "WHATSAPP_CART_REVIEW_REQUIRED"].includes(error.code)) {
    return ar ? "تغير أحد الأصناف أو خياراته. راجع السلة وأعد المحاولة." : "A product or its options changed. Review the cart and try again.";
  }
  if (["WHATSAPP_CHECKOUT_DISABLED", "WHATSAPP_ORDERING_DISABLED", "WHATSAPP_PRICES_HIDDEN",
    "WHATSAPP_CAPABILITY_UNAVAILABLE", "PRODUCT_CONFIGURATION_CAPABILITY_UNAVAILABLE"].includes(error.code)) {
    return ar ? "الطلب عبر WhatsApp غير متاح حاليًا لهذا المنيو." : "WhatsApp checkout is unavailable for this menu.";
  }
  if (error.code === "WHATSAPP_CHECKOUT_REQUIRES_ACCEPTANCE") {
    return ar ? "انتهت صلاحية الموافقة السابقة؛ راجع الطلب وأعد المحاولة." : "The previous approval expired; review the order and retry.";
  }
  if (error.code === "WHATSAPP_MESSAGE_TOO_LONG") {
    return ar ? "رسالة الطلب طويلة جدًا؛ قلّل تفاصيل الطلب ثم حاول مجددًا." : "The order message is too long; reduce its details and retry.";
  }
  if (["WHATSAPP_PHONE_UNAVAILABLE", "WHATSAPP_PHONE_INVALID"].includes(error.code)) {
    return ar ? "رقم WhatsApp الخاص بالمطعم غير متاح حاليًا. حاول لاحقًا." : "The restaurant's WhatsApp number is unavailable. Try later.";
  }
  if (error.lineErrors.length) {
    return ar ? "بعض الأصناف تحتاج مراجعة قبل المتابعة." : "Some items need review before continuing.";
  }
  if (error.code === "WHATSAPP_CHECKOUT_CONCURRENT_UPDATE") {
    return ar ? "تحدّثت القائمة أثناء التحقق. حاول مجددًا." : "The menu changed during verification. Try again.";
  }
  if (error.status >= 500 || error.status === 429) {
    return ar ? "خدمة التحقق غير متاحة مؤقتًا. بقيت بيانات طلبك محفوظة؛ حاول مجددًا." : "Checkout verification is temporarily unavailable. Your order details are saved; retry.";
  }
  return ar ? "تعذر التحقق من الطلب. بقيت بياناتك محفوظة؛ حاول مجددًا."
    : "Could not verify the order. Your details are saved; try again.";
}

export function buildTrustedCheckoutRequest(cart: readonly CartItem[], locale: Locale, details: Details): PublicWhatsappCheckoutRequest {
  return {
    locale,
    ...(details.customerName.trim() ? { customerName: details.customerName.trim() } : {}),
    ...(details.customerPhone.trim() ? { customerPhone: details.customerPhone.trim() } : {}),
    fulfillmentType: details.fulfillmentType,
    ...(details.fulfillmentType === "delivery" ? {
      deliveryArea: details.deliveryArea.trim(), deliveryNear: details.deliveryNear.trim()
    } : details.pickupTime.trim() ? { pickupTime: details.pickupTime.trim() } : {}),
    ...(details.orderNote.trim() ? { orderNote: details.orderNote.trim() } : {}),
    items: cart.map((item) => item.mode === "LEGACY" ? {
      mode: "LEGACY" as const, lineId: item.lineId, productSlug: item.slug,
      quantity: item.quantity, ...(item.note?.trim() ? { note: item.note.trim() } : {}),
      expectedUnitPrice: item.priceText ?? String(item.price)
    } : {
      mode: "NETWORK" as const, lineId: item.lineId, productId: item.productId,
      quantity: item.quantity, selection: item.selection,
      ...(item.note?.trim() ? { note: item.note.trim() } : {}),
      expectedUnitPrice: item.acceptedQuote.total,
      expectedLinkedSourceRevisions: item.acceptedQuote.linkedSourceRevisions
    })
  };
}
type PendingPrice = {
  request: PublicWhatsappCheckoutRequest; draft: PublicWhatsappCheckoutDraft;
  acceptanceToken: string; messagePreview: string;
};

export function compareTrustedDraft(draft: PublicWhatsappCheckoutDraft, checkoutRequest: PublicWhatsappCheckoutRequest,
  displayedTotal: string, restaurantSlug: string, locale: Locale, displayedFee: string | null = null): "INVALID" | "PRICE_CHANGED" | "SOURCE_CHANGED" | "CURRENT" {
  if (draft.items.length !== checkoutRequest.items.length || draft.restaurantSlug !== restaurantSlug
    || draft.locale !== locale || !draft.items.every((line, index) => {
      const requested = checkoutRequest.items[index];
      return line.lineId === requested.lineId && line.mode === requested.mode && line.quantity === requested.quantity;
    })) return "INVALID";
  const feeChanged = checkoutRequest.fulfillmentType === "delivery"
    && (draft.deliveryFee === null || displayedFee === null
      ? draft.deliveryFee !== displayedFee : compareMoney(draft.deliveryFee, displayedFee) !== 0);
  const priceChanged = compareMoney(draft.itemsSubtotal, displayedTotal) !== 0 || feeChanged || draft.items.some((line, index) => {
    const requested = checkoutRequest.items[index];
    return !requested.expectedUnitPrice || compareMoney(line.unitPrice, requested.expectedUnitPrice) !== 0
      || compareMoney(line.lineTotal, multiplyMoney(requested.expectedUnitPrice, requested.quantity)) !== 0;
  });
  if (priceChanged) return "PRICE_CHANGED";
  return draft.items.some((line) => line.changed) ? "SOURCE_CHANGED" : "CURRENT";
}

/** Checkout behavior only. CartView owns the two-step visual shell. */
export function useTrustedWhatsappCheckout({ cart, restaurantSlug, locale, details, disabledReason, displayedFee }: {
  cart: readonly CartItem[]; restaurantSlug: string; locale: Locale; details: Details; disabledReason?: string;
  displayedFee: string | null;
}) {
  const [pendingPrice, setPendingPrice] = useState<PendingPrice | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failureCode, setFailureCode] = useState<string | null>(null);
  const [failureField, setFailureField] = useState<string | null>(null);
  const [reviewIssue, setReviewIssue] = useState<PublicWhatsappCheckoutError | null>(null);
  const [previewMessage, setPreviewMessage] = useState<string | null>(null);
  const [previewPriceChanged, setPreviewPriceChanged] = useState(false);
  const busyRef = useRef(false);
  const editVersion = useRef(0);
  const attemptRef = useRef<{ requestJson: string; idempotencyKey: string; acceptanceToken: string } | null>(null);
  const ar = locale === "ar";

  useEffect(() => {
    editVersion.current += 1;
    attemptRef.current = null;
    setPendingPrice(null);
    setPreviewMessage(null);
    setError(null);
    setFailureCode(null);
    setFailureField(null);
  }, [cart, locale, details.customerName, details.customerPhone, details.fulfillmentType,
    details.deliveryArea, details.deliveryNear, details.pickupTime, details.orderNote]);

  useEffect(() => { setReviewIssue(null); }, [cart]);

  function recordError(caught: unknown) {
    setFailureCode(caught instanceof PublicWhatsappCheckoutError ? caught.code : null);
    setFailureField(caught instanceof PublicWhatsappCheckoutError && caught.code === "INVALID_NETWORK_ORDER_DETAILS"
      ? /^(customerName|customerPhone|deliveryArea|deliveryNear|pickupTime|orderNote)\b/.exec(caught.message)?.[1] ?? null : null);
    setReviewIssue(caught instanceof PublicWhatsappCheckoutError && caught.lineErrors.length ? caught : null);
    setError(trustedCheckoutErrorMessage(caught, locale, details));
  }

  function request(): PublicWhatsappCheckoutRequest {
    return buildTrustedCheckoutRequest(cart, locale, details);
  }

  async function preview() {
    if (disabledReason || !cart.length || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    setFailureCode(null);
    setFailureField(null);
    setPreviewMessage(null);
    const version = editVersion.current;
    const checkoutRequest = request();
    try {
      const prepared = await preparePublicWhatsappCheckout(restaurantSlug, checkoutRequest);
      if (editVersion.current !== version) return;
      const comparison = compareTrustedDraft(prepared.draft, checkoutRequest,
        cartDisplayedTotal(cart), restaurantSlug, locale, displayedFee);
      if (comparison === "INVALID" || comparison === "SOURCE_CHANGED") {
        setError(ar ? "تغيرت اختيارات الطلب؛ راجع السلة قبل معاينة الرسالة." : "Order choices changed; review the cart before previewing.");
        return;
      }
      setPreviewPriceChanged(comparison === "PRICE_CHANGED");
      setPreviewMessage(prepared.messagePreview);
    } catch (caught) {
      if (editVersion.current === version) recordError(caught);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  function handleConfirmationError(caught: unknown, checkoutRequest: PublicWhatsappCheckoutRequest, displayedTotal: string,
    version: number, approvedDraft?: PublicWhatsappCheckoutDraft) {
    if (editVersion.current !== version) return;
    if (caught instanceof PublicWhatsappCheckoutError && caught.status === 409
      && caught.changedDraft && caught.changedMessagePreview && caught.acceptanceToken) {
      const comparison = approvedDraft
        ? caught.changedDraft.totalAmount !== approvedDraft.totalAmount
          || caught.changedDraft.items.some((line, index) => {
            const approvedLine = approvedDraft.items[index];
            return !approvedLine || compareMoney(line.unitPrice, approvedLine.unitPrice) !== 0;
          }) ? "PRICE_CHANGED" : JSON.stringify(caught.changedDraft) !== JSON.stringify(approvedDraft) ? "SOURCE_CHANGED" : "CURRENT"
        : compareTrustedDraft(caught.changedDraft, checkoutRequest, displayedTotal, restaurantSlug, locale, displayedFee);
      if (comparison === "PRICE_CHANGED") {
        setPendingPrice({ request: checkoutRequest, draft: caught.changedDraft,
          messagePreview: caught.changedMessagePreview, acceptanceToken: caught.acceptanceToken });
        return;
      }
      setError(comparison === "SOURCE_CHANGED"
        ? ar ? "تغيرت تفاصيل أحد الأصناف. راجع اختيارات السلة وأعد المحاولة." : "Product details changed. Review your cart choices and try again."
        : ar ? "انتهت صلاحية التحقق. راجع الطلب وأعد الإرسال." : "The verification expired. Review the order and try again.");
      return;
    }
    recordError(caught);
  }

  async function confirmAndOpen(checkoutRequest: PublicWhatsappCheckoutRequest, acceptanceToken: string,
    idempotencyKey: string, displayedTotal: string, version: number, tab: Window | null) {
    try {
      const result = await confirmPublicWhatsappCheckout(restaurantSlug, checkoutRequest, acceptanceToken, idempotencyKey);
      if (!result.whatsappUrl.startsWith("https://wa.me/")) throw new Error("Invalid WhatsApp destination");
      if (editVersion.current !== version) { tab?.close(); return; }
      const comparison = compareTrustedDraft(result.draft, checkoutRequest, displayedTotal, restaurantSlug, locale, displayedFee);
      if (comparison !== "CURRENT") {
        tab?.close();
        setError(ar ? "تغير الطلب أثناء التحقق. راجعه وأعد الإرسال." : "The order changed during verification. Review and retry.");
        return;
      }
      try {
        if (tab) tab.location.href = result.whatsappUrl;
        else window.location.href = result.whatsappUrl;
      } catch {
        setError(ar ? `حُفظ الطلب رقم ${result.orderNumber}، لكن تعذّر فتح WhatsApp. اضغط الزر مجددًا لإعادة فتحه دون إنشاء طلب جديد.`
          : `Order ${result.orderNumber} was saved, but WhatsApp could not open. Tap again to retry without a new order.`);
      }
    } catch (caught) {
      tab?.close();
      handleConfirmationError(caught, checkoutRequest, displayedTotal, version);
    }
  }

  async function submit(displayedTotal: string) {
    if (disabledReason || !cart.length || busyRef.current) return;
    if (details.fulfillmentType === "delivery"
      && (!details.deliveryArea.trim() || !details.deliveryNear.trim())) {
      setError(ar ? "أدخل منطقة التوصيل والعلامة القريبة." : "Enter the delivery area and nearby landmark.");
      return;
    }
    // Reserve a tab during the click; it stays blank until both server calls succeed.
    const tab = window.open("about:blank", "_blank");
    if (tab) tab.opener = null;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    setFailureCode(null);
    setFailureField(null);
    setPendingPrice(null);
    const version = editVersion.current;
    const checkoutRequest = request();
    const requestJson = JSON.stringify(checkoutRequest);
    try {
      if (attemptRef.current?.requestJson === requestJson) {
        await confirmAndOpen(checkoutRequest, attemptRef.current.acceptanceToken,
          attemptRef.current.idempotencyKey, displayedTotal, version, tab);
        return;
      }
      const prepared = await preparePublicWhatsappCheckout(restaurantSlug, checkoutRequest);
      if (editVersion.current !== version) { tab?.close(); return; }
      const comparison = compareTrustedDraft(prepared.draft, checkoutRequest, displayedTotal, restaurantSlug, locale, displayedFee);
      if (comparison === "PRICE_CHANGED") {
        tab?.close();
        setPendingPrice({ request: checkoutRequest, ...prepared });
        return;
      }
      if (comparison !== "CURRENT") {
        tab?.close();
        setError(comparison === "SOURCE_CHANGED"
          ? ar ? "تغيرت تفاصيل أحد الأصناف. راجع اختيارات السلة وأعد المحاولة." : "Product details changed. Review your cart choices and try again."
          : ar ? "تعذر مطابقة الفاتورة مع الطلب. راجع السلة." : "The invoice does not match your order. Review the cart.");
        return;
      }
      // The user's send click accepts only the total already visible in the original invoice.
      const idempotencyKey = window.crypto.randomUUID();
      attemptRef.current = { requestJson, idempotencyKey, acceptanceToken: prepared.acceptanceToken };
      await confirmAndOpen(checkoutRequest, prepared.acceptanceToken, idempotencyKey, displayedTotal, version, tab);
    } catch (caught) {
      tab?.close();
      if (editVersion.current === version) recordError(caught);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  async function acceptUpdatedPrice() {
    if (!pendingPrice || busyRef.current) return;
    const tab = window.open("about:blank", "_blank");
    if (tab) tab.opener = null;
    const version = editVersion.current;
    const { request: checkoutRequest, acceptanceToken, draft } = pendingPrice;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    setFailureCode(null);
    setFailureField(null);
    setPendingPrice(null);
    try {
      // Confirm independently revalidates the draft and the HMAC-bound approval.
      const idempotencyKey = attemptRef.current?.requestJson === JSON.stringify(checkoutRequest)
        ? attemptRef.current.idempotencyKey : window.crypto.randomUUID();
      attemptRef.current = { requestJson: JSON.stringify(checkoutRequest), idempotencyKey, acceptanceToken };
      const result = await confirmPublicWhatsappCheckout(restaurantSlug, checkoutRequest, acceptanceToken, idempotencyKey);
      if (!result.whatsappUrl.startsWith("https://wa.me/")) throw new Error("Invalid WhatsApp destination");
      if (editVersion.current !== version) { tab?.close(); return; }
      if (JSON.stringify(result.draft) !== JSON.stringify(draft)) {
        tab?.close();
        setError(ar ? "تغير الطلب مرة أخرى. راجع السلة وأعد المحاولة." : "The order changed again. Review the cart and retry.");
        return;
      }
      try {
        if (tab) tab.location.href = result.whatsappUrl;
        else window.location.href = result.whatsappUrl;
      } catch {
        setError(ar ? `حُفظ الطلب رقم ${result.orderNumber}، لكن تعذّر فتح WhatsApp. اضغط الزر مجددًا لإعادة فتحه دون إنشاء طلب جديد.`
          : `Order ${result.orderNumber} was saved, but WhatsApp could not open. Tap again to retry without a new order.`);
      }
    } catch (caught) {
      tab?.close();
      handleConfirmationError(caught, checkoutRequest, draft.itemsSubtotal, version, draft);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  return { busy, error, failureCode, failureField, reviewIssue, pendingPrice, previewMessage, previewPriceChanged, preview,
    closePreview: () => setPreviewMessage(null), submit, acceptUpdatedPrice, dismissUpdatedPrice: () => setPendingPrice(null) };
}

export function cartDisplayedTotal(cart: readonly CartItem[]): string {
  return sumMoney(cart.map((line) => multiplyMoney(
    line.mode === "NETWORK" ? line.acceptedQuote.total : line.priceText ?? String(line.price), line.quantity
  )));
}
