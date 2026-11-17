"use client";
import { useRouter } from "next/navigation";
import { PublicImage } from "./public-image";
import { useRestaurantShell } from "./restaurant-shell-context";
import { rememberPublicNavigation } from "./public-history";

export function PublicBackIcon() {
  return <svg className="public-back-icon" viewBox="0 0 24 20" aria-hidden="true"><path d="M9 3.5 15.5 10 9 16.5" /></svg>;
}
export function PublicHeaderLogo({src,name,homeHref,restaurantSlug,locale}:{src?:string|null;name:string;homeHref:string;restaurantSlug:string;locale:"ar"|"en"}) {
  const shell=useRestaurantShell(),router=useRouter();
  function home() {
    if(location.pathname.replace(/\/$/,"")===new URL(homeHref,location.href).pathname.replace(/\/$/,""))return;
    if(!shell?.navigate(homeHref)){rememberPublicNavigation(homeHref,restaurantSlug);router.push(homeHref);}
  }
  return <button className="public-header-logo" type="button" onClick={home} aria-label={locale==="ar"?`الرئيسية — ${name}`:`Home — ${name}`}>
    {src?<PublicImage src={src} alt={name} sizes="44px" />:<span className="public-logo-fallback" />}
  </button>;
}
