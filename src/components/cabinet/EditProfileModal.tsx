import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, User, KeyRound, Image as ImageIcon, Sparkles, Upload, Check, AlertCircle, Save } from 'lucide-react';
import { AppUser } from '../../types';
import { updateUserProfile } from '../../services/auth/authService';
import { FileUploadService } from '../../services/upload/FileUploadService';
import { KNIG_ROUND_URL } from '../../constants/assets';
import { NoirVoiceInput } from '../voice/NoirVoiceInput';
import { NoirVoiceTextarea } from '../voice/NoirVoiceTextarea';

interface EditProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: AppUser;
  onUserUpdated: (user: AppUser) => void;
}

const NOIR_AVATAR_PRESETS = [
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=300&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=300&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=300&auto=format&fit=crop&q=80',
];

export const EditProfileModal: React.FC<EditProfileModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onUserUpdated,
}) => {
  const [activeTab, setActiveTab] = useState<'info' | 'password' | 'avatar'>('info');

  // Form states
  const [name, setName] = useState(currentUser.name || '');
  const [phone, setPhone] = useState(currentUser.phone || '');
  const [email, setEmail] = useState(currentUser.email || '');
  const [telegramId, setTelegramId] = useState(currentUser.telegram_id || '');
  const [bio, setBio] = useState(currentUser.bio || '');

  // Password states
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Avatar states
  const [avatarUrl, setAvatarUrl] = useState(currentUser.avatar_url || '');
  const [avatarPrompt, setAvatarPrompt] = useState('Noir style author portrait, dramatic cinematic contrast, black and white ink, mysterious gaze.');
  const [genLoading, setGenLoading] = useState(false);

  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || typeof document === 'undefined') return null;

  const handleSaveInfo = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const updated = await updateUserProfile(currentUser.uid, {
        name,
        phone,
        email,
        bio,
        telegram_id: telegramId.trim() || null,
        telegram_verified:
          telegramId.trim() === (currentUser.telegram_id || '')
            ? currentUser.telegram_verified
            : false,
      });
      onUserUpdated(updated);
      setSuccessMsg('Личные данные успешно обновлены');
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Ошибка обновления профиля');
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!newPassword || newPassword.length < 6) {
      setErrorMsg('Новый пароль должен содержать минимум 6 символов');
      return;
    }
    if (newPassword !== confirmPassword) {
      setErrorMsg('Новый пароль и подтверждение не совпадают');
      return;
    }

    setSaving(true);
    try {
      // Update password in user profile / DB
      const updated = await updateUserProfile(currentUser.uid, {
        password: newPassword,
      });
      onUserUpdated(updated);
      setSuccessMsg('Пароль успешно изменен');
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Не удалось изменить пароль');
    } finally {
      setSaving(false);
    }
  };

  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 15 * 1024 * 1024) {
      setErrorMsg('Файл аватарки слишком велик (макс 15 МБ)');
      return;
    }
    setUploadingAvatar(true);
    setErrorMsg(null);
    try {
      const uploader = new FileUploadService();
      const fileRecord = await uploader.uploadFileAndRegister(file, null, true, {
        title: `Аватар — ${currentUser.name || 'Пользователь'}`,
        description: `Аватар пользователя ${currentUser.email} (UID: ${currentUser.uid})`,
      });
      const resolvedUrl = fileRecord.original_url || fileRecord.short_url || '';
      setAvatarUrl(resolvedUrl);
      const updated = await updateUserProfile(currentUser.uid, { avatar_url: resolvedUrl });
      onUserUpdated(updated);
      setSuccessMsg('Аватарка успешно загружена в хранилище и сохранена!');
      setTimeout(() => setSuccessMsg(null), 3500);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Ошибка загрузки аватарки в хранилище');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleApplyPresetAvatar = async (url: string) => {
    if (!url.trim()) return;
    setSaving(true);
    setErrorMsg(null);
    try {
      let resolvedUrl = url.trim();
      setAvatarUrl(resolvedUrl);
      const updated = await updateUserProfile(currentUser.uid, { avatar_url: resolvedUrl });
      onUserUpdated(updated);
      setSuccessMsg('Аватарка сохранена в профиле!');
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Не удалось сохранить аватарку');
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[500] flex items-center justify-center p-2.5 sm:p-4 bg-black/55 backdrop-blur-md overflow-y-auto select-none"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-full max-w-xl my-auto noir-modal border-2 border-white shadow-2xl flex flex-col text-white max-h-[90dvh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-zinc-800 bg-black">
          <div className="flex items-center gap-2">
            <User className="w-5 h-5 text-rose-500" />
            <h3 className="text-[17px] font-bold text-white">
              Редактирование профиля автора
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center text-zinc-400 hover:text-white border border-transparent hover:border-zinc-700 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="grid grid-cols-1 sm:grid-cols-3 border-b border-zinc-800 bg-zinc-900/90 text-[14px]">
          <button
            type="button"
            onClick={() => { setActiveTab('info'); setErrorMsg(null); setSuccessMsg(null); }}
            className={`py-3 px-2 font-bold text-center border-b-2 transition cursor-pointer flex items-center justify-center gap-1.5 ${
              activeTab === 'info'
                ? 'border-rose-500 text-white bg-black/50'
                : 'border-transparent text-zinc-400 hover:text-white'
            }`}
          >
            <User className="w-4 h-4 text-rose-500" />
            <span>Личные данные</span>
          </button>
          <button
            type="button"
            onClick={() => { setActiveTab('password'); setErrorMsg(null); setSuccessMsg(null); }}
            className={`py-3 px-2 font-bold text-center border-b-2 transition cursor-pointer flex items-center justify-center gap-1.5 ${
              activeTab === 'password'
                ? 'border-rose-500 text-white bg-black/50'
                : 'border-transparent text-zinc-400 hover:text-white'
            }`}
          >
            <KeyRound className="w-4 h-4 text-rose-500" />
            <span>Смена пароля</span>
          </button>
          <button
            type="button"
            onClick={() => { setActiveTab('avatar'); setErrorMsg(null); setSuccessMsg(null); }}
            className={`py-3 px-2 font-bold text-center border-b-2 transition cursor-pointer flex items-center justify-center gap-1.5 ${
              activeTab === 'avatar'
                ? 'border-rose-500 text-white bg-black/50'
                : 'border-transparent text-zinc-400 hover:text-white'
            }`}
          >
            <ImageIcon className="w-4 h-4 text-rose-500" />
            <span>Аватарка</span>
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto flex flex-col gap-4">
          {errorMsg && (
            <div className="p-3 bg-rose-950/40 border border-rose-500 text-rose-300 text-[14px] flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3 bg-zinc-900 border border-white text-zinc-100 text-[14px] flex items-center gap-2">
              <Check className="w-4 h-4 text-rose-500 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Tab 1: Personal Data */}
          {activeTab === 'info' && (
            <form onSubmit={handleSaveInfo} className="flex flex-col gap-4">
              <div>
                <label className="block text-[14px] font-bold text-white mb-1">
                  Имя автора / Псевдоним:
                </label>
                <NoirVoiceInput
                  value={name}
                  onValueChange={setName}
                  voiceContext="author_name"
                  placeholder="Лев Вершинин"
                  required
                />
              </div>

              <div>
                <label className="block text-[14px] font-bold text-white mb-1">
                  Контактный телефон:
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full min-h-[44px] px-3.5 noir-input text-[14px]"
                  placeholder="+7 (999) 000-00-00"
                />
              </div>

              <div>
                <label className="block text-[14px] font-bold text-white mb-1">
                  Электронная почта (Email):
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full min-h-[44px] px-3.5 noir-input text-[14px]"
                  placeholder="author@example.com"
                  required
                />
              </div>

              <div>
                <label className="block text-[14px] font-bold text-white mb-1">
                  Telegram ID (проверяется кнопкой теста в профиле):
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={telegramId}
                  onChange={(e) => setTelegramId(e.target.value)}
                  className="w-full min-h-[44px] px-3.5 noir-input text-[14px] font-mono"
                  placeholder="169262990"
                />
              </div>

              <div>
                <label className="block text-[14px] font-bold text-white mb-1">
                  О себе / Авторский статус:
                </label>
                <NoirVoiceTextarea
                  minRows={3}
                  maxRows={8}
                  value={bio}
                  onValueChange={setBio}
                  voiceContext="author_bio"
                  enableAiPolish={true}
                  placeholder="Писатель, автор серии исторических и фантастических романов..."
                />
              </div>

              <button
                type="submit"
                disabled={saving}
                className="mt-2 min-h-[44px] px-5 bg-white text-black hover:bg-zinc-200 font-bold transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 text-[14px]"
              >
                <Save className="w-4 h-4 text-black" />
                <span>{saving ? 'Сохранение...' : 'Сохранить личные данные'}</span>
              </button>
            </form>
          )}

          {/* Tab 2: Change Password */}
          {activeTab === 'password' && (
            <form onSubmit={handleChangePassword} className="flex flex-col gap-4">
              <div>
                <label className="block text-[14px] font-bold text-white mb-1">
                  Текущий пароль:
                </label>
                <input
                  type="password"
                  value={oldPassword}
                  onChange={(e) => setOldPassword(e.target.value)}
                  className="w-full min-h-[44px] px-3.5 noir-input text-[14px]"
                  placeholder="••••••••"
                />
              </div>

              <div>
                <label className="block text-[14px] font-bold text-white mb-1">
                  Новый пароль:
                </label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full min-h-[44px] px-3.5 noir-input text-[14px]"
                  placeholder="Минимум 6 символов"
                  required
                />
              </div>

              <div>
                <label className="block text-[14px] font-bold text-white mb-1">
                  Повторите новый пароль:
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full min-h-[44px] px-3.5 noir-input text-[14px]"
                  placeholder="Повтор пароля"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={saving}
                className="mt-2 min-h-[44px] px-5 bg-rose-600 hover:bg-rose-500 text-white font-bold transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 text-[14px]"
              >
                <KeyRound className="w-4 h-4 text-white" />
                <span>{saving ? 'Обновление пароля...' : 'Сменить пароль'}</span>
              </button>
            </form>
          )}

          {/* Tab 3: Avatar */}
          {activeTab === 'avatar' && (
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-4 p-3 bg-black/60 border border-zinc-800">
                <div className="w-16 h-16 border-2 border-white overflow-hidden shrink-0 bg-zinc-900 flex items-center justify-center">
                  <img
                    src={avatarUrl || KNIG_ROUND_URL}
                    alt="Аватарка"
                    className="w-full h-full object-cover"
                  />
                </div>
                <div>
                  <h4 className="text-[14px] font-bold text-white">Текущая аватарка</h4>
                  <p className="text-[14px] text-zinc-400">Отображается в профиле, комментариях и читательском сообществе</p>
                </div>
              </div>

              {/* Upload file */}
              <div className="flex flex-col gap-2 p-3 bg-zinc-950 border border-zinc-800">
                <span className="text-[14px] font-bold text-white">Загрузить файл с устройства в базу данных:</span>
                <label className="min-h-[44px] px-4 bg-zinc-900 border border-zinc-700 hover:border-white text-white font-bold transition flex items-center justify-center gap-2 cursor-pointer text-[14px]">
                  {uploadingAvatar ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-rose-500 animate-spin" />
                      <span>Загрузка в защищенное хранилище...</span>
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4 text-rose-500" />
                      <span>Выбрать изображение с устройства (PNG, JPG)</span>
                    </>
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    disabled={uploadingAvatar}
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </label>
              </div>

              {/* URL Input */}
              <div className="flex flex-col gap-2 p-3 bg-zinc-950 border border-zinc-800">
                <span className="text-[14px] font-bold text-white">Или введите ссылку (URL):</span>
                <div className="flex items-center gap-2">
                  <input
                    type="url"
                    value={avatarUrl}
                    onChange={(e) => setAvatarUrl(e.target.value)}
                    placeholder="https://example.com/photo.jpg"
                    className="flex-1 min-h-[44px] px-3 noir-input text-[14px]"
                  />
                  <button
                    type="button"
                    onClick={() => handleApplyPresetAvatar(avatarUrl)}
                    className="min-h-[44px] px-4 bg-white text-black font-bold text-[14px] hover:bg-zinc-200 cursor-pointer"
                  >
                    Применить
                  </button>
                </div>
              </div>

              {/* Presets */}
              <div className="flex flex-col gap-2">
                <span className="text-[14px] font-bold text-white">Авторские нуар-пресеты:</span>
                <div className="grid grid-cols-4 gap-2">
                  {NOIR_AVATAR_PRESETS.map((preset, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleApplyPresetAvatar(preset)}
                      className="w-full aspect-square border-2 border-zinc-700 hover:border-rose-500 overflow-hidden cursor-pointer transition"
                    >
                      <img src={preset} alt={`Пресет ${idx + 1}`} className="w-full h-full object-cover grayscale" />
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};
