import React, { useState, useEffect } from 'react';
import { Sparkles, Image as ImageIcon, AlertCircle } from 'lucide-react';
import { WorldEntity, Book } from '../../types';
import { NoirModal } from '../common/NoirModal';
import { NoirButton } from '../common/NoirButton';
import { generateProTalkImage, isUsablePublicUrl, resolvePublicUrlMap } from '../../services/ai/protalkImage';
import { registerFileInDb, getOrCreateBookFolder } from '../../services/db/fileStorageRepository';
import { saveGalleryItem, fetchWorldEntities } from '../../services/db/bookRepository';
import { NoirPromptTextarea } from '../editor/NoirPromptTextarea';
import { getPromptConfig, renderPrompt } from '../../services/db/promptRepository';
import { checkSufficientBalance, recordAiUsage } from '../../services/billing/transactionService';
import { estimateImageGenerationLetters, formatLettersCount } from '../../services/billing/costCalculator';
import { PricingInfoModalButton } from '../billing/PricingInfoModalButton';
import { runWithGenerationOverlay } from '../../services/ai/session/generationSession';
import { evaluateArtWith763 } from '../../services/ai/decision/bookClassifier763';

interface WorldEntityImageModalProps {
  isOpen: boolean;
  onClose: () => void;
  entity: WorldEntity | null;
  book: Book;
  onImageSaved: (entityId: number, imageUrl: string) => Promise<void>;
  userUid?: number;
}

