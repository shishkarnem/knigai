import React, { useState } from 'react';
import { Image as ImageIcon, Save, Sparkles } from 'lucide-react';
import { Book, Chapter, Character, ImageLayoutConfig, WorldEntity } from '../../../types';
import { NoirButton } from '../../common/NoirButton';
import { NoirModal } from '../../common/NoirModal';
import { NoirStatus } from '../../common/NoirStatus';
import { GalleryPickerModal } from '../../gallery/GalleryPickerModal';
import { ImageLayoutScaler } from '../../editor/ImageLayoutScaler';
import { ImageFilterControl, getImageFilterStyle } from '../../editor/ImageFilterControl';
import { NoirPromptTextarea } from '../../editor/NoirPromptTextarea';
import { saveChapter } from '../../../services/db/bookRepository';
import { orchestrateChapterIllustration } from '../../../services/ai/orchestrator';
import { estimateImageGenerationLetters, formatLettersCount } from '../../../services/billing/costCalculator';
import { PricingInfoModalButton } from '../../billing/PricingInfoModalButton';
import { runWithGenerationOverlay } from '../../../services/ai/session/generationSession';

const ENTITY_PREFIX: Record<WorldEntity['entity_type'], string> = {
  character: 'Персонаж',
  location: 'Локация',
  item: 'Предмет',
  faction: 'Фракция',
  law: 'Закон',
};

