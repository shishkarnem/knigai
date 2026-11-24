import React, { useState, useEffect } from 'react';
import { Sparkles, Save, AlertCircle } from 'lucide-react';
import { WorldEntity, WorldEntityType, Book } from '../../types';
import { NoirModal } from '../common/NoirModal';
import { NoirButton } from '../common/NoirButton';
import { NoirVoiceInput } from '../voice/NoirVoiceInput';
import { NoirVoiceTextarea } from '../voice/NoirVoiceTextarea';
import { generateProTalkTextWithUsage } from '../../services/ai/protalkText';
import { getPromptConfig, renderPrompt } from '../../services/db/promptRepository';
import { checkSufficientBalance, recordAiUsage } from '../../services/billing/transactionService';
import { calculateAiUsageCost, estimateTextOperationLetters, formatLettersCount } from '../../services/billing/costCalculator';
import { PricingInfoModalButton } from '../billing/PricingInfoModalButton';
import { runWithGenerationOverlay } from '../../services/ai/session/generationSession';

interface WorldEntityConstructorModalProps {
  isOpen: boolean;
  onClose: () => void;
  entityToEdit: WorldEntity | null;
  defaultType?: WorldEntityType;
  book: Book;
  userUid?: number;
  onSave: (entity: Omit<WorldEntity, 'id'>, existingId?: number) => Promise<void>;
}

