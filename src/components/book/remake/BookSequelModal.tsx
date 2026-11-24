import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  GitBranch,
  Sparkles,
  Users,
} from 'lucide-react';
import {
  Book,
  BookRelationType,
  Chapter,
  Character,
  WorldEntity,
} from '../../../types';
import { NoirModal } from '../../common/NoirModal';
import { NoirButton } from '../../common/NoirButton';
import { NoirStatus } from '../../common/NoirStatus';
import { NoirVoiceInput } from '../../voice/NoirVoiceInput';
import { NoirVoiceTextarea } from '../../voice/NoirVoiceTextarea';
import { RubikMarkerHeading } from '../../landing/RubikMarkerHeading';
import { PricingInfoModalButton } from '../../billing/PricingInfoModalButton';
import {
  estimateTextOperationLetters,
  formatLettersCount,
} from '../../../services/billing/costCalculator';
import {
  fetchChapters,
  fetchCharacters,
  fetchWorldEntities,
} from '../../../services/db/bookRepository';
import { orchestrateCreateSequel } from '../../../services/ai/rework/sequelService';
import { isGenerationAbortedError, runWithGenerationOverlay } from '../../../services/ai/session/generationSession';

interface BookSequelModalProps {
  isOpen: boolean;
  onClose: () => void;
  sourceBook: Book;
  userUid?: number;
  authorDefault?: string;
  onSequelCreated: (result: { book: Book; chapters: Chapter[]; characters: Character[] }) => void;
}

const RELATION_OPTIONS: Array<{
  id: Exclude<BookRelationType, 'standalone'>;
  label: string;
  desc: string;
}> = [
  { id: 'sequel', label: 'Сиквел (продолжение)', desc: 'События после финала первоисточника' },
  { id: 'prequel', label: 'Приквел (предыстория)', desc: 'Тайны прошлого до старта 1-й книги' },
  { id: 'spinoff', label: 'Спин-офф (ответвление)', desc: 'Фокус на другом герое или линии мира' },
  { id: 'reboot', label: 'Альтернативная ветка', desc: 'Развилка сюжета «что если всё пошло иначе»' },
];

