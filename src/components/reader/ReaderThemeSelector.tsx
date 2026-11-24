import React from 'react';
import {
  Type,
  Palette,
  Layers,
  BookOpen,
  Sparkles,
  Sliders,
  Check,
  RotateCcw,
} from 'lucide-react';

// 1. Reading Fonts: 10 distinct fonts for Russian & Latin reading
export type ReadingFontId =
  | 'pt-serif'
  | 'merriweather'
  | 'eb-garamond'
  | 'cormorant'
  | 'literata'
  | 'lora'
  | 'spectral'
  | 'roboto-slab'
  | 'courier'
  | 'inter';

export interface ReadingFontConfig {
  id: ReadingFontId;
  name: string;
  category: string;
  cssFamily: string;
  previewSample: string;
}

export const READING_FONTS: Record<ReadingFontId, ReadingFontConfig> = {
  'pt-serif': {
    id: 'pt-serif',
    name: 'PT Serif',
    category: 'Книжный сериф',
    cssFamily: "'PT Serif', serif",
    previewSample: 'Текст книги',
  },
  merriweather: {
    id: 'merriweather',
    name: 'Merriweather',
    category: 'Литературный',
    cssFamily: "'Merriweather', serif",
    previewSample: 'Текст книги',
  },
  'eb-garamond': {
    id: 'eb-garamond',
    name: 'EB Garamond',
    category: 'Ренессанс',
    cssFamily: "'EB Garamond', serif",
    previewSample: 'Текст книги',
  },
  cormorant: {
    id: 'cormorant',
    name: 'Cormorant',
    category: 'Антиква',
    cssFamily: "'Cormorant Garamond', serif",
    previewSample: 'Текст книги',
  },
  literata: {
    id: 'literata',
    name: 'Literata',
    category: 'Электронная книга',
    cssFamily: "'Literata', serif",
    previewSample: 'Текст книги',
  },
  lora: {
    id: 'lora',
    name: 'Lora',
    category: 'Каллиграфический',
    cssFamily: "'Lora', serif",
    previewSample: 'Текст книги',
  },
  spectral: {
    id: 'spectral',
    name: 'Spectral',
    category: 'Контрастный',
    cssFamily: "'Spectral', serif",
    previewSample: 'Текст книги',
  },
  'roboto-slab': {
    id: 'roboto-slab',
    name: 'Roboto Slab',
    category: 'Брусковый',
    cssFamily: "'Roboto Slab', serif",
    previewSample: 'Текст книги',
  },
  courier: {
    id: 'courier',
    name: 'Courier Prime',
    category: 'Печатная машинка',
    cssFamily: "'Courier Prime', monospace",
    previewSample: 'Текст книги',
  },
  inter: {
    id: 'inter',
    name: 'Inter',
    category: 'Чистый гротеск',
    cssFamily: "'Inter', sans-serif",
    previewSample: 'Текст книги',
  },
};

// 2. Reader Background Style (сфера вокруг книги)
export type ReaderBgStyle =
  | 'noir-oled'
  | 'noir-crimson'
  | 'noir-vignette'
  | 'noir-graphite'
  | 'noir-sepia';

export interface ReaderBgConfig {
  id: ReaderBgStyle;
  name: string;
  preview: string;
  wrapperClass: string;
}

export const READER_BG_STYLES: Record<ReaderBgStyle, ReaderBgConfig> = {
  'noir-oled': {
    id: 'noir-oled',
    name: 'Глубокий OLED Нуар',
    preview: '#000000',
    wrapperClass: 'bg-black text-white',
  },
  'noir-crimson': {
    id: 'noir-crimson',
    name: 'Красный полумрак',
    preview: '#26050b',
    wrapperClass: 'bg-gradient-to-b from-black via-zinc-950 to-rose-950/40 text-white',
  },
  'noir-vignette': {
    id: 'noir-vignette',
    name: 'Виньетка тайны',
    preview: '#111115',
    wrapperClass: 'bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-zinc-900 via-zinc-950 to-black text-white',
  },
  'noir-graphite': {
    id: 'noir-graphite',
    name: 'Кабинетный графит',
    preview: '#1c1c20',
    wrapperClass: 'bg-zinc-950 border border-zinc-800 text-white',
  },
  'noir-sepia': {
    id: 'noir-sepia',
    name: 'Архивный фолиант',
    preview: '#1a140f',
    wrapperClass: 'bg-[#120e0a] text-amber-100',
  },
};

// 3. Page Style (стиль страниц: цвет, фактура, античный пергамент и т.д.)
export type PageStyleId =
  | 'antique'
  | 'cream'
  | 'white'
  | 'noir'
  | 'newsprint'
  | 'cyber';

