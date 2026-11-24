import React, { useEffect, useState, useCallback } from 'react';
import { CheckCircle, XCircle, RefreshCw, ArrowLeft, History, Coins, Mail } from 'lucide-react';
import { AppRoute, AppUser } from '../../types';
import { RubikMarkerHeading } from '../../components/landing/RubikMarkerHeading';
import { NoirButton } from '../../components/common/NoirButton';
import { fetchRobokassaOrderStatus, RobokassaOrderSummary } from '../../components/billing/robokassaApi';
import { BALANCE_CHANGED_EVENT, getAuthoritativeBalance } from '../../services/billing/transactionService';
import { saveUserSession } from '../../services/auth/authService';

interface PaymentResultPageProps {
  mode: 'success' | 'fail';
  currentUser: AppUser | null;
  onNavigate: (route: AppRoute) => void;
  onUserUpdated?: (user: AppUser) => void;
}

export const PaymentResultPage: React.FC<PaymentResultPageProps> = ({
  mode,
  currentUser,
  onNavigate,
  onUserUpdated,
}) => {
  const [loading, setLoading] = useState(mode === 'success');
  const [order, setOrder] = useState<RobokassaOrderSummary | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [verifiedBalance, setVerifiedBalance] = useState<number | null>(null);

  const checkStatus = useCallback(async () => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const invId = params.get('InvId') || params.get('invId') || '';

    if (!invId) {
      setLoading(false);
      if (mode === 'success') {
        setErrorText('Номер заказа (InvId) не передан в параметрах возврата.');
      }
      return;
    }

    setLoading(true);
    setErrorText(null);
    try {
      const res = await fetchRobokassaOrderStatus(window.location.search);
      if (res.order) {
        setOrder(res.order);
      }
      if (typeof res.currentBalance === 'number') {
        setVerifiedBalance(res.currentBalance);
        if (currentUser && Number(currentUser.uid) === Number(res.order?.user_uid)) {
          const updated = { ...currentUser, letters_balance: res.currentBalance };
          saveUserSession(updated);
          if (onUserUpdated) {
            onUserUpdated(updated);
          }
          window.dispatchEvent(
            new CustomEvent(BALANCE_CHANGED_EVENT, { detail: { balance: res.currentBalance } })
          );
        }
      } else if (currentUser) {
        const freshBal = await getAuthoritativeBalance(currentUser.uid);
        setVerifiedBalance(freshBal);
      }
    } catch (err: unknown) {
      setErrorText(err instanceof Error ? err.message : 'Ошибка проверки статуса платежа');
    } finally {
      setLoading(false);
    }
  }, [mode, currentUser?.uid]);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    if (mode === 'success') {
      checkStatus();
    } else {
      // On fail page still capture InvId/OutSum if returned by Robokassa
      if (typeof window !== 'undefined') {
        const params = new URLSearchParams(window.location.search);
        const invIdStr = params.get('InvId') || params.get('invId');
        if (invIdStr) {
          fetchRobokassaOrderStatus(window.location.search)
            .then((r) => r.order && setOrder(r.order))
            .catch(() => {});
        }
      }
    }
  }, [mode, checkStatus]);

  return (
    <div className="relative w-full min-h-screen bg-black text-white font-['PT_Serif',serif] px-[2%] sm:px-[8%] py-8 sm:py-16 flex items-center justify-center">
      <div className="w-full max-w-2xl bg-zinc-950/80 border-2 border-white p-5 sm:p-10 flex flex-col gap-6 rounded-none">
        {mode === 'success' ? (
          <>
            <div className="flex items-center gap-3 border-b border-zinc-800 pb-4">
              <div className="w-12 h-12 bg-black border border-white flex items-center justify-center shrink-0">
                <CheckCircle className="w-7 h-7 text-rose-500" />
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[14px] font-mono text-rose-400">
                  Платежная система Робокасса
                </span>
                <RubikMarkerHeading
                  as="h1"
                  text="Оплата успешно подтверждена"
                  className="text-[24px] sm:text-[32px] leading-tight"
                />
              </div>
            </div>

            {loading ? (
              <div className="p-6 bg-black/60 border border-zinc-800 text-[15px] text-zinc-300 flex items-center gap-3">
                <RefreshCw className="w-5 h-5 text-rose-500 animate-spin shrink-0" />
                <span>Проверяем подтверждение оплаты и баланс в PostgreSQL...</span>
              </div>
            ) : errorText ? (
              <div className="p-4 bg-rose-950/40 border border-rose-500 text-rose-200 text-[14px]">
                {errorText}
              </div>
            ) : order ? (
              <div className="flex flex-col gap-4">
                <div className="p-4 bg-black/70 border border-zinc-700 grid grid-cols-1 sm:grid-cols-2 gap-3 text-[14px]">
                  <div>
                    <span className="text-zinc-400 block">Номер заказа (InvId):</span>
                    <span className="text-white font-mono font-bold text-[16px]">#{order.inv_id}</span>
                  </div>
                  <div>
                    <span className="text-zinc-400 block">Статус заказа:</span>
                    <span className="text-rose-400 font-mono font-bold text-[16px]">
                      {order.status === 'paid' ? 'Оплачен и зачислен' : 'Ожидает подтверждения Result URL'}
                    </span>
                  </div>
                  <div>
                    <span className="text-zinc-400 block">Позиция в чеке (ОСН, НДС 5%):</span>
                    <span className="text-white font-bold">
                      Виртуальные единицы Буквы — {order.letters_amount.toLocaleString('ru-RU')} шт.
                    </span>
                  </div>
                  <div>
                    <span className="text-zinc-400 block">Сумма платежа:</span>
                    <span className="text-white font-mono font-bold text-[16px]">
                      {order.out_sum} ₽
                    </span>
                  </div>
                  <div>
                    <span className="text-zinc-400 block">Домен / Магазин Робокассы:</span>
                    <span className="text-zinc-200 font-mono">
                      {order.domain} ({order.merchant_login})
                    </span>
                  </div>
                  {verifiedBalance !== null && (
                    <div>
                      <span className="text-zinc-400 block">Текущий баланс аккаунта:</span>
                      <span className="text-white font-mono font-bold text-[16px]">
                        {verifiedBalance.toLocaleString('ru-RU')} букв
                      </span>
                    </div>
                  )}
                </div>

                {order.status !== 'paid' && (
                  <div className="p-3.5 bg-zinc-900/80 border border-rose-500/60 flex flex-wrap items-center justify-between gap-3 text-[14px]">
                    <span className="text-zinc-200">
                      Серверное уведомление от Робокассы еще обрабатывается. Нажмите кнопку обновления через несколько секунд.
                    </span>
                    <NoirButton
                      variant="outline"
                      onClick={checkStatus}
                      icon={<RefreshCw className="w-4 h-4 text-rose-500" />}
                    >
                      Проверить статус
                    </NoirButton>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-[15px] text-zinc-300">
                Платеж принят платежным шлюзом Робокасса. Баланс «Букв» обновится в личном кабинете в течение нескольких секунд.
              </p>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-zinc-800">
              <NoirButton
                variant="subtle"
                onClick={() => onNavigate('landing')}
                icon={<ArrowLeft className="w-4 h-4 text-rose-500" />}
              >
                На главную
              </NoirButton>
              <div className="flex flex-wrap items-center gap-2">
                {currentUser && (
                  <NoirButton
                    variant="outline"
                    onClick={() => onNavigate('balance')}
                    icon={<History className="w-4 h-4 text-rose-500" />}
                  >
                    История операций и баланс
                  </NoirButton>
                )}
                <NoirButton
                  variant="primary"
                  onClick={() => onNavigate(currentUser ? 'profile' : 'landing')}
                  icon={<Coins className="w-4 h-4 text-black" />}
                >
                  {currentUser ? 'В личный кабинет' : 'Продолжить в KnigAI'}
                </NoirButton>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center gap-3 border-b border-rose-900/60 pb-4">
              <div className="w-12 h-12 bg-rose-950/70 border border-rose-500 flex items-center justify-center shrink-0">
                <XCircle className="w-7 h-7 text-rose-400" />
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[14px] font-mono text-rose-400">
                  Операция прервана
                </span>
                <RubikMarkerHeading
                  as="h1"
                  text="Оплата отменена или не завершена"
                  className="text-[24px] sm:text-[32px] leading-tight"
                />
              </div>
            </div>

            <div className="p-4 bg-black/60 border border-zinc-800 flex flex-col gap-2 text-[15px] text-zinc-300 leading-relaxed">
              <p>
                Платеж через Робокассу не был завершен либо был отменен пользователем. Списание денежных средств с вашей карты сервисом KnigAI не производилось.
              </p>
              {order && (
                <p className="text-[14px] font-mono text-zinc-400">
                  Заказ #{order.inv_id} · Сумма {order.out_sum} ₽ · Магазин {order.merchant_login}
                </p>
              )}
              <div className="flex items-center gap-2 text-[14px] text-zinc-400 pt-2">
                <Mail className="w-4 h-4 text-rose-500 shrink-0" />
                <span>
                  Если средства все же списались банком, напишите на{' '}
                  <a href="mailto:info@arenda-ropa.com" className="text-rose-400 underline font-mono">
                    info@arenda-ropa.com
                  </a>
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-zinc-800">
              <NoirButton
                variant="subtle"
                onClick={() => onNavigate('landing')}
                icon={<ArrowLeft className="w-4 h-4 text-rose-500" />}
              >
                На главную
              </NoirButton>
              <NoirButton
                variant="primary"
                onClick={() => onNavigate(currentUser ? 'balance' : 'landing')}
                icon={<Coins className="w-4 h-4 text-black" />}
              >
                {currentUser ? 'Повторить пополнение в балансе' : 'Вернуться на сайт'}
              </NoirButton>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
