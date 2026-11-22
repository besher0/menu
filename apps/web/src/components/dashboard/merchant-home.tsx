"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { apiFetch, API_URL } from "@/lib/client-api";
import { resolveStoredRestaurant } from "@/lib/session";
import "./merchant-home.css";

type Product = { id: string; name: string };
type Review = { count: number; items: Product[] };
type Overview = {
  zone: string; updatedAt: string; start: string;
  visits: number; views: number; unavailable: Review; missingImage: Review;
  lists: { topViewedProducts: (Product & { imageUrl: string | null; views: number })[] };
  feedback: { id: string; stars: number; comment?: string; createdAt: string }[] | null;
};

function ProductLink({ product, review }: { product: Product; review?: string }) {
  return <Link href={`/dashboard/products/${encodeURIComponent(product.id)}/edit${review ? "?review=" + review : ""}`}><bdi>{product.name}</bdi></Link>;
}

export function MerchantHome({ rankingOnly = false }: { rankingOnly?: boolean }) {
  const params = useSearchParams();
  const requested = params.get("days");
  const [days, setDays] = useState(requested === "7" || requested === "30" ? requested : "1");
  const [refresh, setRefresh] = useState(0);
  const [restaurant, setRestaurant] = useState("");
  const [en, setEn] = useState(false);
  const [result, setResult] = useState<{ key: string; data: Overview }>();
  const [failed, setFailed] = useState("");
  const [busy, setBusy] = useState(true);
  const key = [restaurant, days, rankingOnly].join("/");
  useEffect(() => {
    const sync = () => setRestaurant(resolveStoredRestaurant()?.id ?? "");
    sync();
    const lang = () => setEn(document.documentElement.lang.startsWith("en") || document.documentElement.dir === "ltr");
    lang();
    const observer = new MutationObserver(lang);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["lang", "dir"] });
    window.addEventListener("storage", sync);
    window.addEventListener("restaurant:changed", sync);
    return () => { observer.disconnect(); window.removeEventListener("storage", sync); window.removeEventListener("restaurant:changed", sync); };
  }, []);
  useEffect(() => {
    if (!restaurant) return;
    const controller = new AbortController();
    setBusy(true);
    setFailed("");
    apiFetch<Overview>(`/dashboard/overview?days=${days}${rankingOnly ? "&view=ranking" : ""}`, { signal: controller.signal })
      .then(data => { if (!controller.signal.aborted) setResult({ key, data }); })
      .catch(() => { if (!controller.signal.aborted) setFailed(key); })
      .finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => controller.abort();
  }, [key, refresh, days, rankingOnly, restaurant]);
  const t = (ar: string, english: string) => en ? english : ar;
  const data = result?.key === key ? result.data : undefined;
  const date = (v: string, time = false) => new Intl.DateTimeFormat(en ? "en" : "ar", {
    timeZone: data?.zone, month: "short", day: "numeric", ...(time ? { hour: "2-digit", minute: "2-digit" } as const : {})
  }).format(new Date(v));
  const top = t("أكثر الأصناف مشاهدة", "Most viewed products");
  return <section className="merchant-home" dir={en ? "ltr" : "rtl"}>
    <header><div><h1>{rankingOnly ? top : t("الرئيسية", "Home")}</h1>
      {data && <small>{days !== "1" && <>{date(data.start)} – {date(data.updatedAt)} · </>}{t("آخر تحديث", "Last updated")} · {date(data.updatedAt, true)} ({data.zone})</small>}</div>
      <div className="mh-controls"><select aria-label={t("الفترة", "Period")} value={days} onChange={e => setDays(e.target.value)}>
        <option value="1">{t("اليوم", "Today")}</option><option value="7">{t("آخر 7 أيام", "Last 7 days")}</option><option value="30">{t("آخر 30 يومًا", "Last 30 days")}</option>
      </select><button aria-label={t("تحديث", "Refresh")} disabled={busy} onClick={() => setRefresh(n => n + 1)}><RefreshCw size={18}/></button></div></header>
    {busy && <p role="status">{t("جارٍ تحميل البيانات…", "Loading…")}</p>}
    {failed === key && <p role="alert">{t("تعذر تحديث البيانات.", "Could not refresh.")} <button onClick={() => setRefresh(n => n + 1)}>{t("إعادة المحاولة","Retry")}</button></p>}
    {data && <>
      {!rankingOnly && <div className="mh-stats">{[[t("زيارات المنيو","Menu visits"),data.visits],[t("مشاهدات الأصناف","Product views"),data.views]].map(([label,value]) =>
        <article key={label}><span>{label}</span><strong>{value}</strong></article>)}</div>}
      <div className="mh-panels">
      {!rankingOnly && <article><h2>{t("يحتاج مراجعة","Needs review")}</h2>
        {data.unavailable.count + data.missingImage.count === 0 && <p>{t("جميع الأصناف متوفرة ولها صور.","All products are available and have images.")}</p>}
        {([ [t("أصناف غير متوفرة","Unavailable products"),data.unavailable,"unavailable"], [t("أصناف بدون صور","Products without images"),data.missingImage,"missingImage"] ] as const).map(([title,group,review]) =>
          group.count > 0 && <section key={title}><div className="mh-title"><h3>{title} · {group.count}</h3>
            {group.count > group.items.length && <Link href={`/dashboard/products?review=${review}`} aria-label={t("عرض الكل", "View all") + " — " + title}>{t("عرض الكل", "View all")}</Link>}</div>{group.items.map(product => <div className="mh-row" key={product.id}><ProductLink product={product} review={review}/></div>)}</section>)}</article>}
      <article><div className="mh-title"><h2>{top}</h2>{!rankingOnly && <Link href={`/dashboard/analytics?view=products&days=${days}`}>{t("عرض الكل","View all")}</Link>}</div>
        {data.lists.topViewedProducts.map(product => <div className="mh-row" key={product.id}>
          {product.imageUrl && <img alt="" width="36" height="36" src={product.imageUrl.startsWith("/uploads/") ? API_URL + product.imageUrl : product.imageUrl}/>}
          <ProductLink product={product}/><small>{product.views} {t("مشاهدة","views")}</small></div>)}
        {!data.lists.topViewedProducts.length && <p>{t("لا توجد مشاهدات أصناف ضمن الفترة.","No product views in this period.")}</p>}</article>
      {!rankingOnly && data.feedback && <article><div className="mh-title"><h2>{t("أحدث التقييمات","Latest feedback")}</h2><Link href="/dashboard/feedback">{t("عرض الكل","View all")}</Link></div>
        {data.feedback.map(row => <section key={row.id}><div className="mh-title"><b aria-label={String(row.stars)}>{'★'.repeat(row.stars)}</b><small>{date(row.createdAt)}</small></div>{row.comment && <p dir="auto">{row.comment}</p>}</section>)}
        {!data.feedback.length && <p>{t("لا توجد تقييمات محفوظة.","No saved feedback.")}</p>}</article>}</div>
    </>}
  </section>;
}
