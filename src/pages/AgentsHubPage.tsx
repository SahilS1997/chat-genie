import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import { Link } from 'react-router-dom';

import { MarkdownMessage } from '@/components/MarkdownMessage';
import { useAuth } from '@/hooks/AuthContext';
import {
  askAgent,
  connectFabric,
  listAgents,
  type AgentChatResponse,
  type PortalAgent,
} from '@/services/biPortalService';

type Theme = 'dark' | 'light';

type ChatMessage = {
  id: string;
  role: 'user' | 'agent';
  content: string;
  agentName?: string;
  agentIndex?: number;
};

/** Tasteful, distinct gradients cycled per agent so a shared thread reads like a group chat. */
const AGENT_PALETTE = [
  'from-cyan-400 to-blue-600',
  'from-violet-400 to-purple-600',
  'from-emerald-400 to-teal-600',
  'from-amber-400 to-orange-600',
  'from-rose-400 to-pink-600',
  'from-sky-400 to-indigo-600',
] as const;

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'The portal service returned an unexpected error.';
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

function paletteFor(agentIndex: number) {
  return AGENT_PALETTE[agentIndex % AGENT_PALETTE.length];
}

/**
 * Parses every leading "@AgentName" mention (longest names matched first, so
 * one agent's name can't be shadowed by another that shares its prefix) from
 * the start of a message, returning the matched agents in mention order plus
 * whatever text follows them.
 */
function parseLeadingMentions(rawInput: string, agents: PortalAgent[]) {
  let remainder = rawInput.trimStart();
  const byLongestName = [...agents].sort((a, b) => b.name.length - a.name.length);
  const mentioned: PortalAgent[] = [];
  for (;;) {
    const match = byLongestName.find(
      (agent) =>
        !mentioned.includes(agent) &&
        remainder.toLowerCase().startsWith(`@${agent.name.toLowerCase()}`)
    );
    if (!match) break;
    mentioned.push(match);
    remainder = remainder.slice(`@${match.name}`.length).trimStart();
  }
  return { mentioned, remainder: remainder.trim() };
}

/**
 * Resolves which agent(s) a composed message should go to. Any number of
 * leading "@AgentName" mentions fan the same question out to all of them at
 * once — mention several agents to ask them all in one go, like tagging
 * multiple people in a group chat. With no leading mentions, the message
 * goes to the default (first) agent only.
 */
function resolveTargets(rawInput: string, agents: PortalAgent[]) {
  const { mentioned, remainder } = parseLeadingMentions(rawInput, agents);
  if (mentioned.length) {
    return { targets: mentioned, question: remainder, mentioned: true };
  }
  const fallback = agents[0];
  return { targets: fallback ? [fallback] : [], question: remainder, mentioned: false };
}

/** Finds an in-progress "@token" ending at the caret, or null if none is being typed. */
function activeMentionToken(value: string, caret: number) {
  const upToCaret = value.slice(0, caret);
  const at = upToCaret.lastIndexOf('@');
  if (at === -1) return null;
  const before = upToCaret[at - 1];
  if (before && !/\s/.test(before)) return null;
  const token = upToCaret.slice(at + 1);
  if (/\s/.test(token)) return null;
  return { start: at, query: token };
}

