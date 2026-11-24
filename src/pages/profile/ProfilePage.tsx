import React, { useState } from 'react';
import {
  User,
  BookOpen,
  Library,
  Palette,
  Glasses,
  ImageIcon,
  Shield,
  Copy,
  Check,
  Edit2,
  Save,
  X,
  Plus,
  Mail,
  Phone,
  Calendar,
  ExternalLink,
  ChevronRight,
  LogOut,
  Sparkles,
  Coins,
  FileText,
  History,
  Bell,
} from 'lucide-react';
import { AppRoute, Book, AppUser } from '../../types';
import { RubikMarkerHeading } from '../../components/landing/RubikMarkerHeading';
import { NoirButton } from '../../components/common/NoirButton';
import { KNIG_ROUND_URL } from '../../constants/assets';
import { updateUserProfile, isUserAdmin } from '../../services/auth/authService';
import { LettersPricingModal } from '../../components/cabinet/LettersPricingModal';
import { EditProfileModal } from '../../components/cabinet/EditProfileModal';
import { TelegramConnectCard } from '../../components/cabinet/profile/TelegramConnectCard';
import { TelegramReferralCard } from '../../components/cabinet/profile/TelegramReferralCard';
import { NotificationPrefsCard } from '../../components/cabinet/profile/NotificationPrefsCard';
import { NoirVoiceInput } from '../../components/voice/NoirVoiceInput';
import { PWAInstallButton } from '../../components/pwa/PWAInstallButton';
import { DevicePushPanel } from '../../components/pwa/DevicePushPanel';

interface ProfilePageProps {
  currentUser: AppUser;
  books: Book[];
  activeBook: Book | null;
  onSelectBook: (book: Book) => void;
  onNavigate: (route: AppRoute) => void;
  onOpenNewBookModal: () => void;
  onUserUpdated: (user: AppUser) => void;
  onLogout: () => void;
}

