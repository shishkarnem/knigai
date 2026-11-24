import type { Express, Request, Response } from 'express';
import { QueryPgFn } from '../backup/backupTypes';

function resolveOrigin(req: Request): string {
  const protoHeader = String(req.headers['x-forwarded-proto'] || req.protocol || 'https');
  const proto = protoHeader.split(',')[0].trim() || 'https';
  const host = String(req.headers['x-forwarded-host'] || req.get('host') || 'knigai.ru').split(',')[0].trim();
  return `${proto}://${host}`;
}

function escapeXml(str: string): string {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function toAbsUrl(urlOrPath: string, origin: string): string {
  const clean = String(urlOrPath || '').trim();
  if (!clean) return `${origin}/og-banner-1200x630.png`;
  if (/^https?:\/\//i.test(clean)) return clean;
  if (clean.startsWith('/')) return `${origin}${clean}`;
  return `${origin}/${clean}`;
}

export function registerSeoFeedRoutes(app: Express, queryPg: QueryPgFn): void {
  // Dynamic XML Sitemap with current request domain, published books, and all blog posts
  app.get('/sitemap.xml', async (req: Request, res: Response) => {
    try {
      const origin = resolveOrigin(req);
      let bookUrlsXml = '';
      let blogUrlsXml = '';
      try {
        const booksRes = await queryPg<{
          id: number;
          slug: string | null;
          updated_at: string | null;
        }>(
          `SELECT id, slug, updated_at FROM books WHERE is_published = true ORDER BY updated_at DESC LIMIT 200;`
        );
        bookUrlsXml = (booksRes.rows || [])
          .map((b) => {
            const loc = `${origin}/?book=${encodeURIComponent(b.slug || String(b.id))}`;
            const lastmod = b.updated_at ? new Date(b.updated_at).toISOString().split('T')[0] : '';
            return `  <url>\n    <loc>${escapeXml(loc)}</loc>${
              lastmod ? `\n    <lastmod>${lastmod}</lastmod>` : ''
            }\n    <changefreq>weekly</changefreq>\n    <priority>0.8</priority>\n  </url>`;
          })
          .join('\n');
      } catch {
        // DB unavailable fallback
      }

      try {
        const postsRes = await queryPg<{
          slug: string;
          title: string;
          cover_image_url: string | null;
          updated_at: string | null;
          published_at: string | null;
        }>(
          `SELECT slug, title, cover_image_url, updated_at, published_at
           FROM blog_posts WHERE status = 'published'
           ORDER BY published_at DESC, id DESC LIMIT 500;`
        );
        blogUrlsXml = (postsRes.rows || [])
          .map((p) => {
            const loc = `${origin}/blog/${encodeURIComponent(p.slug)}`;
            const dt = p.updated_at || p.published_at;
            const lastmod = dt ? new Date(dt).toISOString().split('T')[0] : '';
            const imageBlock = p.cover_image_url
              ? `\n    <image:image>\n      <image:loc>${escapeXml(toAbsUrl(p.cover_image_url, origin))}</image:loc>\n      <image:title>${escapeXml(p.title)}</image:title>\n    </image:image>`
              : '';
            return `  <url>\n    <loc>${escapeXml(loc)}</loc>${
              lastmod ? `\n    <lastmod>${lastmod}</lastmod>` : ''
            }\n    <changefreq>weekly</changefreq>\n    <priority>0.85</priority>${imageBlock}\n  </url>`;
          })
          .join('\n');
      } catch {
        // blog_posts may not exist yet on first boot
      }

      const today = new Date().toISOString().split('T')[0];
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
  <url>
    <loc>${escapeXml(origin)}/</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>${escapeXml(origin)}/blog</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.95</priority>
  </url>
  <url>
    <loc>${escapeXml(origin)}/library</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
  </url>
  <url>
    <loc>${escapeXml(origin)}/oferta</loc>
    <changefreq>monthly</changefreq>
    <priority>0.5</priority>
  </url>
  <url>
    <loc>${escapeXml(origin)}/privacy</loc>
    <changefreq>monthly</changefreq>
    <priority>0.4</priority>
  </url>
  <url>
    <loc>${escapeXml(origin)}/agreement</loc>
    <changefreq>monthly</changefreq>
    <priority>0.4</priority>
  </url>
  <url>
    <loc>${escapeXml(origin)}/consent</loc>
    <changefreq>monthly</changefreq>
    <priority>0.4</priority>
  </url>
${blogUrlsXml}
${bookUrlsXml}
</urlset>`;

      res.setHeader('Content-Type', 'application/xml; charset=utf-8');
      res.setHeader('Cache-Control', 'public, max-age=300');
      res.send(xml);
    } catch {
      res.status(500).setHeader('Content-Type', 'text/plain').send('Sitemap generation error');
    }
  });

  // Dynamic RSS 2.0 Feed for Yandex, search readers, blog articles & published books
  app.get('/rss.xml', async (req: Request, res: Response) => {
    try {
      const origin = resolveOrigin(req);
      let itemsXml = '';
      try {
        const postsRes = await queryPg<{
          id: number;
          slug: string;
          title: string;
          excerpt: string | null;
          cover_image_url: string | null;
          author_name: string | null;
          published_at: string | null;
        }>(
          `SELECT id, slug, title, excerpt, cover_image_url, author_name, published_at
           FROM blog_posts WHERE status = 'published'
           ORDER BY published_at DESC, id DESC LIMIT 30;`
        );
        itemsXml += (postsRes.rows || [])
          .map((p) => {
            const link = `${origin}/blog/${encodeURIComponent(p.slug)}`;
            const pubDate = p.published_at ? new Date(p.published_at).toUTCString() : new Date().toUTCString();
            const desc = p.excerpt || p.title;
            const imgTag = p.cover_image_url
              ? `\n      <enclosure url="${escapeXml(toAbsUrl(p.cover_image_url, origin))}" type="image/jpeg" />`
              : '';
            return `    <item>
      <title>${escapeXml(p.title)}</title>
      <link>${escapeXml(link)}</link>
      <guid isPermaLink="true">${escapeXml(link)}</guid>
      <pubDate>${escapeXml(pubDate)}</pubDate>
      <description>${escapeXml(desc.slice(0, 450))}</description>${imgTag}
    </item>`;
          })
          .join('\n');
      } catch {
        // DB fallback
      }

      try {
        const booksRes = await queryPg<{
          id: number;
          title: string;
          author: string | null;
          synopsis_overview: string | null;
          slug: string | null;
          created_at: string | null;
        }>(
          `SELECT id, title, author, synopsis_overview, slug, created_at
           FROM books WHERE is_published = true ORDER BY created_at DESC LIMIT 20;`
        );
        const bookItems = (booksRes.rows || [])
          .map((b) => {
            const link = `${origin}/?book=${encodeURIComponent(b.slug || String(b.id))}`;
            const pubDate = b.created_at ? new Date(b.created_at).toUTCString() : new Date().toUTCString();
            const desc = b.synopsis_overview || `Книга автора ${b.author || 'KnigAI'} в формате А5.`;
            return `    <item>
      <title>${escapeXml(b.title)}${b.author ? ` — ${escapeXml(b.author)}` : ''}</title>
      <link>${escapeXml(link)}</link>
      <guid isPermaLink="false">knigai-book-${b.id}</guid>
      <pubDate>${escapeXml(pubDate)}</pubDate>
      <description>${escapeXml(desc.slice(0, 400))}</description>
    </item>`;
          })
          .join('\n');
        itemsXml = [itemsXml, bookItems].filter(Boolean).join('\n');
      } catch {
        // DB fallback
      }

      if (!itemsXml) {
        itemsXml = `    <item>
      <title>KnigAI — Создайте и издайте свою книгу в формате А5</title>
      <link>${escapeXml(origin)}/</link>
      <guid isPermaLink="false">knigai-home</guid>
      <pubDate>${escapeXml(new Date().toUTCString())}</pubDate>
      <description>Интерактивный конструктор книг, 100 глав, переплет А5 и читалка.</description>
    </item>`;
      }

      const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>KnigAI — Нейросетевая фабрика книг и Блог</title>
    <link>${escapeXml(origin)}/</link>
    <atom:link href="${escapeXml(origin)}/rss.xml" rel="self" type="application/rss+xml" />
    <description>Создание персонализированных книг от 1 экземпляра: сюжет, персонажи, иллюстрации, переплет А5 и печать.</description>
    <language>ru-RU</language>
    <image>
      <url>${escapeXml(origin)}/og-banner-1200x630.png</url>
      <title>KnigAI</title>
      <link>${escapeXml(origin)}/</link>
    </image>
${itemsXml}
  </channel>
</rss>`;

      res.setHeader('Content-Type', 'application/rss+xml; charset=utf-8');
      res.setHeader('Cache-Control', 'public, max-age=300');
      res.send(rss);
    } catch {
      res.status(500).setHeader('Content-Type', 'text/plain').send('RSS generation error');
    }
  });

  // Dynamic llms.txt directory for LLM / Neural Search Engines (ChatGPT, Perplexity, Claude, YandexGPT)
  app.get('/llms.txt', async (req: Request, res: Response) => {
    try {
      const origin = resolveOrigin(req);
      let blogLines = '';
      try {
        const postsRes = await queryPg<{
          slug: string;
          title: string;
          excerpt: string | null;
          seo_keywords: string | null;
        }>(
          `SELECT slug, title, excerpt, seo_keywords
           FROM blog_posts WHERE status = 'published'
           ORDER BY published_at DESC, id DESC LIMIT 100;`
        );
        blogLines = (postsRes.rows || [])
          .map(
            (p) =>
              `- [${p.title}](${origin}/blog/${encodeURIComponent(p.slug)}): ${p.excerpt || p.title}${
                p.seo_keywords ? ` (${p.seo_keywords})` : ''
              }`
          )
          .join('\n');
      } catch {
        // ignore if blog_posts not ready
      }

      const txt = `# KnigAI — Нейросетевая фабрика книг и издательская платформа А5

> Платформа для создания персонализированных книг, графических романов, детских сказок, корпоративных изданий и фанфиков с генерацией сюжета до 100 глав, иллюстраций 16:9 и 3:4, расчётом корешка А5 и печатью от 1 экземпляра по всей России.

## Основные разделы
- [Главная страница KnigAI](${origin}/): Описание сервиса, калькулятор тарифов, 3D-демо и вход в личный кабинет.
- [Блог и журнал KnigAI](${origin}/blog): Экспертные статьи и руководства по изданию книг и работе с ИИ.
- [Общая библиотека](${origin}/library): Каталог опубликованных книг в интерактивной 3D-читалке.
- [Карта сайта XML](${origin}/sitemap.xml)
- [RSS-лента](${origin}/rss.xml)

## Статьи блога KnigAI
${blogLines || `- [Все статьи блога](${origin}/blog)`}
`;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Cache-Control', 'public, max-age=300');
      res.send(txt);
    } catch {
      res.status(500).setHeader('Content-Type', 'text/plain').send('llms.txt generation error');
    }
  });

  // Dynamic Yandex Tableau JSON with absolute domain paths
  app.get('/yandex-tableau.json', (req: Request, res: Response) => {
    const origin = resolveOrigin(req);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.json({
      api_version: 1,
      layout: {
        logo: `${origin}/yandex-tableau-50x50.png`,
        color: '#000000',
        show_title: true,
      },
      feed: `${origin}/rss.xml`,
    });
  });

  // Browserconfig XML
  app.get('/browserconfig.xml', (_req: Request, res: Response) => {
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.send(`<?xml version="1.0" encoding="utf-8"?>
<browserconfig>
  <msapplication>
    <tile>
      <square150x150logo src="/mstile-150x150.png" />
      <square310x310logo src="/mstile-310x310.png" />
      <TileColor>#000000</TileColor>
    </tile>
  </msapplication>
</browserconfig>`);
  });

  // Robots.txt with dynamic Sitemap, Host & Blog/LLMs allow rules
  app.get('/robots.txt', (req: Request, res: Response) => {
    const origin = resolveOrigin(req);
    const host = String(req.headers['x-forwarded-host'] || req.get('host') || 'knigai.ru').split(',')[0].trim();
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.send(
      `User-agent: *\nAllow: /\nAllow: /blog\nAllow: /file/\nAllow: /llms.txt\nDisallow: /api/\n\nSitemap: ${origin}/sitemap.xml\nHost: ${host}\n`
    );
  });
}
