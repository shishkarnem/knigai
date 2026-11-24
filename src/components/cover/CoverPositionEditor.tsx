import React from 'react';
import {
  Sliders,
  Palette,
  RotateCcw,
  AlignCenter,
  AlignLeft,
  AlignRight,
  AlignJustify,
  AlignVerticalJustifyStart,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  AlignVerticalSpaceAround,
  Eye,
  EyeOff,
} from 'lucide-react';
import { BookCoverConfig, CoverTextLayout } from '../../types';
import { NoirVoiceInput } from '../voice/NoirVoiceInput';
import { NoirVoiceTextarea } from '../voice/NoirVoiceTextarea';

export type CoverEditorSection =
  | 'title'
  | 'author'
  | 'subtitle'
  | 'genre'
  | 'back-genre'
  | 'spine'
  | 'spine-title'
  | 'spine-author'
  | 'blurb'
  | 'color';

interface CoverPositionEditorProps {
  cover: BookCoverConfig;
  layout: CoverTextLayout;
  activeSection: CoverEditorSection;
  onSelectSection: (section: CoverEditorSection) => void;
  onUpdateLayout: (key: keyof CoverTextLayout, value: any) => void;
  onUpdateCover: (updated: Partial<BookCoverConfig>) => void;
  onResetLayout: () => void;
}

const NOIR_PALETTES = [
  { name: 'Черный оникс', color: '#121214' },
  { name: 'Угольный графит', color: '#27272a' },
  { name: 'Глубокий цинк', color: '#3f3f46' },
  { name: 'Темный багрянец', color: '#3b1115' },
  { name: 'Кровавый нуар', color: '#450a0a' },
  { name: 'Алый акцент', color: '#7f1d1d' },
];

const SliderNumberField: React.FC<{
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (val: number) => void;
}> = ({ label, value, min, max, step = 1, unit = 'px', onChange }) => (
  <div>
    <div className="flex justify-between items-center text-[14px] mb-1">
      <span className="font-bold text-white">{label}:</span>
      <div className="flex items-center gap-1">
        <input
          type="number"
          min={min}
          max={max}
          value={value}
          onChange={(e) => onChange(parseInt(e.target.value, 10) || 0)}
          className="w-16 h-7 px-1.5 text-center font-mono text-[14px] bg-black border border-zinc-600 text-rose-400 font-bold"
        />
        <span className="text-[14px] text-zinc-400">{unit}</span>
      </div>
    </div>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(parseInt(e.target.value, 10))}
      className="w-full accent-rose-600 cursor-pointer h-2 bg-zinc-700"
    />
  </div>
);

