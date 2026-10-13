"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { restoreCartStorage, type CartItem } from "./cart-model";
import { draftNeedsFreshAcceptance, testOrderRequestFromCart, type TestOrderDetails, type TrustedTestDraft } from "./network-order-test-model";
import styles from "./network-order-test-client.module.css";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000";
type Prepared = { draft: TrustedTestDraft; acceptanceToken: string; requestKey: string };
type Preview = { orderId: string; message: string; totalAmount: string; currency: string; fromSealedSnapshot: true; orderingEnabled: false };

class DemoApiError extends Error {
  constructor(readonly status: number, readonly code: string, readonly payload: Record<string, unknown>) {
    super(typeof payload.message === "string" ? payload.message : code);
  }
}

async function demoApi<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body), cache: "no-store"
  });
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) throw new DemoApiError(response.status, String(payload.error ?? "NETWORK_TEST_FAILED"), payload);
  return (payload.data ?? payload) as T;
}

export function NetworkOrderTestClient({ restaurantSlug, currency }: { restaurantSlug: string; currency: string }) {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [locale, setLocale] = useState<"ar" | "en">("ar");
  const [details, setDetails] = useState<TestOrderDetails>({ fulfillmentType: "pickup" });
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [prepared, setPrepared] = useState<Prepared | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [createdOrderId, setCreatedOrderId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [changed, setChanged] = useState(false);
  const submissionKey = useRef<string | null>(null);
  const inFlight = useRef(false);
  const path = `/public/menus/${encodeURIComponent(restaurantSlug)}/orders/network-test`;

  useEffect(() => {
    setCart(restoreCartStorage(window.localStorage.getItem(`cart:${restaurantSlug}:main`), restaurantSlug, currency));
    setLoaded(true);
  }, [restaurantSlug, currency]);

  const request = useMemo(() => {
    try { return testOrderRequestFromCart(cart, restaurantSlug, currency, locale, details, notes); }
    catch { return null; }
  }, [cart, restaurantSlug, currency, locale, details, notes]);
  const requestKey = request ? JSON.stringify(request) : "";
  const currentPrepared = prepared?.requestKey === requestKey ? prepared : null;
  const hasMixedCart = cart.some((line) => line.mode === "LEGACY");
  const pricesDifferFromCart = Boolean(currentPrepared?.draft.items.some((line, index) =>
    cart[index]?.mode === "NETWORK" && cart[index].acceptedQuote.total !== line.unitPrice));

  function updateDetails<K extends keyof TestOrderDetails>(field: K, value: TestOrderDetails[K]) {
    setDetails((prior) => ({ ...prior, [field]: value }));
    setAccepted(false);
    setPreview(null);
  }

  async function prepare() {
    if (!request || busy || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    setAccepted(false);
    setPreview(null);
    setCreatedOrderId(null);
    submissionKey.current = null;
    try {
      const response = await demoApi<{ draft: TrustedTestDraft; acceptanceToken: string; orderingEnabled: false }>(`${path}/prepare`, request);
      setChanged(prepared ? draftNeedsFreshAcceptance(prepared.draft, response.draft) : false);
      setPrepared({ draft: response.draft, acceptanceToken: response.acceptanceToken, requestKey });
    } catch (cause) {
      setPrepared(null);
      setError(cause instanceof DemoApiError ? `${cause.code} (HTTP ${cause.status}) — صحّح الاختيارات أو أعد فتح المنتج.` : "تعذر الوصول إلى خادم التجربة المحلي.");
    } finally { inFlight.current = false; setBusy(false); }
  }

  async function loadPreview(orderId: string) {
    const result = await demoApi<Preview>(`${path}/${encodeURIComponent(orderId)}/preview`);
    if (result.fromSealedSnapshot !== true || result.orderingEnabled !== false) throw new Error("INVALID_SAVED_PREVIEW");
    setPreview(result);
  }

  async function create() {
    if (!request || !currentPrepared || !accepted || busy || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      submissionKey.current ??= crypto.randomUUID();
      const result = await demoApi<{ orderId: string; orderingEnabled: false }>(path, {
        ...request, acceptanceToken: currentPrepared.acceptanceToken, idempotencyKey: submissionKey.current
      });
      if (result.orderingEnabled !== false) throw new Error("ORDERING_GATE_MISMATCH");
      setCreatedOrderId(result.orderId);
      await loadPreview(result.orderId);
    } catch (cause) {
      if (cause instanceof DemoApiError && cause.status === 409) {
        const updated = cause.payload.changedQuote as TrustedTestDraft | undefined;
        const token = cause.payload.acceptanceToken;
        if (cause.code === "NETWORK_ORDER_REQUIRES_NEW_ACCEPTANCE" && updated && typeof token === "string") {
          setPrepared({ draft: updated, acceptanceToken: token, requestKey });
          setChanged(true);
          setAccepted(false);
          submissionKey.current = null;
          setError("تغير السعر أو التكوين. راجع المسودة الجديدة ووافق عليها صراحة قبل المحاولة مرة أخرى.");
        } else {
          setPrepared(null);
          setAccepted(false);
          setError(`${cause.code} — لم يُنشأ طلب. افتح المنتج وحدّث الاختيارات ثم اطلب مسودة جديدة.`);
        }
      } else {
        setError(cause instanceof DemoApiError ? `${cause.code} (HTTP ${cause.status})` : "تعذر تأكيد النتيجة؛ أعد المحاولة بنفس المفتاح أو حمّل المعاينة إذا ظهر رقم الطلب التجريبي.");
      }
    } finally { inFlight.current = false; setBusy(false); }
  }

  return <main className={styles.page} dir={locale === "ar" ? "rtl" : "ltr"}>
    <header className={styles.header}>
      <Link href={`/m/${encodeURIComponent(restaurantSlug)}/cart`}>العودة إلى السلة</Link>
      <span className={styles.badge}>تجربة محلية معزولة · لا إرسال WhatsApp</span>
      <h1>معاينة الطلب الموثوق</h1>
      <p>هذه الصفحة لا تنشئ طلبًا حقيقيًا. الخادم يعيد قراءة التكوين والأسعار قبل حفظ الطلب التجريبي.</p>
      <button type="button" onClick={() => setLocale(locale === "ar" ? "en" : "ar")}>{locale === "ar" ? "English" : "العربية"}</button>
    </header>

    <section className={styles.card}>
      <h2>سلة الشبكة</h2>
      {!loaded ? <p>تحميل السلة…</p> : cart.length === 0 ? <p>السلة فارغة. أضف بيتزا أو كومبو من المنيو أولًا.</p> : null}
      {hasMixedCart ? <p role="alert">السلة المختلطة غير مدعومة في التجربة. لن تُرسل المنتجات القديمة جزئيًا؛ افصلها دون تحويل صامت.</p> : null}
      <ul>{cart.map((line) => <li key={line.lineId}>{line.name} × {line.quantity} — {line.mode === "NETWORK" ? "تكوين شبكة" : "منتج قديم"}
        {line.mode === "NETWORK" ? <label className={styles.note}>ملاحظة الصنف
          <input value={notes[line.lineId] ?? ""} onChange={(event) => setNotes((prior) => ({ ...prior, [line.lineId]: event.target.value }))} maxLength={500} />
        </label> : null}</li>)}</ul>
    </section>

    <section className={styles.card}>
      <h2>بيانات الطلب التجريبي</h2>
      <div className={styles.grid}>
        <label>اسم الزبون <input value={details.customerName ?? ""} onChange={(event) => updateDetails("customerName", event.target.value)} maxLength={120} /></label>
        <label>الهاتف (اختياري) <input value={details.customerPhone ?? ""} onChange={(event) => updateDetails("customerPhone", event.target.value)} maxLength={40} /></label>
        <label>طريقة الاستلام <select value={details.fulfillmentType ?? "pickup"} onChange={(event) => {
          const mode = event.target.value as "pickup" | "delivery";
          setDetails((prior) => ({ customerName: prior.customerName, customerPhone: prior.customerPhone,
            orderNote: prior.orderNote, fulfillmentType: mode }));
          setAccepted(false);
        }}><option value="pickup">استلام من المطعم</option><option value="delivery">توصيل</option></select></label>
        {details.fulfillmentType === "delivery" ? <>
          <label>المنطقة <input value={details.deliveryArea ?? ""} onChange={(event) => updateDetails("deliveryArea", event.target.value)} maxLength={160} /></label>
          <label>بالقرب من <input value={details.deliveryNear ?? ""} onChange={(event) => updateDetails("deliveryNear", event.target.value)} maxLength={160} /></label>
          <label>بجانب <input value={details.deliveryBeside ?? ""} onChange={(event) => updateDetails("deliveryBeside", event.target.value)} maxLength={160} /></label>
        </> : <label>موعد الاستلام (اختياري) <input value={details.pickupTime ?? ""} onChange={(event) => updateDetails("pickupTime", event.target.value)} maxLength={80} /></label>}
        <label className={styles.wide}>ملاحظات الطلب <textarea value={details.orderNote ?? ""} onChange={(event) => updateDetails("orderNote", event.target.value)} maxLength={500} /></label>
      </div>
      <button type="button" onClick={prepare} disabled={!request || busy || Boolean(createdOrderId)}>اطلب مسودة موثوقة</button>
    </section>

    {currentPrepared ? <section className={styles.card} aria-label="Trusted Draft">
      <h2>مسودة الخادم — راجع قبل الموافقة</h2>
      {(changed || pricesDifferFromCart) ? <p role="alert">تغير السعر أو التكوين مقارنةً بما شاهدته في السلة. لم يُنشأ طلب تلقائيًا.</p> : null}
      <p>المطعم: {currentPrepared.draft.orderDetails.restaurantName}</p>
      <p>الزبون: {currentPrepared.draft.orderDetails.customerName ?? "غير مذكور"} · {currentPrepared.draft.orderDetails.fulfillmentType === "delivery" ? "توصيل" : "استلام"}</p>
      {currentPrepared.draft.orderDetails.fulfillmentType === "delivery" ? <p>العنوان: {[currentPrepared.draft.orderDetails.deliveryArea, currentPrepared.draft.orderDetails.deliveryNear, currentPrepared.draft.orderDetails.deliveryBeside].filter(Boolean).join(" — ")}</p> : null}
      {currentPrepared.draft.orderDetails.orderNote ? <p>ملاحظة: {currentPrepared.draft.orderDetails.orderNote}</p> : null}
      {currentPrepared.draft.items.map((line, index) => <article key={`${line.productId}-${index}`} className={styles.line}>
        <h3>{line.productName} × {line.quantity}</h3>
        {line.note ? <p>ملاحظة الصنف: {line.note}</p> : null}
        <ul>{line.priceBreakdown.map((entry, entryIndex) => <li key={`${entry.path}-${entryIndex}`}>{entry.label} — {entry.included ? "مشمول" : `${entry.chargedAmount} ${currentPrepared.draft.currency}`}</li>)}</ul>
        <p>سعر الوحدة: {line.unitPrice} {currentPrepared.draft.currency} · إجمالي الصنف: {line.lineTotal} {currentPrepared.draft.currency}</p>
      </article>)}
      <strong>إجمالي المسودة الموثوقة: {currentPrepared.draft.totalAmount} {currentPrepared.draft.currency}</strong>
      <label className={styles.accept}><input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} /> راجعت المسودة والأسعار وأوافق على إنشاء طلب تجريبي فقط.</label>
      <button type="button" onClick={create} disabled={!accepted || busy || Boolean(createdOrderId)}>إنشاء طلب تجريبي بعد الموافقة</button>
    </section> : prepared && !currentPrepared ? <p role="alert" className={styles.card}>تغيّرت بيانات الطلب بعد المسودة. اطلب مسودة جديدة قبل الموافقة.</p> : null}

    {error ? <p role="alert" className={styles.error}>{error}</p> : null}
    {createdOrderId && !preview ? <button type="button" onClick={() => loadPreview(createdOrderId).catch(() => setError("تعذر قراءة Snapshot المحفوظة."))}>إعادة تحميل معاينة الطلب المحفوظ</button> : null}
    {preview ? <section className={styles.card} aria-label="WhatsApp Preview">
      <h2>رسالة WhatsApp من Snapshot محفوظة</h2>
      <p>طلب تجريبي محفوظ · لا إرسال ولا فتح للرابط</p>
      <pre className={styles.message} dir="auto">{preview.message}</pre>
      <button type="button" onClick={() => navigator.clipboard.writeText(preview.message).catch(() => setError("تعذر نسخ الرسالة."))}>نسخ الرسالة</button>
    </section> : null}
  </main>;
}
