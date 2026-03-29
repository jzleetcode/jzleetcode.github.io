import type { APIRoute } from "astro";
import { SITE } from "@/config";

const getRobotsTxt = (sitemapURL: URL) => `
User-agent: *
Allow: /

Sitemap: ${sitemapURL.href}
`;

export const GET: APIRoute = ({ site }) => {
  const base = site ?? new URL(SITE.website);
  const sitemapURL = new URL("sitemap-index.xml", base);
  return new Response(getRobotsTxt(sitemapURL), {
    headers: { "Content-Type": "text/plain" },
  });
};