export const WorldEntityConstructorModal: React.FC<WorldEntityConstructorModalProps> = ({
  isOpen,
  onClose,
  entityToEdit,
  defaultType = 'character',
  book,
  userUid,
  onSave,
}) => {
  const [entityType, setEntityType] = useState<WorldEntityType>(entityToEdit?.entity_type || defaultType);
  const [name, setName] = useState(entityToEdit?.name || '');
  const [subtitleOrRole, setSubtitleOrRole] = useState(entityToEdit?.subtitle_or_role || '');
  const [description, setDescription] = useState(entityToEdit?.description || '');
  const [visualPrompt, setVisualPrompt] = useState(entityToEdit?.visual_prompt || '');

  // Dynamic attributes per type
  const [attr1, setAttr1] = useState('');
  const [attr2, setAttr2] = useState('');
  const [attr3, setAttr3] = useState('');

  // AI Fill state
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    setErrorMsg(null);
    if (entityToEdit) {
      setEntityType(entityToEdit.entity_type);
      setName(entityToEdit.name);
      setSubtitleOrRole(entityToEdit.subtitle_or_role || '');
      setDescription(entityToEdit.description || '');
      setVisualPrompt(entityToEdit.visual_prompt || '');

      const a = entityToEdit.attributes || {};
      if (entityToEdit.entity_type === 'character') {
        setAttr1(Array.isArray(a.traits) ? a.traits.join(', ') : (a.traits as string) || '');
        setAttr2((a.motivation as string) || '');
        setAttr3((a.secret as string) || '');
      } else if (entityToEdit.entity_type === 'location') {
        setAttr1((a.geography as string) || '');
        setAttr2((a.hazards as string) || '');
        setAttr3((a.atmosphere as string) || '');
      } else if (entityToEdit.entity_type === 'item') {
        setAttr1((a.powers as string) || '');
        setAttr2((a.drawbacks as string) || '');
        setAttr3((a.holder as string) || '');
      } else if (entityToEdit.entity_type === 'faction') {
        setAttr1((a.creed as string) || '');
        setAttr2((a.leader as string) || '');
        setAttr3((a.rivals as string) || '');
      } else if (entityToEdit.entity_type === 'law') {
        setAttr1((a.domain as string) || '');
        setAttr2((a.penalties as string) || '');
        setAttr3((a.exceptions as string) || '');
      }
    } else {
      setEntityType(defaultType);
      setName('');
      setSubtitleOrRole('');
      setDescription('');
      setVisualPrompt('');
      setAttr1('');
      setAttr2('');
      setAttr3('');
      setAiPrompt('');
    }
  }, [entityToEdit, defaultType, isOpen]);

  const handleAiAutoFill = async () => {
    setAiLoading(true);
    setErrorMsg(null);
    try {
      const typeLabels: Record<WorldEntityType, string> = {
        character: 'персонаж',
        location: 'локация (место действия)',
        item: 'предмет / артефакт / технология',
        faction: 'фракция / синдикат / гильдия / орден',
        law: 'закон мира / магическая система / запрет',
      };

      const cfg = await getPromptConfig('lore_entity_builder');
      const prompt = renderPrompt(
        cfg.template,
        {
          book_title: book.title,
          genres: (book.genres || []).join(', '),
          setting: book.setting || 'книжный нуар',
          entity_type_label: typeLabels[entityType],
          user_wish: aiPrompt
            ? `Пожелание автора: "${aiPrompt}"`
            : 'Сущность должна органично дополнять конфликт книги.',
          synopsis_overview: book.synopsis_overview || 'борьба за власть и тайны',
        },
        cfg.system_instruction
      );

      const est = calculateAiUsageCost({
        inputChars: prompt.length,
        outputChars: 1100,
        inputMultiplier: cfg.input_cost_multiplier,
        outputMultiplier: cfg.output_cost_multiplier,
      });

      if (userUid) {
        const check = await checkSufficientBalance(userUid, est.totalLetters);
        if (!check.ok) {
          setErrorMsg(
            `Недостаточно букв на балансе. Требуется ≈ ${formatLettersCount(est.totalLetters)} букв, доступно: ${formatLettersCount(check.currentBalance)} букв.`
          );
          setAiLoading(false);
          return;
        }
      }

      await runWithGenerationOverlay(
        {
          title: `ИИ-заполнение карточки (${typeLabels[entityType]})`,
          subtitle: `Книга: «${book.title}»`,
          initialStatus: 'Нейросеть прорабатывает характеристики и визуальный промпт...',
          totalSteps: 1,
          estimatedLetters: est.totalLetters,
        },
        async (ctx) => {
          const aiRes = await generateProTalkTextWithUsage(prompt, ctx.setStatus, 50, userUid);
          const reply = aiRes.text;

          await recordAiUsage({
            userUid,
            promptKey: cfg.key,
            inputChars: prompt.length,
            outputChars: reply.length,
            inputMultiplier: cfg.input_cost_multiplier,
            outputMultiplier: cfg.output_cost_multiplier,
            exactTokens: aiRes.tokensTotal,
            tokensIn: aiRes.tokensIn,
            tokensOut: aiRes.tokensOut,
            bookId: book.id,
            bookTitle: book.title,
            description: `Проработка сущности (${typeLabels[entityType]}) для «${book.title}»`,
            alertLink: 'characters',
          });

          const lines = reply.split('\n').map((l) => l.trim()).filter(Boolean);

          for (const line of lines) {
            if (/^имя/i.test(line)) {
              setName(line.replace(/^имя:?\s*/i, '').replace(/["«»]/g, '').trim());
            } else if (/^подзаголовок/i.test(line)) {
              setSubtitleOrRole(line.replace(/^подзаголовок:?\s*/i, '').replace(/["«»]/g, '').trim());
            } else if (/^описание/i.test(line)) {
              setDescription(line.replace(/^описание:?\s*/i, '').trim());
            } else if (/^поле 1/i.test(line)) {
              setAttr1(line.replace(/^поле 1:?\s*/i, '').trim());
            } else if (/^поле 2/i.test(line)) {
              setAttr2(line.replace(/^поле 2:?\s*/i, '').trim());
            } else if (/^поле 3/i.test(line)) {
              setAttr3(line.replace(/^поле 3:?\s*/i, '').trim());
            } else if (/^визуальный промпт/i.test(line)) {
              setVisualPrompt(line.replace(/^визуальный промпт:?\s*/i, '').trim());
            }
          }
          ctx.addApplied(`Поля карточки (${typeLabels[entityType]}) заполнены ИИ`);
          ctx.setProgress(1, 1);
          return reply;
        }
      );
    } catch (e: unknown) {
      setErrorMsg('Ошибка автозаполнения ИИ: ' + (e instanceof Error ? e.message : ''));
    } finally {
      setAiLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setSaving(true);
    try {
      let attributes: Record<string, string | string[]> = {};
      if (entityType === 'character') {
        attributes = {
          traits: attr1.split(',').map((s) => s.trim()).filter(Boolean),
          motivation: attr2,
          secret: attr3,
        };
      } else if (entityType === 'location') {
        attributes = { geography: attr1, hazards: attr2, atmosphere: attr3 };
      } else if (entityType === 'item') {
        attributes = { powers: attr1, drawbacks: attr2, holder: attr3 };
      } else if (entityType === 'faction') {
        attributes = { creed: attr1, leader: attr2, rivals: attr3 };
      } else if (entityType === 'law') {
        attributes = { domain: attr1, penalties: attr2, exceptions: attr3 };
      }

      const generatedVisualPrompt =
        visualPrompt.trim() ||
        `Book illustration of ${entityType} "${name}": ${description.slice(0, 160)}. Dramatic noir style, intense contrast, fine linework, atmospheric lighting, format 3:4.`;

      const entityData: Omit<WorldEntity, 'id'> = {
        book_id: book.id,
        entity_type: entityType,
        name: name.trim(),
        subtitle_or_role: subtitleOrRole.trim(),
        description: description.trim(),
        attributes,
        visual_prompt: generatedVisualPrompt,
        image_url: entityToEdit?.image_url || '',
      };

      await onSave(entityData, entityToEdit?.id);
      onClose();
    } catch (err: unknown) {
      setErrorMsg('Ошибка при сохранении: ' + (err instanceof Error ? err.message : ''));
    } finally {
      setSaving(false);
    }
  };

  const getAttrLabels = () => {
    switch (entityType) {
      case 'character':
        return {
          role: 'Роль в истории (главный герой, антагонист, наставник и др.):',
          f1: 'Черты характера (через запятую):',
          f2: 'Мотивация и цели:',
          f3: 'Скрытая тайна или уязвимость:',
        };
      case 'location':
        return {
          role: 'Тип локации (цитадель, мегаполис, руины, тайное логово):',
          f1: 'География, архитектура и климат:',
          f2: 'Опасности, ловушки и тайники:',
          f3: 'Звуки, запахи и атмосфера места:',
        };
      case 'item':
        return {
          role: 'Категория предмета (реликвия, оружие, технология, фолиант):',
          f1: 'Сверхъестественные или технические свойства:',
          f2: 'Цена использования, дефекты или ограничения:',
          f3: 'Текущий владелец или место хранения:',
        };
      case 'faction':
        return {
          role: 'Тип фракции (орден, гильдия, синдикат, культ, династия):',
          f1: 'Кредо, девиз и идеология:',
          f2: 'Глава фракции и внутренняя иерархия:',
          f3: 'Заклятые враги и ключевые союзники:',
        };
      case 'law':
        return {
          role: 'Сфера закона (магическая система, квантовая физика, табу):',
          f1: 'Механика действия закона или заклинаний:',
          f2: 'Расплата и последствия при нарушении:',
          f3: 'Исключения, парадоксы и древние лазейки:',
        };
    }
  };

  const labels = getAttrLabels();

  return (
    <NoirModal
      isOpen={isOpen}
      onClose={onClose}
      title={entityToEdit ? `Редактирование: ${entityToEdit.name}` : 'Конструктор сущности мира'}
      maxWidth="max-w-2xl"
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 text-white max-h-[82vh] overflow-y-auto pr-1">
        {errorMsg && (
          <div className="p-3 bg-rose-950/80 border border-rose-500 text-rose-200 text-[14px] flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}
        {/* Type Selector (Bubble buttons) */}
        {!entityToEdit && (
          <div>
            <label className="block text-[14px] font-bold text-white mb-1.5">
              Тип сущности лора:
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
              {(
                [
                  { id: 'character', title: 'персонаж' },
                  { id: 'location', title: 'локация' },
                  { id: 'item', title: 'предмет' },
                  { id: 'faction', title: 'фракция' },
                  { id: 'law', title: 'закон мира' },
                ] as const
              ).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setEntityType(t.id)}
                  className={`min-h-[44px] px-2 text-[14px] font-bold border transition cursor-pointer flex items-center justify-center text-center ${
                    entityType === t.id
                      ? 'bg-white text-black border-white'
                      : 'bg-zinc-950 text-zinc-300 border-zinc-700 hover:border-zinc-500'
                  }`}
                >
                  {t.title}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* AI Helper Bar */}
        <div className="p-3 bg-zinc-950 border border-zinc-800 flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[14px] font-bold text-rose-400 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-rose-500" />
              <span>генератор и редактор полей через ИИ</span>
            </span>
            <div className="flex items-center gap-2 text-[14px] text-zinc-400 font-mono">
              <span>≈ {formatLettersCount(estimateTextOperationLetters(900 + aiPrompt.length, 1100))} букв</span>
              <PricingInfoModalButton compact />
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="flex-1 min-w-0">
              <NoirVoiceInput
                value={aiPrompt}
                onValueChange={setAiPrompt}
                voiceContext="lore_entity_ai_wish"
                placeholder="Например: Заброшенная обсерватория над облаками..."
              />
            </div>
            <NoirButton
              type="button"
              variant="primary"
              onClick={handleAiAutoFill}
              loading={aiLoading}
              icon={<Sparkles className="w-3.5 h-3.5 text-black" />}
            >
              заполнить ИИ
            </NoirButton>
          </div>
        </div>

        {/* Name & Subtitle */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-[14px] font-bold text-white mb-1">
              Название / Имя:
            </label>
            <NoirVoiceInput
              required
              value={name}
              onValueChange={setName}
              voiceContext="lore_entity_name"
              placeholder="Например: Обсидиановый обелиск..."
            />
          </div>

          <div>
            <label className="block text-[14px] font-bold text-white mb-1">
              {labels.role}
            </label>
            <NoirVoiceInput
              value={subtitleOrRole}
              onValueChange={setSubtitleOrRole}
              voiceContext="lore_entity_role"
              placeholder="Например: Древний артефакт слияния"
            />
          </div>
        </div>

        {/* Description */}
        <div>
          <label className="block text-[14px] font-bold text-white mb-1">
            Художественное описание и предыстория:
          </label>
          <NoirVoiceTextarea
            minRows={4}
            value={description}
            onValueChange={setDescription}
            voiceContext="lore_entity_description"
            placeholder="Опишите сущность, её влияние на мир книги и тайны..."
          />
        </div>

        {/* Dynamic Attributes */}
        <div className="flex flex-col gap-3 p-3 bg-zinc-950/70 border border-zinc-800">
          <div>
            <label className="block text-[14px] font-bold text-zinc-300 mb-1">
              {labels.f1}
            </label>
            <NoirVoiceInput
              value={attr1}
              onValueChange={setAttr1}
              voiceContext="lore_entity_attr1"
            />
          </div>

          <div>
            <label className="block text-[14px] font-bold text-zinc-300 mb-1">
              {labels.f2}
            </label>
            <NoirVoiceInput
              value={attr2}
              onValueChange={setAttr2}
              voiceContext="lore_entity_attr2"
            />
          </div>

          <div>
            <label className="block text-[14px] font-bold text-zinc-300 mb-1">
              {labels.f3}
            </label>
            <NoirVoiceInput
              value={attr3}
              onValueChange={setAttr3}
              voiceContext="lore_entity_attr3"
            />
          </div>
        </div>

        {/* Visual prompt for illustrator */}
        <div>
          <label className="block text-[14px] font-bold text-white mb-1">
            Промпт для генерации иллюстрации (на английском):
          </label>
          <NoirVoiceTextarea
            minRows={2}
            value={visualPrompt}
            onValueChange={setVisualPrompt}
            voiceContext="lore_entity_visual_prompt"
            placeholder="Detailed prompt for AI illustration..."
            className="font-mono text-zinc-300"
          />
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 pt-3 border-t border-zinc-800 sticky bottom-0 bg-black/95 py-2">
          <NoirButton type="button" variant="subtle" onClick={onClose}>
            Отмена
          </NoirButton>
          <NoirButton
            type="submit"
            variant="primary"
            loading={saving}
            icon={<Save className="w-4 h-4 text-black" />}
          >
            Сохранить сущность
          </NoirButton>
        </div>
      </form>
    </NoirModal>
  );
};
