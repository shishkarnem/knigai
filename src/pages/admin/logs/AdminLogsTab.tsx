import React, { useState, useEffect, useCallback } from 'react';
import {
  Activity,
  RefreshCw,
  Search,
  AlertTriangle,
  Download,
  Clock,
  Cpu,
  Coins,
  Database,
} from 'lucide-react';
import { AiLogRecord } from '../../../types';
import {
  AI_LOG_CREATED_EVENT,
  fetchAiLogs,
  formatRubCost,
  TOKENS_PER_RUB_PACK,
  RUB_PER_TOKEN_PACK,
} from '../../../services/ai/aiLogsService';
import { NoirButton } from '../../../components/common/NoirButton';
import { NoirModal } from '../../../components/common/NoirModal';
import { NoirVoiceInput } from '../../../components/voice/NoirVoiceInput';

export const AdminLogsTab: React.FC = () => {
  const [rows, setRows] = useState<AiLogRecord[]>([]);
  const [summary, setSummary] = useState({
    totalCount: 0,
    totalTokens: 0,
    totalRub: 0,
    errorCount: 0,
  });
  const [syncedAt, setSyncedAt] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [autoSync, setAutoSync] = useState(true);
  const [search, setSearch] = useState('');
  const [onlyErrors, setOnlyErrors] = useState(false);
  const [limit, setLimit] = useState(100);
  const [selectedRow, setSelectedRow] = useState<AiLogRecord | null>(null);

  const loadLogs = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await fetchAiLogs({ limit, search, onlyErrors });
      setRows(data.rows);
      setSummary(data.summary);
      setSyncedAt(data.syncedAt);
    } catch (err) {
      console.warn('Failed loading AI logs:', err);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [limit, search, onlyErrors]);

  useEffect(() => {
    loadLogs(false);
  }, [loadLogs]);

  // Synchronous polling + instant event sync when AI calls finish
  useEffect(() => {
    const onCreated = () => {
      loadLogs(true);
    };
    window.addEventListener(AI_LOG_CREATED_EVENT, onCreated);

    let timer: ReturnType<typeof setInterval> | null = null;
    if (autoSync) {
      timer = setInterval(() => {
        loadLogs(true);
      }, 5000);
    }

    return () => {
      window.removeEventListener(AI_LOG_CREATED_EVENT, onCreated);
      if (timer) clearInterval(timer);
    };
  }, [autoSync, loadLogs]);

  const handleExportCsv = () => {
    const headers = [
      'id',
      'created_at',
      'channel_id',
      'user_social_id',
      'channel_name',
      'bot_id',
      'llm',
      'tokens_total',
      'rub',
      'tokens_in_source',
      'tokens_out_source',
      'tokens_user',
      'server_name',
      'api_key',
      'function_error',
      'user_message',
      'bot_reply',
      'function_call_params',
    ];
    const escapeCsv = (val: unknown) => {
      const s = val === null || val === undefined ? '' : String(val);
      return `"${s.replace(/"/g, '""')}"`;
    };
    const csvRows = [
      headers.join(','),
      ...rows.map((r) =>
        headers.map((h) => escapeCsv((r as unknown as Record<string, unknown>)[h])).join(',')
      ),
    ];
    const blob = new Blob(['\uFEFF' + csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `knigai_logs_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const formatDateTime = (iso?: string) => {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const prettyParams = (raw: string | null) => {
    if (!raw) return '—';
    try {
      return JSON.stringify(JSON.parse(raw), null, 2);
    } catch {
      return raw;
    }
  };

  return (
    <div className="flex flex-col gap-5 text-white min-w-0">
      {/* Header & Sync Controls */}
      <div className="noir-container p-4 border border-zinc-700 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-10 h-10 bg-white text-black flex items-center justify-center font-bold shrink-0">
            <Activity className="w-5 h-5 text-black" />
          </div>
          <div className="min-w-0">
            <h3 className="text-[17px] font-bold text-white break-words">
              Синхронная таблица логов нейросети (<span className="font-mono text-rose-400">logs</span>)
            </h3>
            <p className="text-[14px] text-zinc-300 break-words">
              Тариф <code className="font-mono text-rose-400 font-bold">rub</code>:{' '}
              {TOKENS_PER_RUB_PACK.toLocaleString('ru-RU')} токенов = {RUB_PER_TOKEN_PACK} ₽ · канал{' '}
              <code className="font-mono text-zinc-200">decision_763</code> (<code className="font-mono text-zinc-200">jev+UID</code>)
              {syncedAt ? ` · синхронизировано: ${formatDateTime(syncedAt)}` : ''}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setAutoSync((v) => !v)}
            className={`min-h-[42px] px-3.5 py-2 border text-[14px] font-bold flex items-center gap-2 cursor-pointer transition ${
              autoSync
                ? 'bg-rose-950/80 border-rose-500 text-rose-200'
                : 'bg-zinc-950 border-zinc-700 text-zinc-300 hover:text-white'
            }`}
          >
            <Clock className="w-4 h-4" />
            <span>Автосинхронизация (5 сек): {autoSync ? 'вкл' : 'выкл'}</span>
          </button>

          <NoirButton
            variant="outline"
            onClick={handleExportCsv}
            icon={<Download className="w-4 h-4" />}
          >
            Экспорт CSV
          </NoirButton>

          <NoirButton
            variant="primary"
            onClick={() => loadLogs(false)}
            loading={loading}
            icon={<RefreshCw className={`w-4 h-4 text-black ${loading ? 'animate-spin' : ''}`} />}
          >
            Синхронизировать
          </NoirButton>
        </div>
      </div>

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="noir-container p-4 border border-zinc-800 flex flex-col gap-1">
          <span className="text-[14px] text-zinc-400 flex items-center gap-1.5">
            <Database className="w-4 h-4 text-zinc-300" />
            <span>Всего записей в logs</span>
          </span>
          <span className="text-[22px] font-bold font-mono text-white">
            {summary.totalCount.toLocaleString('ru-RU')}
          </span>
        </div>

        <div className="noir-container p-4 border border-zinc-800 flex flex-col gap-1">
          <span className="text-[14px] text-zinc-400 flex items-center gap-1.5">
            <Cpu className="w-4 h-4 text-zinc-300" />
            <span>Сумма tokens_total</span>
          </span>
          <span className="text-[22px] font-bold font-mono text-white">
            {Math.round(summary.totalTokens).toLocaleString('ru-RU')}
          </span>
        </div>

        <div className="noir-container p-4 border border-rose-700/80 flex flex-col gap-1">
          <span className="text-[14px] text-rose-300 flex items-center gap-1.5 font-bold">
            <Coins className="w-4 h-4 text-rose-500" />
            <span>Итого расход (rub)</span>
          </span>
          <span className="text-[22px] font-bold font-mono text-rose-400">
            {formatRubCost(summary.totalRub)}
          </span>
        </div>

        <div className="noir-container p-4 border border-zinc-800 flex flex-col gap-1">
          <span className="text-[14px] text-zinc-400 flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4 text-rose-500" />
            <span>Ошибок генерации</span>
          </span>
          <span className={`text-[22px] font-bold font-mono ${summary.errorCount > 0 ? 'text-rose-400' : 'text-white'}`}>
            {summary.errorCount.toLocaleString('ru-RU')}
          </span>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="noir-container p-4 border border-zinc-700 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        <div className="flex-1 flex items-center gap-2 min-w-0">
          <Search className="w-4 h-4 text-zinc-400 shrink-0 hidden sm:block" />
          <NoirVoiceInput
            value={search}
            onValueChange={setSearch}
            onEnter={() => loadLogs(false)}
            voiceContext="admin_logs_search"
            placeholder="Поиск по user_social_id, channel_id, тексту запроса/ответа, llm..."
            containerClassName="flex-1 min-w-0"
          />
          <NoirButton variant="subtle" onClick={() => loadLogs(false)} className="shrink-0">
            Найти
          </NoirButton>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setOnlyErrors(false)}
            className={`min-h-[42px] px-3.5 py-2 border text-[14px] font-bold cursor-pointer transition ${
              !onlyErrors
                ? 'bg-white text-black border-white'
                : 'bg-zinc-950 text-zinc-300 border-zinc-700 hover:text-white'
            }`}
          >
            Все логи
          </button>
          <button
            type="button"
            onClick={() => setOnlyErrors(true)}
            className={`min-h-[42px] px-3.5 py-2 border text-[14px] font-bold cursor-pointer transition flex items-center gap-1.5 ${
              onlyErrors
                ? 'bg-rose-600 text-white border-rose-500'
                : 'bg-zinc-950 text-zinc-300 border-zinc-700 hover:text-white'
            }`}
          >
            <AlertTriangle className="w-4 h-4" />
            <span>Только с ошибками</span>
          </button>

          <select
            value={limit}
            onChange={(e) => setLimit(parseInt(e.target.value, 10) || 100)}
            className="min-h-[42px] px-3 noir-input text-[14px]"
          >
            <option value={50} className="bg-zinc-950 text-white">50 строк</option>
            <option value={100} className="bg-zinc-950 text-white">100 строк</option>
            <option value={250} className="bg-zinc-950 text-white">250 строк</option>
            <option value={500} className="bg-zinc-950 text-white">500 строк</option>
          </select>
        </div>
      </div>

      {/* Synchronized Database Mirror Table */}
      <div className="noir-container p-4 border border-zinc-700 flex flex-col gap-3 min-w-0">
        {loading && rows.length === 0 ? (
          <div className="py-12 text-center text-[14px] text-zinc-400">
            Синхронизация таблицы logs с базой данных...
          </div>
        ) : rows.length === 0 ? (
          <div className="py-12 text-center text-[14px] text-zinc-400 border border-zinc-800 p-4">
            Записей в таблице <code className="font-mono text-white">logs</code> пока нет. Выполните любую генерацию текста или изображения, чтобы данные появились автоматически.
          </div>
        ) : (
          <div className="w-full overflow-x-auto max-h-[65vh] border border-zinc-800">
            <table className="w-full text-left text-[14px] border-collapse">
              <thead>
                <tr className="bg-zinc-900 border-b-2 border-zinc-700 text-white font-bold sticky top-0 z-10">
                  <th className="p-2.5 font-mono whitespace-nowrap border-r border-zinc-800">id</th>
                  <th className="p-2.5 font-mono whitespace-nowrap border-r border-zinc-800">created_at</th>
                  <th className="p-2.5 font-mono whitespace-nowrap border-r border-zinc-800">channel_id</th>
                  <th className="p-2.5 font-mono whitespace-nowrap border-r border-zinc-800">user_social_id</th>
                  <th className="p-2.5 font-mono whitespace-nowrap border-r border-zinc-800">channel_name</th>
                  <th className="p-2.5 font-mono whitespace-nowrap border-r border-zinc-800">llm</th>
                  <th className="p-2.5 font-mono whitespace-nowrap border-r border-zinc-800">tokens_total</th>
                  <th className="p-2.5 font-mono whitespace-nowrap border-r border-zinc-800 text-rose-400">rub</th>
                  <th className="p-2.5 font-mono whitespace-nowrap border-r border-zinc-800">tokens_in_source</th>
                  <th className="p-2.5 font-mono whitespace-nowrap border-r border-zinc-800">tokens_out_source</th>
                  <th className="p-2.5 font-mono whitespace-nowrap border-r border-zinc-800">tokens_user</th>
                  <th className="p-2.5 font-mono whitespace-nowrap border-r border-zinc-800">user_message</th>
                  <th className="p-2.5 font-mono whitespace-nowrap border-r border-zinc-800">bot_reply</th>
                  <th className="p-2.5 font-mono whitespace-nowrap border-r border-zinc-800">function_error</th>
                  <th className="p-2.5 font-mono whitespace-nowrap border-r border-zinc-800">function_call_params</th>
                  <th className="p-2.5 font-mono whitespace-nowrap border-r border-zinc-800">bot_id</th>
                  <th className="p-2.5 font-mono whitespace-nowrap border-r border-zinc-800">server_name</th>
                  <th className="p-2.5 font-mono whitespace-nowrap">api_key</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800 bg-zinc-950">
                {rows.map((row) => {
                  const hasError = Boolean(row.function_error && row.function_error.trim());
                  return (
                    <tr
                      key={row.id}
                      onClick={() => setSelectedRow(row)}
                      className={`cursor-pointer transition-colors ${
                        hasError ? 'bg-rose-950/25 hover:bg-rose-950/40' : 'hover:bg-zinc-900/70'
                      }`}
                      title="Нажмите для полного просмотра записи"
                    >
                      <td className="p-2.5 font-mono text-zinc-200 border-r border-zinc-900 whitespace-nowrap">#{row.id}</td>
                      <td className="p-2.5 font-mono text-zinc-300 border-r border-zinc-900 whitespace-nowrap">
                        {formatDateTime(row.created_at)}
                      </td>
                      <td className="p-2.5 font-mono text-white border-r border-zinc-900 whitespace-nowrap">
                        {row.channel_id || '—'}
                      </td>
                      <td className="p-2.5 font-mono text-zinc-300 border-r border-zinc-900 whitespace-nowrap">
                        {row.user_social_id || '—'}
                      </td>
                      <td className="p-2.5 font-mono text-zinc-300 border-r border-zinc-900 whitespace-nowrap">
                        {row.channel_name || '—'}
                      </td>
                      <td className="p-2.5 font-mono text-zinc-200 border-r border-zinc-900 whitespace-nowrap">
                        {row.llm || '—'}
                      </td>
                      <td className="p-2.5 font-mono font-bold text-white border-r border-zinc-900 whitespace-nowrap">
                        {row.tokens_total !== null ? Number(row.tokens_total).toLocaleString('ru-RU') : '0'}
                      </td>
                      <td className="p-2.5 font-mono font-bold text-rose-400 border-r border-zinc-900 whitespace-nowrap">
                        {formatRubCost(row.rub)}
                      </td>
                      <td className="p-2.5 font-mono text-zinc-300 border-r border-zinc-900 whitespace-nowrap">
                        {row.tokens_in_source !== null ? Number(row.tokens_in_source).toLocaleString('ru-RU') : '—'}
                      </td>
                      <td className="p-2.5 font-mono text-zinc-300 border-r border-zinc-900 whitespace-nowrap">
                        {row.tokens_out_source !== null ? Number(row.tokens_out_source).toLocaleString('ru-RU') : '—'}
                      </td>
                      <td className="p-2.5 font-mono text-zinc-300 border-r border-zinc-900 whitespace-nowrap">
                        {row.tokens_user !== null ? Number(row.tokens_user).toLocaleString('ru-RU') : '—'}
                      </td>
                      <td className="p-2.5 text-zinc-200 border-r border-zinc-900 max-w-[220px] truncate">
                        {row.user_message || '—'}
                      </td>
                      <td className="p-2.5 text-zinc-200 border-r border-zinc-900 max-w-[220px] truncate">
                        {row.bot_reply || '—'}
                      </td>
                      <td className={`p-2.5 border-r border-zinc-900 max-w-[200px] truncate ${hasError ? 'text-rose-400 font-bold' : 'text-zinc-500'}`}>
                        {row.function_error || '—'}
                      </td>
                      <td className="p-2.5 font-mono text-zinc-400 border-r border-zinc-900 max-w-[220px] truncate">
                        {row.function_call_params || '—'}
                      </td>
                      <td className="p-2.5 font-mono text-zinc-300 border-r border-zinc-900 whitespace-nowrap">
                        {row.bot_id || '—'}
                      </td>
                      <td className="p-2.5 font-mono text-zinc-300 border-r border-zinc-900 whitespace-nowrap">
                        {row.server_name || '—'}
                      </td>
                      <td className="p-2.5 font-mono text-zinc-400 whitespace-nowrap">
                        {row.api_key || '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Row Detail Inspector Modal */}
      <NoirModal
        isOpen={!!selectedRow}
        onClose={() => setSelectedRow(null)}
        title={selectedRow ? `Лог нейросети #${selectedRow.id}` : 'Детали лога'}
        maxWidth="max-w-3xl"
      >
        {selectedRow && (
          <div className="flex flex-col gap-4 text-white text-[14px]">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-3 border border-zinc-800 bg-zinc-950/70">
              <div>
                <span className="text-zinc-400 block">channel_id</span>
                <span className="font-mono font-bold break-all">{selectedRow.channel_id || '—'}</span>
              </div>
              <div>
                <span className="text-zinc-400 block">user_social_id</span>
                <span className="font-mono font-bold break-all">{selectedRow.user_social_id || '—'}</span>
              </div>
              <div>
                <span className="text-zinc-400 block">tokens_total</span>
                <span className="font-mono font-bold">
                  {selectedRow.tokens_total !== null ? Number(selectedRow.tokens_total).toLocaleString('ru-RU') : '0'}
                </span>
              </div>
              <div>
                <span className="text-zinc-400 block">Стоимость (rub)</span>
                <span className="font-mono font-bold text-rose-400">{formatRubCost(selectedRow.rub)}</span>
              </div>
            </div>

            {selectedRow.function_error && (
              <div className="p-3 border border-rose-500 bg-rose-950/50 text-rose-200 break-words">
                <span className="font-bold block mb-1">function_error:</span>
                <span>{selectedRow.function_error}</span>
              </div>
            )}

            <div>
              <span className="font-bold text-white block mb-1">user_message (запрос):</span>
              <div className="p-3 border border-zinc-800 bg-zinc-950/70 max-h-48 overflow-y-auto whitespace-pre-wrap break-words">
                {selectedRow.user_message || '—'}
              </div>
            </div>

            <div>
              <span className="font-bold text-white block mb-1">bot_reply (ответ нейросети):</span>
              <div className="p-3 border border-zinc-800 bg-zinc-950/70 max-h-48 overflow-y-auto whitespace-pre-wrap break-words">
                {selectedRow.bot_reply || '—'}
              </div>
            </div>

            <div>
              <span className="font-bold text-white block mb-1">function_call_params (аргументы вызова):</span>
              <pre className="p-3 border border-zinc-800 bg-zinc-950/70 max-h-56 overflow-y-auto font-mono text-[14px] whitespace-pre-wrap break-words text-zinc-200">
                {prettyParams(selectedRow.function_call_params)}
              </pre>
            </div>

            <div className="flex justify-end pt-2 border-t border-zinc-800">
              <NoirButton variant="subtle" onClick={() => setSelectedRow(null)}>
                Закрыть
              </NoirButton>
            </div>
          </div>
        )}
      </NoirModal>
    </div>
  );
};
