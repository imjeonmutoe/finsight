import type { MetadataRoute } from "next";
import { PUBLIC_PATHS, siteUrl } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_PATHS.map((path) => ({ url: new URL(path, siteUrl()).href }));
}
