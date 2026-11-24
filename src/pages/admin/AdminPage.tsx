import React, { useState, useEffect } from 'react';
import { Shield, Image as ImageIcon, Database, Layers, LogOut, ArrowLeft, Activity, Archive, Globe, Link2, CreditCard, Tag, Save, CheckCircle2, Newspaper, Mail } from 'lucide-react';
import { AdminLoginView } from './AdminLoginView';
import { AdminGalleryTab } from './AdminGalleryTab';
import { AdminTablesTab } from './AdminTablesTab';
import { AdminPromptsTab } from './AdminPromptsTab';
import { AdminLogsTab } from './logs/AdminLogsTab';
import { AdminBackupsTab } from './backup/AdminBackupsTab';
import { AdminTelegramProxyCard } from './telegram/AdminTelegramProxyCard';
import { AdminFooterLinksTab } from './footer/AdminFooterLinksTab';
import { AdminPaymentsTab } from './payments/AdminPaymentsTab';
import { AdminBlogTab } from './blog/AdminBlogTab';
import { AdminMailTab } from './mail/AdminMailTab';
import { NoirButton } from '../../components/common/NoirButton';
import { useAppVersion, updateAdminAppVersion } from '../../constants/appVersion';

interface AdminPageProps {
  onBackToApp: () => void;
  onOpenBlogPost?: (slug: string) => void;
}

