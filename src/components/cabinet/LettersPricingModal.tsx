import React, { useState, useEffect } from 'react';
import { Coins, Sparkles, ShieldCheck, Zap, Info, AlertCircle, ExternalLink } from 'lucide-react';
import { NoirModal } from '../common/NoirModal';
import { NoirButton } from '../common/NoirButton';
import { RubikMarkerHeading } from '../landing/RubikMarkerHeading';
import { AppRoute, AppUser } from '../../types';
import {
  calculateLettersPrice,
  BASE_LETTERS_PACK,
  BASE_LETTERS_PRICE_RUB,
  MIN_PURCHASE_RUBLES,
  SUBSCRIPTION_MONTHLY_RUB,
} from '../../services/auth/authService';
import { PricingInfoModalButton } from '../billing/PricingInfoModalButton';
import { LegalLinksStrip } from '../billing/LegalLinksStrip';
import {
  fetchRobokassaConfigInfo,
  initiateRobokassaPayment,
  RobokassaConfigInfo,
} from '../billing/robokassaApi';

interface LettersPricingModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: AppUser | null;
  onBalanceUpdated?: (newBalance: number) => void;
  onNavigate?: (route: AppRoute) => void;
}

const PRESET_PACKAGES = [
  {
    letters: 100000,
    label: 'Минимальный',
    note: 'Для пробы или одной повести',
    isPopular: false,
  },
  {
    letters: 1000000,
    label: 'Стандартный',
    note: 'Для анализа полного романа',
    isPopular: false,
  },
  {
    letters: 10000000,
    label: 'Писательский',
    note: 'Скидка 10% — 1 350 ₽ (экономия 150 ₽)',
    isPopular: false,
  },
  {
    letters: 100000000,
    label: 'Издательский',
    note: 'Скидка 20% — 12 000 ₽ (экономия 3 000 ₽)',
    isPopular: true,
  },
  {
    letters: 1000000000,
    label: 'Фабрика книг',
    note: 'Скидка 33% — 100 000 ₽ (экономия 50 000 ₽)',
    isPopular: false,
  },
];

