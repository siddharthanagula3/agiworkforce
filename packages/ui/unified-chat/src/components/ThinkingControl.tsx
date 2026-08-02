/**
 * ThinkingControl — composer chip for extended thinking.
 *
 * Mirrors web `ComposerFooter`'s thinking semantics
 * (`showsThinkingSwitch` / always-on) against the SELECTED model's catalog
 * reasoning contract:
 *   - model with a real on/off contract → an operable toggle bound to the
 *     shared model store;
 *   - always-on reasoner (`control: 'always_on'`, or
 *     `canDisableThinking: false`) → a static "Thinking always on" badge, and
 *     the store is snapped on so what is displayed is what is sent;
 *   - no thinking contract → nothing renders at all.
 *
 * The composer had NO thinking control before this: `thinkingEnabled` sat at
 * its initial `false` and desktop Cloud serialised `thinking_mode: false` on
 * every request, which the route rejects outright for always-on models. The
 * send path clamps independently (`lib/thinkingPolicy.ts`) — this component
 * only makes the state visible and changeable.
 */

import { useEffect } from 'react';
import { Brain } from 'lucide-react';
import { getModelReasoning } from '@agiworkforce/types';
import { cn } from '../lib/utils';
import { useModelStore } from '../stores/modelStore';
import { isAlwaysOnReasoningModel, showsThinkingSwitch } from '../lib/thinkingPolicy';

export interface ThinkingControlProps {
  /** Selected model id — the reasoning contract is read from the catalog. */
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

  // An always-on reasoner keeps thinking on: snap the persisted preference so a
  // stale "off" carried over from another model cannot disagree with what the
  // send path will actually put on the wire.
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
