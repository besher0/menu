"use client";

import { Component, lazy, Suspense, type ComponentProps, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import styles from "./product-configurator.module.css";

// Only component code is shared here, never restaurant/configuration data.
const loadConfigurator = () => import("./product-configurator");
const LazyConfigurator = lazy(() => loadConfigurator().then(module => ({ default: module.ProductConfigurator })));
export function preloadProductConfigurator() { void loadConfigurator().catch(() => undefined); }

class ConfiguratorBoundary extends Component<{ english: boolean; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return <section className={styles.state} role="alert">
      <b>{this.props.english ? "Product choices could not load. Check your connection and reload." : "تعذر تحميل الخيارات. تحقق من الاتصال وأعد تحميل الصفحة."}</b>
      <button type="button" onClick={() => window.location.reload()}>{this.props.english ? "Reload" : "إعادة التحميل"}</button>
    </section>;
    return this.props.children;
  }
}

export function ProductConfigurator(props: ComponentProps<typeof import("./product-configurator").ProductConfigurator>) {
  const english = props.locale === "en";
  return <ConfiguratorBoundary english={english}><Suspense fallback={<section className={`${styles.state} public-configuration-loading`} dir={english ? "ltr" : "rtl"} role="status">
    <Loader2 className={styles.spin} size={22} /><b>{english ? "Loading product choices..." : "جارٍ تحميل خيارات الصنف..."}</b>
  </section>}>
    <LazyConfigurator {...props} />
  </Suspense></ConfiguratorBoundary>;
}
