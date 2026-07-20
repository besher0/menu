import type { MetadataRoute } from "next";

const baseUrl = process.env.NEXT_PUBLIC_WEB_URL ?? "http://localhost:3000";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/m/"],
      disallow: ["/admin", "/dashboard"]
    },
    sitemap: `${baseUrl}/sitemap.xml`
  };
}
