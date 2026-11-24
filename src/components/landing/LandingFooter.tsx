import React, { useEffect, useState } from 'react';
import { ExternalLink, Mail, Shield, MessageCircle, CreditCard, ChevronRight, Newspaper } from 'lucide-react';
import { AppRoute } from '../../types';
import { RubikMarkerHeading } from './RubikMarkerHeading';
import {
  DEFAULT_FOOTER_LINKS,
  FOOTER_LINKS_UPDATED_EVENT,
  fetchFooterLinks,
  FooterLinkItem,
} from '../../pages/admin/footer/footerLinksApi';
import { useAppVersion } from '../../constants/appVersion';

interface LandingFooterProps {
  onNavigate: (route: AppRoute) => void;
}

export const LandingFooter: React.FC<LandingFooterProps> = ({ onNavigate }) => {
  const [productLinks, setProductLinks] = useState<FooterLinkItem[]>(DEFAULT_FOOTER_LINKS);
  const appVersion = useAppVersion();

  useEffect(() => {
    let isMounted = true;

    const loadFooterLinks = async () => {
      try {
        const items = await fetchFooterLinks(false);
        if (isMounted) {
          setProductLinks(items);
        }
      } catch {
        // Keep fallback default links on transient network error
      }
    };

    loadFooterLinks();

    const handleUpdated = () => {
      loadFooterLinks();
    };
    window.addEventListener(FOOTER_LINKS_UPDATED_EVENT, handleUpdated);

    return () => {
      isMounted = false;
      window.removeEventListener(FOOTER_LINKS_UPDATED_EVENT, handleUpdated);
    };
  }, []);

  return (
    <footer className="w-full bg-black/90 border-t border-zinc-800 text-zinc-300 font-['PT_Serif',serif] relative z-20 px-[5%] py-10 sm:py-14">
      <div className="w-full flex flex-col gap-10">
        {/* Top Row: Brand & Product Info */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 border-b border-zinc-800/80 pb-8">
          <div className="flex flex-col gap-2">
            <RubikMarkerHeading
              as="h3"
              text="KnigAI — фабрика книг"
              className="text-[20px] sm:text-[24px]"
            />
            <p className="text-[14px] sm:text-[15px] text-zinc-400">
              © 2026 KnigAI · Полная автоматизация создания книг
            </p>
          </div>

          {/* Action buttons styled as message bubbles */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Blog button */}
            <button
              type="button"
              onClick={() => onNavigate('blog')}
              className="relative group inline-flex items-center gap-2 px-4 py-2.5 bg-zinc-950 border border-zinc-700 hover:border-rose-500 text-white text-[14px] font-bold transition-all rounded-none shadow-md cursor-pointer"
            >
              <Newspaper className="w-4 h-4 text-rose-500" />
              <span>Блог KnigAI</span>
              <span className="absolute -bottom-1.5 left-5 w-2.5 h-2.5 bg-zinc-950 border-r border-b border-zinc-700 rotate-45 pointer-events-none group-hover:border-rose-500 transition-colors" />
            </button>

            {/* RentRop button */}
            <a
              href="https://rent-rop.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="relative group inline-flex items-center gap-2 px-4 py-2.5 bg-zinc-950 border border-zinc-700 hover:border-white text-white text-[14px] transition-all rounded-none shadow-md"
            >
              <span>Продукт компании РентРОП</span>
              <ExternalLink className="w-3.5 h-3.5 text-rose-500" />
              {/* Bubble pointer notch */}
              <span className="absolute -bottom-1.5 left-5 w-2.5 h-2.5 bg-zinc-950 border-r border-b border-zinc-700 rotate-45 pointer-events-none group-hover:border-white transition-colors" />
            </a>

            {/* Support Telegram Chat button */}
            <a
              href="https://t.me/+ULtw-EChQE1lNTI6"
              target="_blank"
              rel="noopener noreferrer"
              className="relative group inline-flex items-center gap-2 px-4 py-2.5 bg-black border border-rose-600/80 hover:border-rose-500 text-white text-[14px] transition-all rounded-none shadow-md"
            >
              <MessageCircle className="w-4 h-4 text-rose-500" />
              <span>Чат техподдержки</span>
              {/* Bubble pointer notch */}
              <span className="absolute -bottom-1.5 left-5 w-2.5 h-2.5 bg-black border-r border-b border-rose-600/80 rotate-45 pointer-events-none group-hover:border-rose-500 transition-colors" />
            </a>
          </div>
        </div>

        {/* Middle Section: Requisites & Payment Methods */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8 text-[14px] leading-relaxed">
          {/* Requisites Block */}
          <div className="md:col-span-8 flex flex-col gap-3">
            <h4 className="text-[15px] font-bold text-white tracking-wider font-mono flex items-center gap-2">
              <Shield className="w-4 h-4 text-rose-500" />
              <span>Реквизиты организации</span>
            </h4>
            <div className="flex flex-col gap-1.5 text-zinc-300">
              <p className="font-bold text-white text-[15px]">ООО «РентРоп»</p>
              <p>
                Юридический адрес: 115191, г. Москва, пер. Духовской, д. 17, стр. 15, помещ. 11Н/2
              </p>
              <p className="font-mono text-zinc-400">
                ОГРН: <span className="text-white">1217700234157</span> · ИНН: <span className="text-white">7726477438</span>
              </p>
              <div className="flex flex-wrap items-center gap-2.5 pt-1">
                <a
                  href="mailto:info@arenda-ropa.com"
                  className="inline-flex items-center gap-1.5 text-rose-400 hover:text-rose-300 underline font-mono"
                >
                  <Mail className="w-3.5 h-3.5" />
                  <span>E-mail: info@arenda-ropa.com</span>
                </a>
              </div>

              {/* All 4 Legal Documents in Noir Bubble Buttons */}
              <div className="flex flex-wrap items-center gap-2.5 pt-2">
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
                    className="relative group inline-flex items-center gap-1 px-3 py-1.5 min-h-[38px] bg-zinc-950 border border-zinc-700 hover:border-white text-zinc-200 hover:text-white text-[14px] transition-colors cursor-pointer rounded-none"
                  >
                    <span>{doc.label}</span>
                    <ChevronRight className="w-3.5 h-3.5 text-rose-500" />
                    <span className="absolute -bottom-1 left-3 w-1.5 h-1.5 bg-zinc-950 border-r border-b border-zinc-700 rotate-45 pointer-events-none group-hover:border-white" />
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Payment & Security */}
          <div className="md:col-span-4 flex flex-col gap-3">
            <h4 className="text-[15px] font-bold text-white tracking-wider font-mono flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-rose-500" />
              <span>Принимаем к оплате</span>
            </h4>
            <p className="text-zinc-400 text-[14px]">
              Робокасса · НДС 5% (ОСН) · Без подписок и скрытых платежей:
            </p>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="px-3 py-1.5 bg-zinc-950 border border-zinc-700 text-white font-mono font-bold text-[14px]">
                МИР
              </span>
              <span className="px-3 py-1.5 bg-zinc-950 border border-zinc-700 text-white font-mono font-bold text-[14px]">
                Visa
              </span>
              <span className="px-3 py-1.5 bg-zinc-950 border border-zinc-700 text-white font-mono font-bold text-[14px]">
                Mastercard
              </span>
              <span className="px-3 py-1.5 bg-zinc-950 border border-zinc-700 text-rose-400 font-mono font-bold text-[14px]">
                СБП
              </span>
            </div>
          </div>
        </div>

        {/* Products Network */}
        <div className="pt-8 border-t border-zinc-800/80 flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-[15px] font-bold text-white tracking-wider font-mono flex items-center gap-2">
              <span className="w-2 h-2 bg-rose-500 shrink-0" />
              <span>Другие наши ИИ-продукты и проекты</span>
            </h4>
            <span className="text-[14px] text-zinc-400">
              Экосистема сервисов автоматизации
            </span>
          </div>

          {/* Mobile: wrapped bubble cloud; Desktop (lg+): single centered horizontal row */}
          <div className="w-full flex flex-wrap justify-center lg:flex-nowrap lg:justify-center items-center gap-3 lg:gap-2 xl:gap-3 pb-2">
            {productLinks.map((item) => (
              <a
                key={`${item.id}-${item.url}`}
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="relative group inline-flex items-center justify-center gap-1.5 xl:gap-2 px-3.5 lg:px-2.5 xl:px-4 py-2.5 min-h-[44px] bg-zinc-950/85 hover:bg-zinc-900 border border-zinc-700 hover:border-rose-500 text-white text-[14px] font-bold whitespace-nowrap transition-all rounded-none shadow-md"
              >
                <span>{item.title}</span>
                <ExternalLink className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                <span className="absolute -bottom-1.5 left-4 w-2.5 h-2.5 bg-zinc-950 border-r border-b border-zinc-700 rotate-45 pointer-events-none group-hover:border-rose-500 group-hover:bg-zinc-900 transition-colors" />
              </a>
            ))}
          </div>
        </div>

        {/* Bottom copyright notice */}
        <div className="pt-6 border-t border-zinc-900 flex flex-col sm:flex-row items-center justify-between gap-3 text-[14px] text-zinc-500">
          <p>© 2026 KnigAI. Все права защищены.</p>
          <div className="flex flex-wrap items-center justify-center gap-3 font-mono text-zinc-400">
            <span>Платформа автоматизированной публикации и печати книг</span>
            <span className="px-2 py-0.5 bg-zinc-950 border border-zinc-800 text-rose-400 font-bold">
              {appVersion}
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
};
