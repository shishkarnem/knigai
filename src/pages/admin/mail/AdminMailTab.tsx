import React, { useEffect, useState } from 'react';
import { Mail, Server, ShieldCheck, Send, Save, CheckCircle2, AlertCircle } from 'lucide-react';
import { NoirButton } from '../../../components/common/NoirButton';

interface MailConfigState {
  config_key: string;
  provider: string;
  username: string;
  sender_name: string;
  sender_email: string;
  password_masked: string;
  incoming_host: string;
  pop3_port: number;
  pop3_ssl_port: number;
  imap_port: number;
  imap_ssl_port: number;
  smtp_host: string;
  smtp_ports: string;
  smtp_ssl_port: number;
  smtp_use_tls: boolean;
  is_active: boolean;
}

export const AdminMailTab: React.FC = () => {
  const [config, setConfig] = useState<MailConfigState | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [testRecipient, setTestRecipient] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [notice, setNotice] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);

  const loadConfig = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/mail-config');
      const data = await res.json();
      if (res.ok && data?.config) {
        setConfig(data.config);
      } else {
        setNotice({ type: 'error', text: data?.error || 'Не удалось загрузить настройки почты' });
      }
    } catch (err) {
      setNotice({ type: 'error', text: err instanceof Error ? err.message : 'Ошибка сети' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadConfig();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!config) return;
    setSaving(true);
    setNotice(null);
    try {
      const res = await fetch('/api/admin/mail-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...config,
          password: newPassword.trim() ? newPassword.trim() : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Ошибка сохранения');
      setConfig(data.config);
      setNewPassword('');
      setNotice({
        type: 'ok',
        text: 'Настройки почтового сервера сохранены в PostgreSQL таблице mail_configs.',
      });
    } catch (err) {
      setNotice({ type: 'error', text: err instanceof Error ? err.message : 'Ошибка сохранения' });
    } finally {
      setSaving(false);
    }
  };

  const handleTestSmtp = async (sendEmail: boolean) => {
    setTesting(true);
    setNotice(null);
    try {
      const res = await fetch('/api/admin/mail-config/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: sendEmail ? testRecipient.trim() : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || 'SMTP-сервер не ответил');
      }
      setNotice({
        type: 'ok',
        text:
          data.mode === 'send'
            ? `Тестовое HTML-письмо успешно отправлено на ${testRecipient.trim()} через порт ${data.portUsed}!`
            : `Соединение с ${data.host}:${data.port} (${data.username}) успешно проверено по SSL/TLS!`,
      });
    } catch (err) {
      setNotice({ type: 'error', text: err instanceof Error ? err.message : 'Ошибка проверки SMTP' });
    } finally {
      setTesting(false);
    }
  };

  if (loading || !config) {
    return (
      <div className="noir-container p-6 border border-zinc-800 text-[14px] text-zinc-300">
        Загрузка конфигурации почтового сервера из PostgreSQL...
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 text-white">
      <div className="noir-container p-4 sm:p-5 border border-zinc-700 bg-zinc-950/75 flex flex-col gap-2">
        <div className="flex items-center gap-2 text-[17px] font-bold text-white">
          <Mail className="w-5 h-5 text-rose-500 shrink-0" />
          <span>PostgreSQL · Таблица mail_configs (Почтовый сервер Reg.ru)</span>
        </div>
        <p className="text-[14px] text-zinc-300 leading-relaxed">
          Используется для отправки HTML-писем восстановления пароля KnigAI. Пароль учетной записи хранится в базе данных и передаётся на клиент только в маскированном виде.
        </p>
      </div>

      {notice && (
        <div
          className={`p-3.5 border text-[14px] flex items-start gap-2 ${
            notice.type === 'error'
              ? 'border-rose-500 bg-rose-950/40 text-rose-200'
              : 'border-white/50 bg-zinc-950/75 text-white'
          }`}
        >
          {notice.type === 'error' ? (
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          ) : (
            <CheckCircle2 className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          )}
          <span className="break-words">{notice.text}</span>
        </div>
      )}

      <form onSubmit={handleSave} className="noir-container p-4 sm:p-6 border border-zinc-800 flex flex-col gap-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <label className="block text-[14px] font-bold text-white mb-1">Учетная запись:</label>
            <input
              type="email"
              value={config.username}
              onChange={(e) => setConfig({ ...config, username: e.target.value })}
              className="w-full min-h-[42px] px-3 noir-input text-[14px]"
            />
          </div>

          <div>
            <label className="block text-[14px] font-bold text-white mb-1">Имя отправителя:</label>
            <input
              type="text"
              value={config.sender_name}
              onChange={(e) => setConfig({ ...config, sender_name: e.target.value })}
              className="w-full min-h-[42px] px-3 noir-input text-[14px]"
            />
          </div>

          <div>
            <label className="block text-[14px] font-bold text-white mb-1">Email отправителя:</label>
            <input
              type="email"
              value={config.sender_email}
              onChange={(e) => setConfig({ ...config, sender_email: e.target.value })}
              className="w-full min-h-[42px] px-3 noir-input text-[14px]"
            />
          </div>

          <div>
            <label className="block text-[14px] font-bold text-white mb-1">
              Сервер исходящей почты (SMTP):
            </label>
            <input
              type="text"
              value={config.smtp_host}
              onChange={(e) => setConfig({ ...config, smtp_host: e.target.value })}
              className="w-full min-h-[42px] px-3 noir-input text-[14px] font-mono"
            />
          </div>

          <div>
            <label className="block text-[14px] font-bold text-white mb-1">SMTP SSL/TLS порт:</label>
            <input
              type="number"
              value={config.smtp_ssl_port}
              onChange={(e) => setConfig({ ...config, smtp_ssl_port: Number(e.target.value) || 465 })}
              className="w-full min-h-[42px] px-3 noir-input text-[14px] font-mono"
            />
          </div>

          <div>
            <label className="block text-[14px] font-bold text-white mb-1">Доступные SMTP порты:</label>
            <input
              type="text"
              value={config.smtp_ports}
              onChange={(e) => setConfig({ ...config, smtp_ports: e.target.value })}
              className="w-full min-h-[42px] px-3 noir-input text-[14px] font-mono"
            />
          </div>

          <div>
            <label className="block text-[14px] font-bold text-white mb-1">
              Сервер входящей почты:
            </label>
            <input
              type="text"
              value={config.incoming_host}
              onChange={(e) => setConfig({ ...config, incoming_host: e.target.value })}
              className="w-full min-h-[42px] px-3 noir-input text-[14px] font-mono"
            />
          </div>

          <div>
            <label className="block text-[14px] font-bold text-white mb-1">
              POP3 / POP3 SSL порты:
            </label>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="number"
                value={config.pop3_port}
                onChange={(e) => setConfig({ ...config, pop3_port: Number(e.target.value) || 110 })}
                className="w-full min-h-[42px] px-3 noir-input text-[14px] font-mono"
              />
              <input
                type="number"
                value={config.pop3_ssl_port}
                onChange={(e) => setConfig({ ...config, pop3_ssl_port: Number(e.target.value) || 995 })}
                className="w-full min-h-[42px] px-3 noir-input text-[14px] font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block text-[14px] font-bold text-white mb-1">
              IMAP / IMAP SSL порты:
            </label>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="number"
                value={config.imap_port}
                onChange={(e) => setConfig({ ...config, imap_port: Number(e.target.value) || 143 })}
                className="w-full min-h-[42px] px-3 noir-input text-[14px] font-mono"
              />
              <input
                type="number"
                value={config.imap_ssl_port}
                onChange={(e) => setConfig({ ...config, imap_ssl_port: Number(e.target.value) || 993 })}
                className="w-full min-h-[42px] px-3 noir-input text-[14px] font-mono"
              />
            </div>
          </div>
        </div>

        <div className="pt-2 border-t border-zinc-800 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div className="flex-1 min-w-0">
            <label className="block text-[14px] font-bold text-white mb-1">
              Новый пароль почты (сейчас: <span className="font-mono text-rose-400">{config.password_masked}</span>):
            </label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Оставьте пустым, чтобы сохранить текущий пароль"
              className="w-full min-h-[42px] px-3 noir-input text-[14px]"
            />
          </div>

          <NoirButton
            type="submit"
            variant="primary"
            loading={saving}
            icon={<Save className="w-4 h-4 text-black" />}
          >
            Сохранить в mail_configs
          </NoirButton>
        </div>
      </form>

      <div className="noir-container p-4 sm:p-6 border border-zinc-800 flex flex-col gap-3">
        <div className="flex items-center gap-2 text-[16px] font-bold text-white">
          <Server className="w-4 h-4 text-rose-500" />
          <span>Проверка подключения SMTP и тестовая отправка HTML-письма</span>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
          <NoirButton
            type="button"
            variant="outline"
            loading={testing}
            onClick={() => handleTestSmtp(false)}
            icon={<ShieldCheck className="w-4 h-4 text-rose-400" />}
          >
            Проверить SMTP handshake (465/587)
          </NoirButton>

          <input
            type="email"
            value={testRecipient}
            onChange={(e) => setTestRecipient(e.target.value)}
            placeholder="test@example.com — для отправки тестового HTML-письма"
            className="flex-1 min-h-[42px] px-3 noir-input text-[14px]"
          />

          <NoirButton
            type="button"
            variant="primary"
            loading={testing}
            disabled={!testRecipient.trim()}
            onClick={() => handleTestSmtp(true)}
            icon={<Send className="w-4 h-4 text-black" />}
          >
            Отправить тест
          </NoirButton>
        </div>
      </div>
    </div>
  );
};
