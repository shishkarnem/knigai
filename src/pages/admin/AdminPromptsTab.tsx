import React, { useState, useEffect } from 'react';
import { Database, Save, RefreshCw, Info, Coins } from 'lucide-react';
import { PromptTemplate } from '../../types';
import { fetchAllPrompts, updatePromptInDb } from '../../services/db/promptRepository';
import { NoirButton } from '../../components/common/NoirButton';
import { NoirStatus } from '../../components/common/NoirStatus';
import { NoirPromptTextarea } from '../../components/editor/NoirPromptTextarea';
import { NoirVoiceInput } from '../../components/voice/NoirVoiceInput';

const CATEGORIES: Array<{ id: PromptTemplate['category']; label: string }> = [
  { id: 'synopsis', label: 'Концепт и план глав' },
  { id: 'chapters', label: 'Главы и подбор сущностей' },
  { id: 'characters', label: 'Персонажи' },
  { id: 'lore', label: 'Лор и мир' },
  { id: 'import', label: 'Импорт и разбор книг' },
  { id: 'visuals', label: 'Иллюстрации' },
  { id: 'covers', label: 'Обложки и переплет' },
  { id: 'style', label: 'Стили текста' },
  { id: 'voice', label: 'Голосовой ввод' },
];

export const AdminPromptsTab: React.FC = () => {
  const [prompts, setPrompts] = useState<PromptTemplate[]>([]);
  const [selectedKey, setSelectedKey] = useState<string>('');
  const [currentTitle, setCurrentTitle] = useState<string>('');
  const [currentCategory, setCurrentCategory] = useState<PromptTemplate['category']>('synopsis');
  const [currentSystemInstruction, setCurrentSystemInstruction] = useState<string>('');
  const [currentTemplate, setCurrentTemplate] = useState<string>('');
  const [currentMacroDesc, setCurrentMacroDesc] = useState<string>('');
  const [inputMult, setInputMult] = useState<number>(1.0);
  const [outputMult, setOutputMult] = useState<number>(1.0);
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: 'info' | 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    loadPrompts(true);
  }, []);

  const applySelection = (item: PromptTemplate) => {
    setSelectedKey(item.key);
    setCurrentTitle(item.title || item.name);
    setCurrentCategory(item.category);
    setCurrentSystemInstruction(item.system_instruction || '');
    setCurrentTemplate(item.template);
    setCurrentMacroDesc(item.macro_description || '');
    setInputMult(item.input_cost_multiplier ?? 1.0);
    setOutputMult(item.output_cost_multiplier ?? 1.0);
  };

  const loadPrompts = async (forceRefresh = false) => {
    setLoading(true);
    try {
      const list = await fetchAllPrompts(forceRefresh);
      setPrompts(list);
      if (list.length > 0) {
        const current = list.find((p) => p.key === selectedKey) || list[0];
        applySelection(current);
      }
    } catch (e: unknown) {
      console.warn('Failed loading prompts:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = (key: string) => {
    const item = prompts.find((p) => p.key === key);
    if (item) {
      applySelection(item);
      setStatusMsg(null);
    }
  };

  const handleSaveToDb = async () => {
    if (!selectedKey) return;
    setLoading(true);
    setStatusMsg(null);
    try {
      const ok = await updatePromptInDb({
        key: selectedKey,
        title: currentTitle,
        category: currentCategory,
        system_instruction: currentSystemInstruction,
        template: currentTemplate,
        macro_description: currentMacroDesc,
        input_cost_multiplier: Number(inputMult) || 1.0,
        output_cost_multiplier: Number(outputMult) || 1.0,
      });
      if (ok) {
        setStatusMsg({
          type: 'success',
          text: `Промпт «${currentTitle}» сохранен в таблице ai_prompts и применен ко всем процессам генерации!`,
        });
        setPrompts((prev) =>
          prev.map((p) =>
            p.key === selectedKey
              ? {
                  ...p,
                  name: currentTitle,
                  title: currentTitle,
                  category: currentCategory,
                  system_instruction: currentSystemInstruction,
                  template: currentTemplate,
                  macro_description: currentMacroDesc,
                  input_cost_multiplier: Number(inputMult) || 1.0,
                  output_cost_multiplier: Number(outputMult) || 1.0,
                }
              : p
          )
        );
      } else {
        setStatusMsg({ type: 'error', text: 'Не удалось сохранить промпт в БД' });
      }
    } catch (e: unknown) {
      setStatusMsg({ type: 'error', text: 'Ошибка: ' + (e instanceof Error ? e.message : '') });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-5 text-white">
      <div className="noir-container p-4 border border-zinc-700 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-white text-black flex items-center justify-center font-bold shrink-0">
            <Database className="w-5 h-5 text-black" />
          </div>
          <div>
            <h3 className="text-[17px] font-bold text-white">
              Системные промпты нейросети и тарифы в базе данных
            </h3>
            <p className="text-[14px] text-zinc-400">
              Таблица PostgreSQL: <code className="font-mono text-white underline">ai_prompts</code> · Все ИИ-модули берут шаблоны и макросы отсюда.
            </p>
          </div>
        </div>

        <NoirButton
          variant="subtle"
          onClick={() => loadPrompts(true)}
          loading={loading}
          icon={<RefreshCw className="w-4 h-4" />}
        >
          Обновить из БД
        </NoirButton>
      </div>

      {statusMsg && <NoirStatus type={statusMsg.type} message={statusMsg.text} />}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left List */}
        <div className="lg:col-span-1 noir-container p-4 border border-zinc-700 flex flex-col gap-2 max-h-[75vh] overflow-y-auto">
          <label className="text-[14px] font-bold text-white mb-1">
            Все системные промпты ({prompts.length}):
          </label>
          {prompts.map((p) => {
            const isSelected = p.key === selectedKey;
            return (
              <button
                key={p.key}
                type="button"
                onClick={() => handleSelect(p.key)}
                className={`min-h-[48px] p-3 text-left transition-all border flex flex-col gap-0.5 cursor-pointer ${
                  isSelected
                    ? 'bg-white text-black border-white font-bold'
                    : 'bg-zinc-950 text-zinc-300 border-zinc-800 hover:border-zinc-500'
                }`}
              >
                <span className="text-[14px] leading-tight break-words">{p.title || p.name}</span>
                <div className="flex items-center justify-between gap-2 text-[14px] font-mono opacity-80">
                  <span className={isSelected ? 'text-black' : 'text-zinc-400'}>{p.key}</span>
                  <span className={isSelected ? 'text-rose-700 font-bold' : 'text-rose-400'}>
                    ×{p.input_cost_multiplier ?? 1} / ×{p.output_cost_multiplier ?? 1}
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Right Editor */}
        <div className="lg:col-span-2 noir-container p-4 sm:p-6 border border-zinc-700 flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-zinc-800">
            <div>
              <h4 className="text-[17px] font-bold text-white break-words">{currentTitle}</h4>
              <p className="text-[14px] font-mono text-zinc-400">ключ: {selectedKey}</p>
            </div>

            <NoirButton
              variant="primary"
              onClick={handleSaveToDb}
              loading={loading}
              icon={<Save className="w-4 h-4 text-black" />}
            >
              Сохранить в БД
            </NoirButton>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[14px] font-bold text-white mb-1">Название шаблона:</label>
              <NoirVoiceInput
                value={currentTitle}
                onValueChange={setCurrentTitle}
                voiceContext="admin_prompt_title"
                placeholder="Название шаблона промпта..."
              />
            </div>

            <div>
              <label className="block text-[14px] font-bold text-white mb-1">Категория:</label>
              <select
                value={currentCategory}
                onChange={(e) => setCurrentCategory(e.target.value as PromptTemplate['category'])}
                className="w-full min-h-[44px] px-3 noir-input text-[14px]"
              >
                {CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id} className="bg-zinc-900 text-white">
                    {c.label} ({c.id})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-zinc-950/80 border border-zinc-800">
            <div>
              <label className="flex items-center gap-1.5 text-[14px] font-bold text-zinc-200 mb-1">
                <Coins className="w-4 h-4 text-rose-500" />
                <span>Множитель стоимости Входа (Input):</span>
              </label>
              <input
                type="number"
                step="0.1"
                min="0"
                value={inputMult}
                onChange={(e) => setInputMult(parseFloat(e.target.value) || 0)}
                className="w-full min-h-[42px] px-3 noir-input font-mono text-[14px]"
              />
            </div>
            <div>
              <label className="flex items-center gap-1.5 text-[14px] font-bold text-zinc-200 mb-1">
                <Coins className="w-4 h-4 text-rose-500" />
                <span>Множитель стоимости Выхода (Output):</span>
              </label>
              <input
                type="number"
                step="0.1"
                min="0"
                value={outputMult}
                onChange={(e) => setOutputMult(parseFloat(e.target.value) || 0)}
                className="w-full min-h-[42px] px-3 noir-input font-mono text-[14px]"
              />
            </div>
          </div>

          {currentMacroDesc && (
            <div className="p-3 bg-zinc-950/80 border border-zinc-800 flex items-start gap-2.5 text-[14px]">
              <Info className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <span className="font-bold text-white block">Доступные макросы из базы данных:</span>
                <code className="font-mono text-rose-300 break-words text-[14px]">{currentMacroDesc}</code>
              </div>
            </div>
          )}

          <div>
            <label className="block text-[14px] font-bold text-white mb-1">
              Системная инструкция для нейросети:
            </label>
            <NoirPromptTextarea
              minRows={2}
              maxRows={5}
              value={currentSystemInstruction}
              onChange={(e) => setCurrentSystemInstruction(e.target.value)}
              placeholder="Роль и системные ограничения модели..."
            />
          </div>

          <div>
            <label className="block text-[14px] font-bold text-white mb-1">
              Шаблон запроса с макросами (в фигурных скобках):
            </label>
            <NoirPromptTextarea
              minRows={6}
              maxRows={14}
              value={currentTemplate}
              onChange={(e) => setCurrentTemplate(e.target.value)}
              className="font-mono"
            />
          </div>
        </div>
      </div>
    </div>
  );
};
