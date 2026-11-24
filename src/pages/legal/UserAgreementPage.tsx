import React, { useEffect } from 'react';
import { ArrowLeft, FileText, ShieldCheck } from 'lucide-react';
import { AppRoute } from '../../types';
import { RubikMarkerHeading } from '../../components/landing/RubikMarkerHeading';
import { NoirButton } from '../../components/common/NoirButton';
import { useAppVersion } from '../../constants/appVersion';

interface UserAgreementPageProps {
  onNavigate: (route: AppRoute) => void;
}

export const UserAgreementPage: React.FC<UserAgreementPageProps> = ({ onNavigate }) => {
  const appVersion = useAppVersion();
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, []);

  return (
    <div className="relative w-full min-h-screen bg-black text-white font-['PT_Serif',serif] px-[2%] sm:px-[8%] py-6 sm:py-14">
      <div className="w-full max-w-4xl mx-auto mb-4 sm:mb-8 flex flex-wrap items-center justify-between gap-2">
        <NoirButton
          variant="subtle"
          onClick={() => onNavigate('landing')}
          icon={<ArrowLeft className="w-4 h-4 text-rose-500" />}
          className="text-[14px] bg-zinc-950/80 border border-zinc-800 text-zinc-300 hover:text-white"
        >
          Вернуться на главную
        </NoirButton>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onNavigate('oferta')}
            className="px-3 py-1.5 min-h-[38px] bg-zinc-950/80 border border-zinc-700 hover:border-rose-500 text-[14px] text-zinc-200 cursor-pointer rounded-none"
          >
            Публичная оферта
          </button>
          <button
            type="button"
            onClick={() => onNavigate('privacy')}
            className="px-3 py-1.5 min-h-[38px] bg-zinc-950/80 border border-zinc-700 hover:border-rose-500 text-[14px] text-zinc-200 cursor-pointer rounded-none"
          >
            Политика конфиденциальности
          </button>
          <button
            type="button"
            onClick={() => onNavigate('consent')}
            className="px-3 py-1.5 min-h-[38px] bg-zinc-950/80 border border-zinc-700 hover:border-rose-500 text-[14px] text-zinc-200 cursor-pointer rounded-none"
          >
            Согласие на обработку ПД
          </button>
        </div>
      </div>

      <article className="max-w-4xl mx-auto bg-zinc-950/75 border border-zinc-800 px-[3%] py-6 sm:p-12 flex flex-col gap-7 rounded-none">
        <header className="border-b border-zinc-800 pb-6 flex flex-col gap-3">
          <div className="inline-flex items-center gap-2 text-rose-500 text-[14px] font-mono">
            <FileText className="w-4 h-4" />
            <span>Правила пользования платформой KnigAI</span>
          </div>
          <RubikMarkerHeading
            as="h1"
            text="Пользовательское соглашение"
            className="text-[26px] sm:text-[36px] leading-tight"
          />
          <p className="text-[14px] text-zinc-400 font-mono">
            Редакция от 22 ноября 2026 года · ООО «РентРоп» · Версия{' '}
            <span className="text-rose-400 font-bold">{appVersion}</span>
          </p>
        </header>

        <section className="flex flex-col gap-3 text-[14px] sm:text-[15px] leading-relaxed text-zinc-300">
          <h2 className="text-[18px] font-bold text-white border-l-2 border-rose-500 pl-3">
            1. Доступ к платформе и учетная запись
          </h2>
          <p>
            Платформа KnigAI предоставляет Пользователям веб-инструменты для проектирования сюжетов, генерации текстов и иллюстраций, верстки обложек формата А5, чтения и экспорта готовых рукописей. После регистрации Пользователю присваивается уникальный 11-значный идентификатор (UID) и подарочный баланс 1 000 000 букв.
          </p>
          <p>
            Пользователь самостоятельно обеспечивает конфиденциальность своего пароля и не передает доступ к личному кабинету третьим лицам.
          </p>
        </section>

        <section className="flex flex-col gap-3 text-[14px] sm:text-[15px] leading-relaxed text-zinc-300">
          <h2 className="text-[18px] font-bold text-white border-l-2 border-rose-500 pl-3">
            2. Баланс «Виртуальные единицы Буквы» и честный биллинг
          </h2>
          <p>
            Работа ИИ-модулей тарифицируется прозрачно: 1 токен обработки модели равен 1 букве. В сервисе отсутствуют обязательные ежемесячные подписки, автопродления и скрытые комиссии. Пополнение баланса выполняется Пользователем добровольно через Робокассу с отображением стоимости (вкл. НДС 5% ОСН) до момента перехода к оплате.
          </p>
        </section>

        <section className="flex flex-col gap-3 text-[14px] sm:text-[15px] leading-relaxed text-zinc-300">
          <h2 className="text-[18px] font-bold text-white border-l-2 border-rose-500 pl-3">
            3. Правила контента и авторские права
          </h2>
          <p>
            Запрещается использовать платформу для создания материалов, нарушающих законодательство Российской Федерации, содержащих призывы к насилию, экстремизму или нарушающих интеллектуальную собственность третьих лиц. Все законно созданные Пользователем произведения принадлежат Пользователю.
          </p>
        </section>

        <footer className="pt-6 border-t border-zinc-800 flex flex-wrap items-center justify-between gap-4 text-[14px]">
          <div className="flex items-center gap-2 text-zinc-300">
            <ShieldCheck className="w-4 h-4 text-rose-500" />
            <span>Поддержка: info@arenda-ropa.com</span>
          </div>
          <NoirButton variant="primary" onClick={() => onNavigate('balance')}>
            Перейти к тарифам и балансу
          </NoirButton>
        </footer>
      </article>
    </div>
  );
};
