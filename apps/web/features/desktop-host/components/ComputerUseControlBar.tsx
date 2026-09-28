'use client';

import { describeAccelerator } from '@agiworkforce/local-runtime-contract';
import { useComputerUse } from '../hooks/use-computer-use';
import { useElectronHost } from '../lib/host';

const BUTTON_CLASS =
  'shrink-0 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60';

export function ComputerUseControlBar() {
  const host = useElectronHost();
  const { status, error, busy, stop, takeOver, handBack } = useComputerUse();

  if (!host || !status || status.phase === 'idle') return null;

  const paused = status.phase === 'paused';
  const stopKey = describeAccelerator(status.stopShortcut, host.platform);
  const activeHint = stopKey
    ? `Press ${stopKey} anywhere to stop it.`
    : 'Stop it here or from the File menu.';

  return (
    <aside
      role="status"
      aria-live="polite"
      aria-label="Computer use"
      className="pointer-events-auto flex items-center gap-3 rounded-xl border border-border bg-background px-4 py-3 text-foreground shadow-lg"
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">
          {paused ? 'Paused. You have the screen.' : 'AGI is using your computer'}
        </p>
        {error ? (
          <p role="alert" className="text-xs text-danger">
            {error}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            {paused
              ? status.pausedBy === 'user-input'
                ? 'It paused when you moved the pointer or typed. Hand back to let it carry on.'
                : 'Hand back to let it carry on.'
              : activeHint}
          </p>
        )}
      </div>
      <button
        type="button"
        className={BUTTON_CLASS}
        disabled={busy}
        onClick={paused ? handBack : takeOver}
      >
        {paused ? 'Hand back' : 'Take over'}
      </button>
      <button type="button" className={BUTTON_CLASS} disabled={busy} onClick={stop}>
        Stop
      </button>
    </aside>
  );
}