const BlockAlignmentControls: React.FC<{
  title?: string;
  alignV?: 'top' | 'center' | 'bottom' | 'space-between';
  alignH?: 'left' | 'center' | 'right' | 'justify';
  isHidden?: boolean;
  onToggleHidden?: () => void;
  onAlignVChange?: (v: 'top' | 'center' | 'bottom' | 'space-between') => void;
  onAlignHChange?: (h: 'left' | 'center' | 'right' | 'justify') => void;
  onCenterX?: () => void;
  onCenterY?: () => void;
}> = ({
  title = 'Позиционирование текста внутри блока',
  alignV = 'top',
  alignH = 'left',
  isHidden = false,
  onToggleHidden,
  onAlignVChange,
  onAlignHChange,
  onCenterX,
  onCenterY,
}) => (
  <div className="md:col-span-2 p-3 bg-black/50 border border-zinc-800 flex flex-col gap-3">
    <div className="flex items-center justify-between flex-wrap gap-2">
      <span className="text-[14px] font-bold text-white">{title}</span>
      <div className="flex flex-wrap items-center gap-1.5">
        {onToggleHidden && (
          <button
            type="button"
            onClick={onToggleHidden}
            className={`px-2.5 py-1 text-[14px] font-bold border transition flex items-center gap-1.5 cursor-pointer ${
              isHidden
                ? 'bg-rose-600 border-rose-500 text-white'
                : 'bg-zinc-900 border-zinc-700 hover:border-white text-zinc-200'
            }`}
          >
            {isHidden ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4 text-rose-500" />}
            <span>{isHidden ? 'Поле скрыто' : 'Скрыть поле'}</span>
          </button>
        )}
        {onCenterX && (
          <button
            type="button"
            onClick={onCenterX}
            className="px-2.5 py-1 text-[14px] font-bold bg-zinc-900 border border-zinc-700 hover:border-white text-zinc-300 hover:text-white transition cursor-pointer"
          >
            По центру X (0)
          </button>
        )}
        {onCenterY && (
          <button
            type="button"
            onClick={onCenterY}
            className="px-2.5 py-1 text-[14px] font-bold bg-zinc-900 border border-zinc-700 hover:border-white text-zinc-300 hover:text-white transition cursor-pointer"
          >
            По центру Y (0)
          </button>
        )}
      </div>
    </div>

    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {onAlignVChange && (
        <div>
          <span className="block text-[14px] text-zinc-400 mb-1.5">
            По вертикали внутри контейнера:
          </span>
          <div className="grid grid-cols-4 gap-1">
            {[
              { id: 'top', label: 'Верх', icon: <AlignVerticalJustifyStart className="w-3.5 h-3.5" /> },
              { id: 'center', label: 'Центр', icon: <AlignVerticalJustifyCenter className="w-3.5 h-3.5" /> },
              { id: 'bottom', label: 'Низ', icon: <AlignVerticalJustifyEnd className="w-3.5 h-3.5" /> },
              { id: 'space-between', label: 'Равном.', icon: <AlignVerticalSpaceAround className="w-3.5 h-3.5" /> },
            ].map((btn) => (
              <button
                key={btn.id}
                type="button"
                onClick={() => onAlignVChange(btn.id as any)}
                className={`min-h-[36px] px-1 text-[14px] font-bold border transition flex items-center justify-center gap-1 cursor-pointer ${
                  alignV === btn.id
                    ? 'bg-rose-600 text-white border-rose-500'
                    : 'bg-zinc-950 text-zinc-300 border-zinc-700 hover:text-white'
                }`}
              >
                {btn.icon}
                <span>{btn.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {onAlignHChange && (
        <div>
          <span className="block text-[14px] text-zinc-400 mb-1.5">
            По горизонтали (выравнивание текста):
          </span>
          <div className="grid grid-cols-4 gap-1">
            {[
              { id: 'left', label: 'Слева', icon: <AlignLeft className="w-3.5 h-3.5" /> },
              { id: 'center', label: 'Центр', icon: <AlignCenter className="w-3.5 h-3.5" /> },
              { id: 'right', label: 'Справа', icon: <AlignRight className="w-3.5 h-3.5" /> },
              { id: 'justify', label: 'Ширина', icon: <AlignJustify className="w-3.5 h-3.5" /> },
            ].map((btn) => (
              <button
                key={btn.id}
                type="button"
                onClick={() => onAlignHChange(btn.id as any)}
                className={`min-h-[36px] px-1 text-[14px] font-bold border transition flex items-center justify-center gap-1 cursor-pointer ${
                  alignH === btn.id
                    ? 'bg-rose-600 text-white border-rose-500'
                    : 'bg-zinc-950 text-zinc-300 border-zinc-700 hover:text-white'
                }`}
              >
                {btn.icon}
                <span>{btn.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  </div>
);

export const CoverPositionEditor: React.FC<CoverPositionEditorProps> = ({
  cover,
  layout,
  activeSection,
  onSelectSection,
  onUpdateLayout,
  onUpdateCover,
  onResetLayout,
}) => {
  const spineBg = cover.spineColor || '#18181b';

  return (
    <div className="noir-container p-4 sm:p-6 border-2 border-white flex flex-col gap-4">
      <div className="flex items-center justify-between pb-2 border-b border-zinc-700 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Sliders className="w-5 h-5 text-rose-500" />
          <h3 className="text-[17px] font-bold text-white">
            Редактор текста, жанра, координат и выравнивания блоков переплета
          </h3>
        </div>

        <button
          type="button"
          onClick={onResetLayout}
          className="flex items-center gap-1.5 text-[14px] text-zinc-400 hover:text-white cursor-pointer px-2 py-1 bg-zinc-900 border border-zinc-700 hover:border-zinc-500 transition"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Сбросить координаты</span>
        </button>
      </div>

      {/* Tabs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        {[
          { id: 'title', label: 'Название', match: activeSection === 'title' || activeSection === 'subtitle' },
          { id: 'author', label: 'Автор', match: activeSection === 'author' },
          { id: 'genre', label: 'Жанр / Категория', match: activeSection === 'genre' || activeSection === 'back-genre' },
          { id: 'spine', label: 'Корешок', match: activeSection === 'spine' || activeSection === 'spine-title' || activeSection === 'spine-author' },
          { id: 'blurb', label: 'Аннотация', match: activeSection === 'blurb' },
          { id: 'color', label: 'Цвет переплета', match: activeSection === 'color', icon: <Palette className="w-4 h-4 text-rose-400" /> },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => onSelectSection(tab.id as CoverEditorSection)}
            className={`min-h-[40px] px-2.5 text-[14px] font-bold border transition cursor-pointer flex items-center justify-center gap-1.5 ${
              tab.match
                ? tab.id === 'color'
                  ? 'bg-rose-600 text-white border-rose-500'
                  : 'bg-white text-black border-white'
                : 'bg-zinc-950 text-zinc-300 border-zinc-700 hover:text-white'
            }`}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Tab 1: Title & Subtitle */}
      {(activeSection === 'title' || activeSection === 'subtitle') && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-zinc-950 border border-zinc-800">
          <div className="md:col-span-2">
            <label className="block text-[14px] font-bold text-white mb-1">
              Текст названия книги:
            </label>
            <NoirVoiceInput
              value={cover.frontTitle}
              onValueChange={(val) => onUpdateCover({ frontTitle: val })}
              voiceContext="cover_front_title"
            />
          </div>

          <SliderNumberField
            label="Размер шрифта названия"
            value={layout.titleFontSize ?? 22}
            min={14}
            max={36}
            onChange={(v) => onUpdateLayout('titleFontSize', v)}
          />

          <SliderNumberField
            label="Ширина контейнера названия"
            value={layout.titleContainerWidth ?? 100}
            min={40}
            max={140}
            step={5}
            unit="%"
            onChange={(v) => onUpdateLayout('titleContainerWidth', v)}
          />

          <SliderNumberField
            label="Высота контейнера названия"
            value={layout.titleContainerHeight ?? 90}
            min={30}
            max={350}
            step={5}
            onChange={(v) => onUpdateLayout('titleContainerHeight', v)}
          />

          <SliderNumberField
            label="Смещение по горизонтали (X)"
            value={layout.titleOffsetX ?? 0}
            min={-250}
            max={250}
            onChange={(v) => onUpdateLayout('titleOffsetX', v)}
          />

          <SliderNumberField
            label="Смещение по вертикали (Y)"
            value={layout.titleOffsetY ?? 0}
            min={-250}
            max={250}
            onChange={(v) => onUpdateLayout('titleOffsetY', v)}
          />

          <BlockAlignmentControls
            title="Позиционирование названия внутри блока"
            alignV={layout.titleAlignV || 'top'}
            alignH={layout.titleAlignH || 'left'}
            isHidden={Boolean(layout.titleHidden)}
            onToggleHidden={() => onUpdateLayout('titleHidden', !layout.titleHidden)}
            onAlignVChange={(v) => onUpdateLayout('titleAlignV', v)}
            onAlignHChange={(h) => onUpdateLayout('titleAlignH', h)}
            onCenterX={() => onUpdateLayout('titleOffsetX', 0)}
            onCenterY={() => onUpdateLayout('titleOffsetY', 0)}
          />

          {/* Subtitle fields */}
          <div className="md:col-span-2 pt-3 border-t border-zinc-800">
            <label className="block text-[14px] font-bold text-white mb-1">
              Текст подзаголовка:
            </label>
            <NoirVoiceInput
              value={cover.frontSubtitle}
              onValueChange={(val) => onUpdateCover({ frontSubtitle: val })}
              voiceContext="cover_front_subtitle"
            />
          </div>

          <SliderNumberField
            label="Размер шрифта подзаголовка"
            value={layout.subtitleFontSize ?? 14}
            min={12}
            max={24}
            onChange={(v) => onUpdateLayout('subtitleFontSize', v)}
          />

          <SliderNumberField
            label="Ширина контейнера подзаголовка"
            value={layout.subtitleContainerWidth ?? 100}
            min={40}
            max={140}
            step={5}
            unit="%"
            onChange={(v) => onUpdateLayout('subtitleContainerWidth', v)}
          />

          <SliderNumberField
            label="Высота контейнера подзаголовка"
            value={layout.subtitleContainerHeight ?? 48}
            min={24}
            max={200}
            step={5}
            onChange={(v) => onUpdateLayout('subtitleContainerHeight', v)}
          />

          <SliderNumberField
            label="Смещение подзаголовка (X)"
            value={layout.subtitleOffsetX ?? 0}
            min={-200}
            max={200}
            onChange={(v) => onUpdateLayout('subtitleOffsetX', v)}
          />

          <SliderNumberField
            label="Смещение подзаголовка (Y)"
            value={layout.subtitleOffsetY ?? 0}
            min={-150}
            max={150}
            onChange={(v) => onUpdateLayout('subtitleOffsetY', v)}
          />

          <BlockAlignmentControls
            title="Позиционирование подзаголовка"
            alignV={layout.subtitleAlignV || 'top'}
            alignH={layout.subtitleAlignH || 'left'}
            isHidden={Boolean(layout.subtitleHidden)}
            onToggleHidden={() => onUpdateLayout('subtitleHidden', !layout.subtitleHidden)}
            onAlignVChange={(v) => onUpdateLayout('subtitleAlignV', v)}
            onAlignHChange={(h) => onUpdateLayout('subtitleAlignH', h)}
            onCenterX={() => onUpdateLayout('subtitleOffsetX', 0)}
            onCenterY={() => onUpdateLayout('subtitleOffsetY', 0)}
          />
        </div>
      )}

      {/* Tab 2: Author */}
      {activeSection === 'author' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-zinc-950 border border-zinc-800">
          <div className="md:col-span-2">
            <label className="block text-[14px] font-bold text-white mb-1">
              Имя автора на обложке:
            </label>
            <NoirVoiceInput
              value={cover.authorName}
              onValueChange={(val) => onUpdateCover({ authorName: val })}
              voiceContext="cover_author_name"
            />
          </div>

          <SliderNumberField
            label="Размер шрифта автора"
            value={layout.authorFontSize ?? 15}
            min={12}
            max={26}
            onChange={(v) => onUpdateLayout('authorFontSize', v)}
          />

          <SliderNumberField
            label="Ширина контейнера автора"
            value={layout.authorContainerWidth ?? 100}
            min={40}
            max={140}
            step={5}
            unit="%"
            onChange={(v) => onUpdateLayout('authorContainerWidth', v)}
          />

          <SliderNumberField
            label="Высота контейнера автора"
            value={layout.authorContainerHeight ?? 42}
            min={25}
            max={250}
            step={5}
            onChange={(v) => onUpdateLayout('authorContainerHeight', v)}
          />

          <SliderNumberField
            label="Смещение по горизонтали (X)"
            value={layout.authorOffsetX ?? 0}
            min={-250}
            max={250}
            onChange={(v) => onUpdateLayout('authorOffsetX', v)}
          />

          <SliderNumberField
            label="Смещение по вертикали (Y)"
            value={layout.authorOffsetY ?? 0}
            min={-250}
            max={250}
            onChange={(v) => onUpdateLayout('authorOffsetY', v)}
          />

          <BlockAlignmentControls
            title="Позиционирование автора внутри блока"
            alignV={layout.authorAlignV || 'top'}
            alignH={layout.authorAlignH || 'left'}
            isHidden={Boolean(layout.authorHidden)}
            onToggleHidden={() => onUpdateLayout('authorHidden', !layout.authorHidden)}
            onAlignVChange={(v) => onUpdateLayout('authorAlignV', v)}
            onAlignHChange={(h) => onUpdateLayout('authorAlignH', h)}
            onCenterX={() => onUpdateLayout('authorOffsetX', 0)}
            onCenterY={() => onUpdateLayout('authorOffsetY', 0)}
          />
        </div>
      )}

      {/* Tab 3: Genre / Series Label (Front & Back) */}
      {(activeSection === 'genre' || activeSection === 'back-genre') && (
        <div className="flex flex-col gap-5 p-4 bg-zinc-950 border border-zinc-800">
          <div>
            <label className="block text-[14px] font-bold text-white mb-1">
              Текст надписи жанра / серии (например: «Художественная литература»):
            </label>
            <NoirVoiceInput
              value={cover.genreLabel}
              onValueChange={(val) => onUpdateCover({ genreLabel: val })}
              voiceContext="cover_genre_label"
              placeholder="Художественная литература"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-3 bg-black/60 border border-zinc-800">
            <div className="md:col-span-2 text-[15px] font-bold text-rose-400">
              Лицевая сторона (правая): блок жанра
            </div>

            <SliderNumberField
              label="Размер шрифта (лицо)"
              value={layout.genreFontSize ?? 14}
              min={11}
              max={24}
              onChange={(v) => onUpdateLayout('genreFontSize', v)}
            />
            <SliderNumberField
              label="Ширина блока (лицо)"
              value={layout.genreContainerWidth ?? 100}
              min={40}
              max={140}
              step={5}
              unit="%"
              onChange={(v) => onUpdateLayout('genreContainerWidth', v)}
            />
            <SliderNumberField
              label="Высота блока (лицо)"
              value={layout.genreContainerHeight ?? 32}
              min={24}
              max={180}
              step={4}
              onChange={(v) => onUpdateLayout('genreContainerHeight', v)}
            />
            <SliderNumberField
              label="Смещение X (лицо)"
              value={layout.genreOffsetX ?? 0}
              min={-250}
              max={250}
              onChange={(v) => onUpdateLayout('genreOffsetX', v)}
            />
            <SliderNumberField
              label="Смещение Y (лицо)"
              value={layout.genreOffsetY ?? 0}
              min={-250}
              max={250}
              onChange={(v) => onUpdateLayout('genreOffsetY', v)}
            />

            <BlockAlignmentControls
              title="Выравнивание и видимость жанра на лицевой стороне"
              alignV={layout.genreAlignV || 'top'}
              alignH={layout.genreAlignH || 'left'}
              isHidden={Boolean(layout.genreHidden)}
              onToggleHidden={() => onUpdateLayout('genreHidden', !layout.genreHidden)}
              onAlignVChange={(v) => onUpdateLayout('genreAlignV', v as any)}
              onAlignHChange={(h) => onUpdateLayout('genreAlignH', h)}
              onCenterX={() => onUpdateLayout('genreOffsetX', 0)}
              onCenterY={() => onUpdateLayout('genreOffsetY', 0)}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-3 bg-black/60 border border-zinc-800">
            <div className="md:col-span-2 text-[15px] font-bold text-rose-400">
              Задняя сторона (левая): блок жанра
            </div>

            <SliderNumberField
              label="Размер шрифта (задник)"
              value={layout.backGenreFontSize ?? 14}
              min={11}
              max={24}
              onChange={(v) => onUpdateLayout('backGenreFontSize', v)}
            />
            <SliderNumberField
              label="Ширина блока (задник)"
              value={layout.backGenreContainerWidth ?? 100}
              min={40}
              max={140}
              step={5}
              unit="%"
              onChange={(v) => onUpdateLayout('backGenreContainerWidth', v)}
            />
            <SliderNumberField
              label="Высота блока (задник)"
              value={layout.backGenreContainerHeight ?? 32}
              min={24}
              max={180}
              step={4}
              onChange={(v) => onUpdateLayout('backGenreContainerHeight', v)}
            />
            <SliderNumberField
              label="Смещение X (задник)"
              value={layout.backGenreOffsetX ?? 0}
              min={-250}
              max={250}
              onChange={(v) => onUpdateLayout('backGenreOffsetX', v)}
            />
            <SliderNumberField
              label="Смещение Y (задник)"
              value={layout.backGenreOffsetY ?? 0}
              min={-250}
              max={250}
              onChange={(v) => onUpdateLayout('backGenreOffsetY', v)}
            />

            <BlockAlignmentControls
              title="Выравнивание и видимость жанра на заднике"
              alignV={layout.backGenreAlignV || 'top'}
              alignH={layout.backGenreAlignH || 'left'}
              isHidden={Boolean(layout.backGenreHidden)}
              onToggleHidden={() => onUpdateLayout('backGenreHidden', !layout.backGenreHidden)}
              onAlignVChange={(v) => onUpdateLayout('backGenreAlignV', v as any)}
              onAlignHChange={(h) => onUpdateLayout('backGenreAlignH', h)}
              onCenterX={() => onUpdateLayout('backGenreOffsetX', 0)}
              onCenterY={() => onUpdateLayout('backGenreOffsetY', 0)}
            />
          </div>
        </div>
      )}

      {/* Tab 4: Spine */}
      {(activeSection === 'spine' || activeSection === 'spine-title' || activeSection === 'spine-author') && (
        <div className="flex flex-col gap-5 p-4 bg-zinc-950 border border-zinc-800">
          <div className="flex items-center justify-between pb-2 border-b border-zinc-800 flex-wrap gap-2">
            <div>
              <h4 className="text-[15px] font-bold text-white">Раздельные блоки корешка: Название и Автор</h4>
              <p className="text-[14px] text-zinc-400">
                Регулируйте размер блока и точное выравнивание текста внутри корешка (вдоль и поперек).
              </p>
            </div>
            <button
              type="button"
              onClick={() => onUpdateLayout('spineSwapOrder', layout.spineSwapOrder ? 0 : 1)}
              className="px-3 py-1.5 bg-zinc-900 border border-zinc-700 hover:border-rose-500 text-white font-bold text-[14px] flex items-center gap-1.5 cursor-pointer transition"
            >
              <RotateCcw className="w-3.5 h-3.5 text-rose-500" />
              <span>{layout.spineSwapOrder ? 'Порядок: Автор → Название' : 'Порядок: Название → Автор'}</span>
            </button>
          </div>

          <div className="p-3 bg-black/60 border border-zinc-800 flex flex-col gap-3">
            <span className="text-[14px] font-bold text-rose-400">1. Название на корешке</span>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <SliderNumberField
                label="Размер шрифта названия"
                value={layout.spineTitleFontSize ?? layout.spineFontSize ?? 13}
                min={9}
                max={18}
                onChange={(v) => onUpdateLayout('spineTitleFontSize', v)}
              />
              <SliderNumberField
                label="Ширина блока названия"
                value={layout.spineTitleWidth ?? 100}
                min={50}
                max={140}
                step={5}
                unit="%"
                onChange={(v) => onUpdateLayout('spineTitleWidth', v)}
              />
              <SliderNumberField
                label="Высота блока названия"
                value={layout.spineTitleHeight ?? 190}
                min={60}
                max={350}
                step={10}
                onChange={(v) => onUpdateLayout('spineTitleHeight', v)}
              />
              <SliderNumberField
                label="Смещение названия Y"
                value={layout.spineTitleOffsetY ?? 0}
                min={-150}
                max={150}
                onChange={(v) => onUpdateLayout('spineTitleOffsetY', v)}
              />
            </div>
            <BlockAlignmentControls
              title="Позиционирование названия на корешке"
              alignV={layout.spineTitleAlignV || 'center'}
              alignH={layout.spineTitleAlignH || 'center'}
              isHidden={Boolean(layout.spineTitleHidden)}
              onToggleHidden={() => onUpdateLayout('spineTitleHidden', !layout.spineTitleHidden)}
              onAlignVChange={(v) => onUpdateLayout('spineTitleAlignV', v)}
              onAlignHChange={(h) => onUpdateLayout('spineTitleAlignH', h === 'justify' ? 'center' : h)}
              onCenterX={() => onUpdateLayout('spineTitleOffsetX', 0)}
              onCenterY={() => onUpdateLayout('spineTitleOffsetY', 0)}
            />
          </div>

          <div className="p-3 bg-black/60 border border-zinc-800 flex flex-col gap-3">
            <span className="text-[14px] font-bold text-rose-400">2. Автор на корешке</span>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <SliderNumberField
                label="Размер шрифта автора"
                value={layout.spineAuthorFontSize ?? 12}
                min={8}
                max={16}
                onChange={(v) => onUpdateLayout('spineAuthorFontSize', v)}
              />
              <SliderNumberField
                label="Ширина блока автора"
                value={layout.spineAuthorWidth ?? 100}
                min={50}
                max={140}
                step={5}
                unit="%"
                onChange={(v) => onUpdateLayout('spineAuthorWidth', v)}
              />
              <SliderNumberField
                label="Высота блока автора"
                value={layout.spineAuthorHeight ?? 120}
                min={40}
                max={250}
                step={10}
                onChange={(v) => onUpdateLayout('spineAuthorHeight', v)}
              />
              <SliderNumberField
                label="Смещение автора Y"
                value={layout.spineAuthorOffsetY ?? 0}
                min={-150}
                max={150}
                onChange={(v) => onUpdateLayout('spineAuthorOffsetY', v)}
              />
            </div>
            <BlockAlignmentControls
              title="Позиционирование автора на корешке"
              alignV={layout.spineAuthorAlignV || 'center'}
              alignH={layout.spineAuthorAlignH || 'center'}
              isHidden={Boolean(layout.spineAuthorHidden)}
              onToggleHidden={() => onUpdateLayout('spineAuthorHidden', !layout.spineAuthorHidden)}
              onAlignVChange={(v) => onUpdateLayout('spineAuthorAlignV', v)}
              onAlignHChange={(h) => onUpdateLayout('spineAuthorAlignH', h === 'justify' ? 'center' : h)}
              onCenterX={() => onUpdateLayout('spineAuthorOffsetX', 0)}
              onCenterY={() => onUpdateLayout('spineAuthorOffsetY', 0)}
            />
          </div>
        </div>
      )}

      {/* Tab 5: Blurb */}
      {activeSection === 'blurb' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-zinc-950 border border-zinc-800">
          <div className="md:col-span-2">
            <label className="block text-[14px] font-bold text-white mb-1">
              Текст аннотации на задней стороне:
            </label>
            <NoirVoiceTextarea
              minRows={4}
              value={cover.backBlurb}
              onValueChange={(val) => onUpdateCover({ backBlurb: val })}
              voiceContext="cover_back_blurb"
              placeholder="Аннотация на задней стороне обложки..."
            />
          </div>

          <SliderNumberField
            label="Размер шрифта аннотации"
            value={layout.blurbFontSize ?? 14}
            min={11}
            max={20}
            onChange={(v) => onUpdateLayout('blurbFontSize', v)}
          />

          <SliderNumberField
            label="Ширина контейнера аннотации"
            value={layout.blurbContainerWidth ?? 100}
            min={50}
            max={140}
            step={5}
            unit="%"
            onChange={(v) => onUpdateLayout('blurbContainerWidth', v)}
          />

          <SliderNumberField
            label="Высота контейнера аннотации"
            value={layout.blurbContainerHeight ?? 165}
            min={50}
            max={400}
            step={10}
            onChange={(v) => onUpdateLayout('blurbContainerHeight', v)}
          />

          <SliderNumberField
            label="Смещение по горизонтали (X)"
            value={layout.blurbOffsetX ?? 0}
            min={-250}
            max={250}
            onChange={(v) => onUpdateLayout('blurbOffsetX', v)}
          />

          <SliderNumberField
            label="Смещение по вертикали (Y)"
            value={layout.blurbOffsetY ?? 0}
            min={-250}
            max={250}
            onChange={(v) => onUpdateLayout('blurbOffsetY', v)}
          />

          <BlockAlignmentControls
            title="Позиционирование аннотации внутри блока"
            alignV={layout.blurbAlignV || 'top'}
            alignH={layout.blurbAlignH || 'left'}
            isHidden={Boolean(layout.blurbHidden)}
            onToggleHidden={() => onUpdateLayout('blurbHidden', !layout.blurbHidden)}
            onAlignVChange={(v) => onUpdateLayout('blurbAlignV', v)}
            onAlignHChange={(h) => onUpdateLayout('blurbAlignH', h)}
            onCenterX={() => onUpdateLayout('blurbOffsetX', 0)}
            onCenterY={() => onUpdateLayout('blurbOffsetY', 0)}
          />
        </div>
      )}

      {/* Tab 6: Color Scheme */}
      {activeSection === 'color' && (
        <div className="flex flex-col gap-4 p-4 bg-zinc-950 border border-zinc-800">
          <div>
            <h4 className="text-[15px] font-bold text-white mb-1">
              Основная цветовая схема переплета (корешок и задняя сторона):
            </h4>
            <p className="text-[14px] text-zinc-400 mb-3">
              Задает общий цвет корешка и левой (задней) стороны книги по умолчанию.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
            {NOIR_PALETTES.map((pal) => (
              <button
                key={pal.color}
                type="button"
                onClick={() => onUpdateCover({ spineColor: pal.color, backColor: pal.color })}
                className={`p-3 border flex flex-col items-center gap-2 cursor-pointer transition ${
                  spineBg.toLowerCase() === pal.color.toLowerCase()
                    ? 'border-rose-500 bg-rose-950/30'
                    : 'border-zinc-700 bg-zinc-900 hover:border-zinc-500'
                }`}
              >
                <div
                  className="w-8 h-8 border border-zinc-500 shadow-inner"
                  style={{ backgroundColor: pal.color }}
                />
                <span className="text-[14px] font-bold text-zinc-200 text-center leading-tight">
                  {pal.name}
                </span>
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3 pt-2 border-t border-zinc-800">
            <span className="text-[14px] font-bold text-white">Выбрать свой оттенок:</span>
            <input
              type="color"
              value={spineBg.startsWith('#') ? spineBg : '#18181b'}
              onChange={(e) => onUpdateCover({ spineColor: e.target.value, backColor: e.target.value })}
              className="w-10 h-10 p-0 bg-transparent border border-zinc-600 cursor-pointer"
            />
            <input
              type="text"
              value={spineBg}
              onChange={(e) => onUpdateCover({ spineColor: e.target.value, backColor: e.target.value })}
              className="w-32 h-9 px-2 font-mono text-[14px] bg-black border border-zinc-700 text-white font-bold"
              placeholder="#18181b"
            />
          </div>
        </div>
      )}
    </div>
  );
};
