"use client";
import "./public-header-controls.css";
import { useRouter } from "next/navigation";
import { PublicImage } from "./public-image";
import { useRestaurantShell } from "./restaurant-shell-context";
import { rememberPublicNavigation } from "./public-history";

function PublicBackIcon() {
  return <svg className="public-back-icon" viewBox="0 0 24 20" aria-hidden="true"><path d="M9 3.5 15.5 10 9 16.5" /></svg>;
}
export function PublicBackButton({onClick, locale}: {onClick: () => void; locale: "ar" | "en"}) {
  return <button type="button" className="public-back-button" dir={locale === "ar" ? "rtl" : "ltr"} onClick={onClick} aria-label={locale === "ar" ? "الرجوع" : "Back"}>
    <PublicBackIcon />
  </button>;
}

export function PublicHeaderLogo({src,name,homeHref,restaurantSlug,locale}:{src?:string|null;name:string;homeHref:string;restaurantSlug:string;locale:"ar"|"en"}) {
  const shell=useRestaurantShell(),router=useRouter();
  function home() {
    if(location.pathname.replace(/\/$/,"")===new URL(homeHref,location.href).pathname.replace(/\/$/,""))return;
    if(!shell?.navigate(homeHref)){rememberPublicNavigation(homeHref,restaurantSlug);router.push(homeHref);}
  }
  return <button className="public-header-logo" type="button" onClick={home} aria-label={locale==="ar"?`الرئيسية — ${name}`:`Home — ${name}`}>
    <PublicImage src={src} alt={name} sizes="44px" fallback={<span className="public-header-logo-fallback" aria-hidden="true" />} />
  </button>;
}