export const WorldEntityImageModal: React.FC<WorldEntityImageModalProps> = ({
  isOpen,
  onClose,
  entity,
  book,
  onImageSaved,
  userUid,
}) => {
  const [prompt, setPrompt] = useState('');
  const [aspectRatio, setAspectRatio] = useState<'3:4' | '1:1' | '16:9'>('3:4');
  const [loading, setLoading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [qaLoading, setQaLoading] = useState(false);
  const [qaVerdict, setQaVerdict] = useState<string | null>(null);

  useEffect(() => {
    setErrorMsg(null);
    setQaVerdict(null);
    if (!entity) return;
    setPreviewUrl(entity.image_url || null);
    if (entity.visual_prompt) {
      setPrompt(entity.visual_prompt);
    } else {
      const typeLabels: Record<string, string> = {
        character: 'character portrait and costume sheet',
        location: 'environment landscape and architectural interior',
        item: 'artifact close-up item concept art',
        faction: 'organization insignia, headquarters and members',
        law: 'mystical concept visualization and runic energy',
      };
      const kind = typeLabels[entity.entity_type] || 'illustration';
      const attrsText = Object.entries(entity.attributes || {})
        .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`)
        .join('. ');

      getPromptConfig('lore_visual_card')
        .then((cfg) => {
          setPrompt(
            renderPrompt(cfg.template, {
              book_title: book.title,
              kind,
              name: entity.name,
              subtitle_or_role: entity.subtitle_or_role || '',
              description: (entity.description || '').slice(0, 180),
              attrs_text: attrsText.slice(0, 140),
            })
          );
        })
        .catch(() => {
          setPrompt(
            `Book illustration (${kind}) for "${book.title}": ${entity.name} (${entity.subtitle_or_role}). Dark noir aesthetic, 8k resolution, no text.`
          );
        });
    }
  }, [entity, book]);

  const handleGenerate = async () => {
    if (!prompt.trim() || !entity) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const estLetters = estimateImageGenerationLetters(prompt.length);
      if (userUid) {
        const check = await checkSufficientBalance(userUid, estLetters);
        if (!check.ok) {
          setErrorMsg(
            `Недостаточно букв на балансе. Требуется ≈ ${formatLettersCount(estLetters)} букв, доступно: ${formatLettersCount(check.currentBalance)} букв.`
          );
          setLoading(false);
          return;
        }
      }

      await runWithGenerationOverlay(
        {
          title: `Иллюстрация для «${entity.name}»`,
          subtitle: `Книга: «${book.title}» • Формат ${aspectRatio}`,
          initialStatus: 'Художник-ИИ создает визуальную карточку сущности...',
          totalSteps: 1,
          estimatedLetters: estLetters,
        },
        async (ctx) => {
          let enrichedPrompt = prompt.trim();
          let refUrl = (entity.image_url || '').trim();
          try {
            const siblings = await fetchWorldEntities(book.id, undefined, userUid);
            const urlMap = await resolvePublicUrlMap([refUrl, ...siblings.map((s) => s.image_url)]);
            const toPub = (u?: string) => {
              const t = (u || '').trim();
              return urlMap.get(t) || (isUsablePublicUrl(t) ? t : '');
            };
            refUrl = toPub(refUrl);
            const loreLines = siblings
              .filter((s) => s.id !== entity.id)
              .slice(0, 8)
              .map((s) => {
                const pub = toPub(s.image_url);
                return `- ${s.entity_type} "${s.name}": ${(s.description || '').slice(0, 100)}${pub ? ` [ref: ${pub}]` : ''}`;
              });
            if (!refUrl) {
              refUrl = siblings.map((s) => toPub(s.image_url)).find(Boolean) || '';
            }
            if ((book.setting || loreLines.length > 0) && !enrichedPrompt.includes('World Lore Context:')) {
              enrichedPrompt = `${enrichedPrompt}\n\nWorld Lore Context (${book.setting || 'book universe'}):\n${loreLines.join('\n')}`;
            }
          } catch {
            // proceed with user prompt if sibling lookup fails
          }

          const res = await generateProTalkImage({
            prompt: enrichedPrompt,
            aspectRatio,
            referenceImageUrl: refUrl || undefined,
            userUid,
            abortSignal: ctx.signal,
          });

          await recordAiUsage({
            userUid,
            promptKey: 'lore_visual_card',
            inputChars: prompt.length,
            outputChars: 0,
            isImage: true,
            exactTokens: res.tokensTotal,
            tokensIn: res.tokensIn,
            tokensOut: res.tokensOut,
            operationType: 'image_generation',
            bookId: book.id,
            bookTitle: book.title,
            description: `Иллюстрация сущности «${entity.name}» для «${book.title}»`,
            alertLink: 'characters',
          });

          let finalUrl = res.url;

          try {
            const folder = await getOrCreateBookFolder(book.id, book.title, userUid);
            const record = await registerFileInDb({
              name: `Иллюстрация: ${entity.name} (${entity.entity_type})`,
              original_url: res.url,
              mime_type: 'image/jpeg',
              folder_id: folder.id,
              user_uid: userUid,
            });
            if (record?.original_url && isUsablePublicUrl(record.original_url)) {
              finalUrl = record.original_url;
            }
            await saveGalleryItem(
              {
                book_id: book.id,
                image_url: finalUrl,
                prompt,
                aspect_ratio: aspectRatio,
              },
              userUid
            );
          } catch (err) {
            console.warn('Register in gallery error:', err);
          }

          setPreviewUrl(finalUrl);
          await onImageSaved(entity.id, finalUrl);
          ctx.addApplied(`Визуальная карточка «${entity.name}» сохранена в галерею`);
          ctx.setProgress(1, 1);
          return finalUrl;
        }
      );
    } catch (e: unknown) {
      setErrorMsg('Ошибка генерации изображения: ' + (e instanceof Error ? e.message : ''));
    } finally {
      setLoading(false);
    }
  };

  const handleEvaluateArt = async () => {
    if (!previewUrl || !entity) return;
    setQaLoading(true);
    setErrorMsg(null);
    try {
      const res = await evaluateArtWith763({
        imageUrls: [previewUrl],
        subjectDescription: `${entity.name} (${entity.subtitle_or_role || entity.entity_type}): ${(entity.description || '').slice(0, 260)}`,
        styleName: book.style_config?.styleName,
        userUid,
        bookId: book.id,
        bookTitle: book.title,
      });
      setQaVerdict(`${res.verdictLabel} · списано ${formatLettersCount(res.costLetters)} букв`);
    } catch (e: unknown) {
      setErrorMsg('Ошибка визуальной оценки 763: ' + (e instanceof Error ? e.message : ''));
    } finally {
      setQaLoading(false);
    }
  };

  if (!entity) return null;

  return (
    <NoirModal
      isOpen={isOpen}
      onClose={onClose}
      title={`Иллюстрация для: ${entity.name}`}
      maxWidth="max-w-xl"
    >
      <div className="flex flex-col gap-4 text-white">
        {errorMsg && (
          <div className="p-3 bg-rose-950/80 border border-rose-500 text-rose-200 text-[14px] flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}
        {/* Preview Container */}
        <div className="w-full aspect-[3/4] max-h-72 bg-zinc-950 border border-zinc-700 flex items-center justify-center overflow-hidden relative">
          {previewUrl ? (
            <img
              src={previewUrl}
              alt={entity.name}
              className="w-full h-full object-contain"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="text-center p-4 text-zinc-500 flex flex-col items-center gap-2">
              <ImageIcon className="w-10 h-10 text-zinc-600" />
              <p className="text-[14px]">Иллюстрация еще не создана. Нажмите кнопку ниже для генерации.</p>
            </div>
          )}
          {loading && (
            <div className="absolute inset-0 bg-black/75 flex flex-col items-center justify-center gap-2 text-white">
              <div className="w-8 h-8 border-2 border-white border-t-rose-500 animate-spin" />
              <span className="text-[14px] font-bold">Нейросеть рисует арт по данным сущности...</span>
            </div>
          )}
        </div>

        {/* Aspect Ratio Selector */}
        <div>
          <label className="block text-[14px] font-bold text-white mb-1.5">
            Формат кадра:
          </label>
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                { id: '3:4', label: '3:4 (вертикальный А5)' },
                { id: '1:1', label: '1:1 (квадрат)' },
                { id: '16:9', label: '16:9 (панорама)' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setAspectRatio(opt.id)}
                className={`min-h-[42px] px-2 text-[14px] font-bold border transition cursor-pointer text-center ${
                  aspectRatio === opt.id
                    ? 'bg-white text-black border-white'
                    : 'bg-zinc-950 text-zinc-400 border-zinc-700 hover:border-zinc-500'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Visual Prompt Input */}
        <div>
          <label className="block text-[14px] font-bold text-white mb-1">
            Промпт для генерации иллюстрации (на основе свойств сущности):
          </label>
          <NoirPromptTextarea
            minRows={2}
            maxRows={10}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Опишите сцену или визуальные детали..."
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-zinc-800">
          <div className="flex items-center gap-2">
            <span className="text-[14px] text-zinc-400 font-mono">
              Стоимость: ≈ {formatLettersCount(estimateImageGenerationLetters(prompt.length))} букв
            </span>
            <PricingInfoModalButton compact />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {previewUrl && (
              <NoirButton
                variant="outline"
                onClick={handleEvaluateArt}
                loading={qaLoading}
              >
                Проверить арт ИИ (763)
              </NoirButton>
            )}
            <NoirButton variant="subtle" onClick={onClose}>
              Закрыть
            </NoirButton>
            <NoirButton
              variant="primary"
              onClick={handleGenerate}
              loading={loading}
              icon={<Sparkles className="w-4 h-4 text-black" />}
            >
              {previewUrl ? 'Перегенерировать арт' : 'Сгенерировать иллюстрацию'}
            </NoirButton>
          </div>
        </div>
        {qaVerdict && (
          <div className="p-2.5 bg-zinc-950 border border-rose-500/70 text-[14px] text-zinc-200 font-mono">
            Вердикт 763 (PPLX): <strong className="text-rose-400">{qaVerdict}</strong>
          </div>
        )}
      </div>
    </NoirModal>
  );
};
