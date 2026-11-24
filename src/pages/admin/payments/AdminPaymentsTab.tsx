import React, { useEffect, useState, useCallback } from 'react';
import { CreditCard, Save, RefreshCw, ShieldCheck, CheckCircle2, AlertCircle } from 'lucide-react';
import {
  AdminPaymentOrderRow,
  AdminSystemConfigRow,
  fetchAdminSystemConfigs,
  updateAdminSystemConfig,
  UserConsentRecord,
} from '../../../components/billing/robokassaApi';
import { NoirButton } from '../../../components/common/NoirButton';

interface ConfigEditDraft {
  domain: string;
  merchant_login: string;
  password_1: string;
  password_2: string;
  result_url: string;
  success_url: string;
  fail_url: string;
  receipt_item_name: string;
  tax_system: string;
  vat_rate: string;
  is_test: boolean;
  is_active: boolean;
}

export const AdminPaymentsTab: React.FC = () => {
  const [configs, setConfigs] = useState<AdminSystemConfigRow[]>([]);
  const [orders, setOrders] = useState<AdminPaymentOrderRow[]>([]);
  const [consents, setConsents] = useState<UserConsentRecord[]>([]);
  const [drafts, setDrafts] = useState<Record<number, ConfigEditDraft>>({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [statusNotice, setStatusNotice] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchAdminSystemConfigs();
      setConfigs(data.configs);
      setOrders(data.orders);
      setConsents(data.consents);

      const initialDrafts: Record<number, ConfigEditDraft> = {};
      for (const c of data.configs) {
        initialDrafts[c.id] = {
          domain: c.domain,
          merchant_login: c.merchant_login,
          password_1: '',
          password_2: '',
          result_url: c.result_url,
          success_url: c.success_url,
          fail_url: c.fail_url,
          receipt_item_name: c.receipt_item_name,
          tax_system: c.tax_system,
          vat_rate: c.vat_rate || '',
          is_test: c.is_test,
          is_active: c.is_active,
        };
      }
      setDrafts(initialDrafts);
    } catch (err: unknown) {
      setStatusNotice({
        type: 'err',
        text: err instanceof Error ? err.message : 'Не удалось загрузить настройки Робокассы',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const handleFieldChange = (
    id: number,
    field: keyof ConfigEditDraft,
    value: string | boolean
  ) => {
    setDrafts((prev) => ({
      ...prev,
      [id]: {
        ...prev[id],
        [field]: value,
      },
    }));
  };

  const handleSaveRow = async (id: number) => {
    const d = drafts[id];
    if (!d) return;
    setSavingId(id);
    setStatusNotice(null);
    try {
      const updated = await updateAdminSystemConfig(id, {
        domain: d.domain,
        merchant_login: d.merchant_login,
        password_1: d.password_1.trim() ? d.password_1.trim() : undefined,
        password_2: d.password_2.trim() ? d.password_2.trim() : undefined,
        result_url: d.result_url,
        success_url: d.success_url,
        fail_url: d.fail_url,
        receipt_item_name: d.receipt_item_name,
        tax_system: d.tax_system,
        vat_rate: d.vat_rate.trim() ? d.vat_rate.trim() : null,
        is_test: d.is_test,
        is_active: d.is_active,
      });
      setConfigs((prev) => prev.map((c) => (c.id === id ? updated : c)));
      setDrafts((prev) => ({
        ...prev,
        [id]: { ...prev[id], password_1: '', password_2: '' },
      }));
      setStatusNotice({
        type: 'ok',
        text: `Конфигурация ${updated.domain} (${updated.merchant_login}) сохранена в PostgreSQL system_configs.`,
      });
    } catch (err: unknown) {
      setStatusNotice({
        type: 'err',
        text: err instanceof Error ? err.message : 'Ошибка сохранения конфигурации',
      });
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="w-full flex flex-col gap-6 font-['PT_Serif',serif] text-white">
      <div className="noir-container p-4 sm:p-6 border border-zinc-700 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2 text-rose-500 font-mono text-[14px]">
            <CreditCard className="w-4 h-4" />
            <span>PostgreSQL · Таблица system_configs (Робокасса)</span>
          </div>
          <h3 className="text-[19px] font-bold text-white">
            Доменные настройки магазинов Робокассы и журнал оплат
          </h3>
          <p className="text-[14px] text-zinc-400">
            Для каждого домена (knigai.online и knigai.ru) хранится отдельная строка в system_configs. Пароли не передаются в клиентский интерфейс и сохраняются только в PostgreSQL.
          </p>
        </div>

        <NoirButton
          variant="outline"
          onClick={loadAll}
          loading={loading}
          icon={<RefreshCw className="w-4 h-4 text-rose-500" />}
        >
          Обновить из БД
        </NoirButton>
      </div>

      {statusNotice && (
        <div
          className={`p-3.5 border text-[14px] flex items-center gap-2 ${
            statusNotice.type === 'ok'
              ? 'bg-zinc-950/80 border-white text-white'
              : 'bg-rose-950/60 border-rose-500 text-rose-200'
          }`}
        >
          {statusNotice.type === 'ok' ? (
            <CheckCircle2 className="w-4 h-4 text-rose-500 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          )}
          <span>{statusNotice.text}</span>
        </div>
      )}

      {/* 1. Editable System Configs (2 rows) */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        {configs.map((cfg) => {
          const d = drafts[cfg.id];
          if (!d) return null;

          return (
            <div
              key={cfg.id}
              className="noir-container p-4 sm:p-5 border-2 border-zinc-700 bg-zinc-950/80 flex flex-col gap-3.5 rounded-none"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 pb-2.5">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-rose-500" />
                  <span className="font-mono font-bold text-[15px] text-white">
                    #{cfg.id} · {cfg.config_key}
                  </span>
                </div>
                <span className="px-2 py-0.5 bg-black border border-rose-500/70 text-rose-300 font-mono text-[14px]">
                  {cfg.hash_algorithm}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[14px]">
                <div>
                  <label className="block text-zinc-400 mb-1">Домен сайта:</label>
                  <input
                    type="text"
                    value={d.domain}
                    onChange={(e) => handleFieldChange(cfg.id, 'domain', e.target.value)}
                    className="w-full min-h-[40px] px-3 noir-input font-mono text-[14px]"
                  />
                </div>
                <div>
                  <label className="block text-zinc-400 mb-1">MerchantLogin (Логин магазина):</label>
                  <input
                    type="text"
                    value={d.merchant_login}
                    onChange={(e) => handleFieldChange(cfg.id, 'merchant_login', e.target.value)}
                    className="w-full min-h-[40px] px-3 noir-input font-mono text-[14px]"
                  />
                </div>
                <div>
                  <label className="block text-zinc-400 mb-1">
                    Новый Пароль #1 (сейчас: {cfg.password_1_masked}):
                  </label>
                  <input
                    type="password"
                    value={d.password_1}
                    onChange={(e) => handleFieldChange(cfg.id, 'password_1', e.target.value)}
                    placeholder="Оставьте пустым, чтобы не менять"
                    className="w-full min-h-[40px] px-3 noir-input font-mono text-[14px]"
                  />
                </div>
                <div>
                  <label className="block text-zinc-400 mb-1">
                    Новый Пароль #2 (сейчас: {cfg.password_2_masked}):
                  </label>
                  <input
                    type="password"
                    value={d.password_2}
                    onChange={(e) => handleFieldChange(cfg.id, 'password_2', e.target.value)}
                    placeholder="Оставьте пустым, чтобы не менять"
                    className="w-full min-h-[40px] px-3 noir-input font-mono text-[14px]"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-2.5 text-[14px]">
                <div>
                  <label className="block text-zinc-400 mb-1">Result URL (POST/GET):</label>
                  <input
                    type="text"
                    value={d.result_url}
                    onChange={(e) => handleFieldChange(cfg.id, 'result_url', e.target.value)}
                    className="w-full min-h-[40px] px-3 noir-input font-mono text-[14px]"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-zinc-400 mb-1">Success URL (GET):</label>
                    <input
                      type="text"
                      value={d.success_url}
                      onChange={(e) => handleFieldChange(cfg.id, 'success_url', e.target.value)}
                      className="w-full min-h-[40px] px-3 noir-input font-mono text-[14px]"
                    />
                  </div>
                  <div>
                    <label className="block text-zinc-400 mb-1">Fail URL (GET):</label>
                    <input
                      type="text"
                      value={d.fail_url}
                      onChange={(e) => handleFieldChange(cfg.id, 'fail_url', e.target.value)}
                      className="w-full min-h-[40px] px-3 noir-input font-mono text-[14px]"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-[14px]">
                <div className="sm:col-span-2">
                  <label className="block text-zinc-400 mb-1">Позиция чека Receipt:</label>
                  <input
                    type="text"
                    value={d.receipt_item_name}
                    onChange={(e) => handleFieldChange(cfg.id, 'receipt_item_name', e.target.value)}
                    className="w-full min-h-[40px] px-3 noir-input text-[14px]"
                  />
                </div>
                <div>
                  <label className="block text-zinc-400 mb-1">tax (пусто = null):</label>
                  <input
                    type="text"
                    value={d.vat_rate}
                    onChange={(e) => handleFieldChange(cfg.id, 'vat_rate', e.target.value)}
                    placeholder="null"
                    className="w-full min-h-[40px] px-3 noir-input font-mono text-[14px]"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-zinc-800 text-[14px]">
                <div className="flex flex-wrap items-center gap-4">
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={d.is_active}
                      onChange={(e) => handleFieldChange(cfg.id, 'is_active', e.target.checked)}
                      className="w-4 h-4 accent-rose-600"
                    />
                    <span>Активен</span>
                  </label>
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={d.is_test}
                      onChange={(e) => handleFieldChange(cfg.id, 'is_test', e.target.checked)}
                      className="w-4 h-4 accent-rose-600"
                    />
                    <span>IsTest=1</span>
                  </label>
                </div>

                <NoirButton
                  variant="primary"
                  onClick={() => handleSaveRow(cfg.id)}
                  loading={savingId === cfg.id}
                  icon={<Save className="w-4 h-4 text-black" />}
                >
                  Сохранить в system_configs
                </NoirButton>
              </div>
            </div>
          );
        })}
      </div>

      {/* 2. Recent Payment Orders */}
      <div className="noir-container p-4 sm:p-5 border border-zinc-800 flex flex-col gap-3">
        <h4 className="text-[16px] font-bold text-white">
          Последние заказы Робокассы (payment_orders: {orders.length})
        </h4>
        {orders.length === 0 ? (
          <p className="text-[14px] text-zinc-400">Заказов на оплату через Робокассу пока нет.</p>
        ) : (
          <div className="flex flex-col gap-2 text-[14px]">
            {orders.slice(0, 20).map((ord) => (
              <div
                key={ord.id}
                className="p-3 bg-black/60 border border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2 font-mono"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-white font-bold">#{ord.inv_id}</span>
                  <span className="text-zinc-400">UID: {ord.user_uid}</span>
                  <span className="text-rose-400">{ord.merchant_login}</span>
                  <span className="text-zinc-300">
                    {Number(ord.letters_amount).toLocaleString('ru-RU')} букв
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-white font-bold">{ord.out_sum} ₽</span>
                  <span
                    className={`px-2 py-0.5 border ${
                      ord.status === 'paid'
                        ? 'border-white text-white bg-zinc-900'
                        : 'border-rose-500/70 text-rose-300 bg-rose-950/30'
                    }`}
                  >
                    {ord.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 3. Recent Consent Logs */}
      <div className="noir-container p-4 sm:p-5 border border-zinc-800 flex flex-col gap-3">
        <h4 className="text-[16px] font-bold text-white">
          Журнал юридических согласий (user_consents: {consents.length})
        </h4>
        {consents.length === 0 ? (
          <p className="text-[14px] text-zinc-400">Записей согласий пока нет.</p>
        ) : (
          <div className="flex flex-col gap-2 text-[14px]">
            {consents.slice(0, 15).map((c) => (
              <div
                key={c.id}
                className="p-2.5 bg-black/60 border border-zinc-800 flex flex-wrap items-center justify-between gap-2 font-mono"
              >
                <span className="text-zinc-300">
                  {new Date(c.created_at).toLocaleString('ru-RU')} · {c.consent_context} ·{' '}
                  {c.email || `UID ${c.user_uid || '-'}`}
                </span>
                <span className="text-rose-400">{c.documents_accepted}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
