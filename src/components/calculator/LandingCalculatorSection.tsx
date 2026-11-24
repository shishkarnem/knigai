import React, { useState } from 'react';
import { Coins, Sparkles, Zap, ArrowRight, ShieldCheck, Check, Calculator, BookOpen } from 'lucide-react';
import { AppUser, AppRoute } from '../../types';
import { NoirButton } from '../common/NoirButton';
import { RubikMarkerHeading } from '../landing/RubikMarkerHeading';
import { SlantedScrollContainer } from '../landing/SlantedScrollContainer';
import {
  calculateLettersPrice,
  BASE_LETTERS_PACK,
  BASE_LETTERS_PRICE_RUB,
  MIN_PURCHASE_RUBLES,
  SUBSCRIPTION_MONTHLY_RUB,
} from '../../services/auth/authService';

interface LandingCalculatorSectionProps {
  currentUser: AppUser | null;
  onOpenAuth: () => void;
  onNavigate: (route: AppRoute) => void;
}

const PRESET_OPTIONS = [
  {
    letters: 100000,
    label: '100 тыс.',
    sublabel: 'Пробный',
    discount: '0%',
  },
  {
    letters: 1000000,
    label: '1 млн',
    sublabel: 'Роман',
    discount: '0%',
  },
  {
    letters: 10000000,
    label: '10 млн',
    sublabel: 'Цикл книг',
    discount: '-10%',
    note: '1 350 ₽',
  },
  {
    letters: 100000000,
    label: '100 млн',
    sublabel: 'Издательство',
    discount: '-20%',
    note: '12 000 ₽',
    isPopular: true,
  },
  {
    letters: 1000000000,
    label: '1 млрд',
    sublabel: 'Фабрика',
    discount: '-33%',
    note: '100 000 ₽',
  },
];

