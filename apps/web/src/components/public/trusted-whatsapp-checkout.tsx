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
  deliveryArea: string; deliveryNear: string; deliveryBeside: string;
  pickupTime: string; orderNote: string;
};
type PendingPrice = {
  request: PublicWhatsappCheckoutRequest; draft: PublicWhatsappCheckoutDraft;
  acceptanceToken: string; messagePreview: string;
};

export function compareTrustedDraft(draft: PublicWhatsappCheckoutDraft, checkoutRequest: PublicWhatsappCheckoutRequest,
  displayedTotal: string, restaurantSlug: string, locale: Locale): "INVALID" | "PRICE_CHANGED" | "SOURCE_CHANGED" | "CURRENT" {
  if (draft.items.length !== checkoutRequest.items.length || draft.restaurantSlug !== restaurantSlug
    || draft.locale !== locale || !draft.items.every((line, index) => {
      const requested = checkoutRequest.items[index];
      return line.lineId === requested.lineId && line.mode === requested.mode && line.quantity === requested.quantity;
    })) return "INVALID";
  const priceChanged = compareMoney(draft.totalAmount, displayedTotal) !== 0 || draft.items.some((line, index) => {
    const requested = checkoutRequest.items[index];
    return !requested.expectedUnitPrice || compareMoney(line.unitPrice, requested.expectedUnitPrice) !== 0
      || compareMoney(line.lineTotal, multiplyMoney(requested.expectedUnitPrice, requested.quantity)) !== 0;
  });
  if (priceChanged) return "PRICE_CHANGED";
  return draft.items.some((line) => line.changed) ? "SOURCE_CHANGED" : "CURRENT";
}

