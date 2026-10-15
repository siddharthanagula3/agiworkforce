import { Hand, MousePointerClick } from 'lucide-react';

import { useComputerUseStore } from '../../stores/computerUseStore';

export function ComputerUseControlStatus() {
  const isRunning = useComputerUseStore(
    (state) => state.isExecutingOpa || state.pausedConfirmation !== null,
  );
  const takenOver = useComputerUseStore((state) => state.takenOver);
  const stopComputerUse = useComputerUseStore((state) => state.stopComputerUse);
  const handBack = useComputerUseStore((state) => state.handBack);

  if (!isRunning && !takenOver) return null;

  const Icon = isRunning ? MousePointerClick : Hand;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 left-1/2 z-[90] flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-3 rounded-full border border-[var(--chat-border)] bg-[var(--chat-surface-elevated)] py-1.5 pl-4 pr-1.5 text-sm text-[var(--chat-text-primary)] shadow-[var(--chat-shadow-lg)]"
    >
      <Icon aria-hidden="true" size={16} className="shrink-0 text-[var(--chat-text-secondary)]" />
      <span className="min-w-0 truncate">
        {isRunning
          ? 'AGI is controlling this computer'
          : 'Screen control is yours. Agents cannot click or type.'}
      </span>
      <button
        type="button"
        onClick={() => void (isRunning ? stopComputerUse() : handBack())}
        className="min-h-8 shrink-0 rounded-full border border-[var(--chat-border-strong)] px-3 text-sm font-medium text-[var(--chat-text-primary)] hover:bg-[var(--chat-surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus-ring)] pointer-coarse:min-h-11"
      >
        {isRunning ? 'Stop' : 'Hand back'}
      </button>
    </div>
  );
}