export const LettersPricingModal: React.FC<LettersPricingModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onNavigate,
}) => {
  const [selectedLetters, setSelectedLetters] = useState<number>(100000000);
  const [customInput, setCustomInput] = useState<string>('100000000');
  const [consentAccepted, setConsentAccepted] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [configInfo, setConfigInfo] = useState<RobokassaConfigInfo | null>(null);

  const currentBalance = currentUser?.letters_balance ?? 1000000;
  const quote = calculateLettersPrice(selectedLetters);

  useEffect(() => {
    if (!isOpen) return;
    // Always keep consent unchecked by default when modal opens
    setConsentAccepted(false);
    setErrorMsg(null);
    fetchRobokassaConfigInfo()
      .then((info) => setConfigInfo(info))
      .catch(() => {});
  }, [isOpen]);

  const handleSelectPreset = (letters: number) => {
    setSelectedLetters(letters);
    setCustomInput(String(letters));
    setErrorMsg(null);
  };

  const handleCustomInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, '');
    setCustomInput(raw);
    const num = parseInt(raw, 10);
    if (!isNaN(num) && num > 0) {
      setSelectedLetters(num);
    }
    setErrorMsg(null);
  };

  const handleDocNavigate = (route: AppRoute) => {
    onClose();
    if (onNavigate) {
      onNavigate(route);
    } else if (typeof window !== 'undefined') {
      window.location.assign(route === 'oferta' ? '/oferta' : `/${route}`);
    }
  };

  const handleBuy = async () => {
    if (!currentUser) {
      setErrorMsg('Для оплаты необходимо войти в личный кабинет.');
      return;
    }
    if (!consentAccepted) {
      setErrorMsg('Поставьте отметку согласия с офертой и политикой конфиденциальности перед переходом в Робокассу.');
      return;
    }

    setIsProcessing(true);
    setErrorMsg(null);

    try {
      const payment = await initiateRobokassaPayment({
        userUid: currentUser.uid,
        letters: quote.letters,
        email: currentUser.email,
        consentAccepted: true,
        consentContext: 'robokassa_pricing_modal',
      });

      if (payment.paymentUrl) {
        window.location.assign(payment.paymentUrl);
      }
    } catch (err: unknown) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Не удалось сформировать ссылку на оплату в Робокассе'
      );
      setIsProcessing(false);
    }
  };

  return (
    <NoirModal
      isOpen={isOpen}
      onClose={onClose}
      title="Пополнение баланса через Робокассу"
      maxWidth="max-w-3xl"
    >
      <div className="flex flex-col gap-5 text-white font-serif max-h-[82vh] overflow-y-auto pr-1">
        {/* Header */}
        <div className="flex flex-col gap-1.5 border-b border-zinc-800 pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-rose-500 font-mono text-[14px]">
            <div className="inline-flex items-center gap-2">
              <Coins className="w-4 h-4" />
              <span>Калькулятор внутренней валюты «Буквы»</span>
            </div>
            {configInfo && (
              <span className="text-[14px] text-zinc-400">
                Касса: <strong className="text-zinc-200">{configInfo.merchantLogin}</strong> ({configInfo.domain})
              </span>
            )}
          </div>
          <RubikMarkerHeading
            as="h2"
            text="Пополнение баланса и расчет стоимости"
            className="text-[20px] sm:text-[26px] leading-tight"
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[14px] text-zinc-300 leading-relaxed flex-1">
              1 токен ИИ = 1 буква (вход + ответ + контекст). Арты: 60 000 букв за картинку + токены промпта. Голосовой ввод и экспорт — бесплатно.
            </p>
            <PricingInfoModalButton compact label="За что списания?" />
          </div>
        </div>

        {/* Current Balance & Subscriptions Banner */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="p-3.5 bg-zinc-950/80 border border-zinc-700 flex flex-col justify-between gap-1.5">
            <span className="text-[14px] text-zinc-400">Текущий баланс автора:</span>
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-[22px] sm:text-[24px] font-black text-white">
                {currentBalance.toLocaleString('ru-RU')}
              </span>
              <span className="text-rose-500 font-bold text-[15px]">букв</span>
            </div>
            <span className="text-[14px] text-zinc-400 font-mono">
              (≈ {Math.round((currentBalance / BASE_LETTERS_PACK) * BASE_LETTERS_PRICE_RUB).toLocaleString('ru-RU')} ₽ по базовому тарифу)
            </span>
          </div>

          <div className="p-3.5 bg-zinc-950/80 border border-zinc-700 flex flex-col justify-between gap-1.5">
            <span className="text-[14px] text-zinc-400">Ежемесячные подписки и налоги:</span>
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-[22px] sm:text-[24px] font-black text-rose-500">
                {SUBSCRIPTION_MONTHLY_RUB} ₽
              </span>
              <span className="text-[14px] text-zinc-300">/ месяц · НДС 5% (ОСН)</span>
            </div>
            <span className="text-[14px] text-zinc-400">
              Никаких автосписаний. В чеке: «Виртуальные единицы Буквы».
            </span>
          </div>
        </div>

        {/* Core Tariff Rules */}
        <div className="p-3 bg-zinc-900/90 border border-zinc-700 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-[14px]">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-rose-500 shrink-0" />
            <span>Базовый тариф: <strong>100 000 букв = 15 рублей</strong> (вкл. НДС 5%)</span>
          </div>
          <span className="font-mono text-zinc-300 text-[14px]">
            Минимальный платеж: <strong>{MIN_PURCHASE_RUBLES} ₽</strong>
          </span>
        </div>

        {/* Preset Packages */}
        <div className="flex flex-col gap-2">
          <label className="text-[14px] font-bold text-white flex items-center justify-between">
            <span>Выберите готовый пакет букв:</span>
            <span className="text-rose-400 text-[14px] font-normal">Скидки до 33%</span>
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {PRESET_PACKAGES.map((pkg) => {
              const q = calculateLettersPrice(pkg.letters);
              const isSelected = selectedLetters === pkg.letters;

              return (
                <button
                  key={pkg.letters}
                  type="button"
                  onClick={() => handleSelectPreset(pkg.letters)}
                  className={`p-3 text-left border transition cursor-pointer flex flex-col justify-between min-h-[110px] relative rounded-none ${
                    isSelected
                      ? 'bg-white text-black border-white font-bold'
                      : 'bg-zinc-950/80 text-zinc-200 border-zinc-800 hover:border-zinc-500'
                  }`}
                >
                  {pkg.isPopular && (
                    <span
                      className={`absolute top-2 right-2 px-1.5 py-0.5 text-[14px] font-mono border ${
                        isSelected
                          ? 'bg-black text-rose-400 border-black'
                          : 'bg-rose-950 text-rose-300 border-rose-500'
                      }`}
                    >
                      Хит
                    </span>
                  )}

                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[15px] font-bold">{pkg.label}</span>
                      {q.discountPercent > 0 && (
                        <span
                          className={`text-[14px] font-mono px-1 border ${
                            isSelected
                              ? 'bg-rose-600 text-white border-rose-600'
                              : 'bg-rose-950 text-rose-400 border-rose-500'
                          }`}
                        >
                          -{q.discountPercent}%
                        </span>
                      )}
                    </div>
                    <div className="font-mono text-[16px] font-extrabold mt-0.5">
                      {pkg.letters.toLocaleString('ru-RU')} букв
                    </div>
                  </div>

                  <div className="pt-2 border-t border-current/20 flex items-baseline justify-between gap-2">
                    <span className="text-[14px] opacity-80">{pkg.note}</span>
                    <span className="font-mono text-[17px] font-black shrink-0">
                      {q.finalRubles.toLocaleString('ru-RU')} ₽
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Custom Letters Calculator */}
        <div className="noir-container p-4 bg-zinc-950/80 border border-zinc-700 flex flex-col gap-3">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
            <label className="text-[14px] font-bold text-white flex items-center gap-2">
              <Info className="w-4 h-4 text-rose-500" />
              <span>Или введите произвольное количество букв:</span>
            </label>
            <span className="text-[14px] text-zinc-400 font-mono">
              Минимум: 100 000 букв
            </span>
          </div>

          <div className="flex items-center gap-3">
            <input
              type="text"
              value={customInput}
              onChange={handleCustomInputChange}
              placeholder="100000"
              className="flex-1 min-h-[44px] px-3.5 noir-input text-[15px] font-mono"
            />
            <span className="text-[15px] font-bold text-zinc-300 shrink-0">букв</span>
          </div>

          {/* Live Quote Breakdown */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-3 border-t border-zinc-800 font-mono text-[14px]">
            <div>
              <span className="text-zinc-400 block">Базовая цена:</span>
              <span className="text-zinc-300 font-bold">
                {quote.baseRubles.toLocaleString('ru-RU')} ₽
              </span>
            </div>

            <div>
              <span className="text-zinc-400 block">Скидка объема:</span>
              <span
                className={`font-bold ${
                  quote.discountPercent > 0 ? 'text-rose-400' : 'text-zinc-400'
                }`}
              >
                {quote.discountPercent > 0
                  ? `-${quote.discountPercent}% (${quote.discountRubles.toLocaleString('ru-RU')} ₽)`
                  : '0%'}
              </span>
            </div>

            <div>
              <span className="text-zinc-400 block">Тариф за 100 тыс.:</span>
              <span className="text-zinc-300 font-bold">
                {quote.effectiveRatePer100k} ₽
              </span>
            </div>

            <div>
              <span className="text-zinc-400 block">Итого (с НДС 5%):</span>
              <span className="text-white text-[18px] font-black">
                {quote.finalRubles.toLocaleString('ru-RU')} ₽
              </span>
            </div>
          </div>

          <div className="text-[14px] text-zinc-400 pt-2 border-t border-zinc-900 leading-snug">
            <ul className="list-disc list-inside space-y-0.5">
              <li>От 10 000 000 букв действует <strong>скидка 10%</strong> — 1 350 ₽ (экономия 150 ₽).</li>
              <li>От 100 000 000 букв действует <strong>скидка 20%</strong> — 12 000 ₽ (экономия 3 000 ₽).</li>
              <li>От 1 000 000 000 букв действует <strong>скидка 33%</strong> — 100 000 ₽ (экономия 50 000 ₽).</li>
            </ul>
          </div>
        </div>

        {/* Unchecked-by-default Consent + All 4 Legal Links */}
        <LegalLinksStrip
          checked={consentAccepted}
          onChange={(next) => {
            setConsentAccepted(next);
            if (next) setErrorMsg(null);
          }}
          onNavigateDoc={handleDocNavigate}
          contextLabel="payment"
        />

        {/* Error notice */}
        {errorMsg && (
          <div className="p-3 bg-rose-950/60 border border-rose-500 text-rose-200 text-[14px] flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-3 border-t border-zinc-800">
          <div className="flex items-center gap-2 text-zinc-400 text-[14px]">
            <ShieldCheck className="w-4 h-4 text-rose-500 shrink-0" />
            <span>Прямой переход на защищенный шлюз Робокассы.</span>
          </div>

          <div className="flex flex-wrap items-center gap-2 justify-end">
            <NoirButton variant="subtle" onClick={onClose} disabled={isProcessing}>
              Закрыть
            </NoirButton>
            <NoirButton
              variant="primary"
              onClick={handleBuy}
              loading={isProcessing}
              disabled={isProcessing || !consentAccepted}
              icon={<ExternalLink className="w-4 h-4 text-black" />}
            >
              Перейти к оплате {quote.finalRubles.toLocaleString('ru-RU')} ₽
            </NoirButton>
          </div>
        </div>
      </div>
    </NoirModal>
  );
};
