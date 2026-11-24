import React, { useState, useEffect, useCallback } from 'react';
import {
  Coins,
  ArrowUpRight,
  ArrowDownLeft,
  Copy,
  Check,
  Gift,
  Plus,
  Bell,
  History,
  ShieldCheck,
  FileText,
  CreditCard,
} from 'lucide-react';
import { AppRoute, AppUser, TransactionRecord } from '../../types';
import { RubikMarkerHeading } from '../../components/landing/RubikMarkerHeading';
import { NoirButton } from '../../components/common/NoirButton';
import { LettersPricingModal } from '../../components/cabinet/LettersPricingModal';
import {
  BALANCE_CHANGED_EVENT,
  fetchUserTransactions,
  getAuthoritativeBalance,
} from '../../services/billing/transactionService';
import { formatLettersCount, lettersToRubles } from '../../services/billing/costCalculator';
import {
  fetchRobokassaConfigInfo,
  fetchUserConsents,
  RobokassaConfigInfo,
  UserConsentRecord,
} from '../../components/billing/robokassaApi';

interface BalancePageProps {
  currentUser: AppUser;
  onNavigate: (route: AppRoute) => void;
  onUserUpdated: (user: AppUser) => void;
}

const OP_LABELS: Record<TransactionRecord['operation_type'], string> = {
  welcome_bonus: 'Стартовый бонус',
  topup: 'Пополнение баланса',
  referral_bonus: 'Реферальный бонус',
  ai_generation: 'ИИ-генерация текста',
  image_generation: 'Генерация графики ИИ',
  book_import: 'ИИ-разбор импорта',
  other: 'Прочая операция',
};

const DOC_BADGES: Record<string, string> = {
  oferta: 'Оферта',
  agreement: 'Соглашение',
  privacy: 'Конфиденциальность',
  consent: 'Согласие ПД',
};

