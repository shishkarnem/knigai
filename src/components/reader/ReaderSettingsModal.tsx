import React, { useState } from 'react';
import {
  Sliders,
  Type,
  Palette,
  Layers,
  BookOpen,
  Sparkles,
  RotateCcw,
  Check,
  X,
  Minus,
  Plus,
} from 'lucide-react';
import {
  ReaderSettings,
  READING_FONTS,
  ReadingFontId,
  PAGE_STYLES,
  PageStyleId,
  READER_BG_STYLES,
  ReaderBgStyle,
  PageTextureId,
  PageBorderId,
  PageLineSpacingId,
  PageMarginsId,
  DEFAULT_READER_SETTINGS,
} from './ReaderThemeSelector';
import { NoirModal } from '../common/NoirModal';
import { NoirButton } from '../common/NoirButton';

export interface ReaderSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: ReaderSettings;
  onChangeSettings: (settings: ReaderSettings) => void;
  onReset: () => void;
  customHeader: string;
  onCustomHeaderChange: (val: string) => void;
  leftFooter: string;
  onLeftFooterChange: (val: string) => void;
  rightFooter: string;
  onRightFooterChange: (val: string) => void;
  hideFooters: boolean;
  onHideFootersChange: (val: boolean) => void;
  bookTitle?: string;
}

