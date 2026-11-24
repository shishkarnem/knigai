import React, { useEffect, useState } from 'react';
import { Mail, Sparkles, Lock, User, Phone, LogIn, UserPlus, Send, KeyRound } from 'lucide-react';
import { NoirModal } from '../common/NoirModal';
import { NoirButton } from '../common/NoirButton';
import { AppRoute, AppUser } from '../../types';
import { loginUser, registerUser } from '../../services/auth/authService';
import {
  authenticateWithTelegramWebApp,
  isRunningInsideTelegramWebApp,
} from '../../services/auth/telegramWebAppAuth';
import { LegalLinksStrip } from '../billing/LegalLinksStrip';
import { recordUserConsent } from '../billing/robokassaApi';
import { ForgotPasswordPanel } from './ForgotPasswordPanel';

interface AuthModalNoirProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (user: AppUser) => void;
  onNavigate?: (route: AppRoute) => void;
  initialMessage?: string;
  initialMode?: 'login' | 'register' | 'forgot';
  initialResetToken?: string;
  initialResetEmail?: string;
}

export const AuthModalNoir: React.FC<AuthModalNoirProps> = ({
  isOpen,
  onClose,
  onSuccess,
  onNavigate,
  initialMessage,
  initialMode = 'login',
  initialResetToken = '',
  initialResetEmail = '',
}) => {
  const [activeTab, setActiveTab] = useState<'login' | 'register' | 'forgot'>(
    initialResetToken ? 'forgot' : initialMode
  );

  // Login form state
  const [loginEmail, setLoginEmail] = useState(initialResetEmail || '');
  const [loginPassword, setLoginPassword] = useState('');

  // Register form state
  const [regName, setRegName] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');
  const [regConsentAccepted, setRegConsentAccepted] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const inTelegramMiniApp = isRunningInsideTelegramWebApp();

  useEffect(() => {
    if (initialResetToken) {
      setActiveTab('forgot');
      if (initialResetEmail) setLoginEmail(initialResetEmail);
    } else if (initialMode) {
      setActiveTab(initialMode);
    }
  }, [initialMode, initialResetToken, initialResetEmail]);

  const handleTelegramMiniAppLogin = async () => {
    setError('');
    setLoading(true);
    try {
      const { user } = await authenticateWithTelegramWebApp();
      onSuccess(user);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Ошибка входа через Telegram Mini App');
    } finally {
      setLoading(false);
    }
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const user = await loginUser(loginEmail, loginPassword);
      onSuccess(user);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Ошибка при входе');
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!regConsentAccepted) {
      setError('Для регистрации необходимо подтвердить согласие с офертой, пользовательским соглашением и обработкой персональных данных.');
      return;
    }
    setLoading(true);
    try {
      const user = await registerUser({
        name: regName,
        phone: regPhone,
        email: regEmail,
        password: regPassword,
        confirmPassword: regConfirmPassword,
      });
      await recordUserConsent({
        userUid: user.uid,
        email: user.email,
        context: 'registration',
        documents: ['oferta', 'agreement', 'privacy', 'consent'],
      });
      onSuccess(user);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Ошибка при регистрации');
    } finally {
      setLoading(false);
    }
  };

  return (
    <NoirModal
      isOpen={isOpen}
      onClose={onClose}
      title="Личный кабинет KnigAI"
      maxWidth="max-w-md"
    >
      <div className="flex flex-col gap-4 text-white">
        {initialMessage && (
          <p className="text-[14px] text-zinc-300 leading-relaxed p-2.5 bg-transparent border-0">
            {initialMessage}
          </p>
        )}

        {inTelegramMiniApp && (
          <div className="p-3 border border-rose-500/70 bg-rose-950/25 flex flex-col gap-2">
            <span className="text-[14px] text-zinc-200">
              Обнаружен Telegram Mini App: вход и регистрация выполняются автоматически с проверкой HMAC-SHA256.
            </span>
            <NoirButton
              variant="primary"
              type="button"
              onClick={handleTelegramMiniAppLogin}
              loading={loading}
              icon={<Send className="w-4 h-4 text-black" />}
              showTail={true}
              className="w-full"
            >
              Войти через Telegram Mini App
            </NoirButton>
          </div>
        )}

            {/* Tab selector: Login vs Register */}
            <div className="grid grid-cols-2 gap-2 border-b border-zinc-800 pb-2">
              <button
                type="button"
                onClick={() => {
                  setActiveTab('login');
                  setError('');
                }}
                className={`min-h-[42px] px-4 font-bold text-[14px] border flex items-center justify-center gap-2 transition cursor-pointer ${
                  activeTab === 'login'
                    ? 'bg-white text-black border-white'
                    : 'bg-zinc-950/70 text-zinc-400 border-zinc-800 hover:text-white'
                }`}
              >
                <LogIn className="w-4 h-4" />
                <span>Вход</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTab('register');
                  setError('');
                }}
                className={`min-h-[42px] px-4 font-bold text-[14px] border flex items-center justify-center gap-2 transition cursor-pointer ${
                  activeTab === 'register'
                    ? 'bg-white text-black border-white'
                    : 'bg-zinc-950/70 text-zinc-400 border-zinc-800 hover:text-white'
                }`}
              >
                <UserPlus className="w-4 h-4" />
                <span>Регистрация</span>
              </button>
            </div>

            {/* 1. Tab: Login */}
            {activeTab === 'login' && (
              <form onSubmit={handleLoginSubmit} className="flex flex-col gap-3.5">
                <div>
                  <label className="block text-[14px] font-bold text-white mb-1 flex items-center gap-1.5">
                    <Mail className="w-4 h-4 text-zinc-400" />
                    Адрес электронной почты:
                  </label>
                  <input
                    type="email"
                    required
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    placeholder="author@knigai.ru"
                    className="w-full min-h-[44px] px-3.5 noir-input text-[14px]"
                  />
                </div>

                <div>
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                    <label className="text-[14px] font-bold text-white flex items-center gap-1.5">
                      <Lock className="w-4 h-4 text-zinc-400" />
                      Пароль:
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setError('');
                        setActiveTab('forgot');
                      }}
                      className="text-[14px] text-rose-400 hover:text-rose-300 underline underline-offset-4 flex items-center gap-1 cursor-pointer"
                    >
                      <KeyRound className="w-3.5 h-3.5" />
                      <span>Забыли пароль?</span>
                    </button>
                  </div>
                  <input
                    type="password"
                    required
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="Введите ваш пароль"
                    className="w-full min-h-[44px] px-3.5 noir-input text-[14px]"
                  />
                </div>

                {error && (
                  <div className="p-3 bg-rose-950/60 border border-rose-800 text-rose-200 text-[14px] flex flex-col gap-2">
                    <span>{error}</span>
                    <button
                      type="button"
                      onClick={() => {
                        setError('');
                        setActiveTab('forgot');
                      }}
                      className="self-start text-[14px] text-white hover:text-rose-300 underline underline-offset-4 cursor-pointer"
                    >
                      Восстановить пароль по email &rarr;
                    </button>
                  </div>
                )}

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-800">
                  <NoirButton variant="subtle" type="button" onClick={onClose}>
                    Отмена
                  </NoirButton>
                  <NoirButton
                    variant="primary"
                    type="submit"
                    loading={loading}
                    icon={<Sparkles className="w-4 h-4 text-black" />}
                  >
                    Войти
                  </NoirButton>
                </div>
              </form>
            )}

            {/* 3. Forgot Password View */}
            {activeTab === 'forgot' && (
              <ForgotPasswordPanel
                initialEmail={loginEmail || regEmail || initialResetEmail}
                initialToken={initialResetToken}
                onBackToLogin={(prefill) => {
                  if (prefill) setLoginEmail(prefill);
                  setError('');
                  setActiveTab('login');
                }}
                onSuccess={onSuccess}
                onClose={onClose}
              />
            )}

            {/* 2. Tab: Register */}
            {activeTab === 'register' && (
              <form onSubmit={handleRegisterSubmit} className="flex flex-col gap-3">
                <div>
                  <label className="block text-[14px] font-bold text-white mb-1 flex items-center gap-1.5">
                    <User className="w-4 h-4 text-zinc-400" />
                    Фамилия, Имя, Отчество (ФИО):
                  </label>
                  <input
                    type="text"
                    required
                    value={regName}
                    onChange={(e) => setRegName(e.target.value)}
                    placeholder="Например: Иванов Иван Иванович"
                    className="w-full min-h-[44px] px-3.5 noir-input text-[14px]"
                  />
                </div>

                <div>
                  <label className="block text-[14px] font-bold text-white mb-1 flex items-center gap-1.5">
                    <Phone className="w-4 h-4 text-zinc-400" />
                    Контактный телефон:
                  </label>
                  <input
                    type="tel"
                    required
                    value={regPhone}
                    onChange={(e) => setRegPhone(e.target.value)}
                    placeholder="+7 (999) 000-00-00"
                    className="w-full min-h-[44px] px-3.5 noir-input text-[14px]"
                  />
                </div>

                <div>
                  <label className="block text-[14px] font-bold text-white mb-1 flex items-center gap-1.5">
                    <Mail className="w-4 h-4 text-zinc-400" />
                    Адрес электронной почты:
                  </label>
                  <input
                    type="email"
                    required
                    value={regEmail}
                    onChange={(e) => setRegEmail(e.target.value)}
                    placeholder="author@knigai.ru"
                    className="w-full min-h-[44px] px-3.5 noir-input text-[14px]"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[14px] font-bold text-white mb-1 flex items-center gap-1.5">
                      <Lock className="w-4 h-4 text-zinc-400" />
                      Пароль:
                    </label>
                    <input
                      type="password"
                      required
                      value={regPassword}
                      onChange={(e) => setRegPassword(e.target.value)}
                      placeholder="Минимум 4 знака"
                      className="w-full min-h-[44px] px-3.5 noir-input text-[14px]"
                    />
                  </div>

                  <div>
                    <label className="block text-[14px] font-bold text-white mb-1 flex items-center gap-1.5">
                      <Lock className="w-4 h-4 text-zinc-400" />
                      Повтор пароля:
                    </label>
                    <input
                      type="password"
                      required
                      value={regConfirmPassword}
                      onChange={(e) => setRegConfirmPassword(e.target.value)}
                      placeholder="Повторите пароль"
                      className="w-full min-h-[44px] px-3.5 noir-input text-[14px]"
                    />
                  </div>
                </div>

                <LegalLinksStrip
                  checked={regConsentAccepted}
                  onChange={(next) => {
                    setRegConsentAccepted(next);
                    if (next) setError('');
                  }}
                  onNavigateDoc={(route) => {
                    onClose();
                    if (onNavigate) {
                      onNavigate(route);
                    } else if (typeof window !== 'undefined') {
                      window.location.assign(route === 'oferta' ? '/oferta' : `/${route}`);
                    }
                  }}
                  contextLabel="registration"
                />

                {error && (
                  <div className="p-3 bg-rose-950/60 border border-rose-800 text-rose-200 text-[14px] flex flex-col gap-2">
                    <span>{error}</span>
                    {error.toLowerCase().includes('уже зарегистрирован') && (
                      <button
                        type="button"
                        onClick={() => {
                          setLoginEmail(regEmail);
                          setError('');
                          setActiveTab('forgot');
                        }}
                        className="self-start text-[14px] text-white hover:text-rose-300 underline underline-offset-4 cursor-pointer"
                      >
                        Забыли пароль от {regEmail || 'этого аккаунта'}? Восстановить &rarr;
                      </button>
                    )}
                  </div>
                )}

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-800">
                  <NoirButton variant="subtle" type="button" onClick={onClose}>
                    Отмена
                  </NoirButton>
                  <NoirButton
                    variant="primary"
                    type="submit"
                    loading={loading}
                    disabled={loading || !regConsentAccepted}
                    icon={<UserPlus className="w-4 h-4 text-black" />}
                  >
                    Зарегистрироваться
                  </NoirButton>
                </div>
              </form>
            )}
      </div>
    </NoirModal>
  );
};