export const BookSequelModal: React.FC<BookSequelModalProps> = ({
  isOpen,
  onClose,
  sourceBook,
  userUid,
  authorDefault,
  onSequelCreated,
}) => {
  const [relationType, setRelationType] = useState<Exclude<BookRelationType, 'standalone'>>('sequel');
  const [customTitle, setCustomTitle] = useState('');
  const [authorName, setAuthorName] = useState(authorDefault || sourceBook.author || 'Автор KnigAI');
  const [timeJump, setTimeJump] = useState('');
  const [targetChapters, setTargetChapters] = useState(Math.min(Math.max(sourceBook.target_chapters || 30, 10), 60));
  const [initialPlannedChapters, setInitialPlannedChapters] = useState(10);
  const [sequelWishes, setSequelWishes] = useState('');

  const [sourceChapters, setSourceChapters] = useState<Chapter[]>([]);
  const [sourceCharacters, setSourceCharacters] = useState<Character[]>([]);
  const [sourceEntities, setSourceEntities] = useState<WorldEntity[]>([]);
  const [selectedCharIds, setSelectedCharIds] = useState<number[]>([]);
  const [selectedEntityIds, setSelectedEntityIds] = useState<number[]>([]);

  const [loadingCanon, setLoadingCanon] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!isOpen || !sourceBook) return;
    let alive = true;
    setCustomTitle('');
    setAuthorName(authorDefault || sourceBook.author || 'Автор KnigAI');
    setStatusMsg('');
    setErrorMsg('');
    setLoadingCanon(true);

    Promise.all([
      fetchChapters(sourceBook.id, sourceBook.user_uid || userUid).catch(() => []),
      fetchCharacters(sourceBook.id, sourceBook.user_uid || userUid).catch(() => []),
      fetchWorldEntities(sourceBook.id, undefined, sourceBook.user_uid || userUid).catch(() => []),
    ])
      .then(([chaps, chars, ents]) => {
        if (!alive) return;
        setSourceChapters(chaps || []);
        setSourceCharacters(chars || []);
        setSourceEntities(ents || []);
        setSelectedCharIds((chars || []).map((c) => c.id));
        setSelectedEntityIds((ents || []).map((e) => e.id));
      })
      .finally(() => {
        if (alive) setLoadingCanon(false);
      });

    return () => {
      alive = false;
    };
  }, [isOpen, sourceBook.id, userUid, authorDefault]);

  const toggleId = (list: number[], setter: (next: number[]) => void, id: number) => {
    setter(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  };

  const estLetters = estimateTextOperationLetters(2200 + sequelWishes.length, 3600);

  const handleCreate = async () => {
    if (!sequelWishes.trim()) {
      setErrorMsg('Опишите хотя бы в паре фраз ключевую идею продолжения или конфликт.');
      return;
    }

    setGenerating(true);
    setErrorMsg('');
    setStatusMsg('Формируем канон и проектируем новую книгу серии...');

    try {
      const outcome = await runWithGenerationOverlay(
        {
          title: 'Проектирование продолжения книги',
          subtitle: `На основе «${sourceBook.title}»`,
          initialStatus: 'Формируем канон и проектируем новую книгу серии...',
          totalSteps: 1,
          estimatedLetters: estLetters,
        },
        async (ctx) => {
          const created = await orchestrateCreateSequel({
            sourceBook,
            sourceChapters,
            sourceCharacters,
            sourceEntities,
            relationType,
            customTitle: customTitle.trim() || undefined,
            authorName,
            targetChapters,
            initialPlannedChapters,
            timeJump: timeJump.trim() || undefined,
            sequelWishes,
            selectedCharacterIds: selectedCharIds,
            selectedEntityIds: selectedEntityIds,
            userUid,
            onProgress: (msg) => {
              setStatusMsg(msg);
              ctx.setStatus(msg);
            },
          });
          ctx.addApplied(`Книга «${created.book.title}» (${created.chapters.length} глав)`);
          ctx.setProgress(1, 1);
          return created;
        }
      );

      if (outcome.result && !outcome.stopped) {
        onSequelCreated(outcome.result);
        onClose();
      } else if (outcome.stopped) {
        setStatusMsg(`Операция остановлена. Списано по факту: ${formatLettersCount(outcome.spentLetters)} б.`);
      }
    } catch (err: unknown) {
      if (!isGenerationAbortedError(err)) {
        setErrorMsg(err instanceof Error ? err.message : 'Не удалось создать продолжение');
      }
    } finally {
      setGenerating(false);
    }
  };

  if (!isOpen) return null;

  return (
    <NoirModal
      isOpen={isOpen}
      onClose={generating ? () => {} : onClose}
      title="Продолжение по канону книги"
      maxWidth="max-w-3xl"
    >
      <div className="flex flex-col gap-4 text-white font-['PT_Serif',serif]">
        <div className="p-3.5 bg-zinc-950/75 border border-zinc-700 flex flex-col gap-1">
          <RubikMarkerHeading
            text={`Серия на основе: ${sourceBook.title}`}
            as="h3"
            className="text-[20px] leading-snug text-white break-words"
          />
          <p className="text-[14px] text-zinc-400">
            ИИ изучит финал и канон первоисточника ({sourceChapters.length} глав), перенесёт выбранных героев с внешними портретами и создаст новую связанную книгу.
          </p>
        </div>

        {/* 1. Relation Type */}
        <div className="flex flex-col gap-2">
          <span className="text-[14px] font-bold text-white flex items-center gap-1.5">
            <GitBranch className="w-4 h-4 text-rose-500" />
            <span>1. Формат связанной книги:</span>
          </span>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {RELATION_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                disabled={generating}
                onClick={() => setRelationType(opt.id)}
                className={`p-3 text-left border transition cursor-pointer flex flex-col gap-0.5 rounded-none ${
                  relationType === opt.id
                    ? 'bg-white text-black border-white'
                    : 'bg-zinc-950/80 text-zinc-200 border-zinc-700 hover:border-white'
                }`}
              >
                <span className="text-[15px] font-bold">{opt.label}</span>
                <span className={`text-[14px] ${relationType === opt.id ? 'text-zinc-800' : 'text-zinc-400'}`}>
                  {opt.desc}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* 2. Title, Author, Time Jump */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-[14px] font-bold text-white mb-1">
              Название (необязательно — ИИ предложит сам):
            </label>
            <NoirVoiceInput
              value={customTitle}
              onValueChange={setCustomTitle}
              voiceContext="sequel_title"
              placeholder={`${sourceBook.title}: Часть II...`}
            />
          </div>
          <div>
            <label className="block text-[14px] font-bold text-white mb-1">
              Автор новой книги:
            </label>
            <NoirVoiceInput
              value={authorName}
              onValueChange={setAuthorName}
              voiceContext="sequel_author"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-[14px] font-bold text-white mb-1">
              Временной сдвиг:
            </label>
            <NoirVoiceInput
              value={timeJump}
              onValueChange={setTimeJump}
              voiceContext="sequel_timejump"
              placeholder="Спустя 3 года..."
            />
          </div>
          <div>
            <label className="block text-[14px] font-bold text-white mb-1">
              Цель (всего глав):
            </label>
            <select
              disabled={generating}
              value={targetChapters}
              onChange={(e) => setTargetChapters(Number(e.target.value))}
              className="w-full min-h-[44px] px-3 noir-input text-[14px] rounded-none"
            >
              {[10, 20, 30, 50, 100].map((n) => (
                <option key={n} value={n} className="bg-zinc-950 text-white">
                  {n} глав
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[14px] font-bold text-white mb-1">
              Стартовый план:
            </label>
            <select
              disabled={generating}
              value={initialPlannedChapters}
              onChange={(e) => setInitialPlannedChapters(Number(e.target.value))}
              className="w-full min-h-[44px] px-3 noir-input text-[14px] rounded-none"
            >
              {[5, 10, 15].map((n) => (
                <option key={n} value={n} className="bg-zinc-950 text-white">
                  Сразу {n} глав в плане
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* 3. Inherit Characters & Entities */}
        <div className="p-3.5 bg-zinc-950/75 border border-zinc-800 flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[14px] font-bold text-white flex items-center gap-1.5">
              <Users className="w-4 h-4 text-rose-500" />
              <span>
                Перенос персонажей ({selectedCharIds.length}/{sourceCharacters.length}) и лора ({selectedEntityIds.length}/{sourceEntities.length}):
              </span>
            </span>
            {loadingCanon && (
              <span className="text-[14px] font-mono text-rose-400">Загрузка канона...</span>
            )}
          </div>

          {(sourceCharacters.length > 0 || sourceEntities.length > 0) ? (
            <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto pr-1">
              {sourceCharacters.map((c) => {
                const active = selectedCharIds.includes(c.id);
                return (
                  <button
                    key={`c-${c.id}`}
                    type="button"
                    disabled={generating}
                    onClick={() => toggleId(selectedCharIds, setSelectedCharIds, c.id)}
                    className={`px-2.5 py-1 text-[14px] border transition cursor-pointer rounded-none ${
                      active
                        ? 'bg-white text-black border-white font-bold'
                        : 'bg-zinc-900 text-zinc-400 border-zinc-700 hover:border-white'
                    }`}
                  >
                    {c.name}
                  </button>
                );
              })}
              {sourceEntities.map((e) => {
                const active = selectedEntityIds.includes(e.id);
                return (
                  <button
                    key={`e-${e.id}`}
                    type="button"
                    disabled={generating}
                    onClick={() => toggleId(selectedEntityIds, setSelectedEntityIds, e.id)}
                    className={`px-2.5 py-1 text-[14px] border transition cursor-pointer rounded-none ${
                      active
                        ? 'bg-rose-950/90 text-rose-200 border-rose-500 font-bold'
                        : 'bg-zinc-900 text-zinc-400 border-zinc-700 hover:border-white'
                    }`}
                  >
                    [{e.entity_type}] {e.name}
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="text-[14px] text-zinc-400">
              Персонажи из базы не найдены — нейросеть извлечёт героев напрямую из описания и глав первоисточника.
            </p>
          )}
        </div>

        {/* 4. Sequel Wishes */}
        <div className="flex flex-col gap-1.5">
          <label className="text-[14px] font-bold text-white">
            4. Идея, завязка и пожелания для новой книги:
          </label>
          <NoirVoiceTextarea
            minRows={3}
            maxRows={8}
            value={sequelWishes}
            onValueChange={setSequelWishes}
            voiceContext="sequel_wishes"
            placeholder="Например: герой возвращается в разрушенный мегаполис через 10 лет и обнаруживает тайный орден..."
          />
        </div>

        {statusMsg && (
          <NoirStatus type={generating ? 'loading' : 'info'} message={statusMsg} />
        )}
        {errorMsg && (
          <div className="p-3 bg-rose-950/80 border border-rose-500 text-rose-200 text-[14px] flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Footer */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-zinc-800">
          <div className="flex flex-wrap items-center gap-2 text-[14px] text-zinc-300">
            <span>
              Списание ≈ <strong className="text-rose-400 font-mono">{formatLettersCount(estLetters)} букв</strong>
            </span>
            <PricingInfoModalButton compact label="Тарифы" />
          </div>

          <div className="flex flex-wrap items-center gap-2 justify-end">
            <NoirButton variant="subtle" onClick={onClose} disabled={generating}>
              Отмена
            </NoirButton>
            <NoirButton
              variant="primary"
              onClick={handleCreate}
              loading={generating}
              icon={<Sparkles className="w-4 h-4 text-black" />}
            >
              Создать связанную книгу
            </NoirButton>
          </div>
        </div>
      </div>
    </NoirModal>
  );
};
