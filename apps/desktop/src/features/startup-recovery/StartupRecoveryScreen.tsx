import { useState } from 'react';
import { Database, FileDown, FolderOpen, Power, RotateCcw, ShieldCheck } from 'lucide-react';

export interface StartupRecoveryInfo {
  code: string;
  title: string;
  message: string;
  dataPreserved: boolean;
}

interface StartupRecoveryScreenProps {
  info: StartupRecoveryInfo;
  onRetry: () => Promise<void>;
  onOpenDataFolder: () => Promise<void>;
  onExportDiagnostics: () => Promise<boolean>;
  onQuit: () => Promise<void>;
}

type PendingAction = 'retry' | 'folder' | 'diagnostics' | 'quit';

export function StartupRecoveryScreen({
  info,
  onRetry,
  onOpenDataFolder,
  onExportDiagnostics,
  onQuit,
}: StartupRecoveryScreenProps) {
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [status, setStatus] = useState('');

  const run = async (
    action: PendingAction,
    operation: () => Promise<void | boolean>,
    successMessage?: string,
  ) => {
    setPending(action);
    setStatus('');
    try {
      const result = await operation();
      if (action === 'diagnostics' && result === false) {
        setStatus('Diagnostics export canceled.');
      } else if (successMessage) {
        setStatus(successMessage);
      }
    } catch {
      setStatus('That action could not be completed. Please try again.');
    } finally {
      setPending(null);
    }
  };

  const busy = pending !== null;

  return (
    <main
      className="flex min-h-screen w-full items-center justify-center overflow-auto bg-[#080b10] px-6 py-10 text-white"
      aria-labelledby="startup-recovery-title"
    >
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute left-1/2 top-[-18rem] h-[36rem] w-[36rem] -translate-x-1/2 rounded-full bg-cyan-500/10 blur-[120px]" />
        <div className="absolute bottom-[-18rem] right-[-10rem] h-[32rem] w-[32rem] rounded-full bg-blue-500/10 blur-[120px]" />
      </div>

      <section className="relative w-full max-w-2xl rounded-3xl border border-white/10 bg-[#11161e]/95 p-7 shadow-2xl shadow-black/40 backdrop-blur sm:p-10">
        <div className="mb-8 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.06]">
              <Database className="h-5 w-5 text-cyan-300" aria-hidden="true" />
            </div>
            <div>
              <p className="text-sm font-semibold tracking-wide text-white">AGI Desktop</p>
              <p className="text-xs text-white/45">Local data recovery</p>
            </div>
          </div>
          <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 font-mono text-[11px] text-white/45">
            {info.code}
          </span>
        </div>

        <h1
          id="startup-recovery-title"
          className="text-2xl font-semibold tracking-tight sm:text-3xl"
        >
          {info.title}
        </h1>
        <p className="mt-3 max-w-xl text-sm leading-6 text-white/65 sm:text-base">{info.message}</p>

        {info.dataPreserved && (
          <div className="mt-6 flex gap-3 rounded-2xl border border-emerald-300/15 bg-emerald-300/[0.06] p-4">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" aria-hidden="true" />
            <div>
              <p className="text-sm font-medium text-emerald-100">Your local data is preserved</p>
              <p className="mt-1 text-sm leading-5 text-emerald-100/65">
                Your database was not deleted, reset, renamed, or replaced.
              </p>
            </div>
          </div>
        )}

        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void run('retry', onRetry)}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-white px-4 text-sm font-semibold text-[#0b0e13] transition hover:bg-white/90 disabled:cursor-wait disabled:opacity-50"
          >
            <RotateCcw
              className={`h-4 w-4 ${pending === 'retry' ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
            {pending === 'retry' ? 'Restarting…' : 'Retry'}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void run('folder', onOpenDataFolder, 'The AGI data folder is open.')}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] px-4 text-sm font-medium text-white transition hover:bg-white/[0.09] disabled:cursor-wait disabled:opacity-50"
          >
            <FolderOpen className="h-4 w-4" aria-hidden="true" />
            {pending === 'folder' ? 'Opening…' : 'Open Data Folder'}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void run(
                'diagnostics',
                onExportDiagnostics,
                'Sanitized diagnostics exported successfully.',
              )
            }
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] px-4 text-sm font-medium text-white transition hover:bg-white/[0.09] disabled:cursor-wait disabled:opacity-50"
          >
            <FileDown className="h-4 w-4" aria-hidden="true" />
            {pending === 'diagnostics' ? 'Exporting…' : 'Export Diagnostics'}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void run('quit', onQuit)}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-white/10 bg-transparent px-4 text-sm font-medium text-white/65 transition hover:bg-white/[0.05] hover:text-white disabled:cursor-wait disabled:opacity-50"
          >
            <Power className="h-4 w-4" aria-hidden="true" />
            {pending === 'quit' ? 'Quitting…' : 'Quit AGI'}
          </button>
        </div>

        <p
          className="mt-5 min-h-5 text-center text-xs text-white/55"
          role="status"
          aria-live="polite"
        >
          {status}
        </p>
      </section>
    </main>
  );
}

export function StartupRecoveryLoading() {
  return (
    <main
      className="flex min-h-screen w-full items-center justify-center bg-[#080b10] text-white"
      aria-label="Opening AGI Desktop"
    >
      <div className="flex flex-col items-center gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.06]">
          <Database className="h-5 w-5 animate-pulse text-cyan-300" aria-hidden="true" />
        </div>
        <p className="text-sm text-white/55" role="status">
          Opening encrypted local data…
        </p>
      </div>
    </main>
  );
}
