import type { APIContext } from 'astro';

export const prerender = true;

// Пять страниц из ТЗ §7. 404 в sitemap не входит.
const PATHS = ['', 'napravleniya/', 'obekty/', 'dopuski/', 'kontakty/'];

export function GET({ site }: APIContext) {
  if (!site) {
    throw new Error('Astro.site не задан — некуда строить абсолютные адреса sitemap');
  }

  const urls = PATHS.map((path) => `  <url><loc>${new URL(path, site).href}</loc></url>`).join('\n');
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;

  return new Response(body, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
}
