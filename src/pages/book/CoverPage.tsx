import React, { useState, useEffect, useRef } from 'react';
import { Palette, Download, Save } from 'lucide-react';
import { Book, BookCoverConfig, Chapter, CoverTextLayout, WorldEntity } from '../../types';
import { computeCoverSpecs } from '../../services/export/SpineCalculator';
import { exportCoverToPdf } from '../../services/export/pdfCoverExport';
import { updateBook, fetchWorldEntities } from '../../services/db/bookRepository';
import { orchestrateCoverImage } from '../../services/ai/orchestrator';
import { getPromptConfig, renderPrompt } from '../../services/db/promptRepository';
import { estimateImageGenerationLetters, formatLettersCount } from '../../services/billing/costCalculator';
import { NoirButton } from '../../components/common/NoirButton';
import { NoirStatus } from '../../components/common/NoirStatus';
import { GalleryPickerModal } from '../../components/gallery/GalleryPickerModal';
import { CoverWrapPreview } from '../../components/cover/CoverWrapPreview';
import { CoverEditorSection, CoverPositionEditor } from '../../components/cover/CoverPositionEditor';
import { CoverBackImageModal } from '../../components/cover/CoverBackImageModal';
import { CoverArtSlot, CoverArtStudioPanel } from '../../components/cover/CoverArtStudioPanel';
import { CoverLayersPanel } from '../../components/cover/layers/CoverLayersPanel';
import { runWithGenerationOverlay } from '../../services/ai/session/generationSession';
import { evaluateArtWith763 } from '../../services/ai/decision/bookClassifier763';

interface CoverPageProps {
  book: Book;
  chapters: Chapter[];
  onBookUpdated: (b: Book) => void;
  userUid?: number;
}

const DEFAULT_TEXT_LAYOUT: CoverTextLayout = {
  titleOffsetX: 0,
  titleOffsetY: 0,
  titleFontSize: 22,
  titleContainerWidth: 100,
  titleContainerHeight: 90,
  titleAlignV: 'top',
  titleAlignH: 'left',
  subtitleOffsetX: 0,
  subtitleOffsetY: 0,
  subtitleFontSize: 14,
  subtitleContainerWidth: 100,
  subtitleContainerHeight: 48,
  subtitleAlignV: 'top',
  subtitleAlignH: 'left',
  authorOffsetX: 0,
  authorOffsetY: 0,
  authorFontSize: 15,
  authorContainerWidth: 100,
  authorContainerHeight: 42,
  authorAlignV: 'top',
  authorAlignH: 'left',
  genreOffsetX: 0,
  genreOffsetY: 0,
  genreFontSize: 14,
  genreContainerWidth: 100,
  genreContainerHeight: 32,
  genreAlignV: 'top',
  genreAlignH: 'left',
  backGenreOffsetX: 0,
  backGenreOffsetY: 0,
  backGenreFontSize: 14,
  backGenreContainerWidth: 100,
  backGenreContainerHeight: 32,
  backGenreAlignV: 'top',
  backGenreAlignH: 'left',
  spineOffsetY: 0,
  spineFontSize: 13,
  spineTitleWidth: 100,
  spineTitleHeight: 190,
  spineTitleAlignV: 'center',
  spineTitleAlignH: 'center',
  spineAuthorWidth: 100,
  spineAuthorHeight: 120,
  spineAuthorAlignV: 'center',
  spineAuthorAlignH: 'center',
  blurbOffsetX: 0,
  blurbOffsetY: 0,
  blurbFontSize: 14,
  blurbContainerWidth: 100,
  blurbContainerHeight: 165,
  blurbAlignV: 'top',
  blurbAlignH: 'left',
};