export const ReaderSettingsModal: React.FC<ReaderSettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onChangeSettings,
  onReset,
  customHeader,
  onCustomHeaderChange,
  leftFooter,
  onLeftFooterChange,
  rightFooter,
  onRightFooterChange,
  hideFooters,
  onHideFootersChange,
  bookTitle = 'Книга',
}) => {
  const [activeTab, setActiveTab] = useState<'typography' | 'paper' | 'background' | 'headers'>('typography');

  const update = <K extends keyof ReaderSettings>(key: K, value: ReaderSettings[K]) => {
    onChangeSettings({
      ...settings,
      [key]: value,
    });
  };

  const fontKeys = Object.keys(READING_FONTS) as ReadingFontId[];
  const pageStyleKeys = Object.keys(PAGE_STYLES) as PageStyleId[];
  const bgKeys = Object.keys(READER_BG_STYLES) as ReaderBgStyle[];

  return (
    <NoirModal
      isOpen={isOpen}
      onClose={onClose}
      title="Параметры и оформление читалки"
      maxWidth="max-w-3xl"
    >
      <div className="flex flex-col gap-5 text-white">
        {/* Navigation Tabs (No horizontal scroll, wrap cleanly) */}
        <div className="flex flex-wrap items-center gap-1.5 pb-2 border-b border-zinc-700">
          {[
            { id: 'typography', label: 'Шрифт и текст', icon: Type },
            { id: 'paper', label: 'Бумага и поля', icon: Layers },
            { id: 'background', label: 'Фон окружения', icon: Palette },
            { id: 'headers', label: 'Колонтитулы', icon: Sliders },
          ].map((tab) => {
            const Icon = tab.icon;
            const isCurrent = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as any)}
                className={`min-h-[40px] px-3.5 text-[14px] font-bold border transition flex items-center gap-2 cursor-pointer ${
                  isCurrent
                    ? 'bg-white text-black border-white'
                    : 'bg-zinc-900 text-zinc-300 border-zinc-700 hover:text-white'
                }`}
              >
                <Icon className={`w-4 h-4 ${isCurrent ? 'text-black' : 'text-zinc-400'}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* TAB 1: TYPOGRAPHY (Font size 14-20, 10 fonts) */}
        {activeTab === 'typography' && (
          <div className="flex flex-col gap-5 max-h-[60vh] overflow-y-auto pr-1">
            {/* Font Size Slider with Quick Steps */}
            <div className="p-4 bg-zinc-950 border border-zinc-800 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <label className="text-[14px] font-bold text-white flex items-center gap-2">
                  <Type className="w-4 h-4 text-rose-500" />
                  <span>Размер шрифта для чтения (от 14 до 20 pt):</span>
                </label>
                <span className="font-mono text-[16px] font-bold text-rose-500 px-2 py-0.5 bg-zinc-900 border border-zinc-700">
                  {Math.max(14, settings.fontSize)} pt
                </span>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => update('fontSize', Math.max(14, settings.fontSize - 1))}
                  disabled={settings.fontSize <= 14}
                  className="w-10 h-10 bg-zinc-900 border border-zinc-700 hover:bg-white hover:text-black text-white font-bold flex items-center justify-center cursor-pointer disabled:opacity-40"
                  title="Уменьшить шрифт"
                >
                  <Minus className="w-4 h-4" />
                </button>

                <input
                  type="range"
                  min={14}
                  max={20}
                  step={1}
                  value={Math.max(14, settings.fontSize)}
                  onChange={(e) => update('fontSize', parseInt(e.target.value, 10))}
                  className="flex-1 accent-rose-500 cursor-pointer"
                />

                <button
                  type="button"
                  onClick={() => update('fontSize', Math.min(20, settings.fontSize + 1))}
                  disabled={settings.fontSize >= 20}
                  className="w-10 h-10 bg-zinc-900 border border-zinc-700 hover:bg-white hover:text-black text-white font-bold flex items-center justify-center cursor-pointer disabled:opacity-40"
                  title="Увеличить шрифт"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>

              <p className="text-[14px] text-zinc-400">
                При изменении размера текста страницы автоматически перерассчитываются, а текст переносится на следующие страницы без потери слов.
              </p>
            </div>

            {/* 10 Reading Fonts */}
            <div className="flex flex-col gap-2">
              <span className="text-[14px] font-bold text-white">
                Шрифт для чтения (10 вариантов для русского текста):
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {fontKeys.map((fKey) => {
                  const f = READING_FONTS[fKey];
                  const isSelected = settings.fontId === fKey;
                  return (
                    <button
                      key={fKey}
                      type="button"
                      onClick={() => update('fontId', fKey)}
                      className={`p-3 text-left border flex items-center justify-between transition cursor-pointer ${
                        isSelected
                          ? 'bg-white text-black border-white font-bold shadow-md'
                          : 'bg-zinc-950 text-zinc-200 border-zinc-800 hover:border-zinc-500'
                      }`}
                    >
                      <div>
                        <div className="text-[14px] font-bold block">{f.name}</div>
                        <span
                          className={`text-[14px] font-mono ${
                            isSelected ? 'text-zinc-700' : 'text-zinc-400'
                          }`}
                        >
                          {f.category}
                        </span>
                      </div>
                      <span
                        className="text-[15px] px-2 py-0.5 border"
                        style={{
                          fontFamily: f.cssFamily,
                          borderColor: isSelected ? '#000000' : '#3f3f46',
                        }}
                      >
                        Аа Бб Вв
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: PAPER & STRUCTURE */}
        {activeTab === 'paper' && (
          <div className="flex flex-col gap-5 max-h-[60vh] overflow-y-auto pr-1">
            {/* Page Style & Structure */}
            <div className="flex flex-col gap-2">
              <span className="text-[14px] font-bold text-white">
                Стиль и фактура страниц книги:
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {pageStyleKeys.map((sKey) => {
                  const s = PAGE_STYLES[sKey];
                  const isSelected = settings.pageStyle === sKey;
                  return (
                    <button
                      key={sKey}
                      type="button"
                      onClick={() => update('pageStyle', sKey)}
                      className={`p-3 text-left border flex flex-col justify-between transition cursor-pointer ${
                        isSelected
                          ? 'bg-zinc-800 border-white text-white font-bold ring-1 ring-white'
                          : 'bg-zinc-950 border-zinc-800 text-zinc-300 hover:border-zinc-600'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span
                          className="w-4 h-4 border border-zinc-500 shrink-0"
                          style={{ backgroundColor: s.previewColor }}
                        />
                        <span className="text-[14px] font-bold">{s.name}</span>
                      </div>
                      <p className="text-[14px] text-zinc-400 leading-snug line-clamp-2">
                        {s.desc}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Line Spacing */}
            <div className="flex flex-col gap-2">
              <span className="text-[14px] font-bold text-white">Межстрочный интервал:</span>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'compact', label: 'Компактный (1.35)' },
                  { id: 'normal', label: 'Стандартный (1.55)' },
                  { id: 'relaxed', label: 'Свободный (1.85)' },
                ].map((item) => {
                  const isSelected = settings.lineSpacing === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => update('lineSpacing', item.id as PageLineSpacingId)}
                      className={`min-h-[42px] px-2 text-[14px] font-bold border transition text-center cursor-pointer ${
                        isSelected
                          ? 'bg-white text-black border-white'
                          : 'bg-zinc-950 text-zinc-300 border-zinc-800 hover:border-zinc-600'
                      }`}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Margins */}
            <div className="flex flex-col gap-2">
              <span className="text-[14px] font-bold text-white">Поля страницы:</span>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'narrow', label: 'Узкие (больше текста)' },
                  { id: 'normal', label: 'Стандартные' },
                  { id: 'wide', label: 'Широкие (комфорт)' },
                ].map((item) => {
                  const isSelected = settings.margins === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => update('margins', item.id as PageMarginsId)}
                      className={`min-h-[42px] px-2 text-[14px] font-bold border transition text-center cursor-pointer ${
                        isSelected
                          ? 'bg-white text-black border-white'
                          : 'bg-zinc-950 text-zinc-300 border-zinc-800 hover:border-zinc-600'
                      }`}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Texture & Frame */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <span className="text-[14px] font-bold text-white block mb-1">
                  Текстура бумаги:
                </span>
                <select
                  value={settings.texture}
                  onChange={(e) => update('texture', e.target.value as PageTextureId)}
                  className="w-full min-h-[44px] px-3 noir-input text-[14px]"
                >
                  <option value="antique-fibers" className="bg-zinc-900 text-white">
                    Волокна античной бумаги
                  </option>
                  <option value="book-grain" className="bg-zinc-900 text-white">
                    Типографская зернистость
                  </option>
                  <option value="smooth" className="bg-zinc-900 text-white">
                    Гладкая поверхность
                  </option>
                </select>
              </div>

              <div>
                <span className="text-[14px] font-bold text-white block mb-1">
                  Рамка страниц:
                </span>
                <select
                  value={settings.borderStyle}
                  onChange={(e) => update('borderStyle', e.target.value as PageBorderId)}
                  className="w-full min-h-[44px] px-3 noir-input text-[14px]"
                >
                  <option value="ornate" className="bg-zinc-900 text-white">
                    Орнаментальная рамка с уголками
                  </option>
                  <option value="single" className="bg-zinc-900 text-white">
                    Одинарная строгая рамка
                  </option>
                  <option value="none" className="bg-zinc-900 text-white">
                    Без рамки
                  </option>
                </select>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: BACKGROUND OF READER */}
        {activeTab === 'background' && (
          <div className="flex flex-col gap-4 max-h-[60vh] overflow-y-auto pr-1">
            <span className="text-[14px] font-bold text-white">
              Фон вокруг книги в читалке:
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {bgKeys.map((bKey) => {
                const b = READER_BG_STYLES[bKey];
                const isSelected = settings.bgStyle === bKey;
                return (
                  <button
                    key={bKey}
                    type="button"
                    onClick={() => update('bgStyle', bKey)}
                    className={`p-4 text-left border flex items-center justify-between transition cursor-pointer ${
                      isSelected
                        ? 'bg-zinc-800 border-white text-white ring-1 ring-white'
                        : 'bg-zinc-950 border-zinc-800 text-zinc-300 hover:border-zinc-600'
                    }`}
                  >
                    <div>
                      <span className="text-[15px] font-bold block">{b.name}</span>
                      <span className="text-[14px] text-zinc-400 mt-0.5 block">{b.preview}</span>
                    </div>
                    {isSelected && <Check className="w-5 h-5 text-rose-500 shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 4: HEADERS & FOOTERS */}
        {activeTab === 'headers' && (
          <div className="flex flex-col gap-4 max-h-[60vh] overflow-y-auto pr-1">
            <div>
              <label className="block text-[14px] font-bold text-white mb-1">
                Верхний колонтитул (название книги/серии):
              </label>
              <input
                type="text"
                value={customHeader}
                onChange={(e) => onCustomHeaderChange(e.target.value)}
                placeholder={bookTitle}
                className="w-full min-h-[44px] px-3.5 noir-input text-[14px]"
              />
            </div>

            <div>
              <label className="block text-[14px] font-bold text-white mb-1">
                Левая подпись нижнего колонтитула:
              </label>
              <input
                type="text"
                value={leftFooter}
                onChange={(e) => onLeftFooterChange(e.target.value)}
                placeholder="Стр. 20/496 (авто)"
                className="w-full min-h-[44px] px-3.5 noir-input text-[14px]"
              />
            </div>

            <div>
              <label className="block text-[14px] font-bold text-white mb-1">
                Правая подпись нижнего колонтитула:
              </label>
              <input
                type="text"
                value={rightFooter}
                onChange={(e) => onRightFooterChange(e.target.value)}
                placeholder="Издание автора"
                className="w-full min-h-[44px] px-3.5 noir-input text-[14px]"
              />
            </div>

            <label className="flex items-center gap-2 cursor-pointer pt-2 text-[14px]">
              <input
                type="checkbox"
                checked={hideFooters}
                onChange={(e) => onHideFootersChange(e.target.checked)}
                className="w-4 h-4 accent-rose-500 cursor-pointer"
              />
              <span>Полностью скрыть нижние подписи издательства</span>
            </label>
          </div>
        )}

        {/* Footer Actions */}
        <div className="flex items-center justify-between pt-4 border-t border-zinc-800">
          <NoirButton
            variant="outline"
            onClick={onReset}
            icon={<RotateCcw className="w-4 h-4 text-zinc-400" />}
          >
            Сбросить по умолчанию
          </NoirButton>

          <NoirButton variant="primary" onClick={onClose}>
            Применить и закрыть
          </NoirButton>
        </div>
      </div>
    </NoirModal>
  );
};
