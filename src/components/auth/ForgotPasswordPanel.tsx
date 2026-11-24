import React, { useEffect, useState } from 'react';
import {
  Mail,
  KeyRound,
  Lock,
  Eye,
  EyeOff,
  ArrowLeft,
  CheckCircle2,
  Send,
  RefreshCw,
} from 'lucide-react';
import { AppUser } from '../../types';
import { NoirButton } from '../common/NoirButton';
import {
  confirmPasswordReset,
  loginUser,
  requestPasswordReset,
  verifyPasswordReset,
} from '../../services/auth/authService';

interface ForgotPasswordPanelProps {
  initialEmail?: string;
  initialToken?: string;
  onBackToLogin: (prefillEmail?: string) => void;
  onSuccess: (user: AppUser) => void;
  onClose: () => void;
}

export const ForgotPasswordPanel: React.FC<ForgotPasswordPanelProps> = ({
  initialEmail = '',
  initialToken = '',
  onBackToLogin,
  onSuccess,
  onClose,
}) => {
  const [step, setStep] = useState<'request' | 'confirm'>(initialToken ? 'confirm' : 'request');
  const [email, setEmail] = useState(initialEmail);
  const [token, setToken] = useState(initialToken);
  const [tokenVerified, setTokenVerified] = useState(false);
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [verifyingToken, setVerifyingToken] = useState(Boolean(initialToken));
  const [cooldownSec, setCooldownSec] = useState(0);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (cooldownSec <= 0) return;
    const timer = setInterval(() => {
      setCooldownSec((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldownSec]);

  useEffect(() => {
    if (!initialToken) return;
    let cancelled = false;
    setVerifyingToken(true);
    verifyPasswordReset({ token: initialToken, email: initialEmail || undefined })
      .then((res) => {
        if (cancelled) return;
        if (res.valid) {
          setTokenVerified(true);
          if (res.email) setEmail(res.email);
          setStep('confirm');
          setNotice('Ссылка из письма подтверждена. Задайте новый пароль для входа в KnigAI.');
        } else {
          setToken('');
          setTokenVerified(false);
          setError(res.error || 'Ссылка восстановления недействительна или устарела. Запросите новое письмо.');
          setStep('request');
        }
      })
      .catch(() => {
        if (!cancelled) {
          setTokenVerified(false);
          setStep('request');
        }
      })
      .finally(() => {
        if (!cancelled) setVerifyingToken(false);
      });

    return () => {
      cancelled = true;
    };
  }, [initialToken, initialEmail]);

  const handleRequestEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setNotice('');
    setLoading(true);
    try {
      const res = await requestPasswordReset(email);
      setCooldownSec(res.cooldownSec || 60);
      setNotice(res.message);
      setToken('');
      setTokenVerified(false);
      setStep('confirm');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Не удалось отправить письмо';
      setError(msg);
      const secMatch = msg.match(/через\s+(\d+)\s+сек/i);
      if (secMatch?.[1]) {
        setCooldownSec(Number(secMatch[1]));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (cooldownSec > 0 || loading) return;
    setError('');
    setNotice('');
    setLoading(true);
    try {
      const res = await requestPasswordReset(email);
      setCooldownSec(res.cooldownSec || 60);
      setNotice(res.message);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Не удалось повторно отправить письмо');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setNotice('');
    setLoading(true);
    try {
      const result = await confirmPasswordReset({
        email: email.trim(),
        code: tokenVerified ? undefined : code.trim(),
        token: tokenVerified ? token : undefined,
        newPassword,
        confirmPassword,
      });
      if (result.user) {
        onSuccess(result.user);
        onClose();
        return;
      }
      const loggedIn = await loginUser(email.trim(), newPassword);
      onSuccess(loggedIn);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Не удалось сбросить пароль');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-3.5 text-white">
      <div className="flex items-center justify-between gap-2 pb-2 border-b border-zinc-800">
        <div className="flex items-center gap-2 min-w-0">
          <KeyRound className="w-4 h-4 text-rose-500 shrink-0" />
          <h3 className="text-[16px] font-bold text-white truncate">
            Восстановление пароля
          </h3>
        </div>
        <button
          type="button"
          onClick={() => onBackToLogin(email)}
          className="text-[14px] text-zinc-300 hover:text-white flex items-center gap-1 cursor-pointer shrink-0"
        >
          <ArrowLeft className="w-4 h-4 text-rose-500" />
          <span>Ко входу</span>
        </button>
      </div>

      {verifyingToken && (
        <div className="p-3 border border-zinc-700 bg-zinc-950/70 text-[14px] text-zinc-200 flex items-center gap-2">
          <RefreshCw className="w-4 h-4 text-rose-500 animate-spin shrink-0" />
          <span>Проверяем одноразовую ссылку восстановления...</span>
        </div>
      )}

      {notice && (
        <div className="p-3 border border-white/50 bg-zinc-950/75 text-[14px] text-zinc-100 leading-relaxed flex items-start gap-2">
          <CheckCircle2 className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
          <span>{notice}</span>
        </div>
      )}

      {step === 'request' && (
        <form onSubmit={handleRequestEmail} className="flex flex-col gap-3.5">
          <p className="text-[14px] text-zinc-300 leading-relaxed font-['PT_Serif',serif]">
            Укажите email от вашего аккаунта KnigAI. Мы отправим вам письмо с 6-значным кодом и прямой ссылкой для создания нового пароля.
          </p>

          <div>
            <label className="block text-[14px] font-bold text-white mb-1 flex items-center gap-1.5">
              <Mail className="w-4 h-4 text-zinc-400" />
              Адрес электронной почты:
            </label>
            <input
              type="email"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="author@knigai.ru"
              className="w-full min-h-[44px] px-3.5 noir-input text-[14px]"
            />
          </div>

          {error && (
            <div className="p-3 bg-rose-950/60 border border-rose-800 text-rose-200 text-[14px] break-words">
              {error}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-zinc-800">
            <button
              type="button"
              onClick={() => setStep('confirm')}
              className="text-[14px] text-zinc-300 hover:text-rose-400 underline underline-offset-4 cursor-pointer"
            >
              Уже есть код из письма?
            </button>

            <NoirButton
              variant="primary"
              type="submit"
              loading={loading}
              icon={<Send className="w-4 h-4 text-black" />}
            >
              Отправить код на почту
            </NoirButton>
          </div>
        </form>
      )}

      {step === 'confirm' && !verifyingToken && (
        <form onSubmit={handleConfirmReset} className="flex flex-col gap-3.5">
          {!tokenVerified && (
            <>
              <div>
                <label className="block text-[14px] font-bold text-white mb-1 flex items-center gap-1.5">
                  <Mail className="w-4 h-4 text-zinc-400" />
                  Email аккаунта:
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="author@knigai.ru"
                  className="w-full min-h-[44px] px-3.5 noir-input text-[14px]"
                />
              </div>

              <div>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                  <label className="text-[14px] font-bold text-white flex items-center gap-1.5">
                    <KeyRound className="w-4 h-4 text-rose-500" />
                    6-значный код из письма:
                  </label>
                  <button
                    type="button"
                    disabled={cooldownSec > 0 || loading || !email.trim()}
                    onClick={handleResend}
                    className={`text-[14px] cursor-pointer ${
                      cooldownSec > 0
                        ? 'text-zinc-500 cursor-not-allowed'
                        : 'text-rose-400 hover:text-rose-300 underline underline-offset-4'
                    }`}
                  >
                    {cooldownSec > 0 ? `Повторить через ${cooldownSec} сек.` : 'Отправить повторно'}
                  </button>
                </div>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  required
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="123456"
                  className="w-full min-h-[46px] px-3.5 noir-input text-[18px] font-mono tracking-[0.3em] text-center"
                />
              </div>
            </>
          )}

          {tokenVerified && (
            <div className="p-2.5 border border-zinc-700 bg-zinc-950/60 text-[14px] text-zinc-300">
              Аккаунт: <strong className="text-white">{email}</strong>
            </div>
          )}

          <div>
            <label className="block text-[14px] font-bold text-white mb-1 flex items-center gap-1.5">
              <Lock className="w-4 h-4 text-zinc-400" />
              Новый пароль (минимум 6 символов):
            </label>
            <div className="relative">
              <input
                type={showNewPassword ? 'text' : 'password'}
                required
                minLength={6}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Придумайте новый пароль"
                className="w-full min-h-[44px] px-3.5 pr-11 noir-input text-[14px]"
              />
              <button
                type="button"
                onClick={() => setShowNewPassword((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-zinc-400 hover:text-white cursor-pointer"
                aria-label={showNewPassword ? 'Скрыть пароль' : 'Показать пароль'}
              >
                {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-[14px] font-bold text-white mb-1 flex items-center gap-1.5">
              <Lock className="w-4 h-4 text-zinc-400" />
              Повторите новый пароль:
            </label>
            <input
              type={showNewPassword ? 'text' : 'password'}
              required
              minLength={6}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Повторите новый пароль"
              className="w-full min-h-[44px] px-3.5 noir-input text-[14px]"
            />
          </div>

          {error && (
            <div className="p-3 bg-rose-950/60 border border-rose-800 text-rose-200 text-[14px] break-words">
              {error}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-zinc-800">
            <NoirButton
              variant="subtle"
              type="button"
              onClick={() => {
                setTokenVerified(false);
                setToken('');
                setError('');
                setStep('request');
              }}
            >
              Другой email
            </NoirButton>

            <NoirButton
              variant="primary"
              type="submit"
              loading={loading}
              icon={<CheckCircle2 className="w-4 h-4 text-black" />}
            >
              Сохранить пароль и войти
            </NoirButton>
          </div>
        </form>
      )}
    </div>
  );
};