export interface PageStyleConfig {
  id: PageStyleId;
  name: string;
  desc: string;
  sheetBg: string;
  sheetText: string;
  sheetBorder: string;
  headerBorder: string;
  accentColor: string;
  previewColor: string;
  innerShadow: string;
  textureOverlay?: string;
}

export const PAGE_STYLES: Record<PageStyleId, PageStyleConfig> = {
  antique: {
    id: 'antique',
    name: 'Античный пергамент',
    desc: 'Состаренная бумага, патина и винтажная текстура волокон',
    sheetBg: 'bg-[#e7d9b9]',
    sheetText: 'text-[#2a1d0f]',
    sheetBorder: 'border-[#8f643f]',
    headerBorder: 'border-[#bba078]',
    accentColor: '#7c2d12',
    previewColor: '#e7d9b9',
    innerShadow: 'inset 0 0 60px rgba(110,65,20,0.22), 0 20px 45px rgba(0,0,0,0.6)',
    textureOverlay:
      'radial-gradient(circle at 10% 20%, rgba(139,90,43,0.12) 0%, transparent 40%), radial-gradient(circle at 90% 80%, rgba(100,50,15,0.14) 0%, transparent 45%)',
  },
  cream: {
    id: 'cream',
    name: 'Кремовый Munken',
    desc: 'Классическая типографская бумага цвета слоновой кости',
    sheetBg: 'bg-[#fbf7ee]',
    sheetText: 'text-[#1c1712]',
    sheetBorder: 'border-[#ddcab0]',
    headerBorder: 'border-[#dfd3be]',
    accentColor: '#92400e',
    previewColor: '#fbf7ee',
    innerShadow: 'inset 0 0 45px rgba(0,0,0,0.04), 0 16px 36px rgba(0,0,0,0.4)',
  },
  white: {
    id: 'white',
    name: 'Белый офсет',
    desc: 'Гладкая бумага книжного блока 80г/м²',
    sheetBg: 'bg-[#ffffff]',
    sheetText: 'text-[#111113]',
    sheetBorder: 'border-zinc-300',
    headerBorder: 'border-zinc-200',
    accentColor: '#000000',
    previewColor: '#ffffff',
    innerShadow: 'inset 0 0 35px rgba(0,0,0,0.03), 0 16px 36px rgba(0,0,0,0.3)',
  },
  noir: {
    id: 'noir',
    name: 'Глубокий нуар',
    desc: 'Черная матовая бумага с белым текстом и красными буквицами',
    sheetBg: 'bg-[#0c0c0e]',
    sheetText: 'text-[#f4f4f5]',
    sheetBorder: 'border-zinc-700',
    headerBorder: 'border-zinc-800',
    accentColor: '#f43f5e',
    previewColor: '#0c0c0e',
    innerShadow: 'inset 0 0 50px rgba(255,255,255,0.02), 0 20px 45px rgba(0,0,0,0.85)',
  },
  newsprint: {
    id: 'newsprint',
    name: 'Газетный ретро',
    desc: 'Сероватая фактурная бумага архивной прессы',
    sheetBg: 'bg-[#ece6d9]',
    sheetText: 'text-[#1d1915]',
    sheetBorder: 'border-[#c5bcad]',
    headerBorder: 'border-[#b8ad9c]',
    accentColor: '#451a03',
    previewColor: '#ece6d9',
    innerShadow: 'inset 0 0 40px rgba(0,0,0,0.06), 0 16px 36px rgba(0,0,0,0.4)',
  },
  cyber: {
    id: 'cyber',
    name: 'Кибер-манускрипт',
    desc: 'Техно-фолиант с тонкой алой нитью',
    sheetBg: 'bg-[#09090b]',
    sheetText: 'text-[#ffffff]',
    sheetBorder: 'border-rose-900/60',
    headerBorder: 'border-rose-950',
    accentColor: '#e11d48',
    previewColor: '#09090b',
    innerShadow: 'inset 0 0 45px rgba(225,29,72,0.08), 0 20px 45px rgba(0,0,0,0.9)',
  },
};

// 4. Page Structure Options
export type PageTextureId = 'antique-fibers' | 'book-grain' | 'smooth';
export type PageBorderId = 'ornate' | 'single' | 'none';
export type PageLineSpacingId = 'compact' | 'normal' | 'relaxed';
export type PageMarginsId = 'narrow' | 'normal' | 'wide';

