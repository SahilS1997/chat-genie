import { useEffect, useRef, useState, type FormEvent } from 'react';
import { factories, models, service as powerBiServiceModule } from 'powerbi-client';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { useAuth } from '@/hooks/AuthContext';
import {
  askAgent,
  connectFabric,
  getEmbedConfig,
  listAgents,
  listReports,
  type PortalAgent,
  type PortalReport,
} from '@/services/biPortalService';

const powerBiService = new powerBiServiceModule.Service(
  factories.hpmFactory,
  factories.wpmpFactory,
  factories.routerFactory
);

type ChatMessage = { id: number; role: 'user' | 'assistant'; content: string };
type Theme = 'dark' | 'light';
const preferredWorkspaceId = import.meta.env.VITE_FABRIC_WORKSPACE_ID;

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'The portal service returned an unexpected error.';
}

function powerBiErrorMessage(detail: unknown) {
  if (
    detail &&
    typeof detail === 'object' &&
    'message' in detail &&
    typeof detail.message === 'string'
  ) {
    return detail.message;
  }
  return 'Power BI returned an embed error.';
}

function AgentMessage({ content }: { content: string }) {
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

export function HomePage() {
  const { signOut, user } = useAuth();
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = window.localStorage.getItem('chat-genie-theme');
    return saved === 'light' ? 'light' : 'dark';
  });
  const [reports, setReports] = useState<PortalReport[]>([]);
  const [selectedReport, setSelectedReport] = useState<PortalReport | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<PortalAgent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [connectionVersion, setConnectionVersion] = useState(0);
  const firstName = user?.name?.split(' ')[0] ?? 'there';

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem('chat-genie-theme', theme);
  }, [theme]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([listReports(), listAgents()])
      .then(([availableReports, availableAgents]) => {
        if (cancelled) return;
        setReports(availableReports);
        setSelectedReport(
          availableReports.find(
            (report) => report.workspaceId === preferredWorkspaceId
          ) ??
            availableReports[0] ??
            null
        );
        setSelectedAgent(availableAgents[0] ?? null);
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(errorMessage(reason));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [connectionVersion]);

  const reconnectFabric = async () => {
    setConnecting(true);
    try {
      await connectFabric();
      setConnectionVersion((current) => current + 1);
    } catch (reason: unknown) {
      setError(errorMessage(reason));
    } finally {
      setConnecting(false);
    }
  };

  return (
    <div className={`theme-${theme} min-h-screen bg-[#06101d] text-slate-100`}>
      <header className="flex min-h-16 items-center justify-between border-b border-white/10 bg-[#091525]/95 px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-300 to-blue-600 text-sm font-black text-slate-950">CG</div>
          <div>
            <p className="text-sm font-bold text-white">Chat Genie</p>
            <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">BI workspace</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden text-sm text-slate-400 sm:block">{firstName}</span>
          <button
            type="button"
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            onClick={() => setTheme((current) => current === 'dark' ? 'light' : 'dark')}
            className="rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-slate-300 transition hover:border-cyan-300/40 hover:text-white"
          >
            {theme === 'dark' ? '☀ Light' : '☾ Dark'}
          </button>
          <button type="button" onClick={() => void signOut()} className="rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-slate-300 transition hover:border-white/25 hover:text-white">Sign out</button>
        </div>
      </header>

      <main className="mx-auto max-w-[1800px] px-4 py-5 sm:px-6 lg:px-8">
        <div className="mb-5 flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-300">Analytics workspace</p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-white sm:text-3xl">Good morning, {firstName}</h1>
            <p className="mt-1 text-sm text-slate-400">Choose a report and keep your analysis in one focused workspace.</p>
          </div>
          <label className="w-full xl:w-[420px]">
            <span className="mb-2 block text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">Power BI report</span>
            <select
              aria-label="Select a Power BI report"
              value={selectedReport?.id ?? ''}
              onChange={(event) => setSelectedReport(reports.find((report) => report.id === event.target.value) ?? null)}
              disabled={loading || !reports.length}
              className="w-full rounded-xl border border-cyan-400/25 bg-[#0b1a2c] px-4 py-3 text-sm font-semibold text-white outline-none transition focus:border-cyan-300"
            >
              {!reports.length && <option value="">No reports available</option>}
              {reports.map((report) => <option key={report.id} value={report.id}>{report.name} · {report.workspaceName}</option>)}
            </select>
          </label>
        </div>

        {error && <div role="alert" className="mb-5 flex flex-col gap-3 rounded-xl border border-rose-400/30 bg-rose-400/10 p-4 text-sm text-rose-200 sm:flex-row sm:items-center sm:justify-between"><span><strong>Portal connection error:</strong> {error}</span><button type="button" disabled={connecting} onClick={() => void reconnectFabric()} className="shrink-0 rounded-lg bg-cyan-400 px-3 py-2 text-xs font-bold text-slate-950 hover:bg-cyan-300 disabled:opacity-50">{connecting ? 'Connecting…' : 'Connect Fabric'}</button></div>}

        <section className="mb-5 grid gap-3 sm:grid-cols-3">
          <Callout label="Available reports" value={loading ? '—' : reports.length.toString()} detail="From your tenant access" />
          <Callout label="Data Agent" value={selectedAgent?.name ?? 'Unavailable'} detail="Connected through Fabric MCP" />
          <Callout label="Workspace mode" value="Focused view" detail="Report-first experience" />
        </section>

        <ReportStage report={selectedReport} />
      </main>

      <FloatingChat agent={selectedAgent} report={selectedReport} />
    </div>
  );
}

