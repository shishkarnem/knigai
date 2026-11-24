import React, { useState, useEffect } from 'react';
import { Database, Table, RefreshCw, Layers, Search, Download, ChevronLeft, ChevronRight } from 'lucide-react';
import { NoirButton } from '../../components/common/NoirButton';
import { TableRowModal } from './tables/TableRowModal';
import { NoirVoiceInput } from '../../components/voice/NoirVoiceInput';

interface TableMeta {
  name: string;
  count: number;
}

export const AdminTablesTab: React.FC = () => {
  const [tables, setTables] = useState<TableMeta[]>([]);
  const [selectedTable, setSelectedTable] = useState<string>('books');
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [limit, setLimit] = useState(50);
  const [offset, setOffset] = useState(0);
  const [searchInput, setSearchInput] = useState('');
  const [activeSearch, setActiveSearch] = useState('');
  const [inspectedRow, setInspectedRow] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    loadTables();
  }, []);

  useEffect(() => {
    if (selectedTable) {
      loadTableData(selectedTable, limit, offset, activeSearch);
    }
  }, [selectedTable, limit, offset, activeSearch]);

  const loadTables = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/db/tables');
      if (res.ok) {
        const data = await res.json();
        setTables(data.tables || []);
        if (data.tables && data.tables.length > 0 && !selectedTable) {
          setSelectedTable(data.tables[0].name);
        }
      }
    } catch (err) {
      console.warn('Failed loading tables:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadTableData = async (tableName: string, curLimit: number, curOffset: number, search: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        table: tableName,
        limit: String(curLimit),
        offset: String(curOffset),
      });
      if (search.trim()) {
        params.set('search', search.trim());
      }
      const res = await fetch(`/api/admin/db/table-data?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        const loadedRows = data.rows || [];
        setRows(loadedRows);
        setTotalCount(typeof data.totalCount === 'number' ? data.totalCount : loadedRows.length);
      }
    } catch (err) {
      console.warn('Failed loading table rows:', err);
    } finally {
      setLoading(false);
    }
  };

  const columns = rows.length > 0 ? Object.keys(rows[0]) : [];

  const handleSelectTable = (tableName: string) => {
    setSelectedTable(tableName);
    setOffset(0);
    setSearchInput('');
    setActiveSearch('');
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setOffset(0);
    setActiveSearch(searchInput.trim());
  };

  const handleExportCsv = () => {
    if (rows.length === 0 || columns.length === 0) return;
    const escapeCsv = (val: unknown): string => {
      const str =
        val === null || val === undefined
          ? ''
          : typeof val === 'object'
          ? JSON.stringify(val)
          : String(val);
      return `"${str.replace(/"/g, '""')}"`;
    };
    const header = columns.map(escapeCsv).join(',');
    const body = rows.map((row) => columns.map((col) => escapeCsv(row[col])).join(',')).join('\n');
    const bom = '\uFEFF';
    const blob = new Blob([bom + header + '\n' + body], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${selectedTable}_rows_${rows.length}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col gap-5 text-white">
      {/* Tables summary header */}
      <div className="noir-container p-4 border border-zinc-700 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-white text-black flex items-center justify-center font-bold shrink-0">
            <Database className="w-5 h-5 text-black" />
          </div>
          <div>
            <h3 className="text-[17px] font-bold text-white">
              Таблицы системной базы данных
            </h3>
            <p className="text-[14px] text-zinc-400">
              Всего таблиц в схеме: <strong className="text-white">{tables.length}</strong> · Нажмите на любую строку для полного просмотра JSON
            </p>
          </div>
        </div>

        <NoirButton
          variant="subtle"
          onClick={() => {
            loadTables();
            if (selectedTable) loadTableData(selectedTable, limit, offset, activeSearch);
          }}
          icon={<RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />}
        >
          Обновить данные
        </NoirButton>
      </div>

      {/* Table buttons strip */}
      <div className="flex flex-wrap items-center gap-2">
        {tables.map((t) => {
          const isSelected = selectedTable === t.name;
          return (
            <button
              key={t.name}
              onClick={() => handleSelectTable(t.name)}
              className={`min-h-[44px] px-4 py-2 border text-[14px] font-bold flex items-center gap-2 transition-colors cursor-pointer ${
                isSelected
                  ? 'bg-white text-black border-white shadow-md'
                  : 'bg-zinc-900 text-zinc-300 border-zinc-700 hover:text-white'
              }`}
            >
              <Table className="w-4 h-4" />
              <span>{t.name}</span>
              <span className={`px-2 py-0.5 text-[14px] font-mono tabular-nums ${isSelected ? 'bg-black text-white' : 'bg-zinc-800 text-zinc-400'}`}>
                {t.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Selected Table Data Inspector */}
      <div className="noir-container p-4 border border-zinc-700 flex flex-col gap-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-zinc-700">
          <div className="flex flex-wrap items-center gap-2">
            <Layers className="w-5 h-5 text-white" />
            <h4 className="text-[16px] font-bold text-white">
              Таблица: <code className="font-mono text-white underline">{selectedTable}</code>
            </h4>
            <span className="text-[14px] text-zinc-400">
              (строк: {rows.length} из {totalCount})
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-[14px]">
            <form onSubmit={handleSearchSubmit} className="flex items-center gap-1.5 flex-1 sm:flex-initial min-w-0">
              <Search className="w-4 h-4 text-zinc-500 shrink-0 hidden sm:block" />
              <NoirVoiceInput
                value={searchInput}
                onValueChange={setSearchInput}
                voiceContext="admin_table_search"
                placeholder="Поиск по полям..."
                containerClassName="flex-1 sm:w-64 min-w-0"
              />
              <NoirButton type="submit" variant="outline" className="shrink-0">
                Найти
              </NoirButton>
            </form>

            <div className="flex items-center gap-1.5">
              <span className="text-zinc-400">Лимит:</span>
              <select
                value={limit}
                onChange={(e) => {
                  setOffset(0);
                  setLimit(parseInt(e.target.value, 10));
                }}
                className="min-h-[38px] px-2 noir-input text-[14px]"
              >
                <option value={20}>20 строк</option>
                <option value={50}>50 строк</option>
                <option value={100}>100 строк</option>
                <option value={250}>250 строк</option>
                <option value={500}>500 строк</option>
              </select>
            </div>

            <NoirButton
              variant="subtle"
              onClick={handleExportCsv}
              disabled={rows.length === 0}
              icon={<Download className="w-4 h-4" />}
            >
              CSV
            </NoirButton>
          </div>
        </div>

        {/* Data Table */}
        {loading ? (
          <div className="py-16 text-center text-zinc-400 text-[14px]">
            Чтение данных таблицы...
          </div>
        ) : rows.length === 0 ? (
          <div className="py-12 text-center text-zinc-400 border border-zinc-800 text-[14px]">
            В таблице «{selectedTable}» нет подходящих записей
          </div>
        ) : (
          <div className="w-full overflow-x-auto max-h-[60vh] border border-zinc-800">
            <table className="w-full text-left text-[14px] border-collapse">
              <thead>
                <tr className="bg-zinc-900 border-b-2 border-zinc-700 text-white font-bold sticky top-0 z-10">
                  {columns.map((col) => (
                    <th key={col} className="p-3 font-mono text-[14px] whitespace-nowrap border-r border-zinc-800">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800 bg-zinc-950 font-sans">
                {rows.map((row, rIdx) => (
                  <tr
                    key={rIdx}
                    onClick={() => setInspectedRow(row)}
                    className="hover:bg-zinc-900/80 transition-colors cursor-pointer"
                    title="Нажмите, чтобы открыть полную запись"
                  >
                    {columns.map((col) => {
                      const val = row[col];
                      const rendered =
                        val === null
                          ? 'NULL'
                          : typeof val === 'object'
                          ? JSON.stringify(val)
                          : String(val);

                      return (
                        <td
                          key={col}
                          className="p-3 text-[14px] text-zinc-300 border-r border-zinc-900 max-w-xs truncate"
                          title={rendered}
                        >
                          {rendered}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Controls */}
        {totalCount > limit && (
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-zinc-800 text-[14px]">
            <span className="text-zinc-400">
              Показано {offset + 1}–{Math.min(offset + rows.length, totalCount)} из {totalCount}
            </span>
            <div className="flex items-center gap-2">
              <NoirButton
                variant="outline"
                disabled={offset === 0 || loading}
                onClick={() => setOffset(Math.max(0, offset - limit))}
                icon={<ChevronLeft className="w-4 h-4" />}
              >
                Назад
              </NoirButton>
              <NoirButton
                variant="outline"
                disabled={offset + rows.length >= totalCount || loading}
                onClick={() => setOffset(offset + limit)}
                icon={<ChevronRight className="w-4 h-4" />}
              >
                Далее
              </NoirButton>
            </div>
          </div>
        )}
      </div>

      <TableRowModal
        isOpen={Boolean(inspectedRow)}
        onClose={() => setInspectedRow(null)}
        tableName={selectedTable}
        row={inspectedRow}
      />
    </div>
  );
};