export interface ReaderSettings {
  fontSize: number; // 14 to 20
  fontId: ReadingFontId;
  bgStyle: ReaderBgStyle;
  pageStyle: PageStyleId;
  texture: PageTextureId;
  borderStyle: PageBorderId;
  lineSpacing: PageLineSpacingId;
  margins: PageMarginsId;
}

export const DEFAULT_READER_SETTINGS: ReaderSettings = {
  fontSize: 16,
  fontId: 'pt-serif',
  bgStyle: 'noir-oled',
  pageStyle: 'antique',
  texture: 'antique-fibers',
  borderStyle: 'ornate',
  lineSpacing: 'normal',
  margins: 'normal',
};

// Backward-compatibility alias
export type ReaderTheme = 'noir-dark' | 'manga-white' | 'cream-classic' | 'sepia-vintage';
export const READER_THEMES: Record<string, { id: string; name: string; sheetBg: string; sheetText: string; sheetBorder: string; headerBorder: string; accentColor: string }> = {
  'noir-dark': {
    id: 'noir-dark',
    name: 'Нуар книга',
    sheetBg: 'bg-[#0c0c0e]',
    sheetText: 'text-zinc-100',
    sheetBorder: 'border-zinc-700',
    headerBorder: 'border-zinc-800',
    accentColor: '#ffffff',
  },
  'manga-white': {
    id: 'manga-white',
    name: 'Белая бумага',
    sheetBg: 'bg-[#ffffff]',
    sheetText: 'text-[#111111]',
    sheetBorder: 'border-zinc-300',
    headerBorder: 'border-zinc-200',
    accentColor: '#000000',
  },
  'cream-classic': {
    id: 'cream-classic',
    name: 'Кремовая классика',
    sheetBg: 'bg-[#fbf7ee]',
    sheetText: 'text-[#1d1712]',
    sheetBorder: 'border-[#ddcab0]',
    headerBorder: 'border-[#dfd3be]',
    accentColor: '#92400e',
  },
  'sepia-vintage': {
    id: 'sepia-vintage',
    name: 'Сепия архив',
    sheetBg: 'bg-[#e7d9b9]',
    sheetText: 'text-[#2a1d0f]',
    sheetBorder: 'border-[#8f643f]',
    headerBorder: 'border-[#bba078]',
    accentColor: '#7c2d12',
  },
};

interface ReaderAppearanceControlsProps {
  settings: ReaderSettings;
  onChangeSettings: (settings: ReaderSettings) => void;
  onReset?: () => void;
}

