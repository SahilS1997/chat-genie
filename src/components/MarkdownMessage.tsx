import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/** Renders a Data Agent's markdown answer with the app's chat typography. */
export function MarkdownMessage({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        h1: ({ children }) => <h3 className="mb-2 text-base font-bold text-white">{children}</h3>,
        h2: ({ children }) => <h4 className="mb-2 mt-4 text-sm font-bold text-white first:mt-0">{children}</h4>,
        h3: ({ children }) => <h4 className="mb-2 mt-3 text-sm font-semibold text-cyan-100">{children}</h4>,
        p: ({ children }) => <p className="mb-3 last:mb-0">{children}</p>,
        ul: ({ children }) => <ul className="mb-3 list-disc space-y-1 pl-5 last:mb-0">{children}</ul>,
        ol: ({ children }) => <ol className="mb-3 list-decimal space-y-1 pl-5 last:mb-0">{children}</ol>,
        li: ({ children }) => <li className="pl-1">{children}</li>,
        strong: ({ children }) => <strong className="font-semibold text-white">{children}</strong>,
        code: ({ children, className }) => (
          <code className={className ? 'block overflow-x-auto rounded-lg bg-black/30 p-3 text-xs text-cyan-100' : 'rounded bg-black/25 px-1 py-0.5 text-cyan-100'}>
            {children}
          </code>
        ),
        table: ({ children }) => <div className="mb-3 overflow-x-auto rounded-lg border border-white/10"><table className="min-w-full text-left text-xs">{children}</table></div>,
        th: ({ children }) => <th className="border-b border-white/10 bg-white/5 px-3 py-2 font-semibold text-white">{children}</th>,
        td: ({ children }) => <td className="border-b border-white/5 px-3 py-2 align-top">{children}</td>,
        a: ({ children, href }) => <a className="text-cyan-300 underline underline-offset-2 hover:text-cyan-200" href={href}>{children}</a>,
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
