import type { MetadataRoute } from "next";

const SITE_URL = "https://uxio-wheat.vercel.app";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: SITE_URL,
      lastModified: new Date("2026-04-01"),
      changeFrequency: "weekly",
      priority: 1,
    },
  ];
}
