import type { MetadataRoute } from "next";
import { getAllPosts } from "@/lib/posts";
import { site } from "@/lib/site";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  const routes = ["", "/blog", "/map", "/about"].map((route) => ({
    url: `${site.url}${route}`,
    lastModified: new Date()
  }));

  const posts = getAllPosts().map((post) => ({
    url: `${site.url}/blog/${post.slug}`,
    lastModified: new Date(post.date)
  }));

  return [...routes, ...posts];
}
