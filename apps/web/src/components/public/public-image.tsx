"use client";

import { getImageProps } from "next/image";
import { useEffect, useRef, useState, type ReactElement } from "react";
import { Image as ImageIcon } from "lucide-react";
import { canOptimizePublicImage, safePublicImageSource } from "./public-image-model";

const bundledRatios: Record<string, [number, number]> = JSON.parse(process.env.PUBLIC_BUNDLED_IMAGE_RATIOS ?? "{}");

type Props = {
  fallback?: ReactElement;
  productImageKey?: string;
  readyThumbnail?: string;
  src?: string | null; alt: string; className?: string; decorative?: boolean;
  sizes?: string; loading?: "lazy" | "eager"; fetchPriority?: "high" | "low" | "auto";
  preserveIntrinsicSize?: boolean;
  originalDimensions?: { width: number; height: number };
};

export function PublicImage({ src: input, ...props }: Props) {
  const src = safePublicImageSource(input);
  // A gallery/source change resets failure state; an error never creates a retry loop.
  return <PublicImageSource key={src} src={src} {...props} />;
}

function PublicImageSource({ src, productImageKey, readyThumbnail: initialThumbnail, alt, className, decorative, fallback, sizes = "(max-width: 430px) 100vw, 430px", loading = "eager", fetchPriority = "auto", preserveIntrinsicSize = false, originalDimensions }: Props) {
  const [failure, setFailure] = useState<"none" | "original" | "missing">("none");
  // Keep this selection while quantity and other controls re-render the open photo.
  const [readyThumbnail] = useState(initialThumbnail);
  const [decoded, setDecoded] = useState(false);
  const element = useRef<HTMLImageElement>(null);
  // Preserve the original ratio across thumbnail resampling in intrinsic-height rows.
  const dimensions = bundledRatios[src ?? ""] ?? (originalDimensions && [originalDimensions.width, originalDimensions.height]);
  const ratio = preserveIntrinsicSize ? dimensions?.join(" / ") : undefined;
  const optimized = (!preserveIntrinsicSize || !!ratio) && failure === "none" && canOptimizePublicImage(src ?? "");
  useEffect(() => {
    // A cached/fast SSR failure may precede hydration and its error handler.
    // An unloaded lazy image has no currentSrc and is not a failed image.
    const image = element.current;
    if (image?.complete && image.currentSrc && image.naturalWidth === 0) {
      setFailure(optimized ? "original" : "missing");
    }
  }, [src, optimized, failure]);
  useEffect(() => {
    const high = element.current;
    if (!readyThumbnail || !high) return;
    let active = true;
    const reveal = async () => {
      if (!high.complete || !high.naturalWidth) return;
      const url = high.currentSrc;
      try { await high.decode(); } catch { return; }
      if (active && high.currentSrc === url) setDecoded(true);
    };
    high.addEventListener("load", reveal);
    void reveal();
    return () => { active = false; high.removeEventListener("load", reveal); };
  }, [readyThumbnail, failure]);

  if (src && readyThumbnail && failure === "missing") return <img src={readyThumbnail} alt={alt} className={className} />;
  if (!src || failure === "missing") return fallback ?? <span className={`product-image-placeholder ${className ?? ""}`} role={decorative ? undefined : "img"} aria-hidden={decorative || undefined} aria-label={decorative ? undefined : alt}><ImageIcon size={24} /></span>;
  const image = optimized ? getImageProps({ src, alt, width: 1600, height: 1600, sizes, quality: 75 }).props : { src, srcSet: undefined, sizes: undefined };
  // Only delivery attributes are reused. Synthetic dimensions from getImageProps
  // MUST NOT override existing theme/intrinsic geometry or crop the source.
  return <><img ref={element} data-product-image-key={productImageKey} className={className} src={image.src} srcSet={image.srcSet} sizes={image.sizes}
    alt={decorative ? "" : alt} aria-hidden={decorative || undefined} loading={loading}
    style={optimized && ratio ? { aspectRatio: ratio } : undefined}
    fetchPriority={fetchPriority} decoding="async" onError={() => setFailure(optimized ? "original" : "missing")} />
    {readyThumbnail && !decoded && <img src={readyThumbnail} aria-hidden="true" alt="" style={{position:"absolute", inset:0, pointerEvents:"none"}} />}
  </>;
}
