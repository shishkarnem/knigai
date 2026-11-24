import { BlogPostDto } from './blogApi';

const DEFAULT_TITLE = 'KnigAI — Автоматизированная ИИ-фабрика книг · Онлайн-издательство и 3D-читалка';
const DEFAULT_DESC =
  'KnigAI — создавайте художественные и подарочные книги до 100 глав с иллюстрациями, редактором переплёта А5 и печатью от 1 экземпляра.';

function upsertMeta(attrName: 'name' | 'property', attrVal: string, content: string): void {
  if (typeof document === 'undefined') return;
  let el = document.querySelector<HTMLMetaElement>(`meta[${attrName}="${attrVal}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attrName, attrVal);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function upsertLink(rel: string, href: string): void {
  if (typeof document === 'undefined') return;
  let el = document.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', rel);
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}

function upsertJsonLd(data: Record<string, unknown> | null): void {
  if (typeof document === 'undefined') return;
  const id = 'knigai-blog-ldjson';
  const existing = document.getElementById(id);
  if (!data) {
    if (existing) existing.remove();
    return;
  }
  let script = existing as HTMLScriptElement | null;
  if (!script) {
    script = document.createElement('script');
    script.id = id;
    script.type = 'application/ld+json';
    document.head.appendChild(script);
  }
  script.textContent = JSON.stringify(data);
}

export function resolveAbsoluteImageUrl(rawUrl: string): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://knigai.ru';
  const trimmed = String(rawUrl || '').trim();
  if (!trimmed || /\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(trimmed)) {
    return `${origin}/icons/icon-512x512.png`;
  }
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `${origin}${trimmed.startsWith('/') ? '' : '/'}${trimmed}`;
}

export function syncBlogIndexSeo(): void {
  if (typeof document === 'undefined') return;
  const origin = window.location.origin;
  const url = `${origin}/blog`;
  const title = 'Блог KnigAI — гид по созданию книг с нейросетью, печати от 1 экземпляра и оформлению А5';
  const desc =
    'Статьи, руководства и кейсы от KnigAI: как написать книгу до 100 глав с ИИ, сделать подарочную или детскую именную книгу, рассчитать корешок А5 и издать тираж от 1 экземпляра.';

  document.title = title;
  upsertMeta('name', 'description', desc);
  upsertMeta('name', 'keywords', 'блог KnigAI, создать книгу с ИИ, печать книги от 1 экземпляра, персональная книга в подарок');
  upsertMeta('property', 'og:type', 'website');
  upsertMeta('property', 'og:title', title);
  upsertMeta('property', 'og:description', desc);
  upsertMeta('property', 'og:url', url);
  upsertMeta('property', 'og:image', `${origin}/icons/icon-512x512.png`);
  upsertMeta('name', 'twitter:title', title);
  upsertMeta('name', 'twitter:description', desc);
  upsertMeta('name', 'twitter:image', `${origin}/icons/icon-512x512.png`);
  upsertLink('canonical', url);
  upsertJsonLd({
    '@context': 'https://schema.org',
    '@type': 'Blog',
    name: 'Блог KnigAI',
    description: desc,
    url,
    publisher: {
      '@type': 'Organization',
      name: 'KnigAI',
      url: origin,
    },
  });
}

export function syncBlogPostSeo(post: BlogPostDto): void {
  if (typeof document === 'undefined') return;
  const origin = window.location.origin;
  const canonicalUrl = `${origin}/blog/${encodeURIComponent(post.slug)}`;
  const imageUrl = resolveAbsoluteImageUrl(post.cover_image_url);
  const effectiveTitle = (post.seo_title || '').trim() || post.title;
  const title = `${effectiveTitle} — Блог KnigAI`;
  const desc = (post.seo_description || post.excerpt || post.subtitle || post.title).slice(0, 260);

  document.title = title;
  upsertMeta('name', 'description', desc);
  upsertMeta('name', 'keywords', post.seo_keywords || (post.tags || []).join(', '));
  upsertMeta('property', 'og:type', 'article');
  upsertMeta('property', 'og:title', effectiveTitle);
  upsertMeta('property', 'og:description', desc);
  upsertMeta('property', 'og:url', canonicalUrl);
  upsertMeta('property', 'og:image', imageUrl);
  upsertMeta('property', 'og:image:width', '1280');
  upsertMeta('property', 'og:image:height', '720');
  upsertMeta('name', 'twitter:card', 'summary_large_image');
  upsertMeta('name', 'twitter:title', effectiveTitle);
  upsertMeta('name', 'twitter:description', desc);
  upsertMeta('name', 'twitter:image', imageUrl);
  upsertLink('canonical', canonicalUrl);
  upsertLink('image_src', imageUrl);

  upsertJsonLd({
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: effectiveTitle,
    description: desc,
    image: [imageUrl],
    datePublished: post.published_at || post.created_at,
    dateModified: post.updated_at || post.published_at || post.created_at,
    keywords: post.seo_keywords || (post.tags || []).join(', '),
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': canonicalUrl,
    },
    author: {
      '@type': 'Person',
      name: post.author_name || 'Редакция KnigAI',
    },
    publisher: {
      '@type': 'Organization',
      name: 'KnigAI',
      url: origin,
    },
  });
}

export function resetDefaultSeo(): void {
  if (typeof document === 'undefined') return;
  document.title = DEFAULT_TITLE;
  upsertMeta('name', 'description', DEFAULT_DESC);
  upsertMeta('property', 'og:type', 'website');
  upsertMeta('property', 'og:title', DEFAULT_TITLE);
  upsertMeta('property', 'og:description', DEFAULT_DESC);
  upsertJsonLd(null);
}
