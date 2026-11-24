import React, { useEffect, useState } from 'react';
import {
  Check,
  Copy,
  Crown,
  ExternalLink,
  Gift,
  MapPin,
  Phone,
  Users,
} from 'lucide-react';
import { AppUser } from '../../../types';
import { KNIG_ROUND_URL } from '../../../constants/assets';
import {
  fetchTelegramReferralStats,
  isRunningInsideTelegramWebApp,
  ReferralStatsDto,
  requestTelegramContactPermission,
  requestTelegramLocationPermission,
} from '../../../services/auth/telegramWebAppAuth';
import { saveUserSession } from '../../../services/auth/authService';
import { NoirButton } from '../../common/NoirButton';

interface TelegramReferralCardProps {
  currentUser: AppUser;
  onUserUpdated: (user: AppUser) => void;
}

export const TelegramReferralCard: React.FC<TelegramReferralCardProps> = ({
  currentUser,
  onUserUpdated,
}) => {
  const [stats, setStats] = useState<ReferralStatsDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [copiedLink, setCopiedLink] = useState(false);
  const [permStatus, setPermStatus] = useState<string | null>(null);
  const [permBusy, setPermBusy] = useState(false);

  const inMiniApp = isRunningInsideTelegramWebApp();

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchTelegramReferralStats(currentUser.uid)
      .then((res) => {
        if (active) setStats(res);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [currentUser.uid, currentUser.telegram_id]);

  const botCleanHandle = (stats?.botUsername || '@Knig_AI').replace(/^@+/, '');
  const refParam = currentUser.telegram_id || String(currentUser.uid);
  const tmaRefLink = stats?.tmaReferralLink || `https://t.me/${botCleanHandle}/app?startapp=${refParam}`;

  const handleCopyRefLink = () => {
    navigator.clipboard.writeText(tmaRefLink);
    setCopiedLink(true);
    window.setTimeout(() => setCopiedLink(false), 2200);
  };

  const handleRequestContact = async () => {
    setPermBusy(true);
    setPermStatus(null);
    try {
      const phone = await requestTelegramContactPermission(currentUser.uid);
      if (phone) {
        const nextUser = { ...currentUser, phone };
        saveUserSession(nextUser);
        onUserUpdated(nextUser);
        setPermStatus(`Контактный телефон (${phone}) получен через Telegram и сохранён.`);
      } else {
        setPermStatus('Передача номера телефона была отменена.');
      }
    } catch (err) {
      setPermStatus(err instanceof Error ? err.message : 'Ошибка запроса контакта');
    } finally {
      setPermBusy(false);
    }
  };

  const handleRequestLocation = async () => {
    setPermBusy(true);
    setPermStatus(null);
    try {
      const coords = await requestTelegramLocationPermission(currentUser.uid);
      if (coords) {
        const nextUser = {
          ...currentUser,
          latitude: coords.latitude,
          longitude: coords.longitude,
        };
        saveUserSession(nextUser);
        onUserUpdated(nextUser);
        setPermStatus(
          `Геолокация (${coords.latitude.toFixed(4)}, ${coords.longitude.toFixed(4)}) сохранена в профиле.`
        );
      } else {
        setPermStatus('Доступ к геолокации не был предоставлен.');
      }
    } catch (err) {
      setPermStatus(err instanceof Error ? err.message : 'Ошибка запроса геолокации');
    } finally {
      setPermBusy(false);
    }
  };

  const rewardBal = Number(stats?.referralRewardBalance ?? currentUser.referral_reward_balance ?? 0);

  return (
    <div className="noir-container p-4 sm:p-6 border border-white/40 flex flex-col gap-5 text-white text-[14px]">
      {/* Header with dual truth IDs */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-zinc-800">
        <div className="flex items-start gap-2.5 min-w-0">
          <Users className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <h3 className="text-[17px] sm:text-[19px] font-bold text-white break-words">
              Telegram Mini App и реферальная программа
            </h3>
            <p className="text-[14px] text-zinc-300 mt-0.5 break-words">
              В профиле зафиксированы два независимых идентификатора: ваш KnigAI UID и Telegram ID.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {currentUser.is_premium && (
            <span className="px-2.5 py-1 border border-rose-500 bg-rose-950/30 text-rose-300 font-mono inline-flex items-center gap-1.5">
              <Crown className="w-4 h-4 text-rose-500" />
              <span>Telegram Premium</span>
            </span>
          )}
          {currentUser.profile_link && (
            <a
              href={currentUser.profile_link}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1 bg-black border border-zinc-700 hover:border-white text-zinc-200 hover:text-white font-mono inline-flex items-center gap-1.5 transition"
            >
              <span>@{currentUser.username || 'telegram'}</span>
              <ExternalLink className="w-3.5 h-3.5 text-rose-500" />
            </a>
          )}
        </div>
      </div>

      {/* Two Truth Identifiers Grid + Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="p-3 bg-black/55 border border-zinc-800 flex flex-col gap-1">
          <span className="text-zinc-400">KnigAI UID (истина №1)</span>
          <span className="font-mono text-[17px] font-bold text-white break-all">
            {currentUser.uid}
          </span>
        </div>

        <div className="p-3 bg-black/55 border border-zinc-800 flex flex-col gap-1">
          <span className="text-zinc-400">Telegram ID (истина №2)</span>
          <span className="font-mono text-[17px] font-bold text-rose-400 break-all">
            {currentUser.telegram_id || 'Не привязан'}
          </span>
        </div>

        <div className="p-3 bg-black/55 border border-zinc-800 flex flex-col gap-1">
          <span className="text-zinc-400">Приглашено друзей</span>
          <span className="font-mono text-[17px] font-bold text-white">
            {loading ? '—' : stats?.invitedUsers?.length ?? 0}
          </span>
        </div>

        <div className="p-3 bg-rose-950/20 border border-rose-500/50 flex flex-col gap-1">
          <span className="text-rose-300">Заработано реферальных</span>
          <span className="font-mono text-[17px] font-bold text-white">
            {rewardBal.toLocaleString('ru-RU')} букв
          </span>
        </div>
      </div>

      {/* Invited by + Optional Telegram Mini App Permissions */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-7 p-3.5 bg-black/60 border border-zinc-800 flex flex-col gap-2">
          <div className="font-bold text-white flex items-center gap-2">
            <Gift className="w-4 h-4 text-rose-500 shrink-0" />
            <span>Ваша реферальная ссылка для Telegram Mini App (+100 000 букв за друга):</span>
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <input
              type="text"
              readOnly
              value={tmaRefLink}
              className="noir-input flex-1 min-w-0 min-h-[42px] px-3 py-2 font-mono text-[14px] text-rose-300 select-all"
            />
            <NoirButton
              variant="primary"
              onClick={handleCopyRefLink}
              icon={copiedLink ? <Check className="w-4 h-4 text-black" /> : <Copy className="w-4 h-4 text-black" />}
              showTail={true}
              className="shrink-0"
            >
              {copiedLink ? 'Скопировано' : 'Копировать ссылку'}
            </NoirButton>
          </div>
          {stats?.invitedBy && (
            <div className="text-[14px] text-zinc-300 pt-1">
              Вас пригласил:{' '}
              <strong className="text-white">
                {stats.invitedBy.name || stats.invitedBy.first_name || `ID ${stats.invitedBy.telegram_id || stats.invitedBy.uid}`}
              </strong>
              {stats.invitedBy.username && (
                <span className="font-mono text-rose-400"> (@{stats.invitedBy.username})</span>
              )}
            </div>
          )}
        </div>

        {/* Telegram Mini App Permissions (Phone / Location) */}
        <div className="lg:col-span-5 p-3.5 bg-black/60 border border-zinc-800 flex flex-col justify-between gap-2.5">
          <div>
            <div className="font-bold text-white text-[15px]">Разрешения Telegram WebApp</div>
            <p className="text-[14px] text-zinc-400 mt-0.5 break-words">
              {inMiniApp
                ? 'Вы открыли кабинет внутри Telegram Mini App — можно запросить контакт и геопозицию.'
                : 'Откройте ссылку в Telegram Mini App, чтобы передать номер и геолокацию в 1 нажатие.'}
            </p>
            {(currentUser.latitude != null || currentUser.longitude != null) && (
              <div className="text-[14px] font-mono text-zinc-300 mt-1">
                Координаты: {Number(currentUser.latitude).toFixed(4)}, {Number(currentUser.longitude).toFixed(4)}
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <NoirButton
              variant="outline"
              onClick={handleRequestContact}
              disabled={!inMiniApp || permBusy}
              icon={<Phone className="w-4 h-4 text-rose-500" />}
              showTail={false}
            >
              Запросить телефон
            </NoirButton>
            <NoirButton
              variant="outline"
              onClick={handleRequestLocation}
              disabled={!inMiniApp || permBusy}
              icon={<MapPin className="w-4 h-4 text-rose-500" />}
              showTail={false}
            >
              Запросить геолокацию
            </NoirButton>
          </div>

          {permStatus && (
            <div className="p-2 border border-white/40 bg-white/10 text-[14px] text-white break-words">
              {permStatus}
            </div>
          )}
        </div>
      </div>

      {/* Invited Users Table/List */}
      <div className="flex flex-col gap-2">
        <div className="font-bold text-white text-[15px]">
          Приглашённые пользователи ({stats?.invitedUsers?.length || 0})
        </div>

        {loading ? (
          <div className="p-4 border border-zinc-800 bg-black/40 text-zinc-400">
            Загрузка реферальной статистики...
          </div>
        ) : !stats || stats.invitedUsers.length === 0 ? (
          <div className="p-4 border border-dashed border-zinc-700 bg-black/40 text-zinc-400">
            Пока никто не зарегистрировался по вашей ссылке. Поделитесь ссылкой выше — за каждого друга начисляется +100 000 букв!
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {stats.invitedUsers.map((inv) => {
              const displayName =
                [inv.first_name, inv.last_name].filter(Boolean).join(' ') ||
                inv.name ||
                `Автор ${inv.uid}`;
              const regDate = inv.created_at
                ? new Date(inv.created_at).toLocaleDateString('ru-RU')
                : '—';

              return (
                <div
                  key={inv.uid}
                  className="p-3 bg-black/60 border border-zinc-800 flex items-center gap-3 min-w-0"
                >
                  <div className="w-11 h-11 border border-zinc-700 bg-zinc-900 overflow-hidden shrink-0">
                    <img
                      src={inv.avatar_url || KNIG_ROUND_URL}
                      alt={displayName}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-white truncate">{displayName}</div>
                    <div className="text-[14px] text-zinc-400 font-mono truncate">
                      {inv.username ? `@${inv.username}` : `UID: ${inv.uid}`} · {regDate}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
