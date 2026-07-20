/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@menu/shared"],
  allowedDevOrigins: [
    "10.128.45.122",
    "10.36.8.122",
    "192.168.*.*",
    "10.*.*.*"
  ]
};

export default nextConfig;