export const CoverPage: React.FC<CoverPageProps> = ({
  book,
  chapters,
  onBookUpdated,
  userUid,
}) => {
  const artStudioRef = useRef<HTMLDivElement>(null);

  const [cover, setCover] = useState<BookCoverConfig>(() => {
    const existing = book.cover_config;
    return {
      frontTitle: existing?.frontTitle || book.title,
      frontSubtitle: existing?.frontSubtitle || book.subtitle || '',
      authorName: existing?.authorName || book.author || 'Автор KnigAI',
      spineText: existing?.spineText || `${book.title} — ${book.author || 'Автор'}`,
      backBlurb: existing?.backBlurb || book.synopsis_overview?.slice(0, 340) || 'Захватывающий роман.',
      genreLabel: existing?.genreLabel || book.genres.join(' / '),
      frontImageUrl: existing?.frontImageUrl || '',
      backImageUrl: existing?.backImageUrl || '',
      fullWrapImageUrl: existing?.fullWrapImageUrl || '',
      frontImagePos: existing?.frontImagePos || { posX: 50, posY: 50, zoom: 100 },
      backImagePos: existing?.backImagePos || { posX: 50, posY: 50, zoom: 100 },
      fullWrapImagePos: existing?.fullWrapImagePos || { posX: 50, posY: 50, zoom: 100 },
      layers: existing?.layers || [],
      backColor: existing?.backColor || existing?.spineColor || '#18181b',
      spineColor: existing?.spineColor || '#18181b',
      paperType: existing?.paperType || 'cream',
      pageCountEstimate: existing?.pageCountEstimate || Math.max(chapters.length * 3 + 12, 100),
      isbn: existing?.isbn || '978-5-00-184920-4',
      barcodeText: existing?.barcodeText || 'Издание формата А5',
      hideBranding: existing?.hideBranding || false,
      showBlockGuides: existing?.showBlockGuides !== undefined ? existing.showBlockGuides : true,
      imageFilter: existing?.imageFilter || 'normal',
      colorTint: existing?.colorTint,
      textLayout: {
        ...DEFAULT_TEXT_LAYOUT,
        ...(existing?.textLayout || {}),
      },
    };
  });

  const [statusMsg, setStatusMsg] = useState<{ type: 'info' | 'success' | 'error'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [genLoading, setGenLoading] = useState(false);
  const [coverQaLoading, setCoverQaLoading] = useState(false);
  const [galleryTargetSlot, setGalleryTargetSlot] = useState<CoverArtSlot | null>(null);
  const [isBackImageModalOpen, setIsBackImageModalOpen] = useState(false);
  const [activeArtSlot, setActiveArtSlot] = useState<CoverArtSlot>('front');
  const [activeSection, setActiveSection] = useState<CoverEditorSection>('title');
  const [selectedBlockId, setSelectedBlockId] = useState<CoverEditorSection | null>(null);
  const [activeLayerId, setActiveLayerId] = useState<string | null>(null);

  const [worldEntities, setWorldEntities] = useState<WorldEntity[]>([]);
  const [frontRefUrl, setFrontRefUrl] = useState('');
  const [customPrompt, setCustomPrompt] = useState(
    `Vertical bestseller book cover for "${book.title}". Genre: ${book.genres.join(', ')}. Style dramatic noir, high contrast black and white inks, dramatic shadows, vertical A5 proportion.`
  );
  const [backPrompt, setBackPrompt] = useState(
    `Vertical back cover art for "${book.title}". Genre: ${book.genres.join(', ')}. Mysterious noir atmosphere leaving clear compositional breathing space for blurb text, dramatic contrast.`
  );
  const [fullWrapPrompt, setFullWrapPrompt] = useState(
    `Wide 16:9 panoramic horizontal book jacket cover illustration for "${book.title}" (${book.genres.join(', ')}). Back cover atmospheric scene on the left, clean spine motif in center, dramatic main focal composition on the right front cover. High contrast noir aesthetic, no text.`
  );

  useEffect(() => {
    let active = true;
    Promise.all([
      getPromptConfig('cover_art').catch(() => null),
      getPromptConfig('back_cover_art').catch(() => null),
      fetchWorldEntities(book.id).catch(() => []),
    ]).then(([cfg, backCfg, entities]) => {
      if (!active) return;
      setWorldEntities(entities);
      const firstRef = entities.find((e) => Boolean(e.image_url?.trim()))?.image_url || '';
      setFrontRefUrl((prev) => prev || firstRef);

      const entitiesSummary = entities
        .slice(0, 6)
        .map((e) => `${e.name}${e.subtitle_or_role ? ` (${e.subtitle_or_role})` : ''}: ${(e.description || '').slice(0, 80)}`)
        .join('; ');

      if (cfg?.template) {
        setCustomPrompt(
          renderPrompt(cfg.template, {
            title: book.title,
            genres: (book.genres || []).join(', '),
            scene: book.synopsis_overview?.slice(0, 180) || 'atmospheric noir centerpiece',
            entities_summary: entitiesSummary || 'dark noir aesthetic',
          })
        );
      }
      if (backCfg?.template) {
        setBackPrompt(
          renderPrompt(backCfg.template, {
            title: book.title,
            genres: (book.genres || []).join(', '),
            synopsis_overview: book.synopsis_overview?.slice(0, 200) || 'dramatic noir atmosphere',
            entities_summary: entitiesSummary || 'dark noir aesthetic',
          })
        );
      }
    });
    return () => {
      active = false;
    };
  }, [book.id]);

  const specs = computeCoverSpecs(cover.pageCountEstimate, cover.paperType);
  const layout = cover.textLayout || DEFAULT_TEXT_LAYOUT;

  const updateTextLayout = (key: keyof CoverTextLayout, value: any) => {
    setCover((prev) => ({
      ...prev,
      textLayout: {
        ...(prev.textLayout || DEFAULT_TEXT_LAYOUT),
        [key]: value,
      },
    }));
  };

  const handleUpdateCover = (updated: Partial<BookCoverConfig>) => {
    setCover((prev) => ({ ...prev, ...updated }));
  };

  const handleResetLayout = () => {
    setCover((prev) => ({
      ...prev,
      textLayout: { ...DEFAULT_TEXT_LAYOUT },
    }));
    setStatusMsg({ type: 'info', text: 'Координаты и размеры контейнеров сброшены в исходные значения.' });
  };

  const handleSelectBlock = (section: CoverEditorSection | null) => {
    setSelectedBlockId(section);
    if (section) {
      setActiveSection(section);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setStatusMsg(null);
    try {
      const updated: Book = { ...book, cover_config: cover };
      await updateBook(updated);
      onBookUpdated(updated);
      setStatusMsg({ type: 'success', text: 'Макет переплета, слои PNG и координаты блоков сохранены в базе данных!' });
    } catch (e: unknown) {
      setStatusMsg({ type: 'error', text: 'Ошибка сохранения: ' + (e instanceof Error ? e.message : '') });
    } finally {
      setSaving(false);
    }
  };

  const handleExportPdf = async () => {
    try {
      const res = await exportCoverToPdf(
        cover,
        cover.frontTitle || book.title,
        cover.authorName || book.author,
        cover.pageCountEstimate,
        book.id,
        userUid,
        { format: 'a5', binding: 'soft_kbs', includeBleed: true, includeCropMarks: true }
      );
      const dpiNote =
        res.dpiWarnings && res.dpiWarnings.length > 0
          ? ` Внимание: у ${res.dpiWarnings.length} изобр. разрешение ниже 220 DPI для печати.`
          : ' Разрешение 300 DPI проверено.';
      setStatusMsg({
        type: 'success',
        text: `Обложка переплета сохранена в папку книги в галерее файлов! Файл: ${res.filename}.${dpiNote}`,
      });
    } catch (err: unknown) {
      setStatusMsg({ type: 'error', text: 'Ошибка экспорта обложки: ' + (err instanceof Error ? err.message : '') });
    }
  };

  const handleGenerateSlot = async (slot: CoverArtSlot) => {
    setGenLoading(true);
    setStatusMsg(null);
    const activePrompt =
      slot === 'front' ? customPrompt : slot === 'back' ? backPrompt : fullWrapPrompt;
    const titleLabel =
      slot === 'front'
        ? 'Генерация лицевой обложки А5'
        : slot === 'back'
        ? 'Генерация задней стороны переплета А5'
        : 'Генерация единого горизонтального разворота (16:9)';

    try {
      const outcome = await runWithGenerationOverlay(
        {
          title: titleLabel,
          subtitle: `Книга: «${book.title}»`,
          initialStatus: 'Художник-ИИ рисует изображение переплета и регистрирует в галерее...',
          totalSteps: 1,
          estimatedLetters: estimateImageGenerationLetters(activePrompt.length),
        },
        async (ctx) => {
          const res = await orchestrateCoverImage({
            book,
            scenePrompt: activePrompt,
            referenceUrl: frontRefUrl,
            isBackCover: slot === 'back',
            isFullWrap: slot === 'fullWrap',
            aspectRatio: slot === 'fullWrap' ? '16:9' : '3:4',
            worldEntities,
            userUid,
          });
          setCover((prev) => ({
            ...prev,
            ...(slot === 'front' ? { frontImageUrl: res.url } : {}),
            ...(slot === 'back' ? { backImageUrl: res.url } : {}),
            ...(slot === 'fullWrap' ? { fullWrapImageUrl: res.url } : {}),
          }));
          ctx.addApplied(`${titleLabel} завершена и добавлена в галерею`);
          ctx.setProgress(1, 1);
          return res;
        }
      );
      if (outcome.stopped && !outcome.result) {
        setStatusMsg({ type: 'info', text: 'Генерация остановлена пользователем.' });
      } else if (outcome.result) {
        setStatusMsg({ type: 'success', text: `${titleLabel} успешно выполнена!` });
      }
    } catch (e: unknown) {
      setStatusMsg({ type: 'error', text: 'Сбой генерации: ' + (e instanceof Error ? e.message : '') });
    } finally {
      setGenLoading(false);
    }
  };

  const handleCheckCoverQa = async (urlToAudit: string) => {
    if (!urlToAudit) return;
    setCoverQaLoading(true);
    setStatusMsg(null);
    try {
      const res = await evaluateArtWith763({
        imageUrls: [urlToAudit],
        subjectDescription: `Обложка книги «${cover.frontTitle || book.title}» (${cover.genreLabel}). ${book.synopsis_overview?.slice(0, 220) || ''}`,
        styleName: book.style_config?.styleName,
        userUid,
        bookId: book.id,
        bookTitle: book.title,
      });
      setStatusMsg({
        type: res.passedQa ? 'success' : 'error',
        text: `Оценка обложки 763 (PPLX): ${res.verdictLabel} (списано ${formatLettersCount(res.costLetters)} букв).`,
      });
    } catch (e: unknown) {
      setStatusMsg({
        type: 'error',
        text: 'Ошибка проверки обложки 763: ' + (e instanceof Error ? e.message : ''),
      });
    } finally {
      setCoverQaLoading(false);
    }
  };

  const focusArtStudioSlot = (slot: CoverArtSlot) => {
    setActiveArtSlot(slot);
    artStudioRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="w-full flex flex-col gap-6 text-white">
      <div className="noir-container p-4 sm:p-6 border-2 border-white shadow-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-[20px] font-bold text-white tracking-tight flex items-center gap-2">
            <Palette className="w-5 h-5 text-rose-500" />
            <span>Конструктор книжного переплета (Формат А5: 148×210 мм)</span>
          </h2>
          <p className="text-[14px] text-zinc-400 mt-1">
            Интерактивный переплет А5: перетаскивайте текст и PNG-слои с прозрачностью, настраивайте корешок, жанр и экспортируйте в PDF.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <NoirButton
            variant="outline"
            onClick={handleSave}
            loading={saving}
            icon={<Save className="w-4 h-4" />}
          >
            Сохранить макет
          </NoirButton>
          <NoirButton
            variant="primary"
            onClick={handleExportPdf}
            icon={<Download className="w-4 h-4 text-black" />}
          >
            Скачать обложку в PDF
          </NoirButton>
        </div>
      </div>

      {statusMsg && <NoirStatus type={statusMsg.type} message={statusMsg.text} />}

      {/* 1. Live Interactive Jacket Wrap */}
      <CoverWrapPreview
        book={book}
        cover={cover}
        layout={layout}
        specs={specs}
        selectedBlockId={selectedBlockId}
        onSelectBlock={handleSelectBlock}
        activeLayerId={activeLayerId}
        onSelectLayer={setActiveLayerId}
        onUpdateLayout={updateTextLayout}
        onUpdateCover={handleUpdateCover}
        onOpenBackImageGen={() => setIsBackImageModalOpen(true)}
        onOpenBackImageUpload={() => setIsBackImageModalOpen(true)}
        onFocusArtSlot={focusArtStudioSlot}
      />

      {/* 2. Mini-Photoshop: PNG Transparency Layers & Field Visibility */}
      <CoverLayersPanel
        bookId={book.id}
        bookTitle={book.title}
        userUid={userUid}
        cover={cover}
        layout={layout}
        activeLayerId={activeLayerId}
        onSelectLayer={(id) => {
          setActiveLayerId(id);
          if (id) setSelectedBlockId(null);
        }}
        onSelectTextSection={(sec) => {
          setActiveLayerId(null);
          handleSelectBlock(sec);
        }}
        onUpdateCover={handleUpdateCover}
        onUpdateLayout={updateTextLayout}
      />

      {/* 3. Cover Images Studio */}
      <div ref={artStudioRef}>
        <CoverArtStudioPanel
          book={book}
          cover={cover}
          activeSlot={activeArtSlot}
          onChangeSlot={setActiveArtSlot}
          worldEntities={worldEntities}
          userUid={userUid}
          frontPrompt={customPrompt}
          onChangeFrontPrompt={setCustomPrompt}
          backPrompt={backPrompt}
          onChangeBackPrompt={setBackPrompt}
          fullWrapPrompt={fullWrapPrompt}
          onChangeFullWrapPrompt={setFullWrapPrompt}
          frontRefUrl={frontRefUrl}
          onChangeFrontRefUrl={setFrontRefUrl}
          genLoading={genLoading}
          coverQaLoading={coverQaLoading}
          onGenerateSlot={handleGenerateSlot}
          onOpenGalleryForSlot={(slot) => setGalleryTargetSlot(slot)}
          onCheckCoverQa={handleCheckCoverQa}
          onUpdateCover={handleUpdateCover}
        />
      </div>

      {/* 4. Advanced Text, Genre, Coordinate and Alignment Editor */}
      <CoverPositionEditor
        cover={cover}
        layout={layout}
        activeSection={activeSection}
        onSelectSection={(s) => handleSelectBlock(s)}
        onUpdateLayout={updateTextLayout}
        onUpdateCover={handleUpdateCover}
        onResetLayout={handleResetLayout}
      />

      {/* 5. Book Specs & Paper Settings */}
      <div className="noir-container p-4 sm:p-6 border border-zinc-700 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-[14px] font-bold text-white mb-1">
            Тип бумаги блока:
          </label>
          <select
            value={cover.paperType}
            onChange={(e) => setCover((prev) => ({ ...prev, paperType: e.target.value as 'cream' | 'white' }))}
            className="w-full min-h-[44px] px-3 noir-input text-[14px]"
          >
            <option value="cream">Кремовая бумага 80г (художественная)</option>
            <option value="white">Белая бумага 75г (универсальная)</option>
          </select>
        </div>

        <div>
          <label className="block text-[14px] font-bold text-white mb-1">
            Оценка страниц (для расчета толщины корешка):
          </label>
          <input
            type="number"
            min="30"
            max="1200"
            value={cover.pageCountEstimate}
            onChange={(e) => setCover((prev) => ({ ...prev, pageCountEstimate: parseInt(e.target.value, 10) || 100 }))}
            className="w-full min-h-[44px] px-3.5 noir-input text-[14px]"
          />
        </div>
      </div>

      {galleryTargetSlot && (
        <GalleryPickerModal
          isOpen={true}
          onClose={() => setGalleryTargetSlot(null)}
          onSelectUrl={(url) => {
            setCover((prev) => ({
              ...prev,
              ...(galleryTargetSlot === 'front' ? { frontImageUrl: url } : {}),
              ...(galleryTargetSlot === 'back' ? { backImageUrl: url } : {}),
              ...(galleryTargetSlot === 'fullWrap' ? { fullWrapImageUrl: url } : {}),
            }));
            setGalleryTargetSlot(null);
          }}
          selectedUrl={
            galleryTargetSlot === 'front'
              ? cover.frontImageUrl
              : galleryTargetSlot === 'back'
              ? cover.backImageUrl
              : cover.fullWrapImageUrl
          }
          title={
            galleryTargetSlot === 'front'
              ? 'Выбор лицевой обложки из галереи'
              : galleryTargetSlot === 'back'
              ? 'Выбор изображения задней стороны из галереи'
              : 'Выбор панорамной картинки разворота из галереи'
          }
        />
      )}

      {isBackImageModalOpen && (
        <CoverBackImageModal
          isOpen={isBackImageModalOpen}
          onClose={() => setIsBackImageModalOpen(false)}
          book={book}
          worldEntities={worldEntities}
          userUid={userUid}
          initialImageUrl={cover.backImageUrl}
          onImageSelected={(url) => setCover((prev) => ({ ...prev, backImageUrl: url }))}
        />
      )}
    </div>
  );
};