export const AdminPage: React.FC<AdminPageProps> = ({ onBackToApp, onOpenBlogPost }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [activeTab, setActiveTab] = useState<'gallery' | 'tables' | 'prompts' | 'logs' | 'backups' | 'proxy' | 'footer' | 'payments' | 'blog' | 'mail'>('gallery');

  const appVersion = useAppVersion();
  const [versionInput, setVersionInput] = useState(appVersion);
  const [savingVersion, setSavingVersion] = useState(false);
  const [versionNotice, setVersionNotice] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);

  useEffect(() => {
    setVersionInput(appVersion);
  }, [appVersion]);

  useEffect(() => {
    const token = localStorage.getItem('knigai_admin_token');
    if (token === 'wkL35eTm') {
      setIsAuthenticated(true);
    }
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('knigai_admin_token');
    setIsAuthenticated(false);
  };

  const handleSaveVersion = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = versionInput.trim();
    if (!trimmed) {
      setVersionNotice({ type: 'error', text: 'Укажите версию платформы, например v.1.07' });
      return;
    }
    setSavingVersion(true);
    setVersionNotice(null);
    try {
      const updated = await updateAdminAppVersion(trimmed);
      setVersionInput(updated);
      setVersionNotice({
        type: 'ok',
        text: `Версия обновлена на «${updated}» — применена в подвале сайта, оферте, юридических документах и Telegram-бэкапах.`,
      });
    } catch (err) {
      setVersionNotice({
        type: 'error',
        text: err instanceof Error ? err.message : 'Не удалось сохранить версию',
      });
    } finally {
      setSavingVersion(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <AdminLoginView
        onLoginSuccess={() => setIsAuthenticated(true)}
        onBackToApp={onBackToApp}
      />
    );
  }

  return (
    <div className="w-full flex flex-col gap-6 text-white">
      {/* Top Admin Header */}
      <div className="noir-container p-4 sm:p-5 border-2 border-white flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-white text-black flex items-center justify-center font-bold shrink-0">
            <Shield className="w-6 h-6 text-black" />
          </div>
          <div className="min-w-0">
            <h2 className="text-[19px] font-bold text-white tracking-tight flex flex-wrap items-center gap-2">
              <span>Панель администратора</span>
              <span className="px-2 py-0.5 border border-rose-500/70 bg-rose-950/30 text-rose-300 text-[14px] font-mono">
                {appVersion}
              </span>
            </h2>
            <p className="text-[14px] text-zinc-400 break-words">
              База данных: <strong className="text-white">kniga</strong> · Проксирование файлов: <strong className="text-white">/file/:id</strong>
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <NoirButton
            variant="outline"
            onClick={onBackToApp}
            icon={<ArrowLeft className="w-4 h-4" />}
          >
            Вернуться к книге
          </NoirButton>
          <NoirButton
            variant="subtle"
            onClick={handleLogout}
            icon={<LogOut className="w-4 h-4 text-rose-400" />}
          >
            Выйти
          </NoirButton>
        </div>
      </div>

      {/* Platform Version Control Card */}
      <form
        onSubmit={handleSaveVersion}
        className="noir-container p-4 sm:p-5 border border-zinc-700 bg-zinc-950/75 flex flex-col gap-3 rounded-none"
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="min-w-0 flex items-start gap-3">
            <div className="w-9 h-9 border border-rose-500/60 bg-rose-950/30 flex items-center justify-center shrink-0 mt-0.5">
              <Tag className="w-4 h-4 text-rose-400" />
            </div>
            <div className="min-w-0">
              <div className="text-[16px] font-bold text-white break-words">
                Текущая версия платформы: <span className="text-rose-400 font-mono">{appVersion}</span>
              </div>
              <p className="text-[14px] text-zinc-400 mt-0.5 break-words">
                Обновляется автоматически в подвале сайта, публичной оферте, юридических документах и отчётах Telegram-бэкапов
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 shrink-0">
            <input
              type="text"
              value={versionInput}
              onChange={(e) => setVersionInput(e.target.value)}
              maxLength={40}
              placeholder="v.1.07"
              aria-label="Версия платформы"
              className="noir-input px-3.5 py-2.5 w-full sm:w-44 text-[14px] font-mono rounded-none"
            />
            <NoirButton
              type="submit"
              variant="primary"
              loading={savingVersion}
              icon={<Save className="w-4 h-4 text-black" />}
              showTail={false}
            >
              Сохранить версию
            </NoirButton>
          </div>
        </div>

        {versionNotice && (
          <div
            className={`p-3 border text-[14px] break-words flex items-start gap-2 rounded-none ${
              versionNotice.type === 'error'
                ? 'border-rose-500 bg-rose-950/40 text-rose-200'
                : 'border-white/50 bg-white/10 text-white'
            }`}
          >
            {versionNotice.type === 'ok' && <CheckCircle2 className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />}
            <span>{versionNotice.text}</span>
          </div>
        )}
      </form>


      {/* Admin Subtabs (No horizontal scroll on mobile) */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => setActiveTab('gallery')}
          className={`min-h-[44px] px-4 py-2 border text-[14px] font-bold flex items-center gap-2 transition-colors cursor-pointer ${
            activeTab === 'gallery'
              ? 'bg-white text-black border-white'
              : 'bg-zinc-950 text-zinc-300 border-zinc-800 hover:text-white'
          }`}
        >
          <ImageIcon className="w-4 h-4" />
          <span>1. Медиа-галерея и файлы</span>
        </button>

        <button
          onClick={() => setActiveTab('tables')}
          className={`min-h-[44px] px-4 py-2 border text-[14px] font-bold flex items-center gap-2 transition-colors cursor-pointer ${
            activeTab === 'tables'
              ? 'bg-white text-black border-white'
              : 'bg-zinc-950 text-zinc-300 border-zinc-800 hover:text-white'
          }`}
        >
          <Database className="w-4 h-4" />
          <span>2. Таблицы базы данных</span>
        </button>

        <button
          onClick={() => setActiveTab('prompts')}
          className={`min-h-[44px] px-4 py-2 border text-[14px] font-bold flex items-center gap-2 transition-colors cursor-pointer ${
            activeTab === 'prompts'
              ? 'bg-white text-black border-white'
              : 'bg-zinc-950 text-zinc-300 border-zinc-800 hover:text-white'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>3. Системные промпты</span>
        </button>

        <button
          onClick={() => setActiveTab('logs')}
          className={`min-h-[44px] px-4 py-2 border text-[14px] font-bold flex items-center gap-2 transition-colors cursor-pointer ${
            activeTab === 'logs'
              ? 'bg-white text-black border-white'
              : 'bg-zinc-950 text-zinc-300 border-zinc-800 hover:text-white'
          }`}
        >
          <Activity className="w-4 h-4 text-rose-500" />
          <span>4. Логи нейросети (logs)</span>
        </button>

        <button
          onClick={() => setActiveTab('backups')}
          className={`min-h-[44px] px-4 py-2 border text-[14px] font-bold flex items-center gap-2 transition-colors cursor-pointer ${
            activeTab === 'backups'
              ? 'bg-white text-black border-white'
              : 'bg-zinc-950 text-zinc-300 border-zinc-800 hover:text-white'
          }`}
        >
          <Archive className="w-4 h-4 text-rose-500" />
          <span>5. Бэкапы и восстановление</span>
        </button>

        <button
          onClick={() => setActiveTab('proxy')}
          className={`min-h-[44px] px-4 py-2 border text-[14px] font-bold flex items-center gap-2 transition-colors cursor-pointer ${
            activeTab === 'proxy'
              ? 'bg-white text-black border-white'
              : 'bg-zinc-950 text-zinc-300 border-zinc-800 hover:text-white'
          }`}
        >
          <Globe className="w-4 h-4 text-rose-500" />
          <span>6. Прокси Telegram (РФ)</span>
        </button>

        <button
          onClick={() => setActiveTab('footer')}
          className={`min-h-[44px] px-4 py-2 border text-[14px] font-bold flex items-center gap-2 transition-colors cursor-pointer ${
            activeTab === 'footer'
              ? 'bg-white text-black border-white'
              : 'bg-zinc-950 text-zinc-300 border-zinc-800 hover:text-white'
          }`}
        >
          <Link2 className="w-4 h-4 text-rose-500" />
          <span>7. Ссылки футера</span>
        </button>

        <button
          onClick={() => setActiveTab('payments')}
          className={`min-h-[44px] px-4 py-2 border text-[14px] font-bold flex items-center gap-2 transition-colors cursor-pointer ${
            activeTab === 'payments'
              ? 'bg-white text-black border-white'
              : 'bg-zinc-950 text-zinc-300 border-zinc-800 hover:text-white'
          }`}
        >
          <CreditCard className="w-4 h-4 text-rose-500" />
          <span>8. Оплата и Робокасса</span>
        </button>

        <button
          onClick={() => setActiveTab('blog')}
          className={`min-h-[44px] px-4 py-2 border text-[14px] font-bold flex items-center gap-2 transition-colors cursor-pointer ${
            activeTab === 'blog'
              ? 'bg-white text-black border-white'
              : 'bg-zinc-950 text-zinc-300 border-zinc-800 hover:text-white'
          }`}
        >
          <Newspaper className="w-4 h-4 text-rose-500" />
          <span>9. Блог и посты</span>
        </button>

        <button
          onClick={() => setActiveTab('mail')}
          className={`min-h-[44px] px-4 py-2 border text-[14px] font-bold flex items-center gap-2 transition-colors cursor-pointer ${
            activeTab === 'mail'
              ? 'bg-white text-black border-white'
              : 'bg-zinc-950 text-zinc-300 border-zinc-800 hover:text-white'
          }`}
        >
          <Mail className="w-4 h-4 text-rose-500" />
          <span>10. Почта и SMTP</span>
        </button>
      </div>

      {/* Tab View */}
      {activeTab === 'gallery' && <AdminGalleryTab />}
      {activeTab === 'tables' && <AdminTablesTab />}
      {activeTab === 'prompts' && <AdminPromptsTab />}
      {activeTab === 'logs' && <AdminLogsTab />}
      {activeTab === 'backups' && <AdminBackupsTab />}
      {activeTab === 'proxy' && <AdminTelegramProxyCard />}
      {activeTab === 'footer' && <AdminFooterLinksTab />}
      {activeTab === 'payments' && <AdminPaymentsTab />}
      {activeTab === 'blog' && <AdminBlogTab onOpenPublicPost={onOpenBlogPost} />}
      {activeTab === 'mail' && <AdminMailTab />}
    </div>
  );
};
