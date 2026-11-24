import React, { useState } from 'react';
import { Sparkles, CheckSquare, Square, AlertCircle } from 'lucide-react';
import { Book, WorldEntity, WorldEntityType } from '../../types';
import { NoirModal } from '../common/NoirModal';
import { NoirButton } from '../common/NoirButton';
import { NoirVoiceTextarea } from '../voice/NoirVoiceTextarea';
import { generateProTalkTextWithUsage } from '../../services/ai/protalkText';
import { getPromptConfig, renderPrompt } from '../../services/db/promptRepository';
import { checkSufficientBalance, recordAiUsage } from '../../services/billing/transactionService';
import { calculateAiUsageCost, estimateTextOperationLetters, formatLettersCount } from '../../services/billing/costCalculator';
import { PricingInfoModalButton } from '../billing/PricingInfoModalButton';
import { runWithGenerationOverlay } from '../../services/ai/session/generationSession';

interface BatchLoreModalProps {
  isOpen: boolean;
  onClose: () => void;
  book: Book;
  userUid?: number;
  onEntitiesCreated: (entities: Omit<WorldEntity, 'id'>[]) => Promise<void>;
}

export const BatchLoreModal: React.FC<BatchLoreModalProps> = ({
  isOpen,
  onClose,
  book,
  userUid,
  onEntitiesCreated,
}) => {
  const [types, setTypes] = useState<WorldEntityType[]>(['character', 'location', 'item', 'faction', 'law']);
  const [countPerType, setCountPerType] = useState(2);
  const [plotFocus, setPlotFocus] = useState(book.synopsis_overview || '');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const toggleType = (t: WorldEntityType) => {
    if (types.includes(t)) {
      if (types.length <= 1) return;
      setTypes(types.filter((x) => x !== t));
    } else {
      setTypes([...types, t]);
    }
  };

  const handleGenerate = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const cfg = await getPromptConfig('lore_batch_builder');
      const prompt = renderPrompt(
        cfg.template,
        {
          book_title: book.title,
          genres: (book.genres || []).join(', '),
          setting: book.setting || 'книжный нуар',
          plot_focus: plotFocus || 'противостояние сил за контроль над будущим',
          types: types.join(', '),
          count_per_type: countPerType,
        },
        cfg.system_instruction
      );

      const est = calculateAiUsageCost({
        inputChars: prompt.length,
        outputChars: Math.max(1200, types.length * countPerType * 380),
        inputMultiplier: cfg.input_cost_multiplier,
        outputMultiplier: cfg.output_cost_multiplier,
      });

      if (userUid) {
        const check = await checkSufficientBalance(userUid, est.totalLetters);
        if (!check.ok) {
          setErrorMsg(
            `Недостаточно букв на балансе. Требуется ≈ ${formatLettersCount(est.totalLetters)} букв, доступно: ${formatLettersCount(check.currentBalance)} букв.`
          );
          setLoading(false);
          return;
        }
      }

      const outcome = await runWithGenerationOverlay(
        {
          title: `Генерация сущностей лора (${types.length * countPerType} шт.)`,
          subtitle: `Книга: «${book.title}»`,
          initialStatus: 'Нейросеть создает персонажей, локации, артефакты и законы мира...',
          totalSteps: 1,
          estimatedLetters: est.totalLetters,
        },
        async (ctx) => {
          const aiRes = await generateProTalkTextWithUsage(prompt, ctx.setStatus, 70, userUid);
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
            description: `Пакетная генерация лора для книги «${book.title}»`,
            alertLink: 'characters',
          });

          const blocks = reply.split('---').map((b) => b.trim()).filter(Boolean);
          const generated: Omit<WorldEntity, 'id'>[] = [];

          for (const block of blocks) {
            let entityType: WorldEntityType = 'character';
            let name = '';
            let subtitleOrRole = '';
            let description = '';
            let f1 = '';
            let f2 = '';
            let f3 = '';
            let visualPrompt = '';

            const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
            for (const line of lines) {
              if (/^тип/i.test(line)) {
                const rawType = line.replace(/^тип:?\s*/i, '').toLowerCase();
                if (rawType.includes('loc') || rawType.includes('локац')) entityType = 'location';
                else if (rawType.includes('item') || rawType.includes('предмет') || rawType.includes('артефакт')) entityType = 'item';
                else if (rawType.includes('fact') || rawType.includes('фракц') || rawType.includes('орден')) entityType = 'faction';
                else if (rawType.includes('law') || rawType.includes('закон') || rawType.includes('маг')) entityType = 'law';
                else entityType = 'character';
              } else if (/^имя/i.test(line)) {
                name = line.replace(/^имя:?\s*/i, '').replace(/["«»]/g, '').trim();
              } else if (/^подзаголовок/i.test(line)) {
                subtitleOrRole = line.replace(/^подзаголовок:?\s*/i, '').replace(/["«»]/g, '').trim();
              } else if (/^описание/i.test(line)) {
                description = line.replace(/^описание:?\s*/i, '').trim();
              } else if (/^поле 1/i.test(line)) {
                f1 = line.replace(/^поле 1:?\s*/i, '').trim();
              } else if (/^поле 2/i.test(line)) {
                f2 = line.replace(/^поле 2:?\s*/i, '').trim();
              } else if (/^поле 3/i.test(line)) {
                f3 = line.replace(/^поле 3:?\s*/i, '').trim();
              } else if (/^визуальный промпт/i.test(line)) {
                visualPrompt = line.replace(/^визуальный промпт:?\s*/i, '').trim();
              }
            }

            if (name) {
              const attributes: Record<string, string | string[]> = {};
              if (entityType === 'character') {
                attributes.traits = f1.split(',').map((s) => s.trim()).filter(Boolean);
                attributes.motivation = f2;
                attributes.secret = f3;
              } else if (entityType === 'location') {
                attributes.geography = f1;
                attributes.hazards = f2;
                attributes.atmosphere = f3;
              } else if (entityType === 'item') {
                attributes.powers = f1;
                attributes.drawbacks = f2;
                attributes.holder = f3;
              } else if (entityType === 'faction') {
                attributes.creed = f1;
                attributes.leader = f2;
                attributes.rivals = f3;
              } else if (entityType === 'law') {
                attributes.domain = f1;
                attributes.penalties = f2;
                attributes.exceptions = f3;
              }

              generated.push({
                book_id: book.id,
                entity_type: entityType,
                name,
                subtitle_or_role: subtitleOrRole,
                description: description || `Элемент мира ${book.title}`,
                attributes,
                visual_prompt:
                  visualPrompt ||
                  `Book interior illustration of ${entityType} "${name}". Dark noir atmosphere, stark contrast, sharp linework, high quality 8k, format 3:4.`,
                image_url: '',
              });
            }
          }

          if (generated.length > 0) {
            await onEntitiesCreated(generated);
            ctx.addApplied(`Создано и сохранено сущностей лора: ${generated.length}`);
            ctx.setProgress(1, 1);
          }
          return generated;
        }
      );

      if (outcome.stopped) {
        if (outcome.result && outcome.result.length > 0) {
          onClose();
        }
        return;
      }

      if (outcome.result && outcome.result.length > 0) {
        onClose();
      } else {
        setErrorMsg('Не удалось разобрать ответ нейросети. Попробуйте еще раз.');
      }
    } catch (e: unknown) {
      setErrorMsg('Ошибка при генерации лора: ' + (e instanceof Error ? e.message : ''));
    } finally {
      setLoading(false);
    }
  };

  return (
    <NoirModal
      isOpen={isOpen}
      onClose={onClose}
      title="Генерация комплекта сущностей для сюжета"
      maxWidth="max-w-lg"
    >
      <div className="flex flex-col gap-4 text-white">
        {errorMsg && (
          <div className="p-3 bg-rose-950/80 border border-rose-500 text-rose-200 text-[14px] flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}
        <div>
          <label className="block text-[14px] font-bold text-white mb-2">
            Выберите категории для создания:
          </label>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                { id: 'character', label: 'персонажи' },
                { id: 'location', label: 'локации' },
                { id: 'item', label: 'предметы и артефакты' },
                { id: 'faction', label: 'фракции и ордена' },
                { id: 'law', label: 'законы мира и магия' },
              ] as const
            ).map((t) => {
              const checked = types.includes(t.id);
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => toggleType(t.id)}
                  className={`min-h-[44px] px-3 text-left border flex items-center gap-2 cursor-pointer transition ${
                    checked
                      ? 'bg-white text-black border-white font-bold'
                      : 'bg-zinc-950 text-zinc-400 border-zinc-700 hover:border-zinc-500'
                  }`}
                >
                  {checked ? <CheckSquare className="w-4 h-4 text-black" /> : <Square className="w-4 h-4" />}
                  <span className="text-[14px]">{t.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label className="block text-[14px] font-bold text-white mb-1">
            Количество сущностей каждого типа:
          </label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min="1"
              max="5"
              value={countPerType}
              onChange={(e) => setCountPerType(Math.min(5, Math.max(1, parseInt(e.target.value, 10) || 1)))}
              className="w-24 min-h-[44px] px-3 noir-input text-center font-bold text-[16px]"
            />
            <span className="text-[14px] text-zinc-400">
              (всего будет создано: {types.length * countPerType} сущностей)
            </span>
          </div>
        </div>

        <div>
          <label className="block text-[14px] font-bold text-white mb-1">
            Сюжетный фокус или конфликт для связи сущностей:
          </label>
          <NoirVoiceTextarea
            minRows={3}
            value={plotFocus}
            onValueChange={setPlotFocus}
            voiceContext="batch_lore_plot_focus"
            placeholder="Опишите, вокруг чего должен строиться конфликт..."
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-zinc-800">
          <div className="flex items-center gap-2 text-[14px] text-zinc-400 font-mono">
            <span>
              ≈ {formatLettersCount(estimateTextOperationLetters(1100 + plotFocus.length, Math.max(1200, types.length * countPerType * 380)))} букв
            </span>
            <PricingInfoModalButton compact />
          </div>
          <div className="flex items-center gap-2">
            <NoirButton variant="subtle" onClick={onClose}>
              Отмена
            </NoirButton>
            <NoirButton
              variant="primary"
              onClick={handleGenerate}
              loading={loading}
              icon={<Sparkles className="w-4 h-4 text-black" />}
            >
              Сгенерировать {types.length * countPerType} сущностей
            </NoirButton>
          </div>
        </div>
      </div>
    </NoirModal>
  );
};