export const BalancePage: React.FC<BalancePageProps> = ({
  currentUser,
  onNavigate,
  onUserUpdated,
}) => {
  const [filter, setFilter] = useState<'all' | 'debit' | 'credit'>('all');
  const [balance, setBalance] = useState<number>(currentUser.letters_balance ?? 1000000);
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const [consents, setConsents] = useState<UserConsentRecord[]>([]);
  const [robokassaInfo, setRobokassaInfo] = useState<RobokassaConfigInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPricingOpen, setIsPricingOpen] = useState(false);
  const [copiedRef, setCopiedRef] = useState(false);

  const referralLink =
    typeof window !== 'undefined' ? `${window.location.origin}/?ref=${currentUser.uid}` : '';

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [authBal, txList, consentRows, rkInfo] = await Promise.all([
        getAuthoritativeBalance(currentUser.uid),
        fetchUserTransactions(currentUser.uid, filter),
        fetchUserConsents(currentUser.uid),
        fetchRobokassaConfigInfo().catch(() => null),
      ]);
      setBalance(authBal);
      setTransactions(txList);
      setConsents(consentRows);
      if (rkInfo) setRobokassaInfo(rkInfo);
      if (authBal !== currentUser.letters_balance) {
        onUserUpdated({ ...currentUser, letters_balance: authBal });
      }
    } finally {
      setLoading(false);
    }
  }, [currentUser.uid, filter]);

  useEffect(() => {
    loadData();
    const handleBalEvent = () => {
      loadData();
    };
    window.addEventListener(BALANCE_CHANGED_EVENT, handleBalEvent);
    return () => window.removeEventListener(BALANCE_CHANGED_EVENT, handleBalEvent);
  }, [loadData]);

  const handleCopyRef = () => {
    if (!referralLink) return;
    navigator.clipboard.writeText(referralLink);
    setCopiedRef(true);
    setTimeout(() => setCopiedRef(false), 2400);
  };

  return (
    <div className="w-full flex flex-col gap-6 font-['PT_Serif',serif] text-white">
      {/* 1. Balance Hero */}
      <div className="noir-container p-4 sm:p-8 border-2 border-white flex flex-col lg:flex-row items-start lg:items-center justify-between gap-5">
        <div className="flex flex-col gap-2">
          <div className="inline-flex items-center gap-2 text-rose-500 font-mono text-[14px]">
            <Coins className="w-4 h-4" />
            <span>Биллинг и валюта «Буквы»</span>
          </div>
          <RubikMarkerHeading
            as="h1"
            text="Баланс, тарифы и история операций"
            className="text-[22px] sm:text-[32px] leading-tight"
          />
          <div className="flex flex-wrap items-baseline gap-3 pt-1">
            <span className="font-mono text-[28px] sm:text-[34px] font-black text-white">
              {formatLettersCount(balance)}
            </span>
            <span className="text-rose-500 text-[18px] font-bold">букв</span>
            <span className="text-[15px] text-zinc-300 font-mono">
              (≈ {lettersToRubles(balance).toLocaleString('ru-RU')} ₽)
            </span>
          </div>
          <p className="text-[14px] text-zinc-300 leading-relaxed max-w-2xl">
            Тариф: <strong>100 000 букв = 15 ₽</strong> · Подписка: <strong>0 ₽/мес</strong> · НДС 5% (ОСН). Списание происходит строго по фактическому числу символов входа и выхода нейросети.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 w-full lg:w-auto justify-start lg:justify-end">
          <NoirButton
            variant="outline"
            onClick={() => onNavigate('notifications')}
            icon={<Bell className="w-4 h-4 text-rose-500" />}
          >
            Уведомления
          </NoirButton>
          <NoirButton
            variant="primary"
            onClick={() => setIsPricingOpen(true)}
            icon={<Plus className="w-4 h-4 text-black" />}
          >
            Оплатить через Робокассу
          </NoirButton>
        </div>
      </div>

      {/* 2. Tariffs & Robokassa Payment Transparency Card */}
      <div className="noir-container p-4 sm:p-6 border border-zinc-700 bg-zinc-950/70 flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800 pb-3">
          <div className="flex items-center gap-2 text-[16px] font-bold text-white">
            <CreditCard className="w-5 h-5 text-rose-500 shrink-0" />
            <span>Тарифы и оплата через Робокассу</span>
          </div>
          {robokassaInfo && (
            <span className="text-[14px] font-mono text-zinc-300">
              Домен: <strong className="text-white">{robokassaInfo.domain}</strong> · Касса:{' '}
              <strong className="text-rose-400">{robokassaInfo.merchantLogin}</strong>
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-[14px]">
          <div className="p-3 bg-black/60 border border-zinc-800">
            <span className="text-zinc-400 block">Стандарт (от 100 тыс.):</span>
            <strong className="text-white font-mono text-[16px]">15 ₽ / 100 000 букв</strong>
          </div>
          <div className="p-3 bg-black/60 border border-zinc-800">
            <span className="text-zinc-400 block">Пакет 10 млн букв:</span>
            <strong className="text-rose-400 font-mono text-[16px]">1 350 ₽ (−10%)</strong>
          </div>
          <div className="p-3 bg-black/60 border border-zinc-800">
            <span className="text-zinc-400 block">Пакет 100 млн букв:</span>
            <strong className="text-rose-400 font-mono text-[16px]">12 000 ₽ (−20%)</strong>
          </div>
          <div className="p-3 bg-black/60 border border-zinc-800">
            <span className="text-zinc-400 block">Пакет 1 млрд букв:</span>
            <strong className="text-rose-400 font-mono text-[16px]">100 000 ₽ (−33%)</strong>
          </div>
        </div>

        <p className="text-[14px] text-zinc-300 leading-relaxed">
          В фискальном чеке указывается позиция <strong className="text-white">«Виртуальные единицы Буквы»</strong> (ОСН, НДС 5%). Подписок и автосписаний нет. Неиспользованные Буквы не сгорают, а возврат средств возможен в течение 10 дней через{' '}
          <a href="mailto:info@arenda-ropa.com" className="text-rose-400 underline font-mono">
            info@arenda-ropa.com
          </a>.
        </p>
      </div>

      {/* 3. Referral Program Card */}
      <div className="noir-container p-4 sm:p-5 border border-rose-500/60 bg-rose-950/20 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 bg-black border border-rose-500 flex items-center justify-center shrink-0">
            <Gift className="w-5 h-5 text-rose-500" />
          </div>
          <div className="flex flex-col gap-1">
            <h2 className="text-[16px] font-bold text-white">
              Реферальный бонус: +100 000 букв за каждого автора
            </h2>
            <p className="text-[14px] text-zinc-300 leading-snug">
              Поделитесь ссылкой с коллегой. После его регистрации по вашей ссылке на ваш счет автоматически начислится <strong>100 000 букв</strong>.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto shrink-0">
          <input
            type="text"
            readOnly
            value={referralLink}
            className="flex-1 md:w-64 min-h-[42px] px-3 noir-input text-[14px] font-mono text-zinc-200"
          />
          <button
            type="button"
            onClick={handleCopyRef}
            className="min-h-[42px] px-3.5 bg-white text-black hover:bg-zinc-200 font-bold text-[14px] flex items-center gap-1.5 cursor-pointer shrink-0 rounded-none"
          >
            {copiedRef ? <Check className="w-4 h-4 text-rose-600" /> : <Copy className="w-4 h-4" />}
            <span>{copiedRef ? 'Скопировано' : 'Копировать'}</span>
          </button>
        </div>
      </div>

      {/* 4. Legal Documents & Consent History */}
      <div className="noir-container p-4 sm:p-5 border border-zinc-800 bg-zinc-950/70 flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-[15px] font-bold text-white">
            <ShieldCheck className="w-4 h-4 text-rose-500" />
            <span>Правовые документы и история ваших согласий</span>
          </div>
          <span className="text-[14px] font-mono text-zinc-400">
            Зафиксировано согласий: {consents.length}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {[
            { route: 'oferta' as AppRoute, label: 'Публичная оферта' },
            { route: 'agreement' as AppRoute, label: 'Пользовательское соглашение' },
            { route: 'privacy' as AppRoute, label: 'Политика конфиденциальности' },
            { route: 'consent' as AppRoute, label: 'Согласие на обработку ПД' },
          ].map((doc) => (
            <button
              key={doc.route}
              type="button"
              onClick={() => onNavigate(doc.route)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[38px] bg-black/80 border border-zinc-700 hover:border-white text-zinc-200 hover:text-white text-[14px] cursor-pointer rounded-none"
            >
              <FileText className="w-3.5 h-3.5 text-rose-500" />
              <span>{doc.label}</span>
            </button>
          ))}
        </div>

        {consents.length > 0 && (
          <div className="flex flex-col gap-1.5 pt-2 border-t border-zinc-800/80 text-[14px]">
            {consents.slice(0, 4).map((c) => (
              <div
                key={c.id}
                className="flex flex-wrap items-center justify-between gap-2 p-2 bg-black/50 border border-zinc-800 font-mono"
              >
                <span className="text-zinc-300">
                  {new Date(c.created_at).toLocaleString('ru-RU')} ·{' '}
                  <strong className="text-white">
                    {c.consent_context === 'registration' ? 'Регистрация' : 'Оплата Робокасса'}
                  </strong>
                  {c.domain ? ` (${c.domain})` : ''}
                </span>
                <span className="text-rose-400">
                  {c.documents_accepted
                    .split(',')
                    .map((d) => DOC_BADGES[d.trim()] || d.trim())
                    .join(', ')}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 5. Filter Bubble Switcher (No horizontal scroll) */}
      <div className="noir-container p-3 sm:p-4 border border-zinc-800 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {[
            { id: 'all' as const, label: 'Все операции' },
            { id: 'debit' as const, label: 'Списания (ИИ и графика)' },
            { id: 'credit' as const, label: 'Начисления и бонусы' },
          ].map((tab) => {
            const isActive = filter === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilter(tab.id)}
                className={`relative min-h-[42px] px-4 py-2 text-[14px] font-bold transition cursor-pointer rounded-none ${
                  isActive
                    ? 'bg-white text-black border-2 border-white'
                    : 'bg-zinc-950 text-zinc-300 border border-zinc-700 hover:border-white hover:text-white'
                }`}
              >
                <span>{tab.label}</span>
                {isActive && (
                  <span
                    aria-hidden="true"
                    className="absolute -bottom-1.5 left-4 w-2 h-2 rotate-45 bg-white"
                  />
                )}
              </button>
            );
          })}
        </div>

        <span className="text-[14px] text-zinc-400 font-mono flex items-center gap-1.5">
          <History className="w-4 h-4 text-rose-500" />
          <span>Записей: {transactions.length}</span>
        </span>
      </div>

      {/* 6. Ledger List */}
      <div className="flex flex-col gap-2.5">
        {loading ? (
          <div className="noir-container p-8 text-center text-[14px] text-zinc-400 border border-zinc-800">
            Загрузка истории операций из базы данных...
          </div>
        ) : transactions.length === 0 ? (
          <div className="noir-container p-10 text-center text-[14px] text-zinc-400 border border-zinc-800">
            По выбранному фильтру транзакций пока нет.
          </div>
        ) : (
          transactions.map((tx) => {
            const isPositive = tx.amount > 0;
            const dateStr = tx.created_at
              ? new Date(tx.created_at).toLocaleString('ru-RU', {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })
              : 'Только что';

            return (
              <div
                key={tx.id}
                className="noir-container p-3.5 sm:p-4 border border-zinc-800 hover:border-zinc-500 transition flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"
              >
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <div
                    className={`w-10 h-10 border flex items-center justify-center shrink-0 ${
                      isPositive
                        ? 'bg-zinc-950 border-white text-white'
                        : 'bg-rose-950/70 border-rose-500 text-rose-400'
                    }`}
                  >
                    {isPositive ? (
                      <ArrowDownLeft className="w-5 h-5" />
                    ) : (
                      <ArrowUpRight className="w-5 h-5" />
                    )}
                  </div>

                  <div className="min-w-0 flex-1 flex flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="px-2 py-0.5 bg-zinc-900 border border-zinc-700 text-[14px] font-mono text-zinc-200">
                        {OP_LABELS[tx.operation_type] || tx.operation_type}
                      </span>
                      <span className="text-[14px] text-zinc-400 font-mono">{dateStr}</span>
                    </div>

                    <p className="text-[15px] font-bold text-white break-words">
                      {tx.description}
                    </p>

                    {tx.details && (Boolean(tx.details.input_chars) || Boolean(tx.details.output_chars) || Boolean(tx.details.decision_api)) && (
                      <div className="text-[14px] text-zinc-400 font-mono flex flex-wrap gap-3">
                        {Boolean(tx.details.decision_api) && (
                          <span className="px-1.5 py-0.5 bg-rose-950/50 border border-rose-500/60 text-rose-300">
                            763 · {String(tx.details.decision_model || 'jev-latest').split('/').pop()}
                            {Number(tx.details.images_count || 0) > 0 ? ` · ${Number(tx.details.images_count)} фото` : ''}
                          </span>
                        )}
                        {tx.details.input_chars !== undefined && (
                          <span>Вход: {formatLettersCount(tx.details.input_chars)} симв.</span>
                        )}
                        {tx.details.output_chars !== undefined && tx.details.output_chars > 0 && (
                          <span>Выход: {formatLettersCount(tx.details.output_chars)} симв.</span>
                        )}
                        {tx.details.rubles !== undefined && (
                          <span>≈ {tx.details.rubles} ₽</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex sm:flex-col items-center sm:items-end justify-between w-full sm:w-auto gap-1 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-zinc-800 font-mono">
                  <span
                    className={`text-[17px] font-black ${
                      isPositive ? 'text-white' : 'text-rose-400'
                    }`}
                  >
                    {isPositive ? '+' : '−'}
                    {formatLettersCount(Math.abs(tx.amount))} букв
                  </span>
                  <span className="text-[14px] text-zinc-400">
                    Остаток: {formatLettersCount(tx.balance_after)}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Pricing Modal */}
      <LettersPricingModal
        isOpen={isPricingOpen}
        onClose={() => setIsPricingOpen(false)}
        currentUser={{ ...currentUser, letters_balance: balance }}
        onNavigate={onNavigate}
        onBalanceUpdated={(newBal) => {
          setBalance(newBal);
          onUserUpdated({ ...currentUser, letters_balance: newBal });
          loadData();
        }}
      />
    </div>
  );
};
