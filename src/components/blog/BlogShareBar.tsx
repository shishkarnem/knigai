import React, { useState } from 'react';
import { Heart, Share2, Copy, Check, Send, ExternalLink, User } from 'lucide-react';
import { AppUser } from '../../types';
import {
  BlogPostDto,
  getBlogGuestName,
  setBlogGuestName,
  toggleBlogPostLike,
  recordBlogPostRepost,
} from '../../services/blog/blogApi';
import { NoirButton } from '../common/NoirButton';

interface BlogShareBarProps {
  post: BlogPostDto;
  currentUser: AppUser | null;
  onPostUpdated: (updated: Partial<BlogPostDto>) => void;
}

export const BlogShareBar: React.FC<BlogShareBarProps> = ({
  post,
  currentUser,
  onPostUpdated,
}) => {
  const [guestName, setGuestNameState] = useState<string>(() => getBlogGuestName());
  const [needNamePrompt, setNeedNamePrompt] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => Promise<void>) | null>(null);
  const [liking, setLiking] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [showSharePanel, setShowSharePanel] = useState(false);
  const [copied, setCopied] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const shareUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/blog/${encodeURIComponent(post.slug)}`
      : `https://knigai.ru/blog/${encodeURIComponent(post.slug)}`;

  const runWithIdentity = async (action: (resolvedGuestName?: string) => Promise<void>) => {
    setErrorMsg('');
    if (currentUser?.uid) {
      await action();
      return;
    }
    const saved = getBlogGuestName();
    if (saved.length >= 2) {
      await action(saved);
      return;
    }
    setPendingAction(() => async () => {
      const latest = getBlogGuestName();
      await action(latest);
    });
    setNeedNamePrompt(true);
  };

  const handleToggleLike = async () => {
    setLiking(true);
    try {
      await runWithIdentity(async (resolvedName) => {
        const result = await toggleBlogPostLike(post.slug, currentUser, resolvedName);
        onPostUpdated({
          liked_by_me: result.liked,
          likes_count: result.likes_count,
        });
      });
    } catch (err: unknown) {
      const e = err as Error & { needName?: boolean };
      if (e.needName) {
        setNeedNamePrompt(true);
      } else {
        setErrorMsg(e.message || 'Ошибка при постановке лайка');
      }
    } finally {
      setLiking(false);
    }
  };

  const handleShareChannel = async (channel: 'copy' | 'telegram' | 'vk' | 'ok' | 'native') => {
    setSharing(true);
    setErrorMsg('');
    try {
      await runWithIdentity(async (resolvedName) => {
        const res = await recordBlogPostRepost(post.slug, currentUser, channel, resolvedName);
        onPostUpdated({ shares_count: res.shares_count });

        if (channel === 'copy') {
          await navigator.clipboard.writeText(shareUrl);
          setCopied(true);
          setTimeout(() => setCopied(false), 2500);
        } else if (channel === 'native' && typeof navigator !== 'undefined' && navigator.share) {
          await navigator.share({
            title: post.title,
            text: post.excerpt || post.subtitle || post.title,
            url: shareUrl,
          });
        } else if (channel === 'telegram') {
          const tgUrl = `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(post.title)}`;
          window.open(tgUrl, '_blank', 'noopener,noreferrer');
        } else if (channel === 'vk') {
          const vkUrl = `https://vk.com/share.php?url=${encodeURIComponent(shareUrl)}&title=${encodeURIComponent(post.title)}&image=${encodeURIComponent(post.cover_image_url ? `${window.location.origin}${post.cover_image_url}` : '')}`;
          window.open(vkUrl, '_blank', 'noopener,noreferrer');
        } else if (channel === 'ok') {
          const okUrl = `https://connect.ok.ru/offer?url=${encodeURIComponent(shareUrl)}&title=${encodeURIComponent(post.title)}`;
          window.open(okUrl, '_blank', 'noopener,noreferrer');
        }
      });
    } catch (err: unknown) {
      const e = err as Error & { needName?: boolean };
      if (e.needName) {
        setNeedNamePrompt(true);
      } else {
        setErrorMsg(e.message || 'Не удалось выполнить репост');
      }
    } finally {
      setSharing(false);
    }
  };

  const handleConfirmGuestName = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = guestName.trim();
    if (cleaned.length < 2) {
      setErrorMsg('Укажите имя (минимум 2 символа), чтобы оценить или сделать репост.');
      return;
    }
    setBlogGuestName(cleaned);
    setNeedNamePrompt(false);
    setErrorMsg('');
    if (pendingAction) {
      const act = pendingAction;
      setPendingAction(null);
      try {
        await act();
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : 'Ошибка действия');
      }
    }
  };

  return (
    <div className="w-full p-4 sm:p-6 bg-zinc-950/75 border border-zinc-700 flex flex-col gap-4 rounded-none">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <NoirButton
            type="button"
            variant={post.liked_by_me ? 'danger' : 'outline'}
            loading={liking}
            onClick={handleToggleLike}
            icon={
              <Heart
                className={`w-4 h-4 ${post.liked_by_me ? 'fill-rose-500 text-rose-500' : 'text-rose-500'}`}
              />
            }
          >
            {post.liked_by_me ? 'Нравится' : 'Лайк'} · {post.likes_count || 0}
          </NoirButton>

          <NoirButton
            type="button"
            variant={showSharePanel ? 'primary' : 'outline'}
            onClick={() => setShowSharePanel((v) => !v)}
            icon={<Share2 className={`w-4 h-4 ${showSharePanel ? 'text-black' : 'text-rose-500'}`} />}
          >
            Поделиться / Репост · {post.shares_count || 0}
          </NoirButton>
        </div>

        {!currentUser && getBlogGuestName() && (
          <div className="flex items-center gap-2 text-[14px] text-zinc-400">
            <User className="w-4 h-4 text-rose-500" />
            <span>Вы: <strong className="text-white">{getBlogGuestName()}</strong></span>
            <button
              type="button"
              onClick={() => setNeedNamePrompt(true)}
              className="text-rose-400 hover:text-rose-300 underline text-[14px] cursor-pointer"
            >
              изменить
            </button>
          </div>
        )}
      </div>

      {/* Anonymous guest name prompt */}
      {needNamePrompt && !currentUser && (
        <form
          onSubmit={handleConfirmGuestName}
          className="p-4 bg-black/80 border border-rose-500/80 flex flex-col sm:flex-row items-stretch sm:items-center gap-3 rounded-none"
        >
          <div className="flex-1 min-w-0">
            <label className="block text-[14px] text-zinc-200 mb-1.5">
              Представьтесь для оценки или репоста (без регистрации):
            </label>
            <input
              type="text"
              value={guestName}
              onChange={(e) => setGuestNameState(e.target.value)}
              placeholder="Ваше имя или никнейм..."
              maxLength={60}
              className="noir-input w-full px-3.5 py-2.5 text-[14px] rounded-none"
            />
          </div>
          <div className="flex items-center gap-2 shrink-0 sm:pt-6">
            <NoirButton type="submit" variant="primary" showTail={false}>
              Подтвердить
            </NoirButton>
            <NoirButton
              type="button"
              variant="subtle"
              showTail={false}
              onClick={() => {
                setNeedNamePrompt(false);
                setPendingAction(null);
              }}
            >
              Отмена
            </NoirButton>
          </div>
        </form>
      )}

      {/* Share & Social Preview Card */}
      {showSharePanel && (
        <div className="p-4 sm:p-5 bg-black/75 border border-zinc-700 flex flex-col gap-4 rounded-none">
          <div className="flex flex-col sm:flex-row gap-4 items-start border-b border-zinc-800 pb-4">
            {post.cover_image_url && (
              <div className="w-full sm:w-52 aspect-video shrink-0 overflow-hidden border border-zinc-700 bg-black">
                <img
                  src={post.cover_image_url}
                  alt={post.title}
                  className="w-full h-full object-cover"
                />
              </div>
            )}
            <div className="min-w-0 flex-1 flex flex-col gap-1.5">
              <span className="text-[14px] text-rose-400 font-mono">
                Предпоказ карточки для соцсетей (16:9)
              </span>
              <div className="text-[16px] font-bold text-white break-words leading-snug">
                {post.title}
              </div>
              <p className="text-[14px] text-zinc-400 break-words line-clamp-2">
                {post.excerpt || post.subtitle}
              </p>
              <div className="text-[14px] font-mono text-zinc-500 break-all pt-1">
                {shareUrl}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <NoirButton
              type="button"
              variant="primary"
              loading={sharing}
              onClick={() => handleShareChannel('copy')}
              icon={copied ? <Check className="w-4 h-4 text-black" /> : <Copy className="w-4 h-4 text-black" />}
              showTail={false}
            >
              {copied ? 'Ссылка скопирована' : 'Копировать ссылку'}
            </NoirButton>

            <NoirButton
              type="button"
              variant="outline"
              loading={sharing}
              onClick={() => handleShareChannel('telegram')}
              icon={<Send className="w-4 h-4 text-rose-500" />}
              showTail={false}
            >
              Telegram
            </NoirButton>

            <NoirButton
              type="button"
              variant="outline"
              loading={sharing}
              onClick={() => handleShareChannel('vk')}
              icon={<ExternalLink className="w-4 h-4 text-rose-500" />}
              showTail={false}
            >
              ВКонтакте
            </NoirButton>

            <NoirButton
              type="button"
              variant="outline"
              loading={sharing}
              onClick={() => handleShareChannel('ok')}
              icon={<ExternalLink className="w-4 h-4 text-rose-500" />}
              showTail={false}
            >
              Одноклассники
            </NoirButton>

            {typeof navigator !== 'undefined' && typeof navigator.share === 'function' && (
              <NoirButton
                type="button"
                variant="subtle"
                loading={sharing}
                onClick={() => handleShareChannel('native')}
                icon={<Share2 className="w-4 h-4 text-white" />}
                showTail={false}
              >
                Системный репост
              </NoirButton>
            )}
          </div>
        </div>
      )}

      {errorMsg && (
        <div className="p-3 border border-rose-500 bg-rose-950/50 text-rose-200 text-[14px]">
          {errorMsg}
        </div>
      )}
    </div>
  );
};