export function AgentsHubPage() {
  const { signOut, user } = useAuth();
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = window.localStorage.getItem('chat-genie-theme');
    return saved === 'light' ? 'light' : 'dark';
  });
  const [agents, setAgents] = useState<PortalAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [connectionVersion, setConnectionVersion] = useState(0);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [pendingAgents, setPendingAgents] = useState<string[]>([]);
  const [sendError, setSendError] = useState<string | null>(null);
  const [mention, setMention] = useState<{ start: number; query: string } | null>(null);
  const [activeMentionIndex, setActiveMentionIndex] = useState(0);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const threadEndRef = useRef<HTMLDivElement>(null);
  const conversationIds = useRef<Record<string, string | undefined>>({});
  const firstName = user?.name?.split(' ')[0] ?? 'there';

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem('chat-genie-theme', theme);
  }, [theme]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    listAgents()
      .then((availableAgents) => {
        if (!cancelled) setAgents(availableAgents);
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

  useEffect(() => {
    threadEndRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'end' });
  }, [messages, busy]);

  const agentIndexById = useMemo(
    () => new Map(agents.map((agent, index) => [agent.id, index])),
    [agents]
  );

  const filteredMentionAgents = useMemo(() => {
    if (!mention) return [];
    const query = mention.query.toLowerCase();
    return agents.filter((agent) => agent.name.toLowerCase().includes(query)).slice(0, 6);
  }, [agents, mention]);

  useEffect(() => {
    if (activeMentionIndex >= filteredMentionAgents.length) setActiveMentionIndex(0);
  }, [filteredMentionAgents.length, activeMentionIndex]);

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

  const updateInput = (value: string, caret: number) => {
    setInput(value);
    setMention(activeMentionToken(value, caret));
  };

  const applyMention = (agent: PortalAgent) => {
    if (!mention) return;
    const before = input.slice(0, mention.start);
    const after = input.slice(mention.start + 1 + mention.query.length);
    const inserted = `@${agent.name} `;
    const next = `${before}${inserted}${after}`;
    setInput(next);
    setMention(null);
    // Defer until the controlled textarea re-renders with `next` so the
    // caret can be placed after the inserted mention. setTimeout (rather
    // than requestAnimationFrame, which jsdom doesn't implement) keeps this
    // reliable in both browsers and the test environment.
    setTimeout(() => {
      const el = textareaRef.current;
      if (!el) return;
      const caret = before.length + inserted.length;
      el.focus();
      el.setSelectionRange(caret, caret);
    }, 0);
  };

  const insertQuickMention = (agent: PortalAgent) => {
    const { mentioned, remainder } = parseLeadingMentions(input, agents);
    if (mentioned.some((existing) => existing.id === agent.id)) {
      // Already tagged — just return focus instead of adding a duplicate mention.
      textareaRef.current?.focus();
      return;
    }
    const mentionPrefix = [...mentioned, agent].map((tagged) => `@${tagged.name}`).join(' ');
    const next = remainder ? `${mentionPrefix} ${remainder}` : `${mentionPrefix} `;
    setInput(next);
    setMention(null);
    setTimeout(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(next.length, next.length);
    }, 0);
  };

  const submit = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    if (busy) return;
    const { targets, question, mentioned } = resolveTargets(input, agents);
    if (!targets.length || !question) return;

    setInput('');
    setMention(null);
    setSendError(null);
    setMessages((current) => [
      ...current,
      { id: `u-${Date.now()}`, role: 'user', content: mentioned ? input.trim() : question },
    ]);
    setBusy(true);
    setPendingAgents(targets.map((agent) => agent.name));

    // Each mentioned agent is asked in parallel and answers independently —
    // whichever agent responds first appears first, like a real group chat —
    // rather than waiting for the slowest agent before showing any reply.
    const failures: string[] = [];
    await Promise.all(
      targets.map(async (agent) => {
        try {
          const response: AgentChatResponse = await askAgent(
            agent.id,
            question,
            undefined,
            conversationIds.current[agent.id]
          );
          conversationIds.current[agent.id] = response.conversationId ?? conversationIds.current[agent.id];
          setMessages((current) => [
            ...current,
            {
              id: `a-${Date.now()}-${agent.id}`,
              role: 'agent',
              content: response.answer,
              agentName: agent.name,
              agentIndex: agentIndexById.get(agent.id) ?? 0,
            },
          ]);
        } catch (reason: unknown) {
          failures.push(targets.length > 1 ? `${agent.name}: ${errorMessage(reason)}` : errorMessage(reason));
        } finally {
          setPendingAgents((current) => current.filter((name) => name !== agent.name));
        }
      })
    );
    if (failures.length) setSendError(failures.join(' • '));
    setBusy(false);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (mention && filteredMentionAgents.length) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setActiveMentionIndex((index) => (index + 1) % filteredMentionAgents.length);
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setActiveMentionIndex(
          (index) => (index - 1 + filteredMentionAgents.length) % filteredMentionAgents.length
        );
        return;
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault();
        applyMention(filteredMentionAgents[activeMentionIndex]);
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        setMention(null);
        return;
      }
    }
    if (event.key === 'Enter' && !event.shiftKey && !mention) {
      event.preventDefault();
      void submit();
    }
  };

  const defaultAgent = agents[0] ?? null;
  const hasAgents = agents.length > 0;

  return (
    <div className={`theme-${theme} flex min-h-screen flex-col bg-[#06101d] text-slate-100`}>
      <header className="flex min-h-16 items-center justify-between border-b border-white/10 bg-[#091525]/95 px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-300 to-blue-600 text-sm font-black text-slate-950">
            CG
          </div>
          <div>
            <p className="text-sm font-bold text-white">Advanced Agent</p>
            <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Multi-agent workspace</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden text-sm text-slate-400 sm:block">{firstName}</span>
          <Link
            to="/"
            className="rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-slate-300 transition hover:border-cyan-300/40 hover:text-white"
          >
            Back to reports
          </Link>
          <button
            type="button"
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            onClick={() => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))}
            className="rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-slate-300 transition hover:border-cyan-300/40 hover:text-white"
          >
            {theme === 'dark' ? '☀ Light' : '☾ Dark'}
          </button>
          <button
            type="button"
            onClick={() => void signOut()}
            className="rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-slate-300 transition hover:border-white/25 hover:text-white"
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col overflow-hidden px-4 py-5 sm:px-6 lg:px-8">
        <div className="mb-4">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-300">Group chat</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-white sm:text-3xl">
            Ask your Data Agents
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            {defaultAgent
              ? `${defaultAgent.name} answers by default. Type “@” to bring one or more agents into the conversation — mention several at once to ask them all in parallel.`
              : 'Connect a workspace with at least one published Data Agent to start chatting.'}
          </p>
        </div>

        {error && (
          <div
            role="alert"
            className="mb-4 flex flex-col gap-3 rounded-xl border border-rose-400/30 bg-rose-400/10 p-4 text-sm text-rose-200 sm:flex-row sm:items-center sm:justify-between"
          >
            <span>
              <strong>Portal connection error:</strong> {error}
            </span>
            <button
              type="button"
              disabled={connecting}
              onClick={() => void reconnectFabric()}
              className="shrink-0 rounded-lg bg-cyan-400 px-3 py-2 text-xs font-bold text-slate-950 hover:bg-cyan-300 disabled:opacity-50"
            >
              {connecting ? 'Connecting…' : 'Connect Fabric'}
            </button>
          </div>
        )}

        <AgentRoster
          agents={agents}
          loading={loading}
          onSelect={insertQuickMention}
        />

        <section className="mt-4 flex flex-1 flex-col overflow-hidden rounded-2xl border border-cyan-400/15 bg-[#0a192a] shadow-2xl shadow-black/20">
          <div className="flex-1 space-y-3 overflow-y-auto p-4 text-sm leading-6 sm:p-5">
            {!messages.length && (
              <p className="rounded-xl border border-white/10 bg-white/[0.04] p-3 text-slate-400">
                {hasAgents
                  ? 'No messages yet. Say hello — your default agent will jump in, or @mention one or more agents by name.'
                  : loading
                    ? 'Loading your Data Agents…'
                    : 'No Data Agents are available in this workspace yet.'}
              </p>
            )}
            {messages.map((message) =>
              message.role === 'user' ? (
                <div key={message.id} className="ml-7 rounded-xl bg-cyan-400/10 p-3 text-cyan-50 sm:ml-16">
                  {message.content}
                </div>
              ) : (
                <div key={message.id} className="mr-2 flex gap-2.5 sm:mr-16">
                  <div
                    className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-[10px] font-black text-slate-950 ${paletteFor(message.agentIndex ?? 0)}`}
                    aria-hidden
                  >
                    {initials(message.agentName ?? '?')}
                  </div>
                  <div className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/[0.04] p-3 text-slate-300">
                    <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.1em] text-slate-500">
                      {message.agentName}
                    </p>
                    <MarkdownMessage content={message.content} />
                  </div>
                </div>
              )
            )}
            {busy && (
              <div className="mr-2 flex items-center gap-2 text-xs text-slate-500 sm:mr-16">
                <span className="flex h-2 w-2 animate-pulse rounded-full bg-cyan-400" />
                {pendingAgents.length > 1
                  ? `Waiting for ${pendingAgents.join(', ')}…`
                  : 'Waiting for a response…'}
              </div>
            )}
            {sendError && <p className="rounded-lg bg-rose-400/10 p-2 text-xs text-rose-200">{sendError}</p>}
            <div ref={threadEndRef} />
          </div>

          <form onSubmit={(event) => void submit(event)} className="relative border-t border-white/10 p-3 sm:p-4">
            {mention && filteredMentionAgents.length > 0 && (
              <div
                role="listbox"
                aria-label="Mention an agent"
                className="absolute bottom-full left-3 mb-2 w-64 overflow-hidden rounded-xl border border-cyan-300/20 bg-[#0d2036] shadow-2xl shadow-black/40"
              >
                {filteredMentionAgents.map((agent, index) => (
                  <button
                    key={agent.id}
                    type="button"
                    role="option"
                    aria-selected={index === activeMentionIndex}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      applyMention(agent);
                    }}
                    className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition ${
                      index === activeMentionIndex ? 'bg-cyan-400/15 text-white' : 'text-slate-300 hover:bg-white/5'
                    }`}
                  >
                    <span
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-[9px] font-black text-slate-950 ${paletteFor(agents.indexOf(agent))}`}
                    >
                      {initials(agent.name)}
                    </span>
                    <span className="truncate font-semibold">{agent.name}</span>
                  </button>
                ))}
              </div>
            )}
            <div className="flex items-end gap-2 rounded-xl border border-white/10 bg-[#07111f] p-2">
              <label htmlFor="agents-hub-question" className="sr-only">
                Ask a Data Agent
              </label>
              <textarea
                id="agents-hub-question"
                ref={textareaRef}
                rows={2}
                value={input}
                onChange={(event) => updateInput(event.target.value, event.target.selectionStart ?? event.target.value.length)}
                onKeyDown={handleKeyDown}
                placeholder={
                  hasAgents
                    ? `Message ${defaultAgent?.name ?? 'your agents'}… (@ to mention someone else)`
                    : 'No Data Agent available'
                }
                disabled={!hasAgents || busy}
                className="min-w-0 flex-1 resize-none bg-transparent px-2 py-1 text-sm text-white outline-none placeholder:text-slate-600"
              />
              <button
                type="submit"
                disabled={!hasAgents || busy || !input.trim()}
                className="rounded-lg bg-cyan-400 px-4 py-2 text-xs font-bold text-slate-950 disabled:opacity-40"
              >
                {busy ? '...' : 'Send'}
              </button>
            </div>
          </form>
        </section>
      </main>
    </div>
  );
}

function AgentRoster({
  agents,
  loading,
  onSelect,
}: {
  agents: PortalAgent[];
  loading: boolean;
  onSelect: (agent: PortalAgent) => void;
}) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-xs text-slate-500">
        Loading agents…
      </div>
    );
  }

  if (!agents.length) return null;

  return (
    <div
      role="list"
      aria-label="Agents in this workspace"
      className="flex items-center gap-2 overflow-x-auto rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5"
    >
      {agents.map((agent, index) => (
        <button
          key={agent.id}
          type="button"
          role="listitem"
          title={agent.description ? `${agent.name} — ${agent.description}` : agent.name}
          onClick={() => onSelect(agent)}
          className="flex shrink-0 items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] py-1.5 pl-1.5 pr-3 text-xs font-semibold text-slate-200 transition hover:border-cyan-300/40 hover:text-white"
        >
          <span
            className={`flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br text-[9px] font-black text-slate-950 ${paletteFor(index)}`}
          >
            {initials(agent.name)}
          </span>
          <span>{agent.name}</span>
          {index === 0 && (
            <span className="rounded-full bg-cyan-400/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-cyan-300">
              Default
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
