import React, { useState } from 'react';
import { Shield, KeyRound, AlertCircle, ArrowLeft } from 'lucide-react';
import { NoirButton } from '../../components/common/NoirButton';

interface AdminLoginViewProps {
  onLoginSuccess: () => void;
  onBackToApp: () => void;
}

export const AdminLoginView: React.FC<AdminLoginViewProps> = ({
  onLoginSuccess,
  onBackToApp,
}) => {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    // Verification without exposing plaintext password in the UI
    if (password === 'wkL35eTm') {
      localStorage.setItem('knigai_admin_token', 'wkL35eTm');
      onLoginSuccess();
    } else {
      setError('Введен неверный пароль доступа к админке');
    }
    setLoading(false);
  };

  return (
    <div className="min-h-[75vh] flex items-center justify-center p-4">
      <div className="w-full max-w-md noir-container p-6 sm:p-8 border-2 border-white shadow-2xl flex flex-col gap-5">
        <div className="flex items-center justify-between pb-3 border-b border-zinc-700">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 bg-white text-black flex items-center justify-center font-bold">
              <Shield className="w-5 h-5 text-black" />
            </div>
            <div>
              <h2 className="text-[18px] font-bold text-white tracking-tight">
                Административная панель
              </h2>
              <p className="text-[14px] text-zinc-400">
                Управление базой данных kniga
              </p>
            </div>
          </div>

          <button
            onClick={onBackToApp}
            className="p-2 border border-zinc-700 hover:border-white text-zinc-400 hover:text-white transition cursor-pointer"
            title="Вернуться к приложению"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
        </div>

        <p className="text-[14px] text-zinc-300 leading-relaxed">
          Для доступа к управлению таблицами, файловым хранилищем и настройками системы введите административный пароль.
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="block text-[14px] font-bold text-white mb-1.5 flex items-center gap-1.5">
              <KeyRound className="w-4 h-4 text-zinc-400" />
              Пароль администратора:
            </label>
            <input
              type="password"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Введите пароль..."
              className="w-full min-h-[46px] px-4 noir-input text-[15px]"
            />
          </div>

          {error && (
            <div className="p-3 bg-rose-950/80 border border-rose-500 text-rose-200 text-[14px] flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex items-center justify-between gap-3 pt-2">
            <NoirButton
              type="button"
              variant="subtle"
              onClick={onBackToApp}
              className="flex-1"
            >
              Отмена
            </NoirButton>
            <NoirButton
              type="submit"
              variant="primary"
              loading={loading}
              className="flex-1"
            >
              Войти в админку
            </NoirButton>
          </div>
        </form>
      </div>
    </div>
  );
};
