export interface FooterLinkItem {
  id: number;
  title: string;
  url: string;
  sort_order: number;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export const FOOTER_LINKS_UPDATED_EVENT = 'knigai_footer_links_updated';

export const DEFAULT_FOOTER_LINKS: FooterLinkItem[] = [
  { id: 1, title: 'Робот Рекрутер', url: 'https://hr-rr.ru/', sort_order: 10, is_active: true },
  { id: 2, title: 'ИИ-Ревизор', url: 'https://ii-rr.ru/', sort_order: 20, is_active: true },
  { id: 3, title: 'ИИ-Викторины', url: 'https://qaiz.ru/', sort_order: 30, is_active: true },
  { id: 4, title: 'АлхимИИ', url: 'https://aihim.ru/', sort_order: 40, is_active: true },
  { id: 5, title: 'ИИ-Разработка', url: 'https://sav-ai.ru/', sort_order: 50, is_active: true },
  { id: 6, title: 'Канал про ИИ', url: 'https://t.me/SAV_AI', sort_order: 60, is_active: true },
  { id: 7, title: 'AI РОП', url: 'https://rent-rop.com/ii-dlya-otdela-prodazh/', sort_order: 70, is_active: true },
  { id: 8, title: 'ИИSMM', url: 'https://iismm.ru/', sort_order: 80, is_active: true },
];

export function dispatchFooterLinksUpdated(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(FOOTER_LINKS_UPDATED_EVENT));
  }
}

export async function fetchFooterLinks(includeAll = false): Promise<FooterLinkItem[]> {
  const res = await fetch(`/api/footer-links${includeAll ? '?all=true' : ''}`);
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Не удалось загрузить ссылки футера');
  }
  return Array.isArray(data.links) ? data.links : [];
}

export async function createFooterLink(payload: {
  title: string;
  url: string;
  sort_order?: number;
  is_active?: boolean;
}): Promise<FooterLinkItem> {
  const res = await fetch('/api/footer-links', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok || !data.success || !data.link) {
    throw new Error(data.error || 'Не удалось добавить ссылку');
  }
  dispatchFooterLinksUpdated();
  return data.link;
}

export async function updateFooterLink(
  id: number,
  payload: {
    title: string;
    url: string;
    sort_order: number;
    is_active: boolean;
  }
): Promise<FooterLinkItem> {
  const res = await fetch(`/api/footer-links/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok || !data.success || !data.link) {
    throw new Error(data.error || 'Не удалось обновить ссылку');
  }
  dispatchFooterLinksUpdated();
  return data.link;
}

export async function reorderFooterLinks(orderedIds: number[]): Promise<FooterLinkItem[]> {
  const res = await fetch('/api/footer-links/reorder', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderedIds }),
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Не удалось изменить порядок ссылок');
  }
  dispatchFooterLinksUpdated();
  return Array.isArray(data.links) ? data.links : [];
}

export async function deleteFooterLink(id: number): Promise<void> {
  const res = await fetch(`/api/footer-links/${id}`, {
    method: 'DELETE',
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Не удалось удалить ссылку');
  }
  dispatchFooterLinksUpdated();
}
