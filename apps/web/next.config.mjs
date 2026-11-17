import { readFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
const publicImagePolicy = JSON.parse(readFileSync(new URL("./public-image-policy.json", import.meta.url), "utf8"));
/** @type {import('next').NextConfig} */
const nextConfig = {
  images: publicImagePolicy,
  experimental: { imgOptConcurrency: 2, imgOptMaxInputPixels: 40000000, imgOptTimeoutInSeconds: 7 },
  // Build-scoped Demo switch, never enabled by an incoming request/header.
  env: {
    ORDERSAWA_DEMO_PREVIEW: /^[0-9]{8}T[0-9]{6}Z-[0-9a-f]{12}$/.test(process.env.ORDERSAWA_RELEASE_ID ?? "") ? "1" : "0"
  },
  ...(process.env.ORDERSAWA_PREVIEW_DIST_DIR ? { distDir: process.env.ORDERSAWA_PREVIEW_DIST_DIR } : {}),
  ...(process.env.ORDERSAWA_RELEASE_ID ? {
    async headers() {
      return [{ source: "/:path*", headers: [{ key: "X-OrderSawa-Release", value: process.env.ORDERSAWA_RELEASE_ID }] }];
    }
  } : {}),
  reactStrictMode: true,
  transpilePackages: ["@menu/shared"],
  allowedDevOrigins: [
    "ordersawa.test:3000",
    "*.ordersawa.test:3000",
    "http://ordersawa.test:3000",
    "http://*.ordersawa.test:3000",
    "10.128.45.122",
    "10.36.8.122",
    "192.168.*.*",
    "10.*.*.*"
  ]
};

// Only index raster files shipped with this web build. Uploaded and remote URLs
// must never become build-time filesystem paths or network requests.
async function bundledImageRatios() {
  const ratios = {};
  const require = createRequire(import.meta.url);
  let sharp;
  try {
    sharp = createRequire(require.resolve("next/package.json"))("sharp");
  } catch {
    return ratios; // Next's optional image codec can be absent on some platforms.
  }
  const publicDir = fileURLToPath(new URL("./public/", import.meta.url));
  async function visit(directory, prefix) {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (error.code === "ENOENT") return;
      throw error;
    }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name, "en"))) {
      const file = join(directory, entry.name);
      const url = prefix + "/" + entry.name;
      if (entry.isDirectory()) await visit(file, url);
      if (!entry.isFile() || !/\.(?:jpe?g|png|webp)$/i.test(entry.name)) continue;
      try {
        const meta = await sharp(file).metadata();
        const { width, height } = meta.autoOrient ?? meta;
        if (width > 0 && height > 0 && !(meta.pages > 1)) ratios[url] = [width, height];
      } catch {
        console.warn("Skipping unreadable bundled image metadata:", url);
      }
    }
  }
  for (const { pathname } of publicImagePolicy.localPatterns) {
    const prefix = pathname.slice(0, -3);
    await visit(join(publicDir, prefix.slice(1)), prefix);
  }
  return ratios;
}

export default async function config(phase) {
  if (phase !== "phase-production-build" && phase !== "phase-development-server") return nextConfig;
  return {
    ...nextConfig,
    env: { ...nextConfig.env, PUBLIC_BUNDLED_IMAGE_RATIOS: JSON.stringify(await bundledImageRatios()) }
  };
}
