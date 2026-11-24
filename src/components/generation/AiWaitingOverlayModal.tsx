import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Check, Clock, Square, X } from 'lucide-react';
import {
  dismissGenerationSummary,
  getGenerationSessionSnapshot,
  requestStopGeneration,
  subscribeGenerationSession,
} from '../../services/ai/session/generationSession';
import { formatLettersCount } from '../../services/billing/costCalculator';
import { NeuroBook } from '../landing/NeuroBook';
import { RubikMarkerHeading } from '../landing/RubikMarkerHeading';

function formatElapsed(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  const hrs = Math.floor(mins / 60);
  if (hrs > 0) {
    return `${String(hrs).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export const AiWaitingOverlayModal: React.FC = () => {
  const [session, setSession] = useState(getGenerationSessionSnapshot);
  const [nowMs, setNowMs] = useState(Date.now());
  const [confirmingStop, setConfirmingStop] = useState(false);

  useEffect(() => {
    const sync = () => setSession(getGenerationSessionSnapshot());
    sync();
    return subscribeGenerationSession(sync);
  }, []);

  useEffect(() => {
    if (!session.active) {
      setConfirmingStop(false);
      return;
    }
    setNowMs(Date.now());
    const id = window.setInterval(() => {
      setNowMs(Date.now());
    }, 250);
    return () => window.clearInterval(id);
  }, [session.active, session.startedAt]);

  if ((!session.active && !session.summaryMode) || typeof document === 'undefined') return null;

  const elapsedMs = (session.endedAt || nowMs) - (session.startedAt || nowMs);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[600] flex items-center justify-center p-2.5 sm:p-5 bg-black/55 backdrop-blur-md overflow-y-auto select-none"
      onClick={(e) => {
        if (session.summaryMode && e.target === e.currentTarget) {
          dismissGenerationSummary();
        }
      }}
    >
      <div
        className="relative w-full max-w-2xl my-auto noir-modal p-4 sm:p-6 text-white rounded-none shadow-2xl flex flex-col gap-4 max-h-[92dvh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Bar with Heading + Live Timer */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-white/25">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <span
              className={`w-2.5 h-2.5 shrink-0 ${
                session.summaryMode
                  ? 'bg-zinc-300'
                  : session.stopRequested
                  ? 'bg-rose-400'
                  : 'bg-rose-500 animate-pulse'
              }`}
            />
            <RubikMarkerHeading
              text={session.summaryMode ? 'Генерация остановлена' : session.title}
              as="h3"
              className="text-[20px] sm:text-[22px] leading-tight text-white break-words"
            />
          </div>

          <div className="flex items-center gap-2 px-3 py-1.5 bg-zinc-950/80 border border-rose-500/80 shrink-0">
            <Clock className="w-4 h-4 text-rose-500 shrink-0" />
            <span className="text-[15px] font-bold font-mono tabular-nums text-white">
              {formatElapsed(elapsedMs)}
            </span>
          </div>
        </div>

        {session.subtitle && (
          <p className="text-[14px] text-zinc-300 break-words leading-snug -mt-1">
            {session.subtitle}
          </p>
        )}

        {/* Active Animation Showcase: Landing 3D NeuroBook */}
        {session.active && (
          <div className="relative w-full h-52 sm:h-60 border border-white/25 bg-zinc-950/75 overflow-hidden flex items-center justify-center">
            <NeuroBook embedded className="w-full h-full" />
            <div className="absolute bottom-2 left-2 right-2 flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-black/75 backdrop-blur-sm border border-white/20">
              <span className="text-[14px] text-white font-medium break-words">
                {session.statusText}
              </span>
              {session.totalSteps > 0 && (
                <span className="text-[14px] font-bold font-mono tabular-nums text-rose-400 shrink-0">
                  {session.completedSteps} / {session.totalSteps}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Live Fact & Balance Consumption Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <div className="p-3 bg-zinc-950/70 border border-zinc-700 flex flex-col gap-0.5">
            <span className="text-[14px] text-zinc-400">Фактически списано за сеанс:</span>
            <span className="text-[16px] font-bold font-mono tabular-nums text-rose-400">
              {formatLettersCount(session.spentLetters)} букв
            </span>
          </div>
          <div className="p-3 bg-zinc-950/70 border border-zinc-700 flex flex-col gap-0.5">
            <span className="text-[14px] text-zinc-400">
              {session.estimatedLetters > 0 ? 'Оценка полного запуска:' : 'Применено результатов:'}
            </span>
            <span className="text-[16px] font-bold font-mono tabular-nums text-white">
              {session.estimatedLetters > 0
                ? `≈ ${formatLettersCount(session.estimatedLetters)} букв`
                : `${session.appliedItems.length} шт.`}
            </span>
          </div>
        </div>

        {/* Applied Items Log */}
        {session.appliedItems.length > 0 && (
          <div className="p-3 bg-zinc-950/75 border border-zinc-700 flex flex-col gap-1.5 max-h-36 overflow-y-auto">
            <span className="text-[14px] font-bold text-white">
              Применено и сохранено в базу данных:
            </span>
            {session.appliedItems.map((item, idx) => (
              <div key={`${item}-${idx}`} className="flex items-start gap-2 text-[14px] text-zinc-200">
                <Check className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                <span className="break-words">{item}</span>
              </div>
            ))}
          </div>
        )}

        {/* Permanent Warning or Post-Stop Final Notification */}
        {session.summaryMode ? (
          <div className="p-3.5 bg-rose-950/45 border border-rose-500 text-[14px] text-zinc-100 flex items-start gap-2.5">
            <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
            <div className="flex flex-col gap-1 min-w-0">
              <span className="font-bold text-white">
                Буквы не возвращаются — удержан только фактический расход.
              </span>
              <span className="text-zinc-200 break-words">
                С вашего баланса списано ровно {formatLettersCount(session.spentLetters)} букв за уже
                выполненные запросы к нейросети.{' '}
                {session.appliedItems.length > 0
                  ? 'Все полученные и загруженные до остановки данные применены и сохранены.'
                  : 'Незавершённые этапы отменены без дальнейшего списания.'}
              </span>
            </div>
          </div>
        ) : (
          <div className="p-3 bg-zinc-950/75 border border-zinc-700 text-[14px] text-zinc-300 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
            <span className="break-words">
              При остановке потраченные буквы не возвращаются — снимается только фактически
              израсходованный к моменту остановки объём, а уже полученные данные от нейросети
              применяются согласно расчётам.
            </span>
          </div>
        )}

        {/* Stop Confirmation or Footer Controls */}
        {session.summaryMode ? (
          <div className="flex justify-end pt-1">
            <button
              type="button"
              onClick={dismissGenerationSummary}
              className="min-h-[44px] px-5 bg-white hover:bg-zinc-200 text-black font-bold text-[14px] border border-white transition cursor-pointer flex items-center gap-2 rounded-none"
            >
              <X className="w-4 h-4" />
              <span>Закрыть</span>
            </button>
          </div>
        ) : confirmingStop ? (
          <div className="p-3.5 bg-rose-950/65 border-2 border-rose-500 flex flex-col gap-3">
            <div className="flex flex-col gap-1 text-[14px]">
              <span className="font-bold text-white">
                Подтвердите остановку операции
              </span>
              <span className="text-rose-100 break-words">
                Уже потраченные буквы ({formatLettersCount(session.spentLetters)} букв + отправленный
                входной запрос) не будут возвращены. Полученные к этому моменту данные будут
                сохранены и применены.
              </span>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmingStop(false)}
                className="min-h-[44px] px-4 bg-zinc-900 hover:bg-white hover:text-black text-white border border-white/40 font-bold text-[14px] transition cursor-pointer rounded-none"
              >
                Продолжить ожидание
              </button>
              <button
                type="button"
                disabled={session.stopRequested}
                onClick={() => {
                  setConfirmingStop(false);
                  requestStopGeneration();
                }}
                className="min-h-[44px] px-4 bg-rose-600 hover:bg-rose-500 text-white border border-rose-400 font-bold text-[14px] transition cursor-pointer flex items-center gap-1.5 rounded-none disabled:opacity-60"
              >
                <Square className="w-4 h-4 fill-white" />
                <span>Да, остановить и применить</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
            <button
              type="button"
              disabled={session.stopRequested}
              onClick={() => setConfirmingStop(true)}
              className="min-h-[44px] px-5 bg-zinc-900 hover:bg-rose-700 text-white border border-rose-500 font-bold text-[14px] transition cursor-pointer flex items-center gap-2 rounded-none disabled:opacity-60"
            >
              <Square className="w-4 h-4 text-rose-400" />
              <span>
                {session.stopRequested ? 'Остановка...' : 'Остановить'}
              </span>
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};
