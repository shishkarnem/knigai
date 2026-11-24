import React, { useEffect, useState } from 'react';
import { MessageSquarePlus, Save, Sparkles } from 'lucide-react';
import { NoirButton } from '../common/NoirButton';
import { NoirVoiceTextarea } from '../voice/NoirVoiceTextarea';

interface AuthorAiCommentPanelProps {
  title: string;
  subtitle?: string;
  value: string;
  placeholder?: string;
  activeDraftsCount?: number;
  readOnly?: boolean;
  compact?: boolean;
  onSave: (nextValue: string) => Promise<void> | void;
}

const PRESET_CHIPS = [
  'Пиши в стиле мрачного детектива нуар',
  'Усиль живые диалоги и психологическое напряжение',
  'Меньше описательной воды, больше конкретных действий',
  'Строго соблюдай канон героев и законы мира',
];

export const AuthorAiCommentPanel: React.FC<AuthorAiCommentPanelProps> = ({
  title,
  subtitle,
  value,
  placeholder = 'Укажите акценты, настроение, детали канона, запреты или пожелания для нейросети (можно надиктовать голосом)...',
  activeDraftsCount,
  readOnly = false,
  compact = false,
  onSave,
}) => {
  const [draftValue, setDraftValue] = useState(value || '');
  const [saving, setSaving] = useState(false);
  const [savedFlag, setSavedFlag] = useState(false);

  useEffect(() => {
    setDraftValue(value || '');
  }, [value]);

  const isDirty = draftValue !== (value || '');

  const handleSave = async () => {
    if (readOnly) return;
    setSaving(true);
    try {
      await onSave(draftValue);
      setSavedFlag(true);
      setTimeout(() => setSavedFlag(false), 2500);
    } finally {
      setSaving(false);
    }
  };

  const appendChip = (chip: string) => {
    if (readOnly) return;
    if (draftValue.toLowerCase().includes(chip.toLowerCase())) return;
    setDraftValue((prev) => (prev.trim() ? `${prev.trim()}\n• ${chip}` : `• ${chip}`));
  };

  return (
    <div
      className={`noir-container border border-rose-500/60 bg-zinc-950/85 flex flex-col gap-2.5 text-white min-w-0 ${
        compact ? 'p-3' : 'p-4'
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h4 className="text-[15px] font-bold text-white flex items-center gap-2">
            <MessageSquarePlus className="w-4 h-4 text-rose-500 shrink-0" />
            <span>{title}</span>
          </h4>
          {subtitle && <p className="text-[14px] text-zinc-400 mt-0.5 leading-snug">{subtitle}</p>}
        </div>

        <span className="px-2 py-0.5 bg-rose-950/70 border border-rose-500/80 text-rose-200 text-[14px] font-bold flex items-center gap-1 shrink-0">
          <Sparkles className="w-3.5 h-3.5 text-rose-400" />
          <span>
            Учитывается в ИИ
            {typeof activeDraftsCount === 'number' && activeDraftsCount > 0
              ? ` (+${activeDraftsCount} черн.)`
              : ''}
          </span>
        </span>
      </div>

      {!readOnly && !compact && (
        <div className="flex flex-wrap gap-1.5">
          {PRESET_CHIPS.map((chip) => (
            <button
              key={chip}
              type="button"
              onClick={() => appendChip(chip)}
              className="px-2.5 py-1 bg-zinc-900 hover:bg-white hover:text-black text-zinc-300 border border-zinc-700 text-[14px] transition cursor-pointer text-left"
            >
              + {chip}
            </button>
          ))}
        </div>
      )}

      <NoirVoiceTextarea
        value={draftValue}
        onValueChange={setDraftValue}
        voiceContext="author_ai_comment"
        disabled={readOnly}
        minRows={compact ? 2 : 3}
        maxRows={8}
        placeholder={placeholder}
      />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[14px] text-zinc-400">
          {savedFlag
            ? '✓ Сохранено в базе данных и передаётся в ИИ'
            : isDirty
            ? 'Есть несохранённые изменения комментария'
            : 'Автоматически передаётся во все ИИ-операции'}
        </span>
        {!readOnly && (
          <NoirButton
            variant={isDirty ? 'primary' : 'outline'}
            onClick={handleSave}
            loading={saving}
            icon={<Save className={`w-4 h-4 ${isDirty ? 'text-black' : 'text-rose-500'}`} />}
          >
            Сохранить указания ИИ
          </NoirButton>
        )}
      </div>
    </div>
  );
};
