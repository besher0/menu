/** @type {import('next').NextConfig} */
const nextConfig = {
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

export default nextConfig;
