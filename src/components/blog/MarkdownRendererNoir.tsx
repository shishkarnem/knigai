import React, { useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import { Check, ImageOff } from 'lucide-react';
import { RubikMarkerHeading } from '../landing/RubikMarkerHeading';
import {
  extractTgBlocks,
  isVideoUrl,
  sanitizeBlogUrl,
} from './rich/tgBlockParser';
import {
  TgButtonsBlock,
  TgCollapseBlock,
  TgGalleryBlock,
  TgVideoBlock,
} from './rich/TgRichBlocks';

export function countMarkdownChars(md: string): number {
  return String(md || '').trim().length;
}

export function estimateReadMinutes(md: string, fallbackChars?: number, explicitMinutes?: number): number {
  if (explicitMinutes && explicitMinutes > 0) {
    return explicitMinutes;
  }
  const plain = String(md || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/[#>*`_\-\[\]()]/g, ' ')
    .trim();
  if (plain) {
    const words = plain.split(/\s+/).filter(Boolean).length;
    return Math.max(1, Math.ceil(words / 160));
  }
  if (fallbackChars && fallbackChars > 0) {
    return Math.max(1, Math.ceil(fallbackChars / 1000));
  }
  return 1;
}

function nodeToPlainText(node: React.ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(nodeToPlainText).join('');
  if (React.isValidElement(node)) {
    const props = node.props as { children?: React.ReactNode };
    return nodeToPlainText(props.children);
  }
  return '';
}

const BlogFigureMedia: React.FC<{ src?: string; alt?: string }> = ({ src, alt }) => {
  const [failed, setFailed] = useState(false);
  const safeSrc = sanitizeBlogUrl(src || '', true);

  if (safeSrc && isVideoUrl(safeSrc)) {
    return (
      <figure className="my-6 flex flex-col gap-2 w-full">
        <div className="relative w-full border border-zinc-800 bg-black rounded-none overflow-hidden">
          <video
            src={safeSrc}
            controls
            playsInline
            preload="auto"
            className="w-full max-h-[540px] object-contain bg-black"
          />
        </div>
        {alt && (
          <figcaption className="text-[14px] text-zinc-400 font-['PT_Serif',serif] italic px-1 border-b border-zinc-800/70 pb-1.5">
            {alt}
          </figcaption>
        )}
      </figure>
    );
  }

  return (
    <figure className="my-6 flex flex-col gap-2.5 w-full">
      <div className="relative w-full aspect-video overflow-hidden border border-zinc-800 bg-black/75 rounded-none">
        {!failed && safeSrc ? (
          <img
            src={safeSrc}
            alt={alt || 'Иллюстрация статьи KnigAI'}
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setFailed(true)}
            className="w-full h-full object-cover transition-transform duration-500 hover:scale-[1.01]"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-zinc-500 p-6">
            <ImageOff className="w-7 h-7 text-rose-500/80" />
            <span className="text-[14px] text-zinc-400 text-center">
              Изображение временно недоступно
            </span>
          </div>
        )}
      </div>
      {alt && (
        <figcaption className="text-[14px] text-zinc-400 font-['PT_Serif',serif] italic px-1 border-b border-zinc-800/70 pb-1.5">
          {alt}
        </figcaption>
      )}
    </figure>
  );
};

interface MarkdownRendererNoirProps {
  markdown: string;
  telegramPostUrl?: string;
  className?: string;
}

export const MarkdownRendererNoir: React.FC<MarkdownRendererNoirProps> = ({
  markdown,
  telegramPostUrl,
  className = '',
}) => {
  const { processedMarkdown, blocks } = useMemo(
    () => extractTgBlocks(markdown),
    [markdown]
  );

  return (
    <div className={`noir-markdown w-full max-w-none ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        urlTransform={(url) => sanitizeBlogUrl(url, true)}
        components={{
          h1: ({ children }) => (
            <RubikMarkerHeading
              as="h1"
              text={nodeToPlainText(children)}
              className="text-[26px] sm:text-[34px] leading-tight mt-6 mb-4"
            />
          ),
          h2: ({ children }) => (
            <RubikMarkerHeading
              as="h2"
              text={nodeToPlainText(children)}
              className="text-[24px] sm:text-[29px] leading-snug mt-9 mb-3 pb-2 border-b border-zinc-800/90"
            />
          ),
          h3: ({ children }) => (
            <RubikMarkerHeading
              as="h3"
              text={nodeToPlainText(children)}
              className="text-[20px] sm:text-[23px] leading-snug mt-7 mb-3"
            />
          ),
          h4: ({ children }) => (
            <h4 className="text-[18px] sm:text-[20px] font-bold text-white mt-6 mb-2 leading-snug">
              {children}
            </h4>
          ),
          p: ({ children }) => (
            <div className="my-4 text-[16px] sm:text-[17px] text-zinc-200 leading-[1.8] font-['PT_Serif',serif] break-words">
              {children}
            </div>
          ),
          strong: ({ children }) => (
            <strong className="font-bold text-white underline decoration-rose-500/75 underline-offset-4">
              {children}
            </strong>
          ),
          em: ({ children }) => <em className="italic text-zinc-100">{children}</em>,
          del: ({ children }) => <del className="line-through text-zinc-500">{children}</del>,
          hr: () => <hr className="my-7 border-zinc-800" />,
          a: ({ href, children }) => {
            const safeHref = sanitizeBlogUrl(href || '', true);
            if (!safeHref) return <span>{children}</span>;
            const external = /^https?:\/\//i.test(safeHref);
            return (
              <a
                href={safeHref}
                target={external ? '_blank' : undefined}
                rel={external ? 'noopener noreferrer' : undefined}
                className="text-rose-400 hover:text-rose-300 underline decoration-rose-500/70 underline-offset-4 transition-colors break-words"
              >
                {children}
              </a>
            );
          },
          img: ({ src, alt }) => <BlogFigureMedia src={src} alt={alt} />,
          blockquote: ({ children }) => (
            <blockquote className="my-7 p-5 sm:p-6 bg-zinc-950/65 border-l-4 border-rose-500 border-y border-r border-zinc-800 text-zinc-100 text-[16px] sm:text-[18px] leading-relaxed italic font-['PT_Serif',serif] rounded-none [&>div]:my-1.5">
              {children}
            </blockquote>
          ),
          ul: ({ children, className: ulClass }) => {
            const isTaskList = (ulClass || '').includes('contains-task-list');
            return (
              <ul className={`my-5 flex flex-col gap-2.5 ${isTaskList ? 'pl-0' : 'pl-2'}`}>
                {children}
              </ul>
            );
          },
          ol: ({ children }) => (
            <ol className="my-5 flex flex-col gap-2.5 pl-5 list-decimal marker:text-rose-500 marker:font-mono marker:font-bold">
              {children}
            </ol>
          ),
          li: ({ children, className: liClass }) => {
            const isTaskItem = (liClass || '').includes('task-list-item');
            return (
              <li
                className={`text-[15px] sm:text-[17px] text-zinc-200 leading-relaxed font-['PT_Serif',serif] break-words ${
                  isTaskItem ? 'flex items-start gap-2.5 list-none' : 'pl-1'
                }`}
              >
                {!isTaskItem && (
                  <span className="inline-block w-2 h-2 bg-rose-500 mr-2.5 align-middle rounded-none" />
                )}
                <span className="min-w-0 flex-1">{children}</span>
              </li>
            );
          },
          input: ({ type, checked }) => {
            if (type === 'checkbox') {
              return (
                <span
                  aria-checked={Boolean(checked)}
                  className={`inline-flex items-center justify-center w-4 h-4 mr-2 align-middle border rounded-none ${
                    checked
                      ? 'bg-rose-600 border-rose-500 text-white'
                      : 'bg-black border-zinc-600 text-transparent'
                  }`}
                >
                  <Check className="w-3 h-3 stroke-[3]" />
                </span>
              );
            }
            return null;
          },
          table: ({ children }) => (
            <div className="my-6 w-full overflow-x-auto border border-zinc-800 bg-zinc-950/65 rounded-none">
              <table className="w-full border-collapse text-left text-[14px] sm:text-[15px]">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-black/80 border-b border-rose-500/70 text-white">{children}</thead>
          ),
          tbody: ({ children }) => <tbody className="divide-y divide-zinc-800">{children}</tbody>,
          tr: ({ children }) => <tr className="hover:bg-white/5 transition-colors">{children}</tr>,
          th: ({ children }) => (
            <th className="px-3.5 py-2.5 font-bold text-white border-r border-zinc-800 last:border-r-0">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="px-3.5 py-2.5 text-zinc-200 border-r border-zinc-800/80 last:border-r-0 align-top">
              {children}
            </td>
          ),
          pre: ({ children }) => {
            const childArr = React.Children.toArray(children);
            const first = childArr[0];
            if (React.isValidElement(first)) {
              const codeProps = first.props as {
                className?: string;
                children?: React.ReactNode;
              };
              const cls = String(codeProps.className || '');
              if (cls.includes('language-knigai-tg-block')) {
                const idx = parseInt(nodeToPlainText(codeProps.children).trim(), 10);
                const block = blocks[idx];
                if (block) {
                  if (block.kind === 'video') {
                    return <TgVideoBlock item={block.data} fallbackPostUrl={telegramPostUrl} />;
                  }
                  if (block.kind === 'gallery') {
                    return <TgGalleryBlock items={block.data} fallbackPostUrl={telegramPostUrl} />;
                  }
                  if (block.kind === 'buttons') {
                    return <TgButtonsBlock rows={block.data} />;
                  }
                  if (block.kind === 'collapse') {
                    return (
                      <TgCollapseBlock
                        data={block.data}
                        renderMarkdown={(subMd) => (
                          <MarkdownRendererNoir
                            markdown={subMd}
                            telegramPostUrl={telegramPostUrl}
                          />
                        )}
                      />
                    );
                  }
                }
                return null;
              }
            }

            return (
              <pre className="my-5 p-4 bg-zinc-950/90 border border-zinc-700 font-mono text-[14px] text-zinc-100 leading-relaxed whitespace-pre-wrap break-words rounded-none">
                {children}
              </pre>
            );
          },
          code: ({ className: codeClass, children }) => {
            const isBlockCode = String(codeClass || '').includes('language-');
            if (isBlockCode) {
              return (
                <code className="block whitespace-pre-wrap break-words font-mono text-[14px] text-zinc-100">
                  {children}
                </code>
              );
            }
            return (
              <code className="px-1.5 py-0.5 bg-zinc-900/90 border border-zinc-700 font-mono text-[14px] text-rose-300 break-words">
                {children}
              </code>
            );
          },
        }}
      >
        {processedMarkdown}
      </ReactMarkdown>
    </div>
  );
};
