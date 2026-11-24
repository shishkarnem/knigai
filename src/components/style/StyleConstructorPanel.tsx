import React, { useState, useEffect } from 'react';
import { Palette, Feather, Save, Sparkles } from 'lucide-react';
import { BookStyleConfig } from '../../types';
import { STYLE_PRESETS, StylePresetItem } from '../../services/genres/StylePresets';
import { getAllStyles, generateStyleWithAi } from '../../services/genres/styleService';
import { NoirButton } from '../common/NoirButton';
import { NoirModal } from '../common/NoirModal';
import { NoirVoiceInput } from '../voice/NoirVoiceInput';
import { NoirVoiceTextarea } from '../voice/NoirVoiceTextarea';
import { PricingInfoModalButton } from '../billing/PricingInfoModalButton';
import { estimateTextOperationLetters, formatLettersCount } from '../../services/billing/costCalculator';

interface StyleConstructorPanelProps {
  activeStyle: BookStyleConfig;
  onChangeStyle: (style: BookStyleConfig) => void;
  onSaveStyle: () => Promise<void>;
  userUid?: number;
}

export const StyleConstructorPanel: React.FC<StyleConstructorPanelProps> = ({
  activeStyle,
  onChangeStyle,
  onSaveStyle,
  userUid,
}) => {
  const [availableStyles, setAvailableStyles] = useState<StylePresetItem[]>(STYLE_PRESETS);
  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getAllStyles(userUid).then(setAvailableStyles).catch(() => {});
  }, [userUid]);

  const handleSelectPreset = (preset: StylePresetItem) => {
    onChangeStyle({
      styleName: preset.styleName,
      proseVoice: preset.proseVoice,
      pacing: preset.pacing,
      vocabulary: preset.vocabulary,
      visualAesthetic: preset.visualAesthetic,
      customGuidelines: preset.customGuidelines,
    });
  };

  const handleAiGenerate = async () => {
    if (!aiPrompt.trim()) return;
    setAiLoading(true);
    setAiError(null);
    try {
      const generated = await generateStyleWithAi(aiPrompt.trim(), userUid);
      onChangeStyle(generated);
      setIsAiModalOpen(false);
      setAiPrompt('');
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Ошибка при генерации стиля ИИ');
    } finally {
      setAiLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSaveStyle();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 text-white">
      {/* Presets Grid */}
      <div className="noir-container p-4 sm:p-6 border-2 border-white shadow-xl flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-zinc-700">
          <div>
            <h3 className="text-[17px] font-bold text-white flex items-center gap-2">
              <Palette className="w-4 h-4 text-rose-500" />
              <span>Литературные и визуальные стили:</span>
            </h3>
            <p className="text-[14px] text-zinc-400">
              Выберите готовый эталонный стиль или создайте авторский через нейросеть.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <NoirButton
              variant="outline"
              onClick={() => setIsAiModalOpen(true)}
              icon={<Sparkles className="w-4 h-4 text-rose-500" />}
            >
              Сгенерировать стиль через ИИ
            </NoirButton>
            <NoirButton
              variant="primary"
              onClick={handleSave}
              loading={saving}
              icon={<Save className="w-4 h-4 text-black" />}
            >
              Зафиксировать стиль
            </NoirButton>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {availableStyles.map((preset) => {
            const isSelected = activeStyle.styleName === preset.styleName;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => handleSelectPreset(preset)}
                className={`p-3.5 text-left border flex flex-col justify-between transition cursor-pointer ${
                  isSelected
                    ? 'bg-white text-black border-white shadow-lg'
                    : 'bg-zinc-950 text-zinc-300 border-zinc-800 hover:border-zinc-500'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[14px] font-bold block">{preset.styleName}</span>
                    {preset.isCustom && (
                      <span className="text-[14px] px-1 border border-current font-mono">
                        авторский
                      </span>
                    )}
                  </div>
                  <p
                    className={`text-[14px] line-clamp-2 leading-snug ${
                      isSelected ? 'text-zinc-800' : 'text-zinc-400'
                    }`}
                  >
                    {preset.tagline}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Active Style Fields Editor */}
      <div className="noir-container p-4 sm:p-6 border-2 border-white shadow-xl flex flex-col gap-4">
        <h3 className="text-[17px] font-bold text-white flex items-center gap-2 pb-2 border-b border-zinc-700">
          <Feather className="w-4 h-4 text-white" />
          <span>Параметры активного стиля «{activeStyle.styleName}»</span>
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-[14px] font-bold text-white mb-1">
              Название стиля:
            </label>
            <NoirVoiceInput
              value={activeStyle.styleName}
              onValueChange={(val) => onChangeStyle({ ...activeStyle, styleName: val })}
              voiceContext="style_name"
            />
          </div>

          <div>
            <label className="block text-[14px] font-bold text-white mb-1">
              Ритм и темп повествования:
            </label>
            <NoirVoiceInput
              value={activeStyle.pacing}
              onValueChange={(val) => onChangeStyle({ ...activeStyle, pacing: val })}
              voiceContext="style_pacing"
              placeholder="Короткие фразы, кинематографичный монтаж..."
            />
          </div>

          <div>
            <label className="block text-[14px] font-bold text-white mb-1">
              Голос прозы и позиция повествователя:
            </label>
            <NoirVoiceTextarea
              minRows={3}
              value={activeStyle.proseVoice}
              onValueChange={(val) => onChangeStyle({ ...activeStyle, proseVoice: val })}
              voiceContext="style_prose_voice"
              placeholder="От первого лица, холодный циничный тон..."
            />
          </div>

          <div>
            <label className="block text-[14px] font-bold text-white mb-1">
              Словарный запас и метафоры:
            </label>
            <NoirVoiceTextarea
              minRows={3}
              value={activeStyle.vocabulary}
              onValueChange={(val) => onChangeStyle({ ...activeStyle, vocabulary: val })}
              voiceContext="style_vocabulary"
              placeholder="Характерные термины, образность, запрещенные штампы..."
            />
          </div>

          <div>
            <label className="block text-[14px] font-bold text-white mb-1">
              Визуальная эстетика для иллюстраций:
            </label>
            <NoirVoiceTextarea
              minRows={3}
              value={activeStyle.visualAesthetic}
              onValueChange={(val) => onChangeStyle({ ...activeStyle, visualAesthetic: val })}
              voiceContext="style_visual_aesthetic"
              placeholder="Глубокие тени, контраст, детализация, вспышки алого..."
            />
          </div>

          <div>
            <label className="block text-[14px] font-bold text-white mb-1">
              Специфические директивы и правила для ИИ:
            </label>
            <NoirVoiceTextarea
              minRows={3}
              value={activeStyle.customGuidelines || ''}
              onValueChange={(val) => onChangeStyle({ ...activeStyle, customGuidelines: val })}
              voiceContext="style_custom_guidelines"
              placeholder="Показывать эмоции через действия, соблюдать законы мира..."
            />
          </div>
        </div>

        <div className="flex justify-end pt-3 border-t border-zinc-800">
          <NoirButton
            variant="primary"
            onClick={handleSave}
            loading={saving}
            icon={<Save className="w-4 h-4 text-black" />}
          >
            Сохранить стиль книги
          </NoirButton>
        </div>
      </div>

      {/* AI Style Generation Modal */}
      {isAiModalOpen && (
        <NoirModal
          isOpen={isAiModalOpen}
          onClose={() => setIsAiModalOpen(false)}
          title="Генерация литературного стиля через ИИ"
          maxWidth="max-w-lg"
        >
          <div className="flex flex-col gap-4 text-white">
            {aiError && (
              <div className="p-3 bg-rose-950/60 border border-rose-500 text-rose-300 text-[14px]">
                {aiError}
              </div>
            )}
            <p className="text-[14px] text-zinc-300">
              Опишите желаемый авторский почерк или дайте ориентиры на классиков литературы (например: «Смесь сухого слога Хемингуэя с визуальным киберпанком Бегущего по лезвию»):
            </p>

            <NoirVoiceTextarea
              minRows={4}
              value={aiPrompt}
              onValueChange={setAiPrompt}
              voiceContext="style_ai_prompt"
              placeholder="Введите описание стиля или продиктуйте атмосферу..."
            />

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-zinc-800">
              <div className="flex items-center gap-2 text-[14px] text-zinc-400 font-mono">
                <span>≈ {formatLettersCount(estimateTextOperationLetters(450 + aiPrompt.length, 900))} букв</span>
                <PricingInfoModalButton compact />
              </div>
              <div className="flex items-center gap-2">
                <NoirButton variant="subtle" onClick={() => setIsAiModalOpen(false)}>
                  Отмена
                </NoirButton>
                <NoirButton
                  variant="primary"
                  onClick={handleAiGenerate}
                  loading={aiLoading}
                  disabled={!aiPrompt.trim()}
                  icon={<Sparkles className="w-4 h-4 text-black" />}
                >
                  Сгенерировать стиль
                </NoirButton>
              </div>
            </div>
          </div>
        </NoirModal>
      )}
    </div>
  );
};