export function ChapterArtModal({
  book,
  chapter,
  characters,
  worldEntities = [],
  userUid,
  onClose,
  onChapterUpdated,
}: {
  book: Book;
  chapter: Chapter;
  characters: Character[];
  worldEntities?: WorldEntity[];
  userUid?: number;
  onClose: () => void;
  onChapterUpdated: (chap: Chapter) => void;
}) {
  const [scene, setScene] = useState(
    chapter.illustration_prompt ||
      `Кульминационный момент главы "${chapter.title}": ${chapter.synopsis || 'герои исследуют ночной мегаполис'}. Стиль книжный нуар, глубокие тени, контрастный свет, без текста.`
  );
  const [aspectRatio, setAspectRatio] = useState<'3:4' | '9:16' | '1:1' | '16:9'>('3:4');

  const visualReferences = React.useMemo(() => {
    const items: Array<{ key: string; label: string; kind: string; url: string; priority: boolean }> = [];
    const seenUrls = new Set<string>();
    const chapSet = new Set((chapter.entity_ids || []).map(Number));

    for (const ent of worldEntities) {
      if (ent.image_url?.trim() && !seenUrls.has(ent.image_url.trim())) {
        seenUrls.add(ent.image_url.trim());
        items.push({
          key: `ent-${ent.id}`,
          label: ent.name,
          kind: ENTITY_PREFIX[ent.entity_type],
          url: ent.image_url.trim(),
          priority: chapSet.has(ent.id),
        });
      }
    }
    for (const c of characters || []) {
      if (c.visual_card_url?.trim() && !seenUrls.has(c.visual_card_url.trim())) {
        seenUrls.add(c.visual_card_url.trim());
        items.push({
          key: `char-${c.id}`,
          label: c.name,
          kind: 'Персонаж',
          url: c.visual_card_url.trim(),
          priority: false,
        });
      }
    }
    return items.sort((a, b) => Number(b.priority) - Number(a.priority));
  }, [worldEntities, characters, chapter.entity_ids]);

  const [refUrl, setRefUrl] = useState<string>(() => visualReferences[0]?.url || '');
  const [loading, setLoading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(chapter.illustration_url || '');
  const [isGalleryPickerOpen, setIsGalleryPickerOpen] = useState(false);

  const [imageLayout, setImageLayout] = useState<ImageLayoutConfig>(
    chapter.image_layout || {
      mode: 'header-break',
      scale: 85,
      filter: 'normal',
      colorTint: undefined,
    }
  );

  const [savedNotice, setSavedNotice] = useState(false);
  const [artError, setArtError] = useState('');

  const handleGenerate = async () => {
    setLoading(true);
    setArtError('');
    try {
      await runWithGenerationOverlay(
        {
          title: `Иллюстрация для главы #${chapter.chapter_number}`,
          subtitle: `Формат ${aspectRatio} • «${book.title}»`,
          initialStatus: 'Художник-ИИ создает иллюстрацию к главе...',
          totalSteps: 1,
          estimatedLetters: estimateImageGenerationLetters(scene.length),
        },
        async (ctx) => {
          const res = await orchestrateChapterIllustration({
            book, chapter, sceneDescription: scene, aspectRatio, referenceCardUrl: refUrl,
            worldEntities, characters, userUid,
          });
          setPreviewUrl(res.url);
          const updated: Chapter = { ...chapter, illustration_url: res.url, illustration_prompt: scene, image_layout: imageLayout };
          await saveChapter(updated, chapter.id, userUid);
          onChapterUpdated(updated);
          ctx.addApplied(`Иллюстрация к главе #${chapter.chapter_number} сохранена в галерею и главу`);
          ctx.setProgress(1, 1);
          return res;
        }
      );
    } catch (e: unknown) {
      setArtError('Ошибка при генерации арта: ' + (e instanceof Error ? e.message : ''));
    } finally {
      setLoading(false);
    }
  };

  const handleSaveLayout = async () => {
    const updated: Chapter = {
      ...chapter,
      illustration_url: previewUrl,
      image_layout: imageLayout,
    };
    await saveChapter(updated, chapter.id, userUid);
    onChapterUpdated(updated);
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 3000);
  };

  const isPng = previewUrl.toLowerCase().includes('.png');

  return (
    <NoirModal isOpen={true} onClose={onClose} title={`Иллюстрация: Глава #${chapter.chapter_number}`} maxWidth="max-w-5xl">
      <div className="flex flex-col gap-5 text-white max-h-[calc(88vh-100px)] overflow-y-auto pr-1">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="flex flex-col gap-4">
            <div>
              <label className="block text-[14px] font-bold text-white mb-1">
                Описание сцены для генерации:
              </label>
              <NoirPromptTextarea
                minRows={2}
                maxRows={10}
                value={scene}
                onChange={(e) => setScene(e.target.value)}
                placeholder="Описание сцены для генерации иллюстрации..."
              />
            </div>

            {visualReferences.length > 0 && (
              <div>
                <label className="block text-[14px] font-bold text-white mb-1">
                  Визуальные референсы сущностей мира ({visualReferences.length} с артом):
                </label>
                <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto p-1.5 bg-zinc-950/70 border border-zinc-800">
                  {visualReferences.map((item) => {
                    const isSelected = refUrl === item.url;
                    return (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => {
                          setRefUrl(isSelected ? '' : item.url);
                          setArtError('');
                        }}
                        className={`min-h-[40px] px-2.5 text-[14px] border font-bold flex items-center gap-1.5 cursor-pointer transition ${
                          isSelected
                            ? 'bg-white text-black border-white'
                            : 'bg-zinc-900 text-zinc-300 border-zinc-700 hover:text-white'
                        }`}
                        title={`Использовать арт «${item.label}» как референс`}
                      >
                        <img src={item.url} alt="" className="w-5 h-5 object-cover shrink-0" referrerPolicy="no-referrer" />
                        <span className={isSelected ? 'text-rose-600' : 'text-rose-400'}>[{item.kind}]</span>
                        <span>{item.label}</span>
                        {isSelected && <span className="text-[14px] underline">✓</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[14px] font-bold text-white mb-1">
                  Формат пропорций:
                </label>
                <select
                  value={aspectRatio}
                  onChange={(e) => setAspectRatio(e.target.value as '3:4' | '9:16' | '1:1' | '16:9')}
                  className="w-full min-h-[44px] px-3 noir-input text-[14px]"
                >
                  <option value="3:4">3:4 (Книжный вертикальный А5)</option>
                  <option value="9:16">9:16 (Мобильный экран)</option>
                  <option value="1:1">1:1 (Квадратный арт)</option>
                  <option value="16:9">16:9 (Кино-разворот)</option>
                </select>
              </div>

              <div>
                <label className="block text-[14px] font-bold text-white mb-1">
                  Галерея файлов:
                </label>
                <NoirButton
                  type="button"
                  variant="outline"
                  onClick={() => setIsGalleryPickerOpen(true)}
                  icon={<ImageIcon className="w-4 h-4" />}
                  className="w-full"
                >
                  Выбрать файл
                </NoirButton>
              </div>
            </div>

            {refUrl && (
              <div className="flex items-center gap-2 p-2 bg-zinc-950 border border-zinc-800">
                <img src={refUrl} alt="Референс" className="w-9 h-9 object-cover" referrerPolicy="no-referrer" />
                <span className="text-[14px] text-zinc-300 truncate">Референс: {refUrl}</span>
                <button
                  type="button"
                  onClick={() => setRefUrl('')}
                  className="ml-auto text-rose-400 text-[14px] underline cursor-pointer shrink-0"
                >
                  Сброс
                </button>
              </div>
            )}

            {artError && <NoirStatus type="error" message={artError} />}

            <div className="flex flex-wrap items-center gap-2">
              <NoirButton
                variant="primary"
                onClick={handleGenerate}
                loading={loading}
                icon={<Sparkles className="w-4 h-4 text-black" />}
                className="flex-1"
              >
                Сгенерировать иллюстрацию (≈ {formatLettersCount(estimateImageGenerationLetters(scene.length))} букв)
              </NoirButton>
              <PricingInfoModalButton compact />
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <div className="flex flex-col items-center justify-center p-3 border-2 border-zinc-800 bg-zinc-950 min-h-[260px] relative">
              {previewUrl ? (
                <div
                  className="relative checkerboard-bg p-1 border border-zinc-700 max-h-[320px] max-w-full flex items-center justify-center overflow-hidden"
                  style={{
                    width: `${imageLayout.scale}%`,
                    backgroundColor: imageLayout.colorTint || 'transparent',
                  }}
                >
                  <img
                    src={previewUrl}
                    alt="Арт главы"
                    className="max-h-[300px] w-auto object-contain mx-auto"
                    referrerPolicy="no-referrer"
                    style={getImageFilterStyle(imageLayout.filter, imageLayout.colorTint)}
                  />
                  {isPng && (
                    <span className="absolute top-2 left-2 px-2 py-0.5 bg-black/80 text-[14px] font-mono text-zinc-200 border border-zinc-700">
                      png alpha
                    </span>
                  )}
                </div>
              ) : (
                <div className="text-center text-zinc-500 py-12">
                  <ImageIcon className="w-12 h-12 mx-auto mb-2 text-zinc-600" />
                  <p className="text-[14px]">Иллюстрация еще не выбрана</p>
                  <p className="text-[14px] text-zinc-400 mt-1">
                    Сгенерируйте нейросетью или перетащите файл ниже
                  </p>
                </div>
              )}
            </div>

            {previewUrl && (
              <div className="p-3 bg-zinc-950/80 border border-zinc-800">
                <ImageFilterControl
                  filter={imageLayout.filter}
                  colorTint={imageLayout.colorTint}
                  onChangeFilter={(f) => setImageLayout({ ...imageLayout, filter: f })}
                  onChangeColorTint={(t) => setImageLayout({ ...imageLayout, colorTint: t })}
                  isPng={isPng}
                />
              </div>
            )}
          </div>
        </div>

        {/* Full-width 9-Mode Visual Page Placement Editor */}
        <div className="pt-4 border-t border-zinc-800">
          <ImageLayoutScaler
            layout={imageLayout}
            onChangeLayout={setImageLayout}
            imageUrl={previewUrl}
            onImageChanged={(newUrl) => setPreviewUrl(newUrl)}
            sampleText={(chapter.content || chapter.synopsis || '').replace(/!\[.*?\]\(.*?\)/g, '').trim().slice(0, 260) || undefined}
          />
        </div>

        <div className="flex items-center justify-between pt-3 border-t border-zinc-800">
          <NoirButton variant="subtle" onClick={onClose}>
            Закрыть
          </NoirButton>
          <div className="flex items-center gap-3">
            {savedNotice && (
              <span className="text-[14px] text-zinc-300 font-mono">
                ✓ Сохранено в базе данных
              </span>
            )}
            <NoirButton
              variant="primary"
              onClick={handleSaveLayout}
              disabled={!previewUrl}
              icon={<Save className="w-4 h-4 text-black" />}
            >
              Сохранить макет иллюстрации
            </NoirButton>
          </div>
        </div>

        {isGalleryPickerOpen && (
          <GalleryPickerModal
            isOpen={isGalleryPickerOpen}
            onClose={() => setIsGalleryPickerOpen(false)}
            onSelectUrl={(url) => {
              setPreviewUrl(url);
              setRefUrl(url);
            }}
            selectedUrl={previewUrl}
            title="Выбор иллюстрации для главы"
          />
        )}
      </div>
    </NoirModal>
  );
}
