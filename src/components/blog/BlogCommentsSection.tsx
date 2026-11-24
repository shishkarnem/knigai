import React, { useMemo, useState } from 'react';
import { Heart, MessageSquare, CornerDownRight, Send, Trash2, User } from 'lucide-react';
import { AppUser } from '../../types';
import {
  BlogCommentDto,
  createBlogComment,
  getBlogGuestName,
  setBlogGuestName,
  toggleBlogCommentLike,
  adminDeleteBlogComment,
} from '../../services/blog/blogApi';
import { NoirButton } from '../common/NoirButton';
import { RubikMarkerHeading } from '../landing/RubikMarkerHeading';

interface BlogCommentsSectionProps {
  slug: string;
  comments: BlogCommentDto[];
  currentUser: AppUser | null;
  isAdmin?: boolean;
  onCommentsUpdated: (nextComments: BlogCommentDto[], totalCount: number) => void;
}

interface CommentNode extends BlogCommentDto {
  replies: CommentNode[];
}

function buildCommentTree(flat: BlogCommentDto[]): CommentNode[] {
  const map = new Map<number, CommentNode>();
  const roots: CommentNode[] = [];

  for (const item of flat) {
    map.set(Number(item.id), { ...item, replies: [] });
  }
  for (const item of flat) {
    const node = map.get(Number(item.id));
    if (!node) continue;
    const pId = item.parent_id ? Number(item.parent_id) : null;
    if (pId && map.has(pId)) {
      map.get(pId)!.replies.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

function formatDateRu(iso: string): string {
  try {
    return new Date(iso).toLocaleString('ru-RU', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export const BlogCommentsSection: React.FC<BlogCommentsSectionProps> = ({
  slug,
  comments,
  currentUser,
  isAdmin = false,
  onCommentsUpdated,
}) => {
  const [guestName, setGuestName] = useState<string>(() => getBlogGuestName());
  const [newText, setNewText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [replyToId, setReplyToId] = useState<number | null>(null);
  const [replyText, setReplyText] = useState('');
  const [replySubmitting, setReplySubmitting] = useState(false);

  const [likingId, setLikingId] = useState<number | null>(null);
  const [likeNeedNameId, setLikeNeedNameId] = useState<number | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  const tree = useMemo(() => buildCommentTree(comments), [comments]);

  const currentAccountName =
    (currentUser?.name || '').trim() ||
    (currentUser?.email ? currentUser.email.split('@')[0] : '') ||
    (currentUser?.uid ? `Автор #${currentUser.uid}` : '');

  const handleSubmitTopComment = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!currentUser && guestName.trim().length < 2) {
      setErrorMsg('Укажите ваше имя (минимум 2 символа), чтобы оставить комментарий без регистрации.');
      return;
    }
    if (newText.trim().length < 2) {
      setErrorMsg('Напишите текст комментария (минимум 2 символа).');
      return;
    }

    if (!currentUser) {
      setBlogGuestName(guestName.trim());
    }

    setSubmitting(true);
    try {
      const res = await createBlogComment(slug, newText.trim(), currentUser, null, guestName.trim());
      setNewText('');
      onCommentsUpdated([...comments, res.comment], res.comments_count);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Ошибка отправки комментария');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitReply = async (parentId: number) => {
    setErrorMsg('');
    if (!currentUser && guestName.trim().length < 2) {
      setErrorMsg('Укажите ваше имя в поле имени выше, чтобы отправить ответ.');
      return;
    }
    if (replyText.trim().length < 2) {
      setErrorMsg('Введите текст ответа (минимум 2 символа).');
      return;
    }

    if (!currentUser) {
      setBlogGuestName(guestName.trim());
    }

    setReplySubmitting(true);
    try {
      const res = await createBlogComment(
        slug,
        replyText.trim(),
        currentUser,
        parentId,
        guestName.trim()
      );
      setReplyText('');
      setReplyToId(null);
      onCommentsUpdated([...comments, res.comment], res.comments_count);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Ошибка отправки ответа');
    } finally {
      setReplySubmitting(false);
    }
  };

  const handleLikeComment = async (commentId: number) => {
    setErrorMsg('');
    if (!currentUser) {
      const saved = (guestName || getBlogGuestName()).trim();
      if (saved.length < 2) {
        setLikeNeedNameId(commentId);
        return;
      }
      setBlogGuestName(saved);
    }

    setLikingId(commentId);
    try {
      const res = await toggleBlogCommentLike(commentId, currentUser, guestName.trim());
      setLikeNeedNameId(null);
      const next = comments.map((c) =>
        Number(c.id) === Number(commentId)
          ? { ...c, liked_by_me: res.liked, likes_count: res.likes_count }
          : c
      );
      onCommentsUpdated(next, next.length);
    } catch (err: unknown) {
      const e = err as Error & { needName?: boolean };
      if (e.needName) {
        setLikeNeedNameId(commentId);
      } else {
        setErrorMsg(e.message || 'Не удалось оценить комментарий');
      }
    } finally {
      setLikingId(null);
    }
  };

  const handleDeleteComment = async (commentId: number) => {
    try {
      await adminDeleteBlogComment(commentId);
      const filtered = comments.filter(
        (c) => Number(c.id) !== Number(commentId) && Number(c.parent_id) !== Number(commentId)
      );
      setConfirmDeleteId(null);
      onCommentsUpdated(filtered, filtered.length);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Ошибка удаления комментария');
    }
  };

  const renderCommentCard = (node: CommentNode, depth = 0) => {
    const isReply = depth > 0;
    const isReplyOpen = replyToId === Number(node.id);
    const showInlineNameForLike = likeNeedNameId === Number(node.id) && !currentUser;

    return (
      <div
        key={node.id}
        className={`flex flex-col gap-3 ${
          isReply ? 'ml-4 sm:ml-8 pl-3 sm:pl-4 border-l border-rose-500/45' : ''
        }`}
      >
        <div className="p-4 sm:p-5 bg-zinc-950/70 border border-zinc-800 flex flex-col gap-3 rounded-none">
          {/* Header */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800/80 pb-2">
            <div className="flex flex-wrap items-center gap-2 text-[14px]">
              <User className="w-4 h-4 text-rose-500 shrink-0" />
              <strong className="text-white font-bold">{node.author_name}</strong>
              <span className="text-zinc-500">·</span>
              <span className="text-zinc-400 font-mono text-[14px]">
                {node.is_guest ? 'Гость' : 'Автор KnigAI'}
              </span>
            </div>
            <span className="text-[14px] text-zinc-500 font-mono">
              {formatDateRu(node.created_at)}
            </span>
          </div>

          {/* Comment Body */}
          <p className="text-[15px] text-zinc-200 leading-relaxed font-['PT_Serif',serif] whitespace-pre-wrap break-words">
            {node.content}
          </p>

          {/* Inline guest name prompt when trying to like a comment anonymously */}
          {showInlineNameForLike && (
            <div className="p-3 bg-black/85 border border-rose-500/80 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <input
                type="text"
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                placeholder="Ваше имя для лайка..."
                className="noir-input flex-1 px-3 py-2 text-[14px] rounded-none"
              />
              <NoirButton
                type="button"
                variant="primary"
                showTail={false}
                onClick={() => handleLikeComment(Number(node.id))}
              >
                Поставить лайк
              </NoirButton>
            </div>
          )}

          {/* Actions Row: Like on comment + Reply + Optional Admin Delete */}
          <div className="flex flex-wrap items-center gap-2.5 pt-1">
            <button
              type="button"
              disabled={likingId === Number(node.id)}
              onClick={() => handleLikeComment(Number(node.id))}
              className={`min-h-[38px] px-3 py-1.5 border text-[14px] font-bold inline-flex items-center gap-1.5 cursor-pointer transition-colors rounded-none ${
                node.liked_by_me
                  ? 'bg-rose-950/70 border-rose-500 text-rose-200'
                  : 'bg-black/70 border-zinc-700 hover:border-rose-500 text-zinc-300 hover:text-white'
              }`}
            >
              <Heart
                className={`w-4 h-4 ${
                  node.liked_by_me ? 'fill-rose-500 text-rose-500' : 'text-rose-500'
                }`}
              />
              <span>{node.likes_count || 0}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setReplyToId(isReplyOpen ? null : Number(node.id));
                setReplyText('');
              }}
              className="min-h-[38px] px-3 py-1.5 bg-black/70 border border-zinc-700 hover:border-white text-zinc-200 hover:text-white text-[14px] font-bold inline-flex items-center gap-1.5 cursor-pointer transition-colors rounded-none"
            >
              <CornerDownRight className="w-4 h-4 text-rose-500" />
              <span>{isReplyOpen ? 'Скрыть ответ' : 'Ответить'}</span>
            </button>

            {isAdmin && (
              confirmDeleteId === Number(node.id) ? (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleDeleteComment(Number(node.id))}
                    className="min-h-[38px] px-3 py-1.5 bg-rose-900 border border-rose-500 text-white text-[14px] font-bold cursor-pointer"
                  >
                    Удалить точно
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteId(null)}
                    className="min-h-[38px] px-3 py-1.5 bg-zinc-900 border border-zinc-700 text-zinc-300 text-[14px] cursor-pointer"
                  >
                    Отмена
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmDeleteId(Number(node.id))}
                  className="min-h-[38px] px-2.5 py-1.5 bg-black/60 border border-zinc-800 hover:border-rose-500 text-zinc-400 hover:text-rose-300 text-[14px] inline-flex items-center gap-1 cursor-pointer"
                  title="Удалить комментарий"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )
            )}
          </div>

          {/* Reply Form */}
          {isReplyOpen && (
            <div className="mt-2 p-3 sm:p-4 bg-black/80 border border-zinc-700 flex flex-col gap-3 rounded-none">
              {!currentUser && (
                <div>
                  <label className="block text-[14px] text-zinc-300 mb-1">
                    Ваше имя (для ответа без регистрации):
                  </label>
                  <input
                    type="text"
                    value={guestName}
                    onChange={(e) => setGuestName(e.target.value)}
                    placeholder="Как вас подписать..."
                    maxLength={60}
                    className="noir-input w-full px-3 py-2 text-[14px] rounded-none"
                  />
                </div>
              )}
              <textarea
                rows={3}
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder={`Ответ для ${node.author_name}...`}
                className="noir-input w-full px-3.5 py-2.5 text-[14px] font-['PT_Serif',serif] rounded-none"
              />
              <div className="flex flex-wrap items-center gap-2">
                <NoirButton
                  type="button"
                  variant="primary"
                  loading={replySubmitting}
                  onClick={() => handleSubmitReply(Number(node.id))}
                  icon={<Send className="w-4 h-4 text-black" />}
                  showTail={false}
                >
                  Отправить ответ
                </NoirButton>
                <NoirButton
                  type="button"
                  variant="subtle"
                  showTail={false}
                  onClick={() => setReplyToId(null)}
                >
                  Отмена
                </NoirButton>
              </div>
            </div>
          )}
        </div>

        {/* Nested replies */}
        {node.replies.length > 0 && (
          <div className="flex flex-col gap-3">
            {node.replies.map((reply) => renderCommentCard(reply, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <section className="w-full flex flex-col gap-6 pt-6 border-t border-zinc-800">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <RubikMarkerHeading
          as="h2"
          text={`Комментарии и обсуждение (${comments.length})`}
          className="text-[22px] sm:text-[28px]"
        />
        <span className="text-[14px] text-zinc-400">
          {currentUser
            ? `Вы комментируете как ${currentAccountName}`
            : 'Можно комментировать без регистрации — укажите имя'}
        </span>
      </div>

      {/* Main New Comment Form */}
      <form
        onSubmit={handleSubmitTopComment}
        className="p-4 sm:p-6 bg-zinc-950/75 border border-zinc-700 flex flex-col gap-4 rounded-none"
      >
        {!currentUser && (
          <div className="flex flex-col gap-1.5">
            <label className="text-[14px] font-bold text-zinc-200 flex items-center gap-2">
              <User className="w-4 h-4 text-rose-500" />
              <span>Ваше имя (для гостей без аккаунта)</span>
            </label>
            <input
              type="text"
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              placeholder="Например: Алексей или Мария К."
              maxLength={60}
              className="noir-input w-full sm:max-w-md px-3.5 py-2.5 text-[14px] rounded-none"
            />
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <label className="text-[14px] font-bold text-zinc-200 flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-rose-500" />
            <span>Ваш комментарий или вопрос по статье</span>
          </label>
          <textarea
            rows={4}
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            placeholder="Поделитесь впечатлением, опытом или задайте вопрос..."
            maxLength={4000}
            className="noir-input w-full px-3.5 py-2.5 text-[15px] font-['PT_Serif',serif] rounded-none"
          />
        </div>

        {errorMsg && (
          <div className="p-3 border border-rose-500 bg-rose-950/50 text-rose-200 text-[14px]">
            {errorMsg}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-[14px] text-zinc-500">
            На комментарии и ответы можно ставить лайки и отвечать в ветке.
          </span>
          <NoirButton
            type="submit"
            variant="primary"
            loading={submitting}
            icon={<Send className="w-4 h-4 text-black" />}
          >
            Опубликовать комментарий
          </NoirButton>
        </div>
      </form>

      {/* Comment Threads */}
      {tree.length === 0 ? (
        <div className="p-6 bg-zinc-950/50 border border-zinc-800 text-center text-[15px] text-zinc-400">
          Пока нет комментариев — станьте первым читателем, который откроет обсуждение.
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {tree.map((node) => renderCommentCard(node, 0))}
        </div>
      )}
    </section>
  );
};
