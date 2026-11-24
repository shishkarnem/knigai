import { AppRoute } from '../types';

export function extractBlogSlugFromPath(pathname: string): string | null {
  const normalized = pathname.replace(/\/+$/, '') || '/';
  if (normalized.startsWith('/blog/')) {
    const slug = decodeURIComponent(normalized.slice('/blog/'.length).split('/')[0] || '').trim();
    return slug || null;
  }
  return null;
}

export function pathToRoute(pathname: string): AppRoute {
  const normalized = pathname.replace(/\/+$/, '') || '/';
  if (normalized === '/blog') return 'blog';
  if (normalized.startsWith('/blog/')) return 'blog-post';
  if (normalized === '/oferta' || normalized === '/payment/oferta') return 'oferta';
  if (normalized === '/privacy' || normalized === '/payment/privacy') return 'privacy';
  if (normalized === '/agreement' || normalized === '/payment/agreement') return 'agreement';
  if (normalized === '/consent' || normalized === '/payment/consent') return 'consent';
  if (normalized === '/payment/success') return 'payment-success';
  if (normalized === '/payment/fail' || normalized === '/payment/fall') return 'payment-fail';
  if (normalized === '/profile') return 'profile';
  if (normalized === '/balance') return 'balance';
  if (normalized === '/notifications') return 'notifications';
  if (normalized.startsWith('/read/')) return 'public-read';
  if (normalized === '/system-admin') return 'admin';
  if (normalized === '/library') return 'library';
  if (normalized === '/constructor') return 'constructor';
  if (normalized === '/chapters') return 'chapters';
  if (normalized === '/characters') return 'characters';
  if (normalized === '/cover') return 'cover';
  if (normalized === '/reader') return 'reader';
  if (normalized === '/gallery') return 'gallery';
  if (normalized === '/landing') return 'landing';
  return 'landing';
}

export function routeToPath(route: AppRoute): string {
  if (route === 'blog') return '/blog';
  if (route === 'blog-post') return '/blog';
  if (route === 'oferta') return '/oferta';
  if (route === 'privacy') return '/privacy';
  if (route === 'agreement') return '/agreement';
  if (route === 'consent') return '/consent';
  if (route === 'payment-success') return '/payment/success';
  if (route === 'payment-fail') return '/payment/fail';
  if (route === 'profile') return '/profile';
  if (route === 'balance') return '/balance';
  if (route === 'notifications') return '/notifications';
  if (route === 'admin') return '/system-admin';
  if (route === 'landing') return '/';
  if (route === 'public-read') return '/read';
  return `/${route}`;
}

export function isFullBleedPublicRoute(route: AppRoute): boolean {
  return (
    route === 'landing' ||
    route === 'blog' ||
    route === 'blog-post' ||
    route === 'oferta' ||
    route === 'privacy' ||
    route === 'agreement' ||
    route === 'consent' ||
    route === 'payment-success' ||
    route === 'payment-fail'
  );
}