export const ProfilePage: React.FC<ProfilePageProps> = ({
  currentUser,
  books,
  activeBook,
  onSelectBook,
  onNavigate,
  onOpenNewBookModal,
  onUserUpdated,
  onLogout,
}) => {
  const [copiedUid, setCopiedUid] = useState(false);
  const [copiedTgId, setCopiedTgId] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editName, setEditName] = useState(currentUser.name || '');
  const [editPhone, setEditPhone] = useState(currentUser.phone || '');
  const [saving, setSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isPricingModalOpen, setIsPricingModalOpen] = useState(false);

  const isAdmin = isUserAdmin(currentUser);

  const handleCopyUid = () => {
    navigator.clipboard.writeText(String(currentUser.uid));
    setCopiedUid(true);
    setTimeout(() => setCopiedUid(false), 2200);
  };

  const handleCopyTgId = () => {
    if (!currentUser.telegram_id) return;
    navigator.clipboard.writeText(String(currentUser.telegram_id));
    setCopiedTgId(true);
    setTimeout(() => setCopiedTgId(false), 2200);
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setStatusMsg(null);
    try {
      const updated = await updateUserProfile(currentUser.uid, {
        name: editName,
        phone: editPhone,
      });
      onUserUpdated(updated);
      setIsEditing(false);
      setStatusMsg({ type: 'success', text: 'Данные профиля успешно сохранены' });
      setTimeout(() => setStatusMsg(null), 3500);
    } catch (err: unknown) {
      setStatusMsg({
        type: 'error',
        text: err instanceof Error ? err.message : 'Не удалось сохранить профиль',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="w-full flex flex-col gap-6 font-['PT_Serif',serif] text-white">
      {/* 1. Header Welcome Banner */}
      <div className="noir-container p-4 sm:p-8 border-2 border-white flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex flex-col gap-2">
          <div className="inline-flex items-center gap-2 text-rose-500 text-[14px] font-mono">
            <User className="w-4 h-4" />
            <span>Главная страница личного кабинета</span>
          </div>
          <RubikMarkerHeading
            as="h1"
            text={`Профиль автора: ${currentUser.name || currentUser.email.split('@')[0]}`}
            className="text-[22px] sm:text-[32px] leading-tight"
          />
          <p className="text-[14px] sm:text-[15px] text-zinc-300 leading-relaxed max-w-2xl">
            Добро пожаловать в персональный рабочий кабинет KnigAI. Здесь собрана общая сводка по вашим книгам, уникальный UID и быстрый доступ ко всем инструментам фабрики.
          </p>
        </div>

        <div className="shrink-0 flex items-center gap-2">
          <NoirButton
            variant="primary"
            onClick={onOpenNewBookModal}
            icon={<Plus className="w-4 h-4 text-black" />}
            className="text-[14px] font-bold"
          >
            Создать книгу
          </NoirButton>
        </div>
      </div>

      {statusMsg && (
        <div
          className={`p-3 border text-[14px] flex items-center justify-between ${
            statusMsg.type === 'success'
              ? 'bg-zinc-950/80 border-white text-zinc-100'
              : 'bg-rose-950/80 border-rose-500 text-rose-200'
          }`}
        >
          <span>{statusMsg.text}</span>
          <button
            onClick={() => setStatusMsg(null)}
            className="p-1 hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 2. Main Identity & Statistics Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Author Identity Card */}
        <div className="lg:col-span-5 noir-container p-4 sm:p-6 border border-white/40 flex flex-col justify-between gap-6">
          <div className="flex flex-col gap-5">
            {/* Avatar & Badges */}
            <div className="flex items-start gap-4">
              <div className="w-20 h-20 sm:w-24 sm:h-24 overflow-hidden bg-black border-2 border-white/60 p-0 flex items-center justify-center shrink-0 shadow-md">
                <img
                  src={currentUser.avatar_url || KNIG_ROUND_URL}
                  alt="Аватар профиля"
                  className="w-full h-full object-cover"
                />
              </div>

              <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[18px] sm:text-[20px] font-bold text-white truncate max-w-[200px]">
                    {currentUser.name || 'Автор KnigAI'}
                  </span>
                  {isAdmin && (
                    <span className="px-2 py-0.5 bg-rose-950 border border-rose-500 text-rose-300 text-[14px] font-mono">
                      Администратор
                    </span>
                  )}
                </div>

                <span className="text-[14px] text-zinc-400 break-all">
                  {currentUser.email}
                </span>

                <div className="pt-1">
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-zinc-900 border border-zinc-700 text-zinc-300 text-[14px]">
                    <span className="w-2 h-2 bg-rose-500 shrink-0" />
                    <span>Статус: Активный автор</span>
                  </span>
                </div>
              </div>
            </div>

            {/* Two Truth Identifiers: 11-digit UID + Telegram ID */}
            <div className="flex flex-col gap-2">
              <div className="p-3 bg-zinc-950/80 border border-zinc-800 flex items-center justify-between gap-2">
                <div className="flex flex-col min-w-0">
                  <span className="text-[14px] text-zinc-400">Уникальный номер (UID):</span>
                  <span className="font-mono text-[16px] sm:text-[18px] font-extrabold text-white tracking-wider break-all">
                    {currentUser.uid}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleCopyUid}
                  title="Скопировать UID"
                  className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-200 hover:text-white text-[14px] font-mono flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
                >
                  {copiedUid ? (
                    <>
                      <Check className="w-4 h-4 text-rose-500" />
                      <span className="text-rose-400">Скопировано</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4 text-zinc-400" />
                      <span>Копировать</span>
                    </>
                  )}
                </button>
              </div>

              <div className="p-3 bg-zinc-950/80 border border-zinc-800 flex items-center justify-between gap-2">
                <div className="flex flex-col min-w-0">
                  <span className="text-[14px] text-zinc-400">Telegram ID (истина):</span>
                  <span className="font-mono text-[16px] sm:text-[18px] font-extrabold text-rose-400 tracking-wider break-all">
                    {currentUser.telegram_id || 'Не привязан'}
                  </span>
                </div>
                {currentUser.telegram_id && (
                  <button
                    type="button"
                    onClick={handleCopyTgId}
                    title="Скопировать Telegram ID"
                    className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-200 hover:text-white text-[14px] font-mono flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
                  >
                    {copiedTgId ? (
                      <>
                        <Check className="w-4 h-4 text-rose-500" />
                        <span className="text-rose-400">Скопировано</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4 text-zinc-400" />
                        <span>Копировать</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>

            {/* Edit Profile Form / Read-only View */}
            {isEditing ? (
              <form onSubmit={handleSaveProfile} className="flex flex-col gap-3 pt-2 border-t border-zinc-800">
                <div>
                  <label className="block text-[14px] text-zinc-300 mb-1">
                    Имя автора или псевдоним:
                  </label>
                  <NoirVoiceInput
                    required
                    value={editName}
                    onValueChange={setEditName}
                    voiceContext="author_name"
                    placeholder="Александр Миронов"
                  />
                </div>

                <div>
                  <label className="block text-[14px] text-zinc-300 mb-1">
                    Контактный телефон:
                  </label>
                  <input
                    type="tel"
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                    placeholder="+7 (999) 000-00-00"
                    className="w-full min-h-[42px] px-3 noir-input text-[14px]"
                  />
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-4 py-2 bg-white text-black hover:bg-zinc-200 font-bold text-[14px] flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Save className="w-4 h-4" />
                    <span>{saving ? 'Сохранение...' : 'Сохранить'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditing(false);
                      setEditName(currentUser.name || '');
                      setEditPhone(currentUser.phone || '');
                    }}
                    className="px-3 py-2 bg-zinc-900 border border-zinc-700 hover:border-zinc-500 text-zinc-300 text-[14px] transition-colors cursor-pointer"
                  >
                    Отмена
                  </button>
                </div>
              </form>
            ) : (
              <div className="flex flex-col gap-2 pt-2 border-t border-zinc-800 text-[14px]">
                <div className="flex items-center justify-between text-zinc-300">
                  <span className="flex items-center gap-2 text-zinc-400">
                    <User className="w-4 h-4 text-rose-500" />
                    <span>Псевдоним:</span>
                  </span>
                  <span className="font-bold text-white">
                    {currentUser.name || 'Не указан'}
                  </span>
                </div>

                <div className="flex items-center justify-between text-zinc-300">
                  <span className="flex items-center gap-2 text-zinc-400">
                    <Phone className="w-4 h-4 text-rose-500" />
                    <span>Телефон:</span>
                  </span>
                  <span className="font-mono text-white">
                    {currentUser.phone || 'Не указан'}
                  </span>
                </div>

                <div className="flex items-center justify-between text-zinc-300">
                  <span className="flex items-center gap-2 text-zinc-400">
                    <Bell className="w-4 h-4 text-rose-500" />
                    <span>Telegram ID:</span>
                  </span>
                  <span className="font-mono text-white">
                    {currentUser.telegram_id
                      ? `${currentUser.telegram_id}${currentUser.telegram_verified ? ' (активен)' : ' (не проверен)'}`
                      : 'Не привязан'}
                  </span>
                </div>

                {/* Поле «О себе» из базы данных */}
                <div className="p-3 bg-zinc-950/80 border border-zinc-800 flex flex-col gap-1.5 mt-1">
                  <span className="text-[14px] font-bold text-zinc-400 tracking-wide flex items-center gap-1.5">
                    <FileText className="w-4 h-4 text-rose-500" />
                    <span>О себе:</span>
                  </span>
                  <p className="text-[14px] text-zinc-200 leading-relaxed font-['PT_Serif',serif] italic whitespace-pre-wrap">
                    {currentUser.bio && currentUser.bio.trim()
                      ? currentUser.bio
                      : 'Информация об авторе пока не заполнена. Нажмите кнопку редактирования ниже, чтобы рассказать о себе читателям.'}
                  </p>
                </div>

                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => setIsEditModalOpen(true)}
                    className="w-full min-h-[42px] px-3.5 bg-zinc-900 hover:bg-white hover:text-black border border-zinc-700 hover:border-white text-white font-bold text-[14px] flex items-center justify-center gap-2 transition cursor-pointer"
                  >
                    <Edit2 className="w-4 h-4 text-rose-500" />
                    <span>Редактировать профиль (данные, пароль, аватар)</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Quick Sign Out Button */}
          <div className="pt-4 border-t border-zinc-800 flex items-center justify-between">
            <span className="text-[14px] text-zinc-400">Сессия активна</span>
            <button
              type="button"
              onClick={onLogout}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-zinc-950 border border-zinc-800 hover:border-rose-500 text-zinc-400 hover:text-rose-400 text-[14px] transition-colors cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              <span>Выйти из кабинета</span>
            </button>
          </div>
        </div>

        {/* Studio Overview & Active Book Spotlight */}
        <div className="lg:col-span-7 flex flex-col gap-6">
          {/* Quick Stats Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3.5 noir-container border border-zinc-800 flex flex-col justify-between gap-1">
              <span className="text-[14px] text-zinc-400">Книг в работе:</span>
              <span className="font-mono text-[22px] font-black text-white">
                {books.length}
              </span>
              <button
                type="button"
                onClick={() => onNavigate('library')}
                className="text-[14px] text-rose-400 hover:text-rose-300 text-left pt-1 inline-flex items-center gap-0.5 cursor-pointer"
              >
                <span>Библиотека</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="p-3.5 noir-container border border-zinc-800 flex flex-col justify-between gap-1">
              <span className="text-[14px] text-zinc-400">Формат книги:</span>
              <span className="font-mono text-[22px] font-black text-rose-500">
                А5
              </span>
              <span className="text-[14px] text-zinc-400 pt-1">
                148 × 210 мм
              </span>
            </div>

            <div className="p-3.5 noir-container border border-zinc-800 flex flex-col justify-between gap-1">
              <span className="text-[14px] text-zinc-400">Глав в каскаде:</span>
              <span className="font-mono text-[22px] font-black text-white">
                {activeBook?.target_chapters || 100}
              </span>
              <button
                type="button"
                onClick={() => onNavigate('chapters')}
                className="text-[14px] text-rose-400 hover:text-rose-300 text-left pt-1 inline-flex items-center gap-0.5 cursor-pointer"
              >
                <span>Все главы</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="p-3.5 noir-container border border-zinc-800 flex flex-col justify-between gap-1">
              <span className="text-[14px] text-zinc-400">Тираж печати:</span>
              <span className="font-mono text-[22px] font-black text-white">
                от 1 экз.
              </span>
              <span className="text-[14px] text-zinc-400 pt-1">
                Твердый переплет
              </span>
            </div>
          </div>

          {/* Author Currency Balance - "Буквы" */}
          <div className="noir-container p-4 sm:p-5 border border-rose-500/50 bg-rose-950/20 flex flex-col gap-3.5">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 border border-rose-500 bg-black flex items-center justify-center shrink-0">
                  <Coins className="w-5 h-5 text-rose-500" />
                </div>
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[14px] text-zinc-400">Баланс валюты «Буквы»:</span>
                    <span className="text-[14px] text-rose-400 font-mono">100 000 букв = 15 ₽</span>
                    <span className="text-[14px] text-zinc-400 font-mono border-l border-zinc-700 pl-2">
                      Подписка: 0 ₽ / мес
                    </span>
                  </div>
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="font-mono text-[24px] sm:text-[28px] font-black text-white">
                      {(currentUser.letters_balance ?? 1000000).toLocaleString('ru-RU')}
                    </span>
                    <span className="text-rose-500 font-bold text-[16px]">букв</span>
                    <span className="text-[14px] text-zinc-300 font-mono">
                      (≈ {Math.round(((currentUser.letters_balance ?? 1000000) / 100000) * 15).toLocaleString('ru-RU')} ₽)
                    </span>
                  </div>
                  <p className="text-[14px] text-zinc-300">
                    1 токен ИИ = 1 буква. Расход только за фактический анализ текста и глав. Без ежемесячных списаний.
                  </p>
                </div>
              </div>

              <div className="shrink-0 flex flex-wrap sm:flex-col items-stretch sm:items-end gap-2 w-full sm:w-auto justify-between sm:justify-start border-t sm:border-t-0 border-zinc-800 pt-2 sm:pt-0">
                <button
                  type="button"
                  onClick={() => setIsPricingModalOpen(true)}
                  className="px-3.5 py-2 bg-rose-600 hover:bg-rose-500 text-white text-[14px] font-mono font-bold transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <Coins className="w-4 h-4 text-white" />
                  <span>Пополнить / Калькулятор</span>
                </button>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onNavigate('balance')}
                    className="relative px-3 py-1.5 bg-black hover:bg-zinc-900 border border-zinc-700 hover:border-white text-zinc-200 hover:text-white text-[14px] font-mono transition-colors cursor-pointer inline-flex items-center gap-1.5"
                  >
                    <History className="w-4 h-4 text-rose-500" />
                    <span>История операций</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onNavigate('notifications')}
                    className="relative px-3 py-1.5 bg-black hover:bg-zinc-900 border border-zinc-700 hover:border-white text-zinc-200 hover:text-white text-[14px] font-mono transition-colors cursor-pointer inline-flex items-center gap-1.5"
                  >
                    <Bell className="w-4 h-4 text-rose-500" />
                    <span>Уведомления</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Discounts teaser bar */}
            <div className="pt-2 border-t border-zinc-800/80 flex flex-wrap items-center justify-between gap-2 text-[14px] text-zinc-400 font-mono">
              <span className="text-rose-400">Скидки при покупке букв:</span>
              <span>10 млн = -10% (1 350 ₽)</span>
              <span>100 млн = -20% (12 000 ₽)</span>
              <span>1 млрд = -33% (100 000 ₽)</span>
              <span>Мин. платеж 15 ₽</span>
            </div>
          </div>

          {/* Active Book Spotlight Card */}
          <div className="noir-container p-4 sm:p-6 border-2 border-white flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3 border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-rose-500 shrink-0" />
                <h2 className="text-[17px] sm:text-[19px] font-bold text-white">
                  Текущая активная книга
                </h2>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('library')}
                className="text-[14px] text-zinc-300 hover:text-white underline cursor-pointer"
              >
                Сменить книгу
              </button>
            </div>

            {activeBook ? (
              <div className="flex flex-col sm:flex-row items-start gap-4">
                {activeBook.cover_config?.frontImageUrl ? (
                  <div className="w-24 sm:w-28 aspect-[3/4] bg-zinc-900 border border-zinc-700 shrink-0 overflow-hidden">
                    <img
                      src={activeBook.cover_config.frontImageUrl}
                      alt={activeBook.title}
                      className="w-full h-full object-cover"
                    />
                  </div>
                ) : (
                  <div className="w-24 sm:w-28 aspect-[3/4] bg-zinc-950 border border-zinc-800 shrink-0 flex flex-col items-center justify-center p-2 text-center">
                    <BookOpen className="w-8 h-8 text-rose-500 mb-1" />
                    <span className="text-[14px] text-zinc-500 font-mono">Макет А5</span>
                  </div>
                )}

                <div className="flex-1 min-w-0 flex flex-col gap-2">
                  <div>
                    <h3 className="text-[18px] sm:text-[20px] font-bold text-white truncate">
                      {activeBook.title}
                    </h3>
                    <p className="text-[14px] text-zinc-400 mt-0.5 line-clamp-2">
                      {activeBook.subtitle || activeBook.synopsis_overview || 'Книга в процессе проектирования и генерации глав.'}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    {activeBook.genres.map((g) => (
                      <span
                        key={g}
                        className="px-2 py-0.5 bg-zinc-900 border border-zinc-700 text-zinc-300 text-[14px] font-mono"
                      >
                        {g}
                      </span>
                    ))}
                  </div>

                  {/* Quick Action Bubble Buttons for Active Book */}
                  <div className="flex flex-wrap items-center gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => onNavigate('constructor')}
                      className="relative group inline-flex items-center gap-1.5 px-3 py-1.5 bg-zinc-950 border border-zinc-700 hover:border-white text-zinc-200 hover:text-white text-[14px] transition-colors cursor-pointer"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-rose-500" />
                      <span>Конструктор</span>
                      <span className="absolute -bottom-1 left-3 w-1.5 h-1.5 bg-zinc-950 border-r border-b border-zinc-700 rotate-45 pointer-events-none group-hover:border-white" />
                    </button>

                    <button
                      type="button"
                      onClick={() => onNavigate('chapters')}
                      className="relative group inline-flex items-center gap-1.5 px-3 py-1.5 bg-zinc-950 border border-zinc-700 hover:border-white text-zinc-200 hover:text-white text-[14px] transition-colors cursor-pointer"
                    >
                      <span>Главы ({activeBook.target_chapters})</span>
                      <span className="absolute -bottom-1 left-3 w-1.5 h-1.5 bg-zinc-950 border-r border-b border-zinc-700 rotate-45 pointer-events-none group-hover:border-white" />
                    </button>

                    <button
                      type="button"
                      onClick={() => onNavigate('cover')}
                      className="relative group inline-flex items-center gap-1.5 px-3 py-1.5 bg-zinc-950 border border-zinc-700 hover:border-white text-zinc-200 hover:text-white text-[14px] transition-colors cursor-pointer"
                    >
                      <Palette className="w-3.5 h-3.5 text-rose-500" />
                      <span>Переплет А5</span>
                      <span className="absolute -bottom-1 left-3 w-1.5 h-1.5 bg-zinc-950 border-r border-b border-zinc-700 rotate-45 pointer-events-none group-hover:border-white" />
                    </button>

                    <button
                      type="button"
                      onClick={() => onNavigate('reader')}
                      className="relative group inline-flex items-center gap-1.5 px-3 py-1.5 bg-zinc-950 border border-zinc-700 hover:border-white text-zinc-200 hover:text-white text-[14px] transition-colors cursor-pointer"
                    >
                      <Glasses className="w-3.5 h-3.5 text-rose-500" />
                      <span>Читалка</span>
                      <span className="absolute -bottom-1 left-3 w-1.5 h-1.5 bg-zinc-950 border-r border-b border-zinc-700 rotate-45 pointer-events-none group-hover:border-white" />
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-6 bg-zinc-950/60 border border-zinc-800 text-center flex flex-col items-center justify-center gap-3">
                <p className="text-[14px] text-zinc-400">
                  У вас пока не выбрана активная книга. Создайте первую книгу или выберите из библиотеки:
                </p>
                <div className="flex items-center gap-3">
                  <NoirButton variant="primary" onClick={onOpenNewBookModal}>
                    Создать первую книгу
                  </NoirButton>
                  <NoirButton variant="subtle" onClick={() => onNavigate('library')}>
                    Открыть библиотеку
                  </NoirButton>
                </div>
              </div>
            )}
          {/* Active Book Spotlight Card */}
          </div>
        </div>
      </div>

      {/* 2a. Mobile & Desktop PWA Install Button + Device Web Push Controls */}
      <PWAInstallButton />
      <DevicePushPanel userUid={currentUser.uid} />

      {/* 2b. Telegram Notifications Integration & Bot Verification */}
      <TelegramConnectCard
        currentUser={currentUser}
        onUserUpdated={onUserUpdated}
      />

      {/* 2c. Telegram Mini App & Referral Program */}
      <TelegramReferralCard
        currentUser={currentUser}
        onUserUpdated={onUserUpdated}
      />

      {/* 2d. Notification Channel Preferences (Bell, Telegram & Push) */}
      <NotificationPrefsCard
        currentUser={currentUser}
        onUserUpdated={onUserUpdated}
      />

      {/* 3. Author Hub: Quick Navigation Across All Cabinet Tools */}
      <div className="noir-container p-4 sm:p-6 border border-white/40 flex flex-col gap-4">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
          <h2 className="text-[18px] sm:text-[20px] font-bold text-white">
            Инструменты фабрики книг
          </h2>
          <span className="text-[14px] text-zinc-400">
            Быстрый переход к разделу
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          <button
            type="button"
            onClick={() => onNavigate('library')}
            className="p-4 bg-zinc-950/80 hover:bg-zinc-900 border border-zinc-800 hover:border-white flex flex-col justify-between gap-3 text-left transition-all cursor-pointer group"
          >
            <div className="flex items-center justify-between">
              <div className="w-8 h-8 flex items-center justify-center bg-transparent border-0">
                <Library className="w-5 h-5 text-rose-500" />
              </div>
              <ChevronRight className="w-4 h-4 text-zinc-500 group-hover:text-white transition-colors" />
            </div>
            <div>
              <h3 className="font-bold text-white text-[15px]">Библиотека</h3>
              <p className="text-[14px] text-zinc-400 mt-0.5 leading-snug">
                Каталог ваших рукописей и статус печати
              </p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('constructor')}
            className="p-4 bg-zinc-950/80 hover:bg-zinc-900 border border-zinc-800 hover:border-white flex flex-col justify-between gap-3 text-left transition-all cursor-pointer group"
          >
            <div className="flex items-center justify-between">
              <div className="w-8 h-8 flex items-center justify-center bg-transparent border-0">
                <BookOpen className="w-5 h-5 text-rose-500" />
              </div>
              <ChevronRight className="w-4 h-4 text-zinc-500 group-hover:text-white transition-colors" />
            </div>
            <div>
              <h3 className="font-bold text-white text-[15px]">Конструктор</h3>
              <p className="text-[14px] text-zinc-400 mt-0.5 leading-snug">
                Генератор вселенной и смешение 100 жанров
              </p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('chapters')}
            className="p-4 bg-zinc-950/80 hover:bg-zinc-900 border border-zinc-800 hover:border-white flex flex-col justify-between gap-3 text-left transition-all cursor-pointer group"
          >
            <div className="flex items-center justify-between">
              <div className="w-8 h-8 flex items-center justify-center bg-transparent border-0">
                <Sparkles className="w-5 h-5 text-rose-500" />
              </div>
              <ChevronRight className="w-4 h-4 text-zinc-500 group-hover:text-white transition-colors" />
            </div>
            <div>
              <h3 className="font-bold text-white text-[15px]">Главы книги</h3>
              <p className="text-[14px] text-zinc-400 mt-0.5 leading-snug">
                Каскад до 100 глав и генерация иллюстраций
              </p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('characters')}
            className="p-4 bg-zinc-950/80 hover:bg-zinc-900 border border-zinc-800 hover:border-white flex flex-col justify-between gap-3 text-left transition-all cursor-pointer group"
          >
            <div className="flex items-center justify-between">
              <div className="w-8 h-8 flex items-center justify-center bg-transparent border-0">
                <User className="w-5 h-5 text-rose-500" />
              </div>
              <ChevronRight className="w-4 h-4 text-zinc-500 group-hover:text-white transition-colors" />
            </div>
            <div>
              <h3 className="font-bold text-white text-[15px]">Персонажи</h3>
              <p className="text-[14px] text-zinc-400 mt-0.5 leading-snug">
                Библия героев и коллажи с ракурсами
              </p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('cover')}
            className="p-4 bg-zinc-950/80 hover:bg-zinc-900 border border-zinc-800 hover:border-white flex flex-col justify-between gap-3 text-left transition-all cursor-pointer group"
          >
            <div className="flex items-center justify-between">
              <div className="w-8 h-8 flex items-center justify-center bg-transparent border-0">
                <Palette className="w-5 h-5 text-rose-500" />
              </div>
              <ChevronRight className="w-4 h-4 text-zinc-500 group-hover:text-white transition-colors" />
            </div>
            <div>
              <h3 className="font-bold text-white text-[15px]">Переплет А5</h3>
              <p className="text-[14px] text-zinc-400 mt-0.5 leading-snug">
                Лицевая часть, расчет корешка и PDF экспорт
              </p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('reader')}
            className="p-4 bg-zinc-950/80 hover:bg-zinc-900 border border-zinc-800 hover:border-white flex flex-col justify-between gap-3 text-left transition-all cursor-pointer group"
          >
            <div className="flex items-center justify-between">
              <div className="w-8 h-8 flex items-center justify-center bg-transparent border-0">
                <Glasses className="w-5 h-5 text-rose-500" />
              </div>
              <ChevronRight className="w-4 h-4 text-zinc-500 group-hover:text-white transition-colors" />
            </div>
            <div>
              <h3 className="font-bold text-white text-[15px]">Читалка</h3>
              <p className="text-[14px] text-zinc-400 mt-0.5 leading-snug">
                Интерактивное перелистывание страниц
              </p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('gallery')}
            className="p-4 bg-zinc-950/80 hover:bg-zinc-900 border border-zinc-800 hover:border-white flex flex-col justify-between gap-3 text-left transition-all cursor-pointer group"
          >
            <div className="flex items-center justify-between">
              <div className="w-8 h-8 flex items-center justify-center bg-transparent border-0">
                <ImageIcon className="w-5 h-5 text-rose-500" />
              </div>
              <ChevronRight className="w-4 h-4 text-zinc-500 group-hover:text-white transition-colors" />
            </div>
            <div>
              <h3 className="font-bold text-white text-[15px]">Медиа-галерея</h3>
              <p className="text-[14px] text-zinc-400 mt-0.5 leading-snug">
                Загрузка артов без фона и папки файлов
              </p>
            </div>
          </button>

          {isAdmin && (
            <button
              type="button"
              onClick={() => onNavigate('admin')}
              className="p-4 bg-zinc-950/80 hover:bg-rose-950/40 border border-rose-500/50 hover:border-rose-500 flex flex-col justify-between gap-3 text-left transition-all cursor-pointer group"
            >
              <div className="flex items-center justify-between">
                <div className="w-8 h-8 flex items-center justify-center bg-transparent border-0">
                  <Shield className="w-5 h-5 text-rose-500" />
                </div>
                <ChevronRight className="w-4 h-4 text-zinc-500 group-hover:text-white transition-colors" />
              </div>
              <div>
                <h3 className="font-bold text-white text-[15px]">Админка</h3>
                <p className="text-[14px] text-zinc-400 mt-0.5 leading-snug">
                  Управление базой данных и таблицами
                </p>
              </div>
            </button>
          )}
        </div>
      </div>

      {/* 4. Support & Legal Footer Block */}
      <div className="p-4 sm:p-6 noir-container border border-zinc-800 flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex flex-col gap-1 text-[14px]">
            <span className="font-bold text-white">Техническая поддержка и правовые документы</span>
            <span className="text-zinc-400">
              Вопросы по оплате через Робокассу, возвратам (10 дней) и работе сервиса:{' '}
              <a href="mailto:info@arenda-ropa.com" className="text-rose-400 underline font-mono">
                info@arenda-ropa.com
              </a>
            </span>
          </div>

          <a
            href="https://t.me/+ULtw-EChQE1lNTI6"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-zinc-950 border border-zinc-700 hover:border-white text-zinc-200 hover:text-white text-[14px] transition-colors shrink-0 rounded-none"
          >
            <span>Чат в Telegram</span>
            <ExternalLink className="w-3.5 h-3.5 text-rose-500" />
          </a>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 pt-2 border-t border-zinc-800/80">
          {[
            { route: 'oferta' as AppRoute, label: 'Публичная оферта' },
            { route: 'agreement' as AppRoute, label: 'Пользовательское соглашение' },
            { route: 'privacy' as AppRoute, label: 'Политика конфиденциальности' },
            { route: 'consent' as AppRoute, label: 'Согласие на обработку ПД' },
          ].map((doc) => (
            <button
              key={doc.route}
              type="button"
              onClick={() => onNavigate(doc.route)}
              className="relative group px-3 py-1.5 min-h-[38px] bg-zinc-950 border border-zinc-700 hover:border-white text-zinc-200 hover:text-white text-[14px] transition-colors cursor-pointer rounded-none"
            >
              <span>{doc.label}</span>
              <span className="absolute -bottom-1 left-3 w-1.5 h-1.5 bg-zinc-950 border-r border-b border-zinc-700 rotate-45 pointer-events-none group-hover:border-white" />
            </button>
          ))}
        </div>
      </div>

      {/* Letters Pricing & Purchase Modal */}
      <LettersPricingModal
        isOpen={isPricingModalOpen}
        onClose={() => setIsPricingModalOpen(false)}
        currentUser={currentUser}
        onNavigate={onNavigate}
        onBalanceUpdated={(newBal) => {
          onUserUpdated({ ...currentUser, letters_balance: newBal });
        }}
      />

      {/* Full Edit Profile Modal */}
      {isEditModalOpen && (
        <EditProfileModal
          isOpen={isEditModalOpen}
          onClose={() => setIsEditModalOpen(false)}
          currentUser={currentUser}
          onUserUpdated={(updated) => {
            onUserUpdated(updated);
            setEditName(updated.name || '');
            setEditPhone(updated.phone || '');
          }}
        />
      )}
    </div>
  );
};