/** Checkout behavior only. CartView owns the original three-step visual shell. */
export function useTrustedWhatsappCheckout({ cart, restaurantSlug, locale, details, disabledReason }: {
  cart: readonly CartItem[]; restaurantSlug: string; locale: Locale; details: Details; disabledReason?: string;
}) {
  const [pendingPrice, setPendingPrice] = useState<PendingPrice | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewMessage, setPreviewMessage] = useState<string | null>(null);
  const [previewPriceChanged, setPreviewPriceChanged] = useState(false);
  const busyRef = useRef(false);
  const editVersion = useRef(0);
  const ar = locale === "ar";

  useEffect(() => {
    editVersion.current += 1;
    setPendingPrice(null);
    setPreviewMessage(null);
  }, [cart, locale, details.customerName, details.customerPhone, details.fulfillmentType,
    details.deliveryArea, details.deliveryNear, details.deliveryBeside, details.pickupTime, details.orderNote]);

  function request(): PublicWhatsappCheckoutRequest {
    return {
      locale,
      ...(details.customerName.trim() ? { customerName: details.customerName.trim() } : {}),
      ...(details.customerPhone.trim() ? { customerPhone: details.customerPhone.trim() } : {}),
      fulfillmentType: details.fulfillmentType,
      ...(details.fulfillmentType === "delivery" ? {
        deliveryArea: details.deliveryArea.trim(), deliveryNear: details.deliveryNear.trim(), deliveryBeside: details.deliveryBeside.trim()
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

  async function preview() {
    if (disabledReason || !cart.length || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    setPreviewMessage(null);
    const version = editVersion.current;
    const checkoutRequest = request();
    try {
      const prepared = await preparePublicWhatsappCheckout(restaurantSlug, checkoutRequest);
      if (editVersion.current !== version) return;
      const comparison = compareTrustedDraft(prepared.draft, checkoutRequest,
        cartDisplayedTotal(cart), restaurantSlug, locale);
      if (comparison === "INVALID" || comparison === "SOURCE_CHANGED") {
        setError(ar ? "تغيرت اختيارات الطلب؛ راجع السلة قبل معاينة الرسالة." : "Order choices changed; review the cart before previewing.");
        return;
      }
      setPreviewPriceChanged(comparison === "PRICE_CHANGED");
      setPreviewMessage(prepared.messagePreview);
    } catch (caught) {
      if (editVersion.current === version) setError(caught instanceof PublicWhatsappCheckoutError ? caught.message
        : ar ? "تعذر تجهيز معاينة الرسالة." : "Could not prepare the message preview.");
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
        ? compareMoney(caught.changedDraft.totalAmount, approvedDraft.totalAmount) !== 0
          || caught.changedDraft.items.some((line, index) => {
            const approvedLine = approvedDraft.items[index];
            return !approvedLine || compareMoney(line.unitPrice, approvedLine.unitPrice) !== 0;
          }) ? "PRICE_CHANGED" : JSON.stringify(caught.changedDraft) !== JSON.stringify(approvedDraft) ? "SOURCE_CHANGED" : "CURRENT"
        : compareTrustedDraft(caught.changedDraft, checkoutRequest, displayedTotal, restaurantSlug, locale);
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
    setError(caught instanceof PublicWhatsappCheckoutError ? caught.message
      : ar ? "لم يُفتح WhatsApp لأن التحقق فشل." : "WhatsApp was not opened because verification failed.");
  }

  async function confirmAndOpen(checkoutRequest: PublicWhatsappCheckoutRequest, acceptanceToken: string,
    displayedTotal: string, version: number, tab: Window | null) {
    try {
      const result = await confirmPublicWhatsappCheckout(restaurantSlug, checkoutRequest, acceptanceToken);
      if (!result.whatsappUrl.startsWith("https://wa.me/")) throw new Error("Invalid WhatsApp destination");
      if (editVersion.current !== version) { tab?.close(); return; }
      const comparison = compareTrustedDraft(result.draft, checkoutRequest, displayedTotal, restaurantSlug, locale);
      if (comparison !== "CURRENT") {
        tab?.close();
        setError(ar ? "تغير الطلب أثناء التحقق. راجعه وأعد الإرسال." : "The order changed during verification. Review and retry.");
        return;
      }
      if (tab) tab.location.href = result.whatsappUrl;
      else window.location.href = result.whatsappUrl;
    } catch (caught) {
      tab?.close();
      handleConfirmationError(caught, checkoutRequest, displayedTotal, version);
    }
  }

  async function submit(displayedTotal: string) {
    if (disabledReason || !cart.length || busyRef.current) return;
    if (details.fulfillmentType === "delivery"
      && (!details.deliveryArea.trim() || !details.deliveryNear.trim() || !details.deliveryBeside.trim())) {
      setError(ar ? "أدخل منطقة التوصيل والعلامة القريبة والتفاصيل." : "Enter the delivery area, nearby landmark and address detail.");
      return;
    }
    // Reserve a tab during the click; it stays blank until both server calls succeed.
    const tab = window.open("about:blank", "_blank");
    busyRef.current = true;
    setBusy(true);
    setError(null);
    setPendingPrice(null);
    const version = editVersion.current;
    const checkoutRequest = request();
    try {
      const prepared = await preparePublicWhatsappCheckout(restaurantSlug, checkoutRequest);
      if (editVersion.current !== version) { tab?.close(); return; }
      const comparison = compareTrustedDraft(prepared.draft, checkoutRequest, displayedTotal, restaurantSlug, locale);
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
      await confirmAndOpen(checkoutRequest, prepared.acceptanceToken, displayedTotal, version, tab);
    } catch (caught) {
      tab?.close();
      if (editVersion.current === version) setError(caught instanceof PublicWhatsappCheckoutError ? caught.message
        : ar ? "تعذر التحقق من الطلب. حاول مجددًا." : "Could not verify the order. Try again.");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  async function acceptUpdatedPrice() {
    if (!pendingPrice || busyRef.current) return;
    const tab = window.open("about:blank", "_blank");
    const version = editVersion.current;
    const { request: checkoutRequest, acceptanceToken, draft } = pendingPrice;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    setPendingPrice(null);
    try {
      // Confirm independently revalidates the draft and the HMAC-bound approval.
      const result = await confirmPublicWhatsappCheckout(restaurantSlug, checkoutRequest, acceptanceToken);
      if (!result.whatsappUrl.startsWith("https://wa.me/")) throw new Error("Invalid WhatsApp destination");
      if (editVersion.current !== version) { tab?.close(); return; }
      if (JSON.stringify(result.draft) !== JSON.stringify(draft)) {
        tab?.close();
        setError(ar ? "تغير الطلب مرة أخرى. راجع السلة وأعد المحاولة." : "The order changed again. Review the cart and retry.");
        return;
      }
      if (tab) tab.location.href = result.whatsappUrl;
      else window.location.href = result.whatsappUrl;
    } catch (caught) {
      tab?.close();
      handleConfirmationError(caught, checkoutRequest, draft.totalAmount, version, draft);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  return { busy, error, pendingPrice, previewMessage, previewPriceChanged, preview,
    closePreview: () => setPreviewMessage(null), submit, acceptUpdatedPrice, dismissUpdatedPrice: () => setPendingPrice(null) };
}

export function cartDisplayedTotal(cart: readonly CartItem[]): string {
  return sumMoney(cart.map((line) => multiplyMoney(
    line.mode === "NETWORK" ? line.acceptedQuote.total : line.priceText ?? String(line.price), line.quantity
  )));
}
