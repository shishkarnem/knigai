import React, { useEffect } from 'react';
import { ArrowLeft, Shield, Lock, Mail } from 'lucide-react';
import { AppRoute } from '../../types';
import { RubikMarkerHeading } from '../../components/landing/RubikMarkerHeading';
import { NoirButton } from '../../components/common/NoirButton';
import { useAppVersion } from '../../constants/appVersion';

interface PrivacyPolicyPageProps {
  onNavigate: (route: AppRoute) => void;
}

export const PrivacyPolicyPage: React.FC<PrivacyPolicyPageProps> = ({ onNavigate }) => {
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
            <Lock className="w-4 h-4" />
            <span>Федеральный закон № 152-ФЗ · Защита данных</span>
          </div>
          <RubikMarkerHeading
            as="h1"
            text="Политика конфиденциальности KnigAI"
            className="text-[26px] sm:text-[36px] leading-tight"
          />
          <p className="text-[14px] text-zinc-400 font-mono">
            Оператор: ООО «РентРоп» (ИНН 7726477438, ОГРН 1217700234157) · Редакция от 22 ноября 2026 года · Версия{' '}
            <span className="text-rose-400 font-bold">{appVersion}</span>
          </p>
        </header>

        <section className="flex flex-col gap-3 text-[14px] sm:text-[15px] leading-relaxed text-zinc-300">
          <h2 className="text-[18px] font-bold text-white border-l-2 border-rose-500 pl-3">
            1. Какие данные мы собираем
          </h2>
          <p>
            При регистрации, авторизации и оплате услуг в сервисе KnigAI (домены knigai.online, knigai.ru, iismm.ru) Оператор обрабатывает минимально необходимый объем персональных данных:
          </p>
          <ul className="list-disc pl-5 space-y-1.5 marker:text-rose-500">
            <li>Фамилия, имя, отчество (или авторский псевдоним);</li>
            <li>Адрес электронной почты (Email) для авторизации, чеков и уведомлений;</li>
            <li>Контактный номер телефона и привязанный Telegram ID (по желанию пользователя);</li>
            <li>Технические метаданные: домен обращения, IP-адрес иUser-Agent при фиксации юридических согласий;</li>
            <li>История заказов и транзакций (InvId, сумма, статус оплаты без реквизитов банковских карт).</li>
          </ul>
        </section>

        <section className="flex flex-col gap-3 text-[14px] sm:text-[15px] leading-relaxed text-zinc-300">
          <h2 className="text-[18px] font-bold text-white border-l-2 border-rose-500 pl-3">
            2. Безопасность платежей через Робокассу
          </h2>
          <p>
            ООО «РентРоп» не запрашивает и не хранит номера банковских карт, CVV/CVC-коды или пароли 3D-Secure. Все платежные операции выполняются на защищенной стороне платежного агрегатора Робокасса по протоколам PCI DSS с проверкой контрольных подписей MD5 и передачей фискальных данных.
          </p>
        </section>

        <section className="flex flex-col gap-3 text-[14px] sm:text-[15px] leading-relaxed text-zinc-300">
          <h2 className="text-[18px] font-bold text-white border-l-2 border-rose-500 pl-3">
            3. Цели обработки, хранение и права пользователя
          </h2>
          <p>
            Персональные данные обрабатываются строго для исполнения договора оферты, ведения баланса «Буквы», отправки фискальных чеков и технической поддержки. Передача третьим лицам исключена, за исключением случаев, предусмотренных законодательством РФ и платежным сервисом Робокасса для проведения платежа.
          </p>
          <p>
            Пользователь вправе в любой момент запросить уточнение, выгрузку или удаление своих данных, обратившись на{' '}
            <a href="mailto:info@arenda-ropa.com" className="text-rose-400 underline font-mono">
              info@arenda-ropa.com
            </a>.
          </p>
        </section>

        <footer className="pt-6 border-t border-zinc-800 flex flex-wrap items-center justify-between gap-4 text-[14px]">
          <div className="flex items-center gap-2 text-zinc-400">
            <Mail className="w-4 h-4 text-rose-500" />
            <span>Обращения по ПД: info@arenda-ropa.com</span>
          </div>
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-rose-500" />
            <span className="text-zinc-300 font-mono">115191, г. Москва, пер. Духовской, д. 17, стр. 15</span>
          </div>
        </footer>
      </article>
    </div>
  );
};