export const LandingCalculatorSection: React.FC<LandingCalculatorSectionProps> = ({
  currentUser,
  onOpenAuth,
  onNavigate,
}) => {
  const [lettersCount, setLettersCount] = useState<number>(100000000); // 100M default
  const [inputValue, setInputValue] = useState<string>('100000000');

  const quote = calculateLettersPrice(lettersCount);

  // Approximate pages (standard A5 book page has ~1 600 - 1 800 characters)
  const approxPages = Math.round(lettersCount / 1700);
  const approxBooks = Math.max(1, Math.round(lettersCount / 800000));

  const handleSelectPreset = (amount: number) => {
    setLettersCount(amount);
    setInputValue(String(amount));
  };

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawVal = Number(e.target.value);
    // Exponential scale from 100 000 to 1 000 000 000
    // slider value 0 to 100
    const minLog = Math.log(100000);
    const maxLog = Math.log(1000000000);
    const scale = (maxLog - minLog) / 100;
    const computedLetters = Math.round(Math.exp(minLog + scale * rawVal) / 100000) * 100000;
    const finalVal = Math.min(1000000000, Math.max(100000, computedLetters));
    setLettersCount(finalVal);
    setInputValue(String(finalVal));
  };

  // Convert current letters to slider position 0-100
  const getSliderValue = () => {
    const minLog = Math.log(100000);
    const maxLog = Math.log(1000000000);
    const currentLog = Math.log(Math.max(100000, lettersCount));
    return Math.round(((currentLog - minLog) / (maxLog - minLog)) * 100);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const digitsOnly = e.target.value.replace(/\D/g, '');
    setInputValue(digitsOnly);
    const num = parseInt(digitsOnly, 10);
    if (!isNaN(num) && num > 0) {
      setLettersCount(num);
    }
  };

  const handleCtaClick = () => {
    if (currentUser) {
      onNavigate('profile');
    } else {
      onOpenAuth();
    }
  };

  return (
    <section id="pricing-calculator" className="w-full px-[2%] sm:px-[5%] relative z-20">
      <SlantedScrollContainer
        variant="slant-left"
        slideDirection="left"
        className="flex flex-col gap-6 text-white font-['PT_Serif',serif]"
      >
        {/* Section Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-white/20 pb-4">
          <div className="flex flex-col gap-2 max-w-2xl">
            <div className="inline-flex items-center gap-2 text-rose-500 font-mono text-[14px]">
              <Calculator className="w-4 h-4" />
              <span>Честная прозрачная тарификация</span>
            </div>
            <RubikMarkerHeading
              as="h2"
              text="Калькулятор внутренней валюты «Буквы» и токенов"
              className="text-[22px] sm:text-[32px] leading-tight"
            />
            <p className="text-[14px] sm:text-[15px] text-zinc-300 leading-relaxed">
              Тариф: 100 000 букв = 15 рублей. 1 токен нейросети = 1 буква. Никаких ежемесячных подписок (0 ₽/мес). Деньги и неизрасходованные буквы никогда не сгорают.
            </p>
          </div>

          <div className="shrink-0 flex flex-wrap items-center gap-2">
            <div className="p-3 bg-zinc-950/70 border border-white/30 flex flex-col gap-0.5">
              <span className="text-[14px] text-zinc-400 font-mono">Базовый тариф:</span>
              <span className="text-[16px] font-bold text-white font-mono">100 тыс. = 15 ₽</span>
            </div>
            <div className="p-3 bg-zinc-950/70 border border-rose-600/70 flex flex-col gap-0.5">
              <span className="text-[14px] text-zinc-400 font-mono">Подписка:</span>
              <span className="text-[16px] font-bold text-rose-400 font-mono">0 ₽ в месяц</span>
            </div>
          </div>
        </div>

        {/* Free Registration Gift Banner */}
        <div className="p-3.5 sm:p-4 bg-zinc-950/60 border border-rose-500/60 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 border border-rose-500 bg-black/60 shrink-0">
              <Coins className="w-5 h-5 text-rose-500" />
            </div>
            <div className="flex flex-col">
              <span className="text-[15px] font-bold text-white">
                Каждому новому автору дарим 1 000 000 букв при регистрации
              </span>
              <span className="text-[14px] text-zinc-300">
                Этого достаточно для полного анализа, структурирования и оформления романа на 150-200 страниц.
              </span>
            </div>
          </div>

          <div className="shrink-0">
            <span className="inline-block px-3 py-1 bg-rose-950/80 border border-rose-500 text-rose-300 font-mono text-[14px]">
              Подарок 1 000 000 букв
            </span>
          </div>
        </div>

        {/* Interactive Calculator Body */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Controls Column */}
          <div className="lg:col-span-7 flex flex-col gap-4">
            {/* Quick Preset Message Bubbles */}
            <div className="flex flex-col gap-2">
              <label className="text-[14px] font-bold text-white flex items-center justify-between flex-wrap gap-1">
                <span>Быстрый выбор пакета:</span>
                <span className="text-rose-400 text-[14px] font-mono">Скидки 10%, 20%, 33%</span>
              </label>

              {/* Message Bubble Buttons (Sharp Edges, No Rounding) */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
                {PRESET_OPTIONS.map((item) => {
                  const isSelected = lettersCount === item.letters;
                  return (
                    <button
                      key={item.letters}
                      type="button"
                      onClick={() => handleSelectPreset(item.letters)}
                      className={`p-2.5 sm:p-3 text-left border transition-all cursor-pointer flex flex-col justify-between relative ${
                        isSelected
                          ? 'bg-white text-black border-white shadow-md'
                          : 'bg-zinc-950/70 text-zinc-200 border-zinc-800 hover:border-zinc-500'
                      }`}
                    >
                      {item.isPopular && (
                        <span
                          className={`absolute -top-2 -right-1 px-1 py-0.2 text-[14px] font-mono border ${
                            isSelected
                              ? 'bg-black text-rose-400 border-black'
                              : 'bg-rose-950 text-rose-300 border-rose-500'
                          }`}
                        >
                          Хит
                        </span>
                      )}

                      <div className="flex items-center justify-between gap-1">
                        <span className="font-bold text-[14px]">{item.label}</span>
                        {item.discount !== '0%' && (
                          <span
                            className={`text-[14px] font-mono px-1 border ${
                              isSelected
                                ? 'bg-rose-600 text-white border-rose-600'
                                : 'bg-rose-950 text-rose-400 border-rose-500'
                            }`}
                          >
                            {item.discount}
                          </span>
                        )}
                      </div>

                      <div className="text-[14px] opacity-80 mt-1">
                        {item.sublabel}
                      </div>

                      {item.note && (
                        <div className="text-[14px] font-mono font-bold mt-1 text-rose-500">
                          {item.note}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Custom Input & Slider */}
            <div className="p-4 bg-zinc-950/70 border border-zinc-800 flex flex-col gap-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                <label className="text-[14px] font-bold text-white flex items-center gap-2">
                  <Zap className="w-4 h-4 text-rose-500" />
                  <span>Укажите нужное число букв вручную:</span>
                </label>
                <span className="text-[14px] text-zinc-400 font-mono">
                  Мин. платеж от {MIN_PURCHASE_RUBLES} ₽ (100 тыс. букв)
                </span>
              </div>

              {/* Number Input with Suffix */}
              <div className="flex items-center gap-3">
                <input
                  type="text"
                  value={inputValue}
                  onChange={handleInputChange}
                  placeholder="100000"
                  className="flex-1 min-h-[46px] px-4 bg-black/80 border border-zinc-700 text-white text-[16px] font-mono focus:outline-none focus:border-rose-500 rounded-none"
                />
                <span className="text-[15px] font-bold text-zinc-300 shrink-0 font-mono">букв</span>
              </div>

              {/* Range Slider */}
              <div className="flex flex-col gap-1.5 pt-2">
                <div className="flex items-center justify-between text-[14px] text-zinc-400 font-mono">
                  <span>100 тыс.</span>
                  <span>10 млн (-10%)</span>
                  <span>100 млн (-20%)</span>
                  <span>1 млрд (-33%)</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={getSliderValue()}
                  onChange={handleSliderChange}
                  className="w-full accent-rose-600 cursor-pointer h-2 bg-zinc-800 rounded-none"
                />
              </div>

              {/* Discount Rules Clarification */}
              <div className="p-3 bg-black/50 border border-zinc-800 text-[14px] text-zinc-300 flex flex-col gap-1">
                <span className="text-white font-bold font-mono">Ступени оптовых скидок:</span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5 pt-1 font-mono text-[14px]">
                  <div className="p-1.5 border border-zinc-800 bg-zinc-950">
                    <span className="text-rose-400 block font-bold">10 млн букв</span>
                    <span className="text-zinc-200">Скидка 10% = 1 350 ₽</span>
                    <span className="text-zinc-400 block">(экономия 150 ₽)</span>
                  </div>
                  <div className="p-1.5 border border-rose-900/60 bg-zinc-950">
                    <span className="text-rose-400 block font-bold">100 млн букв</span>
                    <span className="text-zinc-200">Скидка 20% = 12 000 ₽</span>
                    <span className="text-zinc-400 block">(экономия 3 000 ₽)</span>
                  </div>
                  <div className="p-1.5 border border-zinc-800 bg-zinc-950">
                    <span className="text-rose-400 block font-bold">1 млрд букв</span>
                    <span className="text-zinc-200">Скидка 33% = 100 000 ₽</span>
                    <span className="text-zinc-400 block">(экономия 50 000 ₽)</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Result Card Column */}
          <div className="lg:col-span-5 flex flex-col gap-4">
            <div className="p-4 sm:p-5 bg-zinc-950/80 border-2 border-white/60 flex flex-col gap-4">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                <span className="text-[14px] font-mono text-zinc-400">Итоговый расчет:</span>
                <span className="text-[14px] font-mono text-rose-400">
                  {quote.discountPercent > 0 ? `Скидка ${quote.discountPercent}%` : 'Без наценок'}
                </span>
              </div>

              {/* Main Price Highlight */}
              <div className="flex flex-col gap-1">
                <span className="text-[14px] text-zinc-400">Стоимость к оплате:</span>
                <div className="flex items-baseline gap-2">
                  <span className="font-mono text-[30px] sm:text-[38px] font-black text-white">
                    {quote.finalRubles.toLocaleString('ru-RU')}
                  </span>
                  <span className="text-[20px] font-bold text-rose-500 font-mono">₽</span>
                  {quote.discountPercent > 0 && (
                    <span className="text-[15px] text-zinc-400 line-through font-mono">
                      {quote.baseRubles.toLocaleString('ru-RU')} ₽
                    </span>
                  )}
                </div>
                {quote.discountRubles > 0 && (
                  <span className="text-[14px] text-rose-400 font-mono">
                    Вы экономите: {quote.discountRubles.toLocaleString('ru-RU')} ₽
                  </span>
                )}
              </div>

              {/* Breakdown Details Grid */}
              <div className="grid grid-cols-2 gap-2.5 pt-3 border-t border-zinc-800 text-[14px]">
                <div className="p-2.5 bg-black/60 border border-zinc-800 flex flex-col">
                  <span className="text-zinc-400">Количество букв:</span>
                  <span className="text-white font-mono font-bold text-[15px]">
                    {quote.letters.toLocaleString('ru-RU')}
                  </span>
                </div>

                <div className="p-2.5 bg-black/60 border border-zinc-800 flex flex-col">
                  <span className="text-zinc-400">Токенов ИИ (1:1):</span>
                  <span className="text-rose-400 font-mono font-bold text-[15px]">
                    {quote.letters.toLocaleString('ru-RU')}
                  </span>
                </div>

                <div className="p-2.5 bg-black/60 border border-zinc-800 flex flex-col">
                  <span className="text-zinc-400">Эффективный тариф:</span>
                  <span className="text-zinc-200 font-mono font-bold">
                    {quote.effectiveRatePer100k} ₽ / 100 тыс.
                  </span>
                </div>

                <div className="p-2.5 bg-black/60 border border-zinc-800 flex flex-col">
                  <span className="text-zinc-400">Примерный объем:</span>
                  <span className="text-zinc-200 font-mono font-bold">
                    ≈ {approxPages.toLocaleString('ru-RU')} стр. А5
                  </span>
                </div>
              </div>

              {/* Book Equivalent Info */}
              <div className="p-3 bg-zinc-900/60 border border-zinc-800 flex items-start gap-2.5 text-[14px] text-zinc-300">
                <BookOpen className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                <span>
                  Этого объема хватит примерно на <strong>{approxBooks} {approxBooks === 1 ? 'полную книгу' : 'книг(и)'}</strong> со всеми итерациями нейросети, аннотациями и генерацией глав.
                </span>
              </div>

              {/* CTA Bubble Button */}
              <div className="pt-2 flex flex-col gap-2.5">
                <NoirButton
                  variant="primary"
                  onClick={handleCtaClick}
                  icon={<ArrowRight className="w-4 h-4 text-black" />}
                  className="w-full py-3.5 text-[15px] font-bold bg-white text-black hover:bg-zinc-200 border-2 border-white justify-center"
                >
                  {currentUser
                    ? 'Перейти к оплате через Робокассу'
                    : 'Забрать 1 000 000 букв бесплатно'}
                </NoirButton>

                <div className="flex items-center justify-center gap-1.5 text-zinc-400 text-[14px] text-center">
                  <ShieldCheck className="w-4 h-4 text-rose-500 shrink-0" />
                  <span>Робокасса · НДС 5% (ОСН) · Чек «Виртуальные единицы Буквы»</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Transparent Legal & Refund Bar for Robokassa Moderation */}
        <div className="p-3.5 bg-zinc-950/70 border border-zinc-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 text-[14px]">
          <div className="text-zinc-300 leading-snug">
            <strong className="text-white">Прозрачные условия:</strong> без подписок (0 ₽/мес) и скрытых списаний. Возврат неиспользованных средств в течение 10 дней через{' '}
            <a href="mailto:info@arenda-ropa.com" className="text-rose-400 underline font-mono">
              info@arenda-ropa.com
            </a>.
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => onNavigate('oferta')}
              className="px-2.5 py-1.5 bg-black border border-zinc-700 hover:border-white text-zinc-200 cursor-pointer rounded-none"
            >
              Оферта
            </button>
            <button
              type="button"
              onClick={() => onNavigate('agreement')}
              className="px-2.5 py-1.5 bg-black border border-zinc-700 hover:border-white text-zinc-200 cursor-pointer rounded-none"
            >
              Соглашение
            </button>
            <button
              type="button"
              onClick={() => onNavigate('privacy')}
              className="px-2.5 py-1.5 bg-black border border-zinc-700 hover:border-white text-zinc-200 cursor-pointer rounded-none"
            >
              Конфиденциальность
            </button>
            <button
              type="button"
              onClick={() => onNavigate('consent')}
              className="px-2.5 py-1.5 bg-black border border-zinc-700 hover:border-white text-zinc-200 cursor-pointer rounded-none"
            >
              Согласие на ПД
            </button>
          </div>
        </div>
      </SlantedScrollContainer>
    </section>
  );
};
