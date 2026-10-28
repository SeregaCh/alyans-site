import type { APIContext } from 'astro';

export const prerender = true;

export function GET({ site }: APIContext) {
  const isProduction = process.env.SITE_ENV === 'production';

  const body = isProduction
    ? `User-agent: *\nAllow: /\n\nSitemap: ${new URL('sitemap.xml', site)}\n`
    : `User-agent: *\nDisallow: /\n`;

  return new Response(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
