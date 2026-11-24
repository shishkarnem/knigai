import React, { useEffect, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Check,
  Edit3,
  ExternalLink,
  Eye,
  EyeOff,
  Link2,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  X,
} from 'lucide-react';
import { NoirButton } from '../../../components/common/NoirButton';
import { RubikMarkerHeading } from '../../../components/landing/RubikMarkerHeading';
import {
  createFooterLink,
  deleteFooterLink,
  fetchFooterLinks,
  FooterLinkItem,
  reorderFooterLinks,
  updateFooterLink,
} from './footerLinksApi';

export const AdminFooterLinksTab: React.FC = () => {
  const [links, setLinks] = useState<FooterLinkItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);

  // Add form state
  const [newTitle, setNewTitle] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [newSortOrder, setNewSortOrder] = useState('');

  // Inline edit state
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editUrl, setEditUrl] = useState('');
  const [editSortOrder, setEditSortOrder] = useState(0);
  const [editIsActive, setEditIsActive] = useState(true);

  // Two-step delete confirmation without window.confirm
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  const loadLinks = async () => {
    setIsLoading(true);
    try {
      const items = await fetchFooterLinks(true);
      setLinks(items);
    } catch (err) {
      setStatusMsg({
        type: 'error',
        text: err instanceof Error ? err.message : 'Ошибка загрузки ссылок футера',
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadLinks();
  }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMsg(null);
    const title = newTitle.trim();
    const url = newUrl.trim();
    if (!title || !url) {
      setStatusMsg({ type: 'error', text: 'Заполните название кнопки и URL сайта.' });
      return;
    }

    setIsSubmitting(true);
    try {
      const parsedSort = newSortOrder.trim() !== '' ? Number(newSortOrder.trim()) : undefined;
      const created = await createFooterLink({
        title,
        url,
        sort_order: Number.isFinite(parsedSort) ? parsedSort : undefined,
        is_active: true,
      });
      setLinks((prev) =>
        [...prev, created].sort((a, b) => a.sort_order - b.sort_order || a.id - b.id)
      );
      setNewTitle('');
      setNewUrl('');
      setNewSortOrder('');
      setStatusMsg({
        type: 'ok',
        text: `Кнопка «${created.title}» сохранена в базе данных и сразу появилась в футере.`,
      });
    } catch (err) {
      setStatusMsg({
        type: 'error',
        text: err instanceof Error ? err.message : 'Ошибка при добавлении ссылки',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const startEditing = (item: FooterLinkItem) => {
    setEditingId(item.id);
    setEditTitle(item.title);
    setEditUrl(item.url);
    setEditSortOrder(item.sort_order);
    setEditIsActive(item.is_active);
    setConfirmDeleteId(null);
    setStatusMsg(null);
  };

  const cancelEditing = () => {
    setEditingId(null);
  };

  const handleSaveEdit = async (id: number) => {
    setIsSubmitting(true);
    setStatusMsg(null);
    try {
      const updated = await updateFooterLink(id, {
        title: editTitle.trim(),
        url: editUrl.trim(),
        sort_order: Number(editSortOrder) || 0,
        is_active: editIsActive,
      });
      setLinks((prev) =>
        prev
          .map((row) => (row.id === id ? updated : row))
          .sort((a, b) => a.sort_order - b.sort_order || a.id - b.id)
      );
      setEditingId(null);
      setStatusMsg({
        type: 'ok',
        text: `Кнопка «${updated.title}» обновлена в PostgreSQL.`,
      });
    } catch (err) {
      setStatusMsg({
        type: 'error',
        text: err instanceof Error ? err.message : 'Ошибка сохранения изменений',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleActive = async (item: FooterLinkItem) => {
    setIsSubmitting(true);
    setStatusMsg(null);
    try {
      const updated = await updateFooterLink(item.id, {
        title: item.title,
        url: item.url,
        sort_order: item.sort_order,
        is_active: !item.is_active,
      });
      setLinks((prev) => prev.map((row) => (row.id === item.id ? updated : row)));
      setStatusMsg({
        type: 'ok',
        text: updated.is_active
          ? `Кнопка «${updated.title}» включена для показа в футере.`
          : `Кнопка «${updated.title}» скрыта из футера.`,
      });
    } catch (err) {
      setStatusMsg({
        type: 'error',
        text: err instanceof Error ? err.message : 'Ошибка переключения видимости',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleMove = async (index: number, direction: -1 | 1) => {
    const targetIdx = index + direction;
    if (targetIdx < 0 || targetIdx >= links.length) return;
    const reordered = [...links];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(targetIdx, 0, moved);

    setIsSubmitting(true);
    setStatusMsg(null);
    try {
      const savedLinks = await reorderFooterLinks(reordered.map((item) => item.id));
      setLinks(savedLinks);
    } catch (err) {
      setStatusMsg({
        type: 'error',
        text: err instanceof Error ? err.message : 'Ошибка изменения порядка',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: number, title: string) => {
    setIsSubmitting(true);
    setStatusMsg(null);
    try {
      await deleteFooterLink(id);
      setLinks((prev) => prev.filter((row) => row.id !== id));
      setConfirmDeleteId(null);
      setStatusMsg({
        type: 'ok',
        text: `Кнопка «${title}» удалена из базы данных.`,
      });
    } catch (err) {
      setStatusMsg({
        type: 'error',
        text: err instanceof Error ? err.message : 'Ошибка удаления ссылки',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="noir-container p-4 sm:p-6 border border-white/30 text-white flex flex-col gap-6 text-[14px] rounded-none">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-zinc-800">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-10 h-10 bg-black/80 border border-rose-500 flex items-center justify-center shrink-0 rounded-none">
            <Link2 className="w-5 h-5 text-rose-500" />
          </div>
          <div className="min-w-0">
            <RubikMarkerHeading
              text="Ссылки проектов в футере"
              as="h3"
              className="text-[20px] sm:text-[24px] leading-tight break-words"
            />
            <p className="text-[14px] text-zinc-300 mt-1 break-words">
              Управление кнопками-сайтами в разделе «Другие наши ИИ-продукты и проекты» (таблица{' '}
              <code className="text-rose-400 font-mono">footer_links</code> в PostgreSQL).
            </p>
          </div>
        </div>

        <NoirButton
          type="button"
          variant="outline"
          onClick={loadLinks}
          loading={isLoading}
          icon={<RefreshCw className="w-4 h-4 text-rose-500" />}
          showTail={true}
        >
          Обновить
        </NoirButton>
      </div>

      {/* Add New Link Form */}
      <form
        onSubmit={handleAdd}
        className="p-4 bg-black/60 border border-zinc-800 flex flex-col gap-4 rounded-none"
      >
        <div className="flex items-center gap-2 font-bold text-white text-[15px]">
          <Plus className="w-4 h-4 text-rose-500 shrink-0" />
          <span>Добавить новую кнопку-сайт</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
          <div className="md:col-span-4 flex flex-col gap-1.5">
            <label className="text-[14px] text-zinc-300 font-bold">Название кнопки:</label>
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Например: ИИSMM"
              className="noir-input w-full min-h-[44px] px-3.5 py-2.5 text-[14px] rounded-none"
              required
            />
          </div>

          <div className="md:col-span-5 flex flex-col gap-1.5">
            <label className="text-[14px] text-zinc-300 font-bold">URL адрес сайта:</label>
            <input
              type="url"
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
              placeholder="https://example.ru/"
              className="noir-input w-full min-h-[44px] px-3.5 py-2.5 text-[14px] font-mono rounded-none"
              required
            />
          </div>

          <div className="md:col-span-3 flex flex-col gap-1.5">
            <label className="text-[14px] text-zinc-300 font-bold">Порядок (опц.):</label>
            <input
              type="number"
              value={newSortOrder}
              onChange={(e) => setNewSortOrder(e.target.value)}
              placeholder="Авто"
              className="noir-input w-full min-h-[44px] px-3.5 py-2.5 text-[14px] font-mono rounded-none"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <span className="text-[14px] text-zinc-400">
            На ПК активные ссылки выстраиваются в одну строку по центру, на мобильных — облаком.
          </span>
          <NoirButton
            type="submit"
            variant="primary"
            loading={isSubmitting}
            icon={<Plus className="w-4 h-4 text-black" />}
            showTail={true}
          >
            Добавить в футер
          </NoirButton>
        </div>
      </form>

      {statusMsg && (
        <div
          className={`p-3.5 border text-[14px] break-words rounded-none ${
            statusMsg.type === 'error'
              ? 'border-rose-500 bg-rose-950/40 text-rose-200'
              : 'border-white/60 bg-white/10 text-white'
          }`}
        >
          {statusMsg.text}
        </div>
      )}

      {/* Existing Links List */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between text-[14px] text-zinc-400">
          <span>Всего записей: {links.length}</span>
          <span>Активных в футере: {links.filter((l) => l.is_active).length}</span>
        </div>

        {isLoading ? (
          <div className="p-6 border border-zinc-800 bg-black/50 text-center text-zinc-400 text-[14px] rounded-none">
            Загрузка ссылок из базы данных...
          </div>
        ) : links.length === 0 ? (
          <div className="p-6 border border-zinc-800 bg-black/50 text-center text-zinc-400 text-[14px] rounded-none">
            Ссылки в базе данных отсутствуют. Добавьте первую кнопку выше.
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {links.map((item, idx) => {
              const isEditing = editingId === item.id;
              const isConfirmingDelete = confirmDeleteId === item.id;

              return (
                <div
                  key={item.id}
                  className={`p-4 border transition-colors rounded-none ${
                    item.is_active
                      ? 'bg-black/65 border-zinc-700'
                      : 'bg-zinc-950/60 border-zinc-800/70 opacity-75'
                  }`}
                >
                  {isEditing ? (
                    <div className="flex flex-col gap-3">
                      <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                        <div className="md:col-span-4 flex flex-col gap-1">
                          <label className="text-[14px] text-zinc-400">Название:</label>
                          <input
                            type="text"
                            value={editTitle}
                            onChange={(e) => setEditTitle(e.target.value)}
                            className="noir-input w-full min-h-[44px] px-3 py-2 text-[14px] rounded-none"
                          />
                        </div>
                        <div className="md:col-span-5 flex flex-col gap-1">
                          <label className="text-[14px] text-zinc-400">URL:</label>
                          <input
                            type="url"
                            value={editUrl}
                            onChange={(e) => setEditUrl(e.target.value)}
                            className="noir-input w-full min-h-[44px] px-3 py-2 text-[14px] font-mono rounded-none"
                          />
                        </div>
                        <div className="md:col-span-3 flex flex-col gap-1">
                          <label className="text-[14px] text-zinc-400">Порядок:</label>
                          <input
                            type="number"
                            value={editSortOrder}
                            onChange={(e) => setEditSortOrder(Number(e.target.value))}
                            className="noir-input w-full min-h-[44px] px-3 py-2 text-[14px] font-mono rounded-none"
                          />
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                        <label className="inline-flex items-center gap-2 text-[14px] text-zinc-200 cursor-pointer min-h-[44px]">
                          <input
                            type="checkbox"
                            checked={editIsActive}
                            onChange={(e) => setEditIsActive(e.target.checked)}
                            className="w-4 h-4 accent-rose-600"
                          />
                          <span>Показывать в футере сайта</span>
                        </label>

                        <div className="flex flex-wrap items-center gap-2">
                          <NoirButton
                            type="button"
                            variant="primary"
                            onClick={() => handleSaveEdit(item.id)}
                            loading={isSubmitting}
                            icon={<Save className="w-4 h-4 text-black" />}
                            showTail={true}
                          >
                            Сохранить
                          </NoirButton>
                          <NoirButton
                            type="button"
                            variant="subtle"
                            onClick={cancelEditing}
                            icon={<X className="w-4 h-4 text-zinc-300" />}
                            showTail={true}
                          >
                            Отмена
                          </NoirButton>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                      <div className="flex flex-col gap-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="px-2 py-0.5 bg-zinc-900 border border-zinc-700 font-mono text-[14px] text-zinc-400 rounded-none">
                            #{item.sort_order}
                          </span>
                          <span className="font-bold text-[16px] text-white break-words">
                            {item.title}
                          </span>
                          {!item.is_active && (
                            <span className="px-2 py-0.5 bg-rose-950/60 border border-rose-600/60 text-rose-300 text-[14px] rounded-none">
                              Скрыта
                            </span>
                          )}
                        </div>
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-[14px] font-mono text-rose-400 hover:text-rose-300 underline break-all"
                        >
                          <span>{item.url}</span>
                          <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                        </a>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleMove(idx, -1)}
                          disabled={idx === 0 || isSubmitting}
                          title="Переместить выше"
                          className="min-h-[44px] min-w-[44px] px-2.5 bg-zinc-950 border border-zinc-700 hover:border-white text-zinc-200 disabled:opacity-35 inline-flex items-center justify-center cursor-pointer rounded-none"
                        >
                          <ArrowUp className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleMove(idx, 1)}
                          disabled={idx === links.length - 1 || isSubmitting}
                          title="Переместить ниже"
                          className="min-h-[44px] min-w-[44px] px-2.5 bg-zinc-950 border border-zinc-700 hover:border-white text-zinc-200 disabled:opacity-35 inline-flex items-center justify-center cursor-pointer rounded-none"
                        >
                          <ArrowDown className="w-4 h-4" />
                        </button>

                        <button
                          type="button"
                          onClick={() => handleToggleActive(item)}
                          disabled={isSubmitting}
                          className="min-h-[44px] px-3 bg-zinc-950 border border-zinc-700 hover:border-white text-zinc-200 text-[14px] inline-flex items-center gap-1.5 cursor-pointer rounded-none"
                        >
                          {item.is_active ? (
                            <>
                              <Eye className="w-4 h-4 text-rose-500" />
                              <span>Видна</span>
                            </>
                          ) : (
                            <>
                              <EyeOff className="w-4 h-4 text-zinc-500" />
                              <span>Скрыта</span>
                            </>
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={() => startEditing(item)}
                          disabled={isSubmitting}
                          className="min-h-[44px] px-3 bg-zinc-950 border border-zinc-700 hover:border-white text-white text-[14px] inline-flex items-center gap-1.5 cursor-pointer rounded-none"
                        >
                          <Edit3 className="w-4 h-4 text-rose-500" />
                          <span>Изменить</span>
                        </button>

                        {isConfirmingDelete ? (
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleDelete(item.id, item.title)}
                              disabled={isSubmitting}
                              className="min-h-[44px] px-3 bg-rose-950/90 border border-rose-500 text-rose-200 text-[14px] font-bold inline-flex items-center gap-1 cursor-pointer rounded-none"
                            >
                              <Check className="w-4 h-4" />
                              <span>Удалить</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(null)}
                              className="min-h-[44px] px-2.5 bg-zinc-950 border border-zinc-700 text-zinc-300 text-[14px] inline-flex items-center cursor-pointer rounded-none"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(item.id)}
                            disabled={isSubmitting}
                            title="Удалить ссылку"
                            className="min-h-[44px] px-3 bg-zinc-950 border border-zinc-700 hover:border-rose-500 text-zinc-300 hover:text-rose-400 text-[14px] inline-flex items-center gap-1.5 cursor-pointer rounded-none"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
