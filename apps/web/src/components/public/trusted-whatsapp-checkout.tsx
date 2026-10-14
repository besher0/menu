"use client";

import { useEffect, useRef, useState } from "react";
import {
  confirmPublicWhatsappCheckout, preparePublicWhatsappCheckout, PublicWhatsappCheckoutError,
  type PublicWhatsappCheckoutDraft, type PublicWhatsappCheckoutRequest
} from "@/lib/api";
import type { CartItem } from "./cart-model";

type Locale = "ar" | "en";

export function TrustedWhatsappCheckout({ cart, restaurantSlug, locale, disabledReason }: {
  cart: readonly CartItem[]; restaurantSlug: string; locale: Locale; disabledReason?: string;
}) {
  const [fulfillmentType, setFulfillmentType] = useState<"pickup" | "delivery">("pickup");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [deliveryArea, setDeliveryArea] = useState("");
  const [deliveryNear, setDeliveryNear] = useState("");
  const [deliveryBeside, setDeliveryBeside] = useState("");
  const [pickupTime, setPickupTime] = useState("");
  const [orderNote, setOrderNote] = useState("");
  const [prepared, setPrepared] = useState<{ request: PublicWhatsappCheckoutRequest;
    draft: PublicWhatsappCheckoutDraft; messagePreview: string; acceptanceToken: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const editVersion = useRef(0);
  const ar = locale === "ar";

  useEffect(() => { editVersion.current += 1; setPrepared(null); }, [cart, fulfillmentType, customerName, customerPhone,
    deliveryArea, deliveryNear, deliveryBeside, pickupTime, orderNote, locale]);

  function request(): PublicWhatsappCheckoutRequest {
    return {
      locale,
      ...(customerName.trim() ? { customerName: customerName.trim() } : {}),
      ...(customerPhone.trim() ? { customerPhone: customerPhone.trim() } : {}),
      fulfillmentType,
      ...(fulfillmentType === "delivery" ? {
        deliveryArea: deliveryArea.trim(), deliveryNear: deliveryNear.trim(), deliveryBeside: deliveryBeside.trim()
      } : pickupTime.trim() ? { pickupTime: pickupTime.trim() } : {}),
      ...(orderNote.trim() ? { orderNote: orderNote.trim() } : {}),
      items: cart.map((item) => item.mode === "LEGACY" ? {
        mode: "LEGACY" as const, lineId: item.lineId, productSlug: item.slug,
        quantity: item.quantity, ...(item.note?.trim() ? { note: item.note.trim() } : {}),
        ...(item.priceText ? { expectedUnitPrice: item.priceText } : {})
      } : {
        mode: "NETWORK" as const, lineId: item.lineId, productId: item.productId,
        quantity: item.quantity, selection: item.selection,
        ...(item.note?.trim() ? { note: item.note.trim() } : {}),
        expectedUnitPrice: item.acceptedQuote.total,
        expectedLinkedSourceRevisions: item.acceptedQuote.linkedSourceRevisions
      })
    };
  }

  async function prepare() {
    if (disabledReason || !cart.length || busy) return;
    if (fulfillmentType === "delivery" && (!deliveryArea.trim() || !deliveryNear.trim() || !deliveryBeside.trim())) {
      setError(ar ? "أدخل منطقة التوصيل والعلامة القريبة والتفاصيل." : "Enter the delivery area, nearby landmark and address detail.");
      return;
    }
    setBusy(true);
    setError(null);
    setPrepared(null);
    const version = editVersion.current;
    try {
      const checkoutRequest = request();
      const response = await preparePublicWhatsappCheckout(restaurantSlug, checkoutRequest);
      if (editVersion.current === version) setPrepared({ request: checkoutRequest, ...response });
    } catch (caught) {
      setError(caught instanceof PublicWhatsappCheckoutError ? caught.message : ar ? "تعذر التحقق من الطلب. حاول مجددًا." : "Could not verify the order. Try again.");
    } finally { setBusy(false); }
  }

  async function acceptAndOpen() {
    if (!prepared || busy) return;
    // Open a blank tab within the user's click; never populate it before server confirmation.
    const tab = window.open("about:blank", "_blank");
    const version = editVersion.current;
    setBusy(true);
    setError(null);
    try {
      const result = await confirmPublicWhatsappCheckout(restaurantSlug, prepared.request, prepared.acceptanceToken);
      if (!result.whatsappUrl.startsWith("https://wa.me/")) throw new Error("Invalid WhatsApp destination");
      if (editVersion.current !== version) {
        tab?.close();
        return;
      }
      if (tab) tab.location.href = result.whatsappUrl;
      else window.location.href = result.whatsappUrl;
    } catch (caught) {
      tab?.close();
      if (caught instanceof PublicWhatsappCheckoutError && caught.status === 409
        && caught.changedDraft && caught.changedMessagePreview && caught.acceptanceToken) {
        if (editVersion.current === version) setPrepared({ ...prepared, draft: caught.changedDraft,
          messagePreview: caught.changedMessagePreview, acceptanceToken: caught.acceptanceToken });
        setError(ar ? "تغيّر الطلب بعد المراجعة. راجع الأسعار الجديدة ثم وافق مرة أخرى." : "The order changed after review. Check the new prices and accept again.");
      } else {
        setPrepared(null);
        setError(caught instanceof PublicWhatsappCheckoutError ? caught.message : ar ? "لم يُفتح WhatsApp لأن التحقق فشل." : "WhatsApp was not opened because verification failed.");
      }
    } finally { setBusy(false); }
  }

  return <section className="cart-checkout-card trusted-whatsapp-checkout" dir={ar ? "rtl" : "ltr"}>
    <h2>{ar ? "مراجعة طلب WhatsApp" : "Review WhatsApp order"}</h2>
    <p>{ar ? "سنراجع الأسعار والتوفر مباشرة من المطعم قبل فتح الرسالة. لن تُرسل تلقائيًا." : "We will verify prices and availability with the restaurant before opening the message. It will not send automatically."}</p>
    <label><span>{ar ? "اسم الزبون (اختياري)" : "Customer name (optional)"}</span>
      <input value={customerName} maxLength={120} onChange={(event) => setCustomerName(event.target.value)} /></label>
    <label><span>{ar ? "الهاتف (اختياري)" : "Phone (optional)"}</span>
      <input value={customerPhone} maxLength={40} onChange={(event) => setCustomerPhone(event.target.value)} /></label>
    <div className="fulfillment-toggle">
      <button type="button" className={fulfillmentType === "pickup" ? "active" : ""} onClick={() => setFulfillmentType("pickup")}>{ar ? "استلام" : "Pickup"}</button>
      <button type="button" className={fulfillmentType === "delivery" ? "active" : ""} onClick={() => setFulfillmentType("delivery")}>{ar ? "توصيل" : "Delivery"}</button>
    </div>
    {fulfillmentType === "delivery" ? <>
      <label><span>{ar ? "المنطقة" : "Area"}</span><input value={deliveryArea} maxLength={160} onChange={(event) => setDeliveryArea(event.target.value)} /></label>
      <label><span>{ar ? "بالقرب من" : "Near"}</span><input value={deliveryNear} maxLength={160} onChange={(event) => setDeliveryNear(event.target.value)} /></label>
      <label><span>{ar ? "تفاصيل العنوان" : "Address detail"}</span><input value={deliveryBeside} maxLength={160} onChange={(event) => setDeliveryBeside(event.target.value)} /></label>
    </> : <label><span>{ar ? "وقت الاستلام (اختياري)" : "Pickup time (optional)"}</span>
      <input value={pickupTime} maxLength={80} onChange={(event) => setPickupTime(event.target.value)} /></label>}
    <label><span>{ar ? "ملاحظة الطلب (اختياري)" : "Order note (optional)"}</span>
      <textarea value={orderNote} maxLength={500} onChange={(event) => setOrderNote(event.target.value)} /></label>
    {disabledReason ? <p role="alert" className="cart-message">{disabledReason}</p> : null}
    {error ? <p role="alert" className="cart-message">{error}</p> : null}
    <button className="cart-whatsapp" type="button" disabled={Boolean(disabledReason) || !cart.length || busy} onClick={() => void prepare()}>
      {busy ? ar ? "جارٍ التحقق..." : "Checking..." : ar ? "مراجعة الأسعار والاختيارات" : "Verify prices and choices"}
    </button>
    {prepared ? <div className="trusted-whatsapp-draft" role="status">
      <h3>{ar ? "المراجعة الموثوقة" : "Verified review"}</h3>
      <ul>{prepared.draft.items.map((line) => <li key={line.lineId}>
        <b>{line.productName} × {line.quantity}</b> — {line.lineTotal} {prepared.draft.currency}
        {line.changed ? <em> {ar ? "(تغيّر السعر؛ راجع قبل الموافقة)" : "(price changed; review before accepting)"}</em> : null}
      </li>)}</ul>
      <pre className="trusted-whatsapp-message-preview" dir="auto">{prepared.messagePreview}</pre>
      <strong>{ar ? "الإجمالي" : "Total"}: {prepared.draft.totalAmount} {prepared.draft.currency}</strong>
      <p>{ar ? "أوافق على السعر والاختيارات أعلاه، وأفتح WhatsApp لإرسال الطلب بنفسي." : "I accept the prices and choices above and will send the message myself in WhatsApp."}</p>
      <button className="cart-whatsapp" type="button" disabled={busy} onClick={() => void acceptAndOpen()}>
        {ar ? "أوافق وأفتح WhatsApp" : "Accept and open WhatsApp"}
      </button>
    </div> : null}
  </section>;
}
