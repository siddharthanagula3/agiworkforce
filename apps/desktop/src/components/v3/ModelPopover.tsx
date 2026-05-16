import { useState, useRef, useEffect } from 'react';
import { Check, ChevronRight } from 'lucide-react';
import { cn, useChatModelStore } from '@agiworkforce/unified-chat';
import { getRoutingSlotModel } from '@agiworkforce/types';

// Primary 3 Anthropic models — IDs come from getRoutingSlotModel, never hardcoded
const PRIMARY_MODELS = [
  {
    id: () => getRoutingSlotModel('general_premium'),
    slot: 'general_premium' as const,
    label: 'Most capable for ambitious work',
    displayName: 'Claude (Premium)',
  },
  {
    id: () => getRoutingSlotModel('general_balanced'),
    slot: 'general_balanced' as const,
    label: 'Responsive everyday work',
    displayName: 'Claude (Balanced)',
  },
  {
    id: () => getRoutingSlotModel('general_fast'),
    slot: 'general_fast' as const,
    label: 'Fastest, most efficient',
    displayName: 'Claude (Fast)',
  },
] as const;

// "More models" groups — IDs from slot registry
const MORE_GROUPS = [
  {
    label: 'Older models',
    items: [
      { id: () => getRoutingSlotModel('coding_premium'), tag: undefined },
      { id: () => getRoutingSlotModel('coding_fast'), tag: 'Budget' },
    ],
  },
  {
    label: 'Other providers',
    items: [
      { id: () => getRoutingSlotModel('general_balanced_pro'), tag: undefined },
      { id: () => getRoutingSlotModel('reasoning_premium'), tag: 'Reasoning' },
    ],
  },
] as const;

export interface ModelPopoverProps {
  onClose: () => void;
}

export function ModelPopover({ onClose }: ModelPopoverProps) {
  const selectedModelId = useChatModelStore((s) => s.selectedModelId);
  const selectModel = useChatModelStore((s) => s.selectModel);
  const thinkingEnabled = useChatModelStore((s) => s.thinkingEnabled);
  const toggleThinking = useChatModelStore((s) => s.toggleThinking);
  const models = useChatModelStore((s) => s.models);

  const [moreOpen, setMoreOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!ref.current) return;
      if (ref.current.contains(e.target as Node)) return;
      onClose();
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [onClose]);

  const handleSelect = (id: string) => {
    selectModel(id);
    onClose();
  };

  // Resolve display name from store if available, fall back to slot label
  const resolveDisplayName = (modelId: string, fallback: string): string => {
    const found = models.find((m) => m.id === modelId);
    return found?.name ?? fallback;
  };

  return (
    <div
      ref={ref}
      className="absolute bottom-full right-0 z-50 mb-2 w-64 rounded-xl border py-2 shadow-lg"
      style={{
        background: 'var(--chat-surface-elevated)',
        borderColor: 'var(--chat-border)',
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* Primary 3 */}
      {PRIMARY_MODELS.map((item) => {
        const modelId = item.id();
        const selected = selectedModelId === modelId;
        const name = resolveDisplayName(modelId, item.displayName);
        return (
          <button
            key={item.slot}
            type="button"
            className={cn(
              'flex w-full items-center gap-3 px-3 py-2.5 transition-colors',
              'hover:bg-[var(--chat-surface-hover)]',
              selected && 'bg-[var(--chat-surface-hover)]',
            )}
            onClick={() => handleSelect(modelId)}
          >
            <div className="flex-1 text-left">
              <div className="text-sm font-medium" style={{ color: 'var(--chat-text-primary)' }}>
                {name}
              </div>
              <div className="text-xs" style={{ color: 'var(--chat-text-muted)' }}>
                {item.label}
              </div>
            </div>
            {selected && (
              <Check size={14} strokeWidth={2.4} style={{ color: 'var(--chat-accent-primary)' }} />
            )}
          </button>
        );
      })}

      <Divider />

      {/* Adaptive thinking toggle */}
      <div
        className="flex cursor-pointer items-center gap-3 px-3 py-2.5 transition-colors hover:bg-[var(--chat-surface-hover)]"
        role="button"
        tabIndex={0}
        onClick={toggleThinking}
        onKeyDown={(e) => e.key === 'Enter' && toggleThinking()}
      >
        <div className="flex-1">
          <div className="text-sm font-medium" style={{ color: 'var(--chat-text-primary)' }}>
            Adaptive thinking
          </div>
          <div className="text-xs" style={{ color: 'var(--chat-text-muted)' }}>
            Thinks for more complex tasks
          </div>
        </div>
        <IosToggle on={thinkingEnabled} onToggle={toggleThinking} />
      </div>

      <Divider />

      {/* More models expand */}
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors hover:bg-[var(--chat-surface-hover)]"
        style={{ color: 'var(--chat-text-secondary)' }}
        onClick={() => setMoreOpen((o) => !o)}
      >
        <span className="flex-1 text-left font-medium">More models</span>
        <ChevronRight size={13} className={cn('transition-transform', moreOpen && 'rotate-90')} />
      </button>

      {moreOpen && (
        <div className="pb-1">
          {MORE_GROUPS.map((group) => (
            <div key={group.label}>
              <div
                className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider"
                style={{ color: 'var(--chat-text-muted)' }}
              >
                {group.label}
              </div>
              {group.items.map((item) => {
                const modelId = item.id();
                if (!modelId) return null;
                const selected = selectedModelId === modelId;
                const name = resolveDisplayName(modelId, modelId);
                return (
                  <button
                    key={modelId}
                    type="button"
                    className={cn(
                      'flex w-full items-center gap-2 px-3 py-1.5 text-sm transition-colors',
                      'hover:bg-[var(--chat-surface-hover)]',
                      selected && 'bg-[var(--chat-surface-hover)]',
                    )}
                    onClick={() => handleSelect(modelId)}
                  >
                    <span
                      className="flex-1 text-left"
                      style={{ color: 'var(--chat-text-primary)' }}
                    >
                      {name}
                    </span>
                    {item.tag && (
                      <span
                        className="rounded px-1.5 py-0.5 text-[10px] font-medium"
                        style={{
                          background: 'var(--chat-surface-hover)',
                          color: 'var(--chat-text-muted)',
                        }}
                      >
                        {item.tag}
                      </span>
                    )}
                    {selected && (
                      <Check
                        size={12}
                        strokeWidth={2.4}
                        style={{ color: 'var(--chat-accent-primary)' }}
                      />
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// iOS-style toggle
// ---------------------------------------------------------------------------

interface IosToggleProps {
  on: boolean;
  onToggle: () => void;
}

function IosToggle({ on, onToggle }: IosToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      className={cn(
        'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full',
        'transition-colors duration-200 ease-in-out focus-visible:outline-none',
        'focus-visible:ring-2 focus-visible:ring-[var(--chat-accent-primary)] focus-visible:ring-offset-2',
      )}
      style={{
        background: on ? 'var(--chat-accent-primary)' : 'var(--chat-border)',
      }}
    >
      <span
        className={cn(
          'pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm',
          'transition-transform duration-200 ease-in-out',
          on ? 'translate-x-4' : 'translate-x-0.5',
        )}
        style={{ marginTop: 2 }}
      />
    </button>
  );
}

function Divider() {
  return <div className="my-1 h-px" style={{ background: 'var(--chat-border)' }} />;
}
