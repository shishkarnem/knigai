import React, { useEffect } from 'react';
import { ArrowLeft, UserCheck, Mail } from 'lucide-react';
import { AppRoute } from '../../types';
import { RubikMarkerHeading } from '../../components/landing/RubikMarkerHeading';
import { NoirButton } from '../../components/common/NoirButton';
import { useAppVersion } from '../../constants/appVersion';

interface PersonalDataConsentPageProps {
  onNavigate: (route: AppRoute) => void;
}

export const PersonalDataConsentPage: React.FC<PersonalDataConsentPageProps> = ({ onNavigate }) => {
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
            onClick={() => onNavigate('agreement')}
            className="px-3 py-1.5 min-h-[38px] bg-zinc-950/80 border border-zinc-700 hover:border-rose-500 text-[14px] text-zinc-200 cursor-pointer rounded-none"
          >
            Пользовательское соглашение
          </button>
          <button
            type="button"
            onClick={() => onNavigate('privacy')}
            className="px-3 py-1.5 min-h-[38px] bg-zinc-950/80 border border-zinc-700 hover:border-rose-500 text-[14px] text-zinc-200 cursor-pointer rounded-none"
          >
            Политика конфиденциальности
          </button>
        </div>
      </div>

      <article className="max-w-4xl mx-auto bg-zinc-950/75 border border-zinc-800 px-[3%] py-6 sm:p-12 flex flex-col gap-7 rounded-none">
        <header className="border-b border-zinc-800 pb-6 flex flex-col gap-3">
          <div className="inline-flex items-center gap-2 text-rose-500 text-[14px] font-mono">
            <UserCheck className="w-4 h-4" />
            <span>Согласие субъекта персональных данных</span>
          </div>
          <RubikMarkerHeading
            as="h1"
            text="Согласие на обработку персональных данных"
            className="text-[26px] sm:text-[36px] leading-tight"
          />
          <p className="text-[14px] text-zinc-400 font-mono">
            Оператор: ООО «РентРоп» (ИНН 7726477438) · Редакция от 22 ноября 2026 года · Версия{' '}
            <span className="text-rose-400 font-bold">{appVersion}</span>
          </p>
        </header>

        <section className="flex flex-col gap-3 text-[14px] sm:text-[15px] leading-relaxed text-zinc-300">
          <p>
            Нажимая отметку согласия (чекбокс) в регистрационной форме или форме пополнения баланса на сайте KnigAI (домены knigai.online, knigai.ru, iismm.ru), я свободно, своей волей и в своем интересе даю согласие ООО «РентРоп» (115191, г. Москва, пер. Духовской, д. 17, стр. 15, помещ. 11Н/2) на автоматизированную и неавтоматизированную обработку моих персональных данных:
          </p>
          <ul className="list-disc pl-5 space-y-1.5 marker:text-rose-500">
            <li>ФИО / имя автора, адрес электронной почты, контактный телефон, Telegram ID;</li>
            <li>Идентификатор пользователя (UID), технические данные сессии и журнал юридических согласий;</li>
            <li>Сведения об оплатах «Виртуальных единиц Буквы», необходимые для формирования фискального чека через Робокассу и бухгалтерского учета (НДС 5% ОСН).</li>
          </ul>
        </section>

        <section className="flex flex-col gap-3 text-[14px] sm:text-[15px] leading-relaxed text-zinc-300">
          <h2 className="text-[18px] font-bold text-white border-l-2 border-rose-500 pl-3">
            Срок действия и отзыв согласия
          </h2>
          <p>
            Настоящее согласие действует в течение всего срока использования учетной записи и может быть отозвано в любой момент путем направления уведомления в свободной форме на электронный адрес{' '}
            <a href="mailto:info@arenda-ropa.com" className="text-rose-400 underline font-mono">
              info@arenda-ropa.com
            </a>.
          </p>
        </section>

        <footer className="pt-6 border-t border-zinc-800 flex flex-wrap items-center justify-between gap-4 text-[14px]">
          <div className="flex items-center gap-2 text-zinc-400">
            <Mail className="w-4 h-4 text-rose-500" />
            <span>Отзыв согласия: info@arenda-ropa.com</span>
          </div>
          <NoirButton variant="primary" onClick={() => onNavigate('landing')}>
            На главную страницу
          </NoirButton>
        </footer>
      </article>
    </div>
  );
};