function Callout({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div className="rounded-xl border border-white/10 bg-white/[0.045] px-4 py-3"><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">{label}</p><p className="mt-2 truncate text-lg font-bold text-white">{value}</p><p className="mt-1 text-xs text-emerald-300">{detail}</p></div>;
}

function ReportStage({ report }: { report: PortalReport | null }) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState('Select a report to start viewing.');
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    const onFullscreenChange = () => setFullscreen(document.fullscreenElement === stageRef.current);
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  useEffect(() => {
    if (!report || !stageRef.current) return;
    const container = stageRef.current.querySelector<HTMLDivElement>('[data-powerbi-container]');
    if (!container) return;
    let cancelled = false;
    setStatus('Loading report...');
    getEmbedConfig(report)
      .then((config) => {
        if (cancelled) return;
        powerBiService.reset(container);
        const embeddedReport = powerBiService.embed(container, {
          type: 'report',
          id: config.reportId,
          embedUrl: config.embedUrl,
          accessToken: config.accessToken,
          tokenType: config.tokenType === 'Aad' ? models.TokenType.Aad : models.TokenType.Embed,
          permissions: models.Permissions.Read,
          viewMode: models.ViewMode.View,
          settings: { panes: { filters: { visible: true, expanded: false } }, navContentPaneEnabled: true },
        });
        embeddedReport.on('loaded', () => {
          if (!cancelled) setStatus('');
        });
        embeddedReport.on('error', (event) => {
          if (!cancelled) {
            setStatus(
              `Unable to embed this report: ${powerBiErrorMessage(event.detail)}`
            );
          }
        });
      })
      .catch((reason: unknown) => setStatus(`Unable to embed this report: ${errorMessage(reason)}`));
    return () => {
      cancelled = true;
      powerBiService.reset(container);
    };
  }, [report]);

  const toggleFullscreen = async () => {
    if (!stageRef.current) return;
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      await stageRef.current.requestFullscreen();
    }
  };

  return (
    <section ref={stageRef} className={`overflow-hidden rounded-2xl border border-cyan-400/15 bg-[#0a192a] shadow-2xl shadow-black/20 ${fullscreen ? 'h-screen rounded-none' : 'h-[calc(100vh-250px)] min-h-[560px]'}`}>
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Power BI report</p>
          <h2 className="truncate text-sm font-bold text-white sm:text-base">{report?.name ?? 'No report selected'}</h2>
        </div>
        <button type="button" onClick={() => void toggleFullscreen()} className="rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-slate-300 transition hover:border-cyan-300/40 hover:text-white">
          {fullscreen ? 'Exit full screen' : 'Full screen'}
        </button>
      </div>
      <div className="relative h-[calc(100%-61px)] bg-[#07111f]">
        <div data-powerbi-container className="h-full w-full" />
        {status && <div className="absolute inset-0 flex items-center justify-center p-8 text-center text-sm text-slate-400"><span className="max-w-md">{status}</span></div>}
      </div>
    </section>
  );
}

