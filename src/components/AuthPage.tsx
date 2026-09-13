import { useState } from 'react';

import { useAuth } from '@/hooks/AuthContext';

const msLogo = (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="16"
    height="16"
    viewBox="0 0 21 21"
    className="mr-2"
  >
    <rect x="1" y="1" width="9" height="9" fill="#f25022" />
    <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
    <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
    <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
  </svg>
);

export function AuthPage() {
  const { signIn, fabricAuthEnabled } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSignIn = async () => {
    setError(null);
    setIsLoading(true);

    try {
      await signIn();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to sign in.');
    } finally {
      setIsLoading(false);
    }
  };

  const buttonLabel = isLoading
    ? fabricAuthEnabled
      ? 'Opening Fabric...'
      : 'Signing in...'
    : 'Continue with Microsoft';

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-950">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(96,165,250,0.24),_transparent_34%),radial-gradient(circle_at_bottom_right,_rgba(45,212,191,0.18),_transparent_28%)]" />

      <div className="relative flex min-h-screen items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="rounded-[28px] border border-white/10 bg-slate-900/80 p-8 shadow-2xl shadow-slate-950/60 backdrop-blur-xl">
            <div className="mb-8 text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 text-2xl font-black text-white shadow-lg shadow-cyan-500/20">
                C
              </div>
              <p className="text-xs font-semibold uppercase tracking-[0.26em] text-cyan-300">
                Fabric App
              </p>
              <h1 className="mt-3 text-3xl font-bold text-white">Chat Genie</h1>
              <p className="mt-2 text-sm text-slate-300">
                Securely access your Power BI Agent workspace and continue the conversation.
              </p>
            </div>

            <button
              type="button"
              onClick={handleSignIn}
              disabled={isLoading}
              className="flex w-full items-center justify-center rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-cyan-500/20 transition-all hover:brightness-110 hover:shadow-cyan-500/30 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {msLogo}
              {buttonLabel}
            </button>

            <div className="mt-6 rounded-2xl border border-slate-700 bg-slate-800/70 p-4">
              <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-400">
                Workspace
              </p>
              <p className="mt-2 text-base font-semibold text-slate-100">
                Power BI Agent - Development
              </p>
              <p className="mt-1 text-sm text-slate-400">
                Built for interactive analysis, prompts, and workflow support.
              </p>
            </div>

            {error && (
              <p className="mt-4 text-center text-sm text-rose-300">{error}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
