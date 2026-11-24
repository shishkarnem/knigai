import type { Request } from 'express';
import { QueryPgFn } from '../backup/backupTypes';

function escapeHtml(str: string): string {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function resolveRequestOrigin(req: Request): string {
  const protoHeader = String(req.headers['x-forwarded-proto'] || req.protocol || 'https');
  const proto = protoHeader.split(',')[0].trim() || 'https';
  const host = String(req.headers['x-forwarded-host'] || req.get('host') || 'knigai.ru')
    .split(',')[0]
    .trim();
  return `${proto}://${host}`;
}

function isVideoUrl(url: string): boolean {
  return /\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(String(url || '').trim());
}

function toAbsoluteImageUrl(urlOrPath: string, origin: string): string {
  const clean = String(urlOrPath || '').trim();
  if (!clean || isVideoUrl(clean)) return `${origin}/og-banner-1200x630.png`;
  if (/^https?:\/\//i.test(clean)) return clean;
  if (clean.startsWith('/')) return `${origin}${clean}`;
  return `${origin}/${clean}`;
}

function toAbsoluteUrl(urlOrPath: string, origin: string): string {
  const clean = String(urlOrPath || '').trim();
  if (!clean) return `${origin}/og-banner-1200x630.png`;
  if (/^https?:\/\//i.test(clean)) return clean;
  if (clean.startsWith('/')) return `${origin}${clean}`;
  return `${origin}/${clean}`;
}

function markdownToSimpleSeoHtml(md: string, origin: string): string {
  const lines = String(md || '').split(/\r?\n/);
  const out: string[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const imgMatch = line.match(/^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)$/);
    if (imgMatch) {
      out.push(
        `<figure><img src="${escapeHtml(toAbsoluteUrl(imgMatch[2], origin))}" alt="${escapeHtml(
          imgMatch[1] || 'Иллюстрация KnigAI'
        )}" /></figure>`
      );
      continue;
    }
    if (line.startsWith('### ')) {
      out.push(`<h3>${escapeHtml(line.slice(4))}</h3>`);
    } else if (line.startsWith('## ')) {
      out.push(`<h2>${escapeHtml(line.slice(3))}</h2>`);
    } else if (line.startsWith('# ')) {
      out.push(`<h2>${escapeHtml(line.slice(2))}</h2>`);
    } else {
      const cleanText = line.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
      out.push(`<p>${cleanText.replace(/</g, '&lt;').replace(/&lt;strong&gt;/g, '<strong>').replace(/&lt;\/strong&gt;/g, '</strong>')}</p>`);
    }
  }
  return out.join('\n');
}

function replaceMetaTag(html: string, pattern: RegExp, replacement: string): string {
  if (pattern.test(html)) {
    return html.replace(pattern, replacement);
  }
  return html.replace('</head>', `    ${replacement}\n  </head>`);
}

export async function injectBlogSeoIntoHtml(
  baseHtml: string,
  req: Request,
  queryPg: QueryPgFn
): Promise<string> {
  const pathname = (req.path || '/').replace(/\/+$/, '') || '/';
  if (pathname !== '/blog' && !pathname.startsWith('/blog/')) {
    return baseHtml;
  }

  const origin = resolveRequestOrigin(req);

  try {
    if (pathname === '/blog') {
      const postsRes = await queryPg<{
        slug: string;
        title: string;
        excerpt: string | null;
        cover_image_url: string | null;
        published_at: string | null;
        author_name: string | null;
      }>(
        `SELECT slug, title, excerpt, cover_image_url, published_at, author_name
         FROM blog_posts WHERE status = 'published'
         ORDER BY COALESCE(is_pinned, false) DESC, pinned_at DESC NULLS LAST, published_at DESC, id DESC LIMIT 30;`
      );
      const posts = postsRes.rows || [];
      const pageTitle = 'Блог KnigAI — Статьи о создании книг, печати от 1 экземпляра и нейросетях';
      const pageDesc =
        'Журнал KnigAI: практические руководства по созданию персональных книг в подарок, генерации иллюстраций, верстке А5, печати малых тиражей в РФ и работе с ИИ.';
      const canonical = `${origin}/blog`;
      const ogImage = toAbsoluteImageUrl(posts[0]?.cover_image_url || '', origin);

      let html = baseHtml;
      html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(pageTitle)}</title>`);
      html = replaceMetaTag(
        html,
        /<meta\s+name="description"[^>]*>/i,
        `<meta name="description" content="${escapeHtml(pageDesc)}" />`
      );
      html = replaceMetaTag(
        html,
        /<meta\s+property="og:type"[^>]*>/i,
        `<meta property="og:type" content="website" />`
      );
      html = replaceMetaTag(
        html,
        /<meta\s+property="og:title"[^>]*>/i,
        `<meta property="og:title" content="${escapeHtml(pageTitle)}" />`
      );
      html = replaceMetaTag(
        html,
        /<meta\s+property="og:description"[^>]*>/i,
        `<meta property="og:description" content="${escapeHtml(pageDesc)}" />`
      );
      html = replaceMetaTag(
        html,
        /<meta\s+property="og:image"[^>]*>/i,
        `<meta property="og:image" content="${escapeHtml(ogImage)}" />`
      );
      html = replaceMetaTag(
        html,
        /<meta\s+name="twitter:title"[^>]*>/i,
        `<meta name="twitter:title" content="${escapeHtml(pageTitle)}" />`
      );
      html = replaceMetaTag(
        html,
        /<meta\s+name="twitter:description"[^>]*>/i,
        `<meta name="twitter:description" content="${escapeHtml(pageDesc)}" />`
      );
      html = replaceMetaTag(
        html,
        /<meta\s+name="twitter:image"[^>]*>/i,
        `<meta name="twitter:image" content="${escapeHtml(ogImage)}" />`
      );
      html = replaceMetaTag(
        html,
        /<link\s+rel="canonical"[^>]*>/i,
        `<link rel="canonical" href="${escapeHtml(canonical)}" />`
      );

      const ldJson = {
        '@context': 'https://schema.org',
        '@type': 'Blog',
        name: 'Блог KnigAI',
        url: canonical,
        description: pageDesc,
        blogPost: posts.map((p) => ({
          '@type': 'BlogPosting',
          headline: p.title,
          url: `${origin}/blog/${encodeURIComponent(p.slug)}`,
          datePublished: p.published_at || new Date().toISOString(),
          author: { '@type': 'Person', name: p.author_name || 'Редакция KnigAI' },
          image: toAbsoluteImageUrl(p.cover_image_url || '', origin),
          description: p.excerpt || p.title,
        })),
      };

      html = html.replace(
        '</head>',
        `    <meta property="og:url" content="${escapeHtml(canonical)}" />\n    <script type="application/ld+json">${JSON.stringify(ldJson)}</script>\n  </head>`
      );

      const prerenderLinks = posts
        .map(
          (p) =>
            `<article><h2><a href="/blog/${escapeHtml(p.slug)}">${escapeHtml(p.title)}</a></h2><p>${escapeHtml(
              p.excerpt || ''
            )}</p></article>`
        )
        .join('\n');

      html = html.replace(
        '<div id="root"></div>',
        `<div id="root"><main style="background:#050505;color:#fff;padding:24px;"><h1>Блог KnigAI</h1><p>${escapeHtml(
          pageDesc
        )}</p>${prerenderLinks}</main></div>`
      );
      return html;
    }

    // Single article: /blog/:slug
    const slug = decodeURIComponent(pathname.slice('/blog/'.length)).trim();
    const postRes = await queryPg<{
      id: number;
      slug: string;
      title: string;
      subtitle: string | null;
      excerpt: string | null;
      content_markdown: string;
      cover_image_url: string | null;
      tags: unknown;
      seo_keywords: string | null;
      seo_title: string | null;
      seo_description: string | null;
      author_name: string | null;
      published_at: string | null;
      updated_at: string | null;
    }>(
      `SELECT id, slug, title, subtitle, excerpt, content_markdown, cover_image_url, tags, seo_keywords, seo_title, seo_description, author_name, published_at, updated_at
       FROM blog_posts WHERE slug = $1 AND status = 'published' LIMIT 1;`,
      [slug]
    );

    const post = postRes.rows?.[0];
    if (!post) {
      return baseHtml;
    }

    const effectiveTitle = String(post.seo_title || '').trim() || post.title;
    const pageTitle = `${effectiveTitle} — Блог KnigAI`;
    const pageDesc = String(post.seo_description || post.excerpt || post.subtitle || post.title).slice(0, 240);
    const canonical = `${origin}/blog/${encodeURIComponent(post.slug)}`;
    const ogImage = toAbsoluteImageUrl(post.cover_image_url || '', origin);
    const keywords = String(post.seo_keywords || '').trim();

    let html = baseHtml;
    html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(pageTitle)}</title>`);
    html = replaceMetaTag(
      html,
      /<meta\s+name="description"[^>]*>/i,
      `<meta name="description" content="${escapeHtml(pageDesc)}" />`
    );
    html = replaceMetaTag(
      html,
      /<meta\s+property="og:type"[^>]*>/i,
      `<meta property="og:type" content="article" />`
    );
    html = replaceMetaTag(
      html,
      /<meta\s+property="og:title"[^>]*>/i,
      `<meta property="og:title" content="${escapeHtml(post.title)}" />`
    );
    html = replaceMetaTag(
      html,
      /<meta\s+property="og:description"[^>]*>/i,
      `<meta property="og:description" content="${escapeHtml(pageDesc)}" />`
    );
    html = replaceMetaTag(
      html,
      /<meta\s+property="og:image"[^>]*>/i,
      `<meta property="og:image" content="${escapeHtml(ogImage)}" />`
    );
    html = replaceMetaTag(
      html,
      /<meta\s+name="twitter:title"[^>]*>/i,
      `<meta name="twitter:title" content="${escapeHtml(post.title)}" />`
    );
    html = replaceMetaTag(
      html,
      /<meta\s+name="twitter:description"[^>]*>/i,
      `<meta name="twitter:description" content="${escapeHtml(pageDesc)}" />`
    );
    html = replaceMetaTag(
      html,
      /<meta\s+name="twitter:image"[^>]*>/i,
      `<meta name="twitter:image" content="${escapeHtml(ogImage)}" />`
    );
    html = replaceMetaTag(
      html,
      /<link\s+rel="image_src"[^>]*>/i,
      `<link rel="image_src" href="${escapeHtml(ogImage)}" />`
    );
    html = replaceMetaTag(
      html,
      /<link\s+rel="canonical"[^>]*>/i,
      `<link rel="canonical" href="${escapeHtml(canonical)}" />`
    );

    const ldJson = {
      '@context': 'https://schema.org',
      '@type': 'BlogPosting',
      mainEntityOfPage: {
        '@type': 'WebPage',
        '@id': canonical,
      },
      headline: post.title,
      description: pageDesc,
      image: [ogImage],
      author: {
        '@type': 'Person',
        name: post.author_name || 'Редакция KnigAI',
      },
      publisher: {
        '@type': 'Organization',
        name: 'KnigAI',
        logo: {
          '@type': 'ImageObject',
          url: `${origin}/pwa-512x512.png`,
        },
      },
      datePublished: post.published_at || new Date().toISOString(),
      dateModified: post.updated_at || post.published_at || new Date().toISOString(),
      keywords: keywords || undefined,
    };

    const extraHeadTags = [
      `<meta property="og:url" content="${escapeHtml(canonical)}" />`,
      `<meta property="article:published_time" content="${escapeHtml(post.published_at || '')}" />`,
      keywords ? `<meta name="keywords" content="${escapeHtml(keywords)}" />` : '',
      `<script type="application/ld+json">${JSON.stringify(ldJson)}</script>`,
    ]
      .filter(Boolean)
      .join('\n    ');

    html = html.replace('</head>', `    ${extraHeadTags}\n  </head>`);

    const seoBody = `
      <div id="root">
        <article style="background:#050505;color:#fff;padding:24px;max-width:860px;margin:0 auto;">
          <p><a href="/blog">Блог KnigAI</a></p>
          <h1>${escapeHtml(post.title)}</h1>
          ${post.subtitle ? `<p><strong>${escapeHtml(post.subtitle)}</strong></p>` : ''}
          ${markdownToSimpleSeoHtml(post.content_markdown, origin)}
        </article>
      </div>
    `;
    html = html.replace('<div id="root"></div>', seoBody);

    return html;
  } catch (err) {
    console.warn('[KnigAI Blog SEO HTML] notice:', err);
    return baseHtml;
  }
}