export const ReaderAppearanceControls: React.FC<ReaderAppearanceControlsProps> = ({
  settings,
  onChangeSettings,
  onReset,
}) => {
  const [activeTab, setActiveTab] = React.useState<'typography' | 'pages' | 'bg'>('typography');

  const updateSetting = <K extends keyof ReaderSettings>(key: K, value: ReaderSettings[K]) => {
    onChangeSettings({
      ...settings,
      [key]: value,
    });
  };

  return (
    <div className="w-full flex flex-col gap-3 noir-container p-3 sm:p-4 border border-zinc-800 text-white">
      {/* Category Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 pb-2.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setActiveTab('typography')}
            className={`min-h-[40px] px-3.5 py-1 text-[14px] font-bold border transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'typography'
                ? 'bg-white text-black border-white'
                : 'bg-zinc-950/80 text-zinc-300 border-zinc-700 hover:text-white'
            }`}
          >
            <Type className="w-4 h-4 shrink-0" />
            <span>Шрифт и размер (14–20px)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('pages')}
            className={`min-h-[40px] px-3.5 py-1 text-[14px] font-bold border transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'pages'
                ? 'bg-white text-black border-white'
                : 'bg-zinc-950/80 text-zinc-300 border-zinc-700 hover:text-white'
            }`}
          >
            <BookOpen className="w-4 h-4 shrink-0" />
            <span>Стиль и структура страниц</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('bg')}
            className={`min-h-[40px] px-3.5 py-1 text-[14px] font-bold border transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'bg'
                ? 'bg-white text-black border-white'
                : 'bg-zinc-950/80 text-zinc-300 border-zinc-700 hover:text-white'
            }`}
          >
            <Palette className="w-4 h-4 shrink-0" />
            <span>Фон читалки</span>
          </button>
        </div>

        {onReset && (
          <button
            type="button"
            onClick={onReset}
            className="min-h-[36px] px-2.5 py-1 text-[14px] text-zinc-400 hover:text-white flex items-center gap-1 transition-colors cursor-pointer"
            title="Сбросить к исходным настройкам"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Сброс</span>
          </button>
        )}
      </div>

      {/* Tab 1: Typography (Font Size 14-20 & 10 Fonts) */}
      {activeTab === 'typography' && (
        <div className="flex flex-col gap-4">
          {/* Font Size Selector from 14 to 20 */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-zinc-950/70 border border-zinc-800">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[14px] font-bold text-white">Размер шрифта текста:</span>
              <span className="px-2.5 py-0.5 bg-white text-black font-mono font-bold text-[14px]">
                {Math.max(14, settings.fontSize)} px
              </span>
              <span className="text-[14px] text-zinc-400 font-mono">(диапазон 14–20px)</span>
            </div>

            {/* Stepper + Slider */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => updateSetting('fontSize', Math.max(14, settings.fontSize - 1))}
                disabled={settings.fontSize <= 14}
                className="w-9 h-9 flex items-center justify-center bg-zinc-900 border border-zinc-700 hover:bg-white hover:text-black font-bold disabled:opacity-30 cursor-pointer"
              >
                –
              </button>

              <input
                type="range"
                min={14}
                max={20}
                step={1}
                value={Math.max(14, settings.fontSize)}
                onChange={(e) => updateSetting('fontSize', parseInt(e.target.value, 10))}
                className="w-36 sm:w-48 accent-rose-500 cursor-pointer"
              />

              <button
                type="button"
                onClick={() => updateSetting('fontSize', Math.min(20, settings.fontSize + 1))}
                disabled={settings.fontSize >= 20}
                className="w-9 h-9 flex items-center justify-center bg-zinc-900 border border-zinc-700 hover:bg-white hover:text-black font-bold disabled:opacity-30 cursor-pointer"
              >
                +
              </button>
            </div>
          </div>

          {/* Quick Font Size Buttons 14 to 20 */}
          <div className="flex flex-wrap items-center gap-1">
            <span className="text-[14px] text-zinc-400 mr-1">Быстрый выбор:</span>
            {Array.from({ length: 7 }, (_, i) => 14 + i).map((sz) => (
              <button
                key={sz}
                type="button"
                onClick={() => updateSetting('fontSize', sz)}
                className={`min-h-[36px] px-2.5 text-[14px] font-mono font-bold border transition-colors cursor-pointer ${
                  settings.fontSize === sz
                    ? 'bg-white text-black border-white'
                    : 'bg-zinc-900 text-zinc-300 border-zinc-800 hover:border-zinc-600'
                }`}
              >
                {sz}
              </button>
            ))}
          </div>

          {/* 10 Reading Fonts Grid */}
          <div className="flex flex-col gap-2">
            <div className="text-[14px] font-bold text-white flex items-center gap-1.5">
              <span>Гарнитура текста (10 шрифтов на выбор):</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
              {Object.values(READING_FONTS).map((font) => {
                const isSelected = settings.fontId === font.id;

                return (
                  <button
                    key={font.id}
                    type="button"
                    onClick={() => updateSetting('fontId', font.id)}
                    className={`p-2.5 border text-left flex flex-col justify-between gap-1 transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-white text-black border-2 border-white shadow-md'
                        : 'bg-zinc-950/80 text-zinc-200 border-zinc-800 hover:border-zinc-500'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[14px] font-bold truncate">{font.name}</span>
                      {isSelected && <Check className="w-3.5 h-3.5 text-black shrink-0" />}
                    </div>
                    <span
                      className="text-[15px] truncate mt-0.5"
                      style={{ fontFamily: font.cssFamily }}
                    >
                      {font.previewSample}
                    </span>
                    <span
                      className={`text-[14px] font-mono ${
                        isSelected ? 'text-zinc-700' : 'text-zinc-400'
                      }`}
                    >
                      {font.category}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Page Styles & Structure (Antique, Cream, Borders, Margins) */}
      {activeTab === 'pages' && (
        <div className="flex flex-col gap-4">
          {/* Page Styles (Цвет и стиль страниц) */}
          <div className="flex flex-col gap-2">
            <span className="text-[14px] font-bold text-white">
              Стиль и цвет страниц книги:
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {Object.values(PAGE_STYLES).map((pStyle) => {
                const isSelected = settings.pageStyle === pStyle.id;

                return (
                  <button
                    key={pStyle.id}
                    type="button"
                    onClick={() => updateSetting('pageStyle', pStyle.id)}
                    className={`p-3 border text-left flex items-start gap-3 transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-zinc-900 border-2 border-white shadow-md'
                        : 'bg-zinc-950/80 border-zinc-800 hover:border-zinc-600'
                    }`}
                  >
                    <span
                      className="w-7 h-9 border border-zinc-500 shrink-0 shadow-sm mt-0.5"
                      style={{ backgroundColor: pStyle.previewColor }}
                    />
                    <div className="flex flex-col min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-[14px] font-bold text-white truncate">
                          {pStyle.name}
                        </span>
                        {isSelected && <Check className="w-3.5 h-3.5 text-rose-500 shrink-0" />}
                      </div>
                      <span className="text-[14px] text-zinc-400 leading-snug line-clamp-2">
                        {pStyle.desc}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Page Structure Sub-Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2 border-t border-zinc-800/80">
            {/* 1. Texture */}
            <div className="flex flex-col gap-1.5">
              <span className="text-[14px] font-bold text-zinc-300">Фактура бумаги:</span>
              <div className="flex flex-col gap-1">
                {(
                  [
                    { id: 'antique-fibers', label: 'Античные волокна' },
                    { id: 'book-grain', label: 'Книжная зернистость' },
                    { id: 'smooth', label: 'Гладкая матовая' },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => updateSetting('texture', opt.id)}
                    className={`min-h-[36px] px-2.5 text-[14px] text-left border transition-colors cursor-pointer ${
                      settings.texture === opt.id
                        ? 'bg-white text-black font-bold border-white'
                        : 'bg-zinc-900 text-zinc-300 border-zinc-800 hover:text-white'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 2. Page Border / Frames */}
            <div className="flex flex-col gap-1.5">
              <span className="text-[14px] font-bold text-zinc-300">Рамка страницы:</span>
              <div className="flex flex-col gap-1">
                {(
                  [
                    { id: 'ornate', label: 'Античная виньетка' },
                    { id: 'single', label: 'Тонкая одинарная' },
                    { id: 'none', label: 'Без рамки' },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => updateSetting('borderStyle', opt.id)}
                    className={`min-h-[36px] px-2.5 text-[14px] text-left border transition-colors cursor-pointer ${
                      settings.borderStyle === opt.id
                        ? 'bg-white text-black font-bold border-white'
                        : 'bg-zinc-900 text-zinc-300 border-zinc-800 hover:text-white'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 3. Line Spacing */}
            <div className="flex flex-col gap-1.5">
              <span className="text-[14px] font-bold text-zinc-300">Интервал строк:</span>
              <div className="flex flex-col gap-1">
                {(
                  [
                    { id: 'compact', label: 'Компактный (1.35)' },
                    { id: 'normal', label: 'Стандартный (1.60)' },
                    { id: 'relaxed', label: 'Просторный (1.90)' },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => updateSetting('lineSpacing', opt.id)}
                    className={`min-h-[36px] px-2.5 text-[14px] text-left border transition-colors cursor-pointer ${
                      settings.lineSpacing === opt.id
                        ? 'bg-white text-black font-bold border-white'
                        : 'bg-zinc-900 text-zinc-300 border-zinc-800 hover:text-white'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 4. Page Margins */}
            <div className="flex flex-col gap-1.5">
              <span className="text-[14px] font-bold text-zinc-300">Поля страницы:</span>
              <div className="flex flex-col gap-1">
                {(
                  [
                    { id: 'narrow', label: 'Узкие поля' },
                    { id: 'normal', label: 'Стандартные А5' },
                    { id: 'wide', label: 'Широкие поля' },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => updateSetting('margins', opt.id)}
                    className={`min-h-[36px] px-2.5 text-[14px] text-left border transition-colors cursor-pointer ${
                      settings.margins === opt.id
                        ? 'bg-white text-black font-bold border-white'
                        : 'bg-zinc-900 text-zinc-300 border-zinc-800 hover:text-white'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Reader Background Styles */}
      {activeTab === 'bg' && (
        <div className="flex flex-col gap-2">
          <span className="text-[14px] font-bold text-white">
            Стиль окружения и фона читалки:
          </span>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {Object.values(READER_BG_STYLES).map((bg) => {
              const isSelected = settings.bgStyle === bg.id;

              return (
                <button
                  key={bg.id}
                  type="button"
                  onClick={() => updateSetting('bgStyle', bg.id)}
                  className={`p-3 border text-left flex items-center gap-3 transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-zinc-900 border-2 border-white shadow-md'
                      : 'bg-zinc-950/80 border-zinc-800 hover:border-zinc-600'
                  }`}
                >
                  <span
                    className="w-6 h-6 border border-zinc-600 shrink-0"
                    style={{ backgroundColor: bg.preview }}
                  />
                  <div className="flex-1 flex items-center justify-between min-w-0">
                    <span className="text-[14px] font-bold text-white truncate">
                      {bg.name}
                    </span>
                    {isSelected && <Check className="w-3.5 h-3.5 text-rose-500 shrink-0" />}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