function FloatingChat({ agent, report }: { agent: PortalAgent | null; report: PortalReport | null }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const question = input.trim();
    if (!question || !agent) return;
    setInput('');
    setError(null);
    setMessages((current) => [...current, { id: Date.now(), role: 'user', content: question }]);
    setBusy(true);
    try {
      const response = await askAgent(agent.id, question, report?.id);
      setMessages((current) => [...current, { id: Date.now() + 1, role: 'assistant', content: response.answer }]);
    } catch (reason: unknown) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed bottom-5 right-5 z-50 sm:bottom-7 sm:right-7">
      {open && <section className="mb-3 flex h-[min(620px,calc(100vh-110px))] w-[min(420px,calc(100vw-32px))] flex-col overflow-hidden rounded-2xl border border-cyan-300/20 bg-[#0a192a]/[.98] shadow-2xl shadow-black/50 backdrop-blur-xl">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-cyan-300">Fabric Data Agent</p><p className="mt-1 max-w-[270px] truncate text-sm font-bold text-white">{agent?.name ?? 'No agent available'}</p></div>
          <button type="button" aria-label="Close chat" onClick={() => setOpen(false)} className="rounded-lg px-2 py-1 text-lg text-slate-400 hover:bg-white/5 hover:text-white">×</button>
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto p-4 text-sm leading-6">
          {!messages.length && <p className="rounded-xl border border-white/10 bg-white/[0.04] p-3 text-slate-400">Ask a question about the selected report. Answers come from the connected Fabric Data Agent.</p>}
          {messages.map((message) => <div key={message.id} className={message.role === 'user' ? 'ml-7 rounded-xl bg-cyan-400/10 p-3 text-cyan-50' : 'mr-2 rounded-xl border border-white/10 bg-white/[0.04] p-3 text-slate-300'}>{message.role === 'assistant' ? <AgentMessage content={message.content} /> : message.content}</div>)}
          {error && <p className="rounded-lg bg-rose-400/10 p-2 text-xs text-rose-200">{error}</p>}
        </div>
        <form onSubmit={submit} className="border-t border-white/10 p-3">
          <div className="flex items-end gap-2 rounded-xl border border-white/10 bg-[#07111f] p-2">
            <label htmlFor="floating-agent-question" className="sr-only">Ask the Data Agent</label>
            <textarea id="floating-agent-question" rows={2} value={input} onChange={(event) => setInput(event.target.value)} placeholder={agent ? 'Ask your question...' : 'No Data Agent available'} disabled={!agent || busy} className="min-w-0 flex-1 resize-none bg-transparent px-2 py-1 text-sm text-white outline-none placeholder:text-slate-600" />
            <button type="submit" disabled={!agent || busy} className="rounded-lg bg-cyan-400 px-3 py-2 text-xs font-bold text-slate-950 disabled:opacity-40">{busy ? '...' : 'Send'}</button>
          </div>
        </form>
      </section>}
      <button type="button" aria-expanded={open} onClick={() => setOpen((current) => !current)} className="ml-auto flex items-center gap-3 rounded-full border border-cyan-200/30 bg-cyan-400 px-4 py-3 text-sm font-bold text-slate-950 shadow-lg shadow-cyan-950/40 transition hover:bg-cyan-300">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-950 text-xs text-cyan-200">✦</span>
        {open ? 'Close assistant' : 'Ask Data Agent'}
      </button>
    </div>
  );
}
