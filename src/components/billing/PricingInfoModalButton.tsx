import React, { useState } from 'react';
import { HelpCircle, Coins, Image as ImageIcon, FileText, Users, Sparkles, CheckCircle2 } from 'lucide-react';
import { NoirModal } from '../common/NoirModal';
import { NoirButton } from '../common/NoirButton';
import {
  BASE_LETTERS_PACK,
  BASE_LETTERS_PRICE_RUB,
  IMAGE_GENERATION_BASE_LETTERS,
  IMAGE_PROMPT_OUTPUT_EST_TOKENS,
  formatLettersCount,
} from '../../services/billing/costCalculator';

interface PricingInfoModalButtonProps {
  label?: string;
  compact?: boolean;
  className?: string;
}

export const PricingInfoModalButton: React.FC<PricingInfoModalButtonProps> = ({
  label,
  compact = false,
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        title="Справка: за что списываются Буквы и как считаются цены"
        aria-label="Справка по ценам и списанию букв"
        className={`inline-flex items-center justify-center gap-1.5 border border-zinc-700 hover:border-rose-500 bg-zinc-950/80 hover:bg-zinc-900 text-zinc-200 hover:text-white transition-colors cursor-pointer shrink-0 rounded-none ${
          compact ? 'w-[38px] h-[38px] sm:w-auto sm:h-auto sm:min-h-[44px] sm:min-w-[44px] sm:px-2.5' : 'min-h-[44px] px-3'
        } ${className}`}
      >
        <HelpCircle className="w-4 h-4 text-rose-500 shrink-0" />
        {label && <span className="text-[14px] font-bold leading-none">{label}</span>}
      </button>

      <NoirModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title="Как устроены цены и за что списываются Буквы"
        maxWidth="max-w-2xl"
      >
        <div className="flex flex-col gap-4 text-white font-['PT_Serif',serif] max-h-[80vh] overflow-y-auto pr-1">
          {/* Core rule */}
          <div className="p-3.5 bg-zinc-950/80 border border-rose-500/70 flex flex-col gap-1.5">
            <div className="flex items-center gap-2 text-rose-400 font-bold text-[15px]">
              <Coins className="w-4 h-4 shrink-0" />
              <span>Главное правило: 1 токен ИИ = 1 Буква</span>
            </div>
            <p className="text-[14px] text-zinc-200 leading-relaxed">
              Базовый курс пополнения: <strong className="text-white">{formatLettersCount(BASE_LETTERS_PACK)} букв = {BASE_LETTERS_PRICE_RUB} ₽</strong> (при крупных пакетах — скидки до 33%). Вы платите только за фактические токены, которые обработала нейросеть по логам KnigAI: входящий запрос + контекст + сгенерированный ответ.
            </p>
          </div>

          {/* Breakdown cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Images & Art */}
            <div className="p-3.5 bg-zinc-950/70 border border-zinc-700 flex flex-col gap-2">
              <div className="flex items-center gap-2 text-white font-bold text-[15px]">
                <ImageIcon className="w-4 h-4 text-rose-500 shrink-0" />
                <span>Арты, обложки и карты</span>
              </div>
              <p className="text-[14px] text-zinc-300 leading-relaxed">
                Фиксированная цена за генерацию 1 изображения: <strong className="text-rose-400">{formatLettersCount(IMAGE_GENERATION_BASE_LETTERS)} букв</strong> + фактические токены входа и выхода промпта (~{formatLettersCount(IMAGE_PROMPT_OUTPUT_EST_TOKENS)} букв).
              </p>
              <span className="text-[14px] font-mono text-zinc-400">
                Итого: ≈ 61 550–62 200 букв (≈ 9,2 ₽)
              </span>
            </div>

            {/* Full 10-page chapters */}
            <div className="p-3.5 bg-zinc-950/70 border border-zinc-700 flex flex-col gap-2">
              <div className="flex items-center gap-2 text-white font-bold text-[15px]">
                <FileText className="w-4 h-4 text-rose-500 shrink-0" />
                <span>Главы (~10 стр. А5) и правки ИИ</span>
              </div>
              <p className="text-[14px] text-zinc-300 leading-relaxed">
                Списываются токены за сжатый Rolling-контекст книги, выбранный лор/персонажей и весь объём текста главы (13 000–17 000 знаков + сноски и итог).
              </p>
              <span className="text-[14px] font-mono text-zinc-400">
                Итого: ≈ 7 500–9 500 букв (≈ 1,1–1,4 ₽)
              </span>
            </div>

            {/* Synopses & Plan */}
            <div className="p-3.5 bg-zinc-950/70 border border-zinc-700 flex flex-col gap-2">
              <div className="flex items-center gap-2 text-white font-bold text-[15px]">
                <Sparkles className="w-4 h-4 text-rose-500 shrink-0" />
                <span>План глав и синопсисы</span>
              </div>
              <p className="text-[14px] text-zinc-300 leading-relaxed">
                Формирование структуры и привязка сущностей в JSON по 5–30 глав за запрос. Списываются только реальные токены промпта и JSON-ответа.
              </p>
              <span className="text-[14px] font-mono text-zinc-400">
                Пакет 5–10 глав: ≈ 1 800–3 500 букв
              </span>
            </div>

            {/* Characters, Lore, Style, Cover text */}
            <div className="p-3.5 bg-zinc-950/70 border border-zinc-700 flex flex-col gap-2">
              <div className="flex items-center gap-2 text-white font-bold text-[15px]">
                <Users className="w-4 h-4 text-rose-500 shrink-0" />
                <span>Персонажи, Лор и концепт</span>
              </div>
              <p className="text-[14px] text-zinc-300 leading-relaxed">
                Анкета героя, локация, артефакт, фракция, закон мира, стиль изложения и концепт книги оплачиваются строго по токенам входа и выхода модели.
              </p>
              <span className="text-[14px] font-mono text-zinc-400">
                За 1 сущность: ≈ 600–1 500 букв
              </span>
            </div>
          </div>

          {/* Decisions 763 Economy */}
          <div className="p-3.5 bg-zinc-950/70 border border-rose-500/50 flex flex-col gap-1.5">
            <div className="flex items-center gap-2 text-white font-bold text-[14px]">
              <Sparkles className="w-4 h-4 text-rose-500 shrink-0" />
              <span>Умная экономия: KnigAI Decisions (763)</span>
            </div>
            <p className="text-[14px] text-zinc-300 leading-relaxed">
              Классификация до 5 жанров, стиля и 3 сюжетов KnigAI, фильтрация глав при ремейке, проверка диктовки и оценка качества идут по льготному коэффициенту: <strong className="text-white">0.25×</strong> (<code className="font-mono text-rose-400">jev-latest</code>), визуальная проверка до 4 артов — <strong className="text-white">0.55× + 350 букв/фото</strong> (<code className="font-mono text-rose-400">pplx</code>).
            </p>
          </div>

          {/* Free features + Transparency */}
          <div className="p-3.5 bg-zinc-950/70 border border-zinc-800 flex flex-col gap-1.5">
            <div className="flex items-center gap-2 text-white font-bold text-[14px]">
              <CheckCircle2 className="w-4 h-4 text-rose-500 shrink-0" />
              <span>Что всегда бесплатно (0 букв):</span>
            </div>
            <p className="text-[14px] text-zinc-300 leading-relaxed">
              Голосовой ввод (диктовка и сохранение аудиозаписей), ручное редактирование глав, конструктор переплета и позиций текста, 3D-читалка и экспорт PDF/Markdown. Детальный чек по каждой операции доступен в разделе «Баланс и история».
            </p>
          </div>

          <div className="flex justify-end pt-2 border-t border-zinc-800">
            <NoirButton variant="primary" onClick={() => setIsOpen(false)}>
              Понятно
            </NoirButton>
          </div>
        </div>
      </NoirModal>
    </>
  );
};
