import React, { useEffect } from 'react';
import { ArrowLeft, Shield, ExternalLink, HelpCircle, FileText, Coins } from 'lucide-react';
import { AppRoute } from '../../types';
import { RubikMarkerHeading } from '../../components/landing/RubikMarkerHeading';
import { NoirButton } from '../../components/common/NoirButton';
import { useAppVersion } from '../../constants/appVersion';

interface OfertaPageProps {
  onNavigate: (route: AppRoute) => void;
}

export const OfertaPage: React.FC<OfertaPageProps> = ({ onNavigate }) => {
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
            onClick={() => onNavigate('agreement')}
            className="px-3 py-1.5 min-h-[38px] bg-zinc-950/80 border border-zinc-700 hover:border-rose-500 text-[14px] text-zinc-200 hover:text-white cursor-pointer rounded-none"
          >
            Пользовательское соглашение
          </button>
          <button
            type="button"
            onClick={() => onNavigate('privacy')}
            className="px-3 py-1.5 min-h-[38px] bg-zinc-950/80 border border-zinc-700 hover:border-rose-500 text-[14px] text-zinc-200 hover:text-white cursor-pointer rounded-none"
          >
            Политика конфиденциальности
          </button>
          <button
            type="button"
            onClick={() => onNavigate('consent')}
            className="px-3 py-1.5 min-h-[38px] bg-zinc-950/80 border border-zinc-700 hover:border-rose-500 text-[14px] text-zinc-200 hover:text-white cursor-pointer rounded-none"
          >
            Согласие на обработку ПД
          </button>
        </div>
      </div>

      <article className="max-w-4xl mx-auto bg-zinc-950/70 border border-zinc-800 px-[3%] py-6 sm:p-12 flex flex-col gap-8 rounded-none">
        <header className="border-b border-zinc-800 pb-6 flex flex-col gap-3">
          <div className="inline-flex items-center gap-2 text-rose-500 text-[14px] font-mono">
            <Shield className="w-4 h-4" />
            <span>Юридический документ · Публичная оферта</span>
          </div>
          <RubikMarkerHeading
            as="h1"
            text="Публичная оферта сервиса KnigAI"
            className="text-[26px] sm:text-[38px] leading-tight"
          />
          <p className="text-[14px] text-zinc-400 font-mono">
            Редакция от 22 ноября 2026 года · ООО «РентРоп» · ОСН (вкл. НДС 5%) · Версия{' '}
            <span className="text-rose-400 font-bold">{appVersion}</span>
          </p>
        </header>

        {/* 1. Общие положения */}
        <section className="flex flex-col gap-3 text-[14px] sm:text-[15px] leading-relaxed text-zinc-300">
          <h2 className="text-[18px] sm:text-[20px] font-bold text-white border-l-2 border-rose-500 pl-3">
            1. Общие положения и предмет договора
          </h2>
          <p>
            Настоящий документ является официальным публичным предложением (публичной офертой согласно ст. 437 Гражданского кодекса РФ) общества с ограниченной ответственностью «РентРоп» (далее — Исполнитель) заключить договор на оказание цифровых услуг платформы KnigAI (домены knigai.online, knigai.ru, iismm.ru): предоставление прав доступа к функционалу ИИ-генерации книг, верстки макетов А5 и начисление внутренней учетной единицы «Виртуальные единицы Буквы».
          </p>
          <p>
            Акцептом настоящей оферты признается простановка Пользователем отметки согласия (чекбокса) при регистрации или перед оплатой на платежной форме, а также фактическое внесение оплаты через платежный шлюз Робокасса.
          </p>
        </section>

        {/* 2. Реквизиты и система налогообложения */}
        <section className="px-[3%] py-4 sm:p-6 bg-black/60 border border-white/20 flex flex-col gap-3 text-[14px] rounded-none">
          <h3 className="text-[16px] font-bold text-rose-400 font-mono">
            2. Реквизиты Исполнителя и налоговый режим
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-zinc-300">
            <div>
              <span className="text-zinc-500 block">Наименование:</span>
              <strong className="text-white">ООО «РентРоп»</strong>
            </div>
            <div>
              <span className="text-zinc-500 block">Система налогообложения и НДС:</span>
              <strong className="text-rose-400 font-mono">ОСН · Все цены включают НДС 5%</strong>
            </div>
            <div>
              <span className="text-zinc-500 block">ОГРН:</span>
              <span className="text-white font-mono">1217700234157</span>
            </div>
            <div>
              <span className="text-zinc-500 block">ИНН:</span>
              <span className="text-white font-mono">7726477438</span>
            </div>
            <div>
              <span className="text-zinc-500 block">Электронная почта (поддержка и возвраты):</span>
              <a href="mailto:info@arenda-ropa.com" className="text-rose-400 underline font-mono">
                info@arenda-ropa.com
              </a>
            </div>
            <div>
              <span className="text-zinc-500 block">Платежный агрегатор:</span>
              <span className="text-white font-mono">Робокасса (МИР, Visa, Mastercard, СБП)</span>
            </div>
            <div className="md:col-span-2">
              <span className="text-zinc-500 block">Юридический адрес:</span>
              <span className="text-white">
                115191, г. Москва, пер. Духовской, д. 17, стр. 15, помещ. 11Н/2
              </span>
            </div>
          </div>
        </section>

        {/* 3. Виртуальные единицы Буквы, тарифы и чек */}
        <section className="flex flex-col gap-3 text-[14px] sm:text-[15px] leading-relaxed text-zinc-300">
          <h2 className="text-[18px] sm:text-[20px] font-bold text-white border-l-2 border-rose-500 pl-3 flex items-center gap-2">
            <Coins className="w-5 h-5 text-rose-500 shrink-0" />
            <span>3. Тарифы, «Виртуальные единицы Буквы» и порядок списаний</span>
          </h2>
          <p>
            Для учета потребляемых вычислительных ресурсов нейросетей используется внутренняя единица измерения — <strong className="text-white">«Виртуальные единицы Буквы»</strong> (именно эта номенклатура указывается в фискальном чеке Робокассы: <span className="font-mono text-rose-400">«Виртуальные единицы Буквы»</span>, количество — число приобретаемых Букв, сумма — итоговая сумма платежа в рублях, вкл. НДС 5% по ОСН).
          </p>
          <ul className="flex flex-col gap-2 pl-4 list-disc marker:text-rose-500">
            <li>
              <strong className="text-white">Базовый тариф:</strong> 100 000 букв = 15 рублей (включая НДС 5%). Минимальная сумма пополнения — 15 рублей.
            </li>
            <li>
              <strong className="text-white">Ежемесячные подписки и скрытые платежи:</strong> 0 ₽ в месяц. Рекуррентные автосписания отсутствуют полностью.
            </li>
            <li>
              <strong className="text-white">Пакеты со скидкой объема:</strong> 10 000 000 букв (−10%) = 1 350 ₽; 100 000 000 букв (−20%) = 12 000 ₽; 1 000 000 000 букв (−33%) = 100 000 ₽.
            </li>
            <li>
              <strong className="text-white">Прозрачный расход:</strong> 1 токен ИИ = 1 буква (учитываются токены входящего запроса, контекста и ответа модели). Генерация изображения или арта — 60 000 букв + фактические токены промпта.
            </li>
            <li>
              <strong className="text-white">Бесплатные функции (0 букв):</strong> регистрация (с подарочными 1 000 000 букв), ручной редактор глав, голосовой ввод, конструктор переплета А5, онлайн-читалка и экспорт PDF/Markdown.
            </li>
          </ul>
        </section>

        {/* 4. Условия оплаты и момент оказания услуги */}
        <section className="flex flex-col gap-3 text-[14px] sm:text-[15px] leading-relaxed text-zinc-300">
          <h2 className="text-[18px] sm:text-[20px] font-bold text-white border-l-2 border-rose-500 pl-3">
            4. Условия оплаты и момент оказания услуги
          </h2>
          <p>
            Оплата производится в российских рублях в безналичной форме через защищенное соединение платежного сервиса <strong className="text-white">Робокасса</strong>. Данные банковских карт вводятся исключительно на защищенной странице Робокассы и не передаются и не хранятся на серверах ООО «РентРоп».
          </p>
          <p>
            Услуга по предоставлению права использования вычислительной квоты «Виртуальные единицы Буквы» считается оказанной в полном объеме с момента автоматического подтверждения платежа от Робокассы и зачисления указанного количества Букв на баланс Пользователя с отображением записи в разделе «Баланс и история операций».
          </p>
          <p>
            Зачисленные «Буквы» не имеют срока годности и не сгорают при длительном неиспользовании аккаунта. При изменении тарифов Исполнитель уведомляет Пользователей на сайте не менее чем за <strong className="text-white">14 календарных дней</strong> до вступления изменений в силу; ранее оплаченные Буквы сохраняются на счете в полном объеме без перерасчета.
          </p>
        </section>

        {/* 5. Простой порядок возврата */}
        <section className="flex flex-col gap-3 text-[14px] sm:text-[15px] leading-relaxed text-zinc-300">
          <h2 className="text-[18px] sm:text-[20px] font-bold text-white border-l-2 border-rose-500 pl-3">
            5. Порядок отмены заказа и возврата денежных средств
          </h2>
          <p>
            Пользователь имеет право отказаться от неиспользованных «Виртуальных единиц Буквы» и получить возврат уплаченных денежных средств без скрытых комиссий и штрафов со стороны Исполнителя в течение <strong className="text-white">10 календарных дней</strong> с момента оплаты.
          </p>
          <p>
            Для оформления возврата достаточно направить письмо в свободной форме на электронную почту{' '}
            <a href="mailto:info@arenda-ropa.com" className="text-rose-400 underline font-mono">
              info@arenda-ropa.com
            </a>{' '}
            с указанием номера заказа (<span className="font-mono text-white">InvId</span>), email аккаунта и даты платежа. Возврат осуществляется на ту же банковскую карту или счет, с которого была произведена оплата, в срок до 10 календарных дней с даты получения обращения (за вычетом фактически израсходованного на генерации объема Букв).
          </p>
        </section>

        {/* 6. Интеллектуальные права */}
        <section className="flex flex-col gap-3 text-[14px] sm:text-[15px] leading-relaxed text-zinc-300">
          <h2 className="text-[18px] sm:text-[20px] font-bold text-white border-l-2 border-rose-500 pl-3">
            6. Авторские права и ответственность
          </h2>
          <p>
            Пользователь сохраняет полные исключительные права на созданные тексты, макеты и скомпонованные книги. Пользователь гарантирует, что загруженные им исходные материалы не нарушают законодательство РФ и права третьих лиц.
          </p>
        </section>

        <footer className="pt-6 border-t border-zinc-800 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-zinc-400 text-[14px]">
            <HelpCircle className="w-4 h-4 text-rose-500 shrink-0" />
            <span>Вопросы и возвраты: info@arenda-ropa.com</span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <a
              href="https://t.me/+ULtw-EChQE1lNTI6"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-[14px] px-4 py-2.5 bg-black border border-zinc-700 text-zinc-200 hover:text-white transition-colors rounded-none"
            >
              <span>Чат техподдержки</span>
              <ExternalLink className="w-3.5 h-3.5 text-rose-500" />
            </a>
            <NoirButton
              variant="outline"
              onClick={() => onNavigate('balance')}
              icon={<FileText className="w-4 h-4 text-rose-500" />}
              className="text-[14px]"
            >
              К балансу и оплате
            </NoirButton>
            <NoirButton
              variant="primary"
              onClick={() => onNavigate('landing')}
              className="text-[14px] font-bold bg-white text-black hover:bg-zinc-200 border border-white"
            >
              На главную
            </NoirButton>
          </div>
        </footer>
      </article>
    </div>
  );
};
