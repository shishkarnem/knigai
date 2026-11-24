import React from 'react';
import { Check, FileText, ShieldCheck } from 'lucide-react';
import { AppRoute } from '../../types';

interface LegalLinksStripProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  onNavigateDoc?: (route: AppRoute) => void;
  contextLabel?: 'registration' | 'payment';
}

const LEGAL_DOCS: Array<{ route: AppRoute; label: string }> = [
  { route: 'oferta', label: 'Публичная оферта' },
  { route: 'agreement', label: 'Пользовательское соглашение' },
  { route: 'privacy', label: 'Политика конфиденциальности' },
  { route: 'consent', label: 'Согласие на обработку ПД' },
];

export const LegalLinksStrip: React.FC<LegalLinksStripProps> = ({
  checked,
  onChange,
  onNavigateDoc,
  contextLabel = 'payment',
}) => {
  const handleDocClick = (route: AppRoute) => {
    if (onNavigateDoc) {
      onNavigateDoc(route);
      return;
    }
    if (typeof window !== 'undefined') {
      const targetPath = route === 'oferta' ? '/oferta' : `/${route}`;
      window.location.assign(targetPath);
    }
  };

  return (
    <div className="p-3.5 bg-zinc-950/75 border border-zinc-700 flex flex-col gap-3 rounded-none text-[14px] font-['PT_Serif',serif]">
      {/* Explicit Unchecked-by-default Consent Checkbox */}
      <label className="flex items-start gap-3 cursor-pointer select-none">
        <button
          type="button"
          role="checkbox"
          aria-checked={checked}
          onClick={() => onChange(!checked)}
          className={`mt-0.5 w-5 h-5 border flex items-center justify-center shrink-0 transition-colors cursor-pointer rounded-none ${
            checked
              ? 'bg-rose-600 border-rose-500 text-white'
              : 'bg-black/80 border-zinc-500 hover:border-white text-transparent'
          }`}
        >
          <Check className="w-3.5 h-3.5 stroke-[3]" />
        </button>

        <span
          onClick={() => onChange(!checked)}
          className="text-[14px] text-zinc-200 leading-snug"
        >
          {contextLabel === 'registration'
            ? 'Я подтверждаю, что ознакомился(лась) и принимаю условия Публичной оферты, Пользовательского соглашения, Политики конфиденциальности и даю Согласие на обработку персональных данных.'
            : 'Я принимаю условия Публичной оферты (НДС 5% ОСН, чек «Виртуальные единицы Буквы»), Пользовательского соглашения, Политики конфиденциальности и Согласия на обработку ПД. Подтверждаю, что скрытых списаний и подписок нет.'}
        </span>
      </label>

      {/* Transparent Terms Notice */}
      <div className="flex items-center gap-2 text-zinc-400 text-[14px] border-t border-zinc-800/80 pt-2">
        <ShieldCheck className="w-4 h-4 text-rose-500 shrink-0" />
        <span>
          Документы для ознакомления (без скрытых платежей, возврат в течение 10 дней через info@arenda-ropa.com):
        </span>
      </div>

      {/* Bubble Buttons to All 4 Legal Documents */}
      <div className="flex flex-wrap items-center gap-2">
        {LEGAL_DOCS.map((doc) => (
          <button
            key={doc.route}
            type="button"
            onClick={() => handleDocClick(doc.route)}
            className="relative group inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[38px] bg-black/75 border border-zinc-700 hover:border-rose-500 text-zinc-200 hover:text-white text-[14px] transition-colors cursor-pointer rounded-none"
          >
            <FileText className="w-3.5 h-3.5 text-rose-500 shrink-0" />
            <span>{doc.label}</span>
            <span
              aria-hidden="true"
              className="absolute -bottom-1 left-3 w-1.5 h-1.5 bg-black border-r border-b border-zinc-700 rotate-45 pointer-events-none group-hover:border-rose-500"
            />
          </button>
        ))}
      </div>
    </div>
  );
};
