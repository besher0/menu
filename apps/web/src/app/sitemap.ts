import type { MetadataRoute } from "next";

const baseUrl = process.env.NEXT_PUBLIC_WEB_URL ?? "http://localhost:3000";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: `${baseUrl}/`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.5
    }
  ];
}
