import React, { useState } from 'react';
import { Download, Smartphone, X, Share, PlusSquare } from 'lucide-react';
import { usePWAInstall } from './usePWAInstall';
import { NoirButton } from '../common/NoirButton';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, isAndroid, install } = usePWAInstall();
  const [showGuideModal, setShowGuideModal] = useState(false);

  // Suppress install prompt when already running in standalone installed PWA mode
  if (isInstalled) {
    return null;
  }

  const handleAction = async () => {
    if (isInstallable) {
      await install();
      return;
    }
    setShowGuideModal(true);
  };

  return (
    <>
      <div className="noir-container p-4 sm:p-5 border-2 border-white/80 bg-zinc-950/90 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-11 h-11 bg-rose-600/20 border border-rose-500 flex items-center justify-center shrink-0">
            <Smartphone className="w-5 h-5 text-rose-500" />
          </div>
          <div className="min-w-0">
            <h3 className="text-[16px] sm:text-[18px] font-bold text-white break-words">
              Установить приложение KnigAI на телефон или компьютер (PWA)
            </h3>
            <p className="text-[14px] text-zinc-300 mt-0.5 break-words">
              Добавьте иконку KnigAI на рабочий стол Android или iPhone для быстрого полноэкранного доступа и стабильной доставки мобильных Push-уведомлений.
            </p>
          </div>
        </div>

        <div className="shrink-0 flex items-center gap-2">
          <NoirButton
            variant="primary"
            onClick={handleAction}
            icon={<Download className="w-4 h-4 text-black" />}
          >
            {isInstallable
              ? 'Установить приложение'
              : isIOS
              ? 'Установить на iPhone / iPad'
              : isAndroid
              ? 'Установить на Android'
              : 'Установить на рабочий стол'}
          </NoirButton>
        </div>
      </div>

      {showGuideModal && (
        <div
          onClick={() => setShowGuideModal(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md noir-container p-5 border-2 border-white bg-zinc-950 text-white flex flex-col gap-4 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2">
                <Smartphone className="w-5 h-5 text-rose-500" />
                <h4 className="text-[17px] font-bold text-white">
                  {isIOS ? 'Установка на iPhone / iPad (Safari)' : 'Установка приложения KnigAI'}
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setShowGuideModal(false)}
                className="p-1 text-zinc-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {isIOS ? (
              <div className="flex flex-col gap-3 text-[14px] text-zinc-200 leading-relaxed">
                <p>Apple iOS устанавливает веб-приложения через встроенное меню Safari:</p>
                <div className="p-3 bg-black border border-zinc-800 flex items-start gap-2.5">
                  <Share className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
                  <span>
                    <strong>1.</strong> Нажмите кнопку <strong>«Поделиться»</strong> (квадрат со стрелкой вверх) на нижней панели Safari.
                  </span>
                </div>
                <div className="p-3 bg-black border border-zinc-800 flex items-start gap-2.5">
                  <PlusSquare className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
                  <span>
                    <strong>2.</strong> Пролистайте список вниз и выберите <strong>«На экран „Домой“»</strong> → <strong>«Добавить»</strong>.
                  </span>
                </div>
                <p className="text-zinc-400">
                  После запуска с иконки на рабочем столе (iOS 16.4+) станут доступны системные Push-уведомления на экран блокировки.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-3 text-[14px] text-zinc-200 leading-relaxed">
                <p>Чтобы установить приложение KnigAI на рабочий стол Android или ПК:</p>
                <div className="p-3 bg-black border border-zinc-800">
                  <strong>1.</strong> Откройте сайт в браузере Chrome, Яндекс.Браузер или Edge в обычном (не встроенном) окне.
                </div>
                <div className="p-3 bg-black border border-zinc-800">
                  <strong>2.</strong> Нажмите меню браузера <strong>⋮</strong> (справа сверху) и выберите <strong>«Установить приложение»</strong> или <strong>«Добавить на гл. экран»</strong>.
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={() => setShowGuideModal(false)}
              className="w-full min-h-[42px] bg-white text-black hover:bg-zinc-200 font-bold text-[14px] transition cursor-pointer"
            >
              Понятно, закрыть
            </button>
          </div>
        </div>
      )}
    </>
  );
};
