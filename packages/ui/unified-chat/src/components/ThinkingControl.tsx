
import { useEffect } from 'react';
import { Brain } from 'lucide-react';
import { getModelReasoning } from '@agiworkforce/types';
import { cn } from '../lib/utils';
import { useModelStore } from '../stores/modelStore';
import { isAlwaysOnReasoningModel, showsThinkingSwitch } from '../lib/thinkingPolicy';

export interface ThinkingControlProps {
  modelId: string;
  disabled?: boolean;
  className?: string;
}

export function ThinkingControl({ modelId, disabled, className }: ThinkingControlProps) {
  const thinkingEnabled = useModelStore((state) => state.thinkingEnabled);
  const setThinking = useModelStore((state) => state.setThinking);
  const reasoning = getModelReasoning(modelId);
  const alwaysOn = isAlwaysOnReasoningModel(reasoning);
  const showsSwitch = showsThinkingSwitch(reasoning);

  useEffect(() => {
    if (alwaysOn && !thinkingEnabled) setThinking(true);
  }, [alwaysOn, thinkingEnabled, setThinking]);

  if (alwaysOn) {
    return (
      <span
        data-testid="thinking-always-on"
        title="This model always uses extended thinking."
        className={cn(
          'inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1',
          'text-[11px] font-medium select-none',
          'text-[var(--chat-accent-primary)] bg-[var(--chat-accent-primary)]/15',
          className,
        )}
      >
        <Brain aria-hidden="true" size={11} className="shrink-0" />
        <span className="truncate">Thinking always on</span>
      </span>
    );
  }

  if (!showsSwitch) return null;

  return (
    <button
      type="button"
      role="switch"
      aria-checked={thinkingEnabled}
      aria-label="Toggle extended thinking"
      disabled={disabled}
      onClick={() => setThinking(!thinkingEnabled)}
      title={
        thinkingEnabled
          ? 'Extended thinking is on. Click to turn it off.'
          : 'Turn on extended thinking for more complex tasks.'
      }
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1',
        'text-[11px] font-medium transition-colors duration-150 select-none',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-accent-secondary)]',
        thinkingEnabled
          ? 'bg-[var(--chat-accent-primary)]/15 text-[var(--chat-accent-primary)]'
          : 'text-[var(--chat-text-secondary)] hover:bg-[var(--chat-surface-hover)] hover:text-[var(--chat-text-primary)]',
        disabled && 'cursor-not-allowed opacity-50',
        className,
      )}
    >
      <Brain aria-hidden="true" size={11} className="shrink-0" />
      <span className="truncate">Thinking</span>
    </button>
  );
}
