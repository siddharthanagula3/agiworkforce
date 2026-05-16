import { useState, useRef, useEffect } from 'react';
import { Check, ChevronRight } from 'lucide-react';
import { cn, useChatModelStore } from '@agiworkforce/unified-chat';
import {
  getTaskModelForProvider,
  getProviderDefaultModel,
  getModelMetadataById,
} from '@agiworkforce/types';

// ---------------------------------------------------------------------------
// Primary 3 — Anthropic models per design spec.
// IDs resolved via catalog helpers, never hardcoded literals.
// ---------------------------------------------------------------------------
const PRIMARY_MODELS = [
  {
    key: 'anthropic-premium',
    getId: () =>
      getTaskModelForProvider('anthropic', 'complex_reasoning') ??
      getProviderDefaultModel('anthropic') ??
      '',
    label: 'Most capable for ambitious work',
  },
  {
    key: 'anthropic-balanced',
    getId: () => getProviderDefaultModel('anthropic') ?? '',
    label: 'Responsive everyday work',
  },
  {
    key: 'anthropic-fast',
    getId: () =>
      getTaskModelForProvider('anthropic', 'fast_completion') ??
      getProviderDefaultModel('anthropic') ??
      '',
    label: 'Fastest, most efficient',
  },
] as const;

// ---------------------------------------------------------------------------
// "More models" — 2 groups per design spec.
// All IDs from catalog helpers.
// ---------------------------------------------------------------------------
const MORE_GROUPS = [
  {
    label: 'Older Anthropic',
    items: [
      {
        key: 'anthropic-vision',
        getId: () =>
          getTaskModelForProvider('anthropic', 'vision') ??
          getProviderDefaultModel('anthropic') ??
          '',
        tag: undefined as string | undefined,
      },
      {
        key: 'anthropic-code',
        getId: () =>
          getTaskModelForProvider('anthropic', 'code_generation') ??
          getProviderDefaultModel('anthropic') ??
          '',
        tag: undefined as string | undefined,
      },
    ],
  },
  {
    label: 'Other providers',
    items: [
      {
        key: 'openai-default',
        getId: () => getProviderDefaultModel('openai') ?? '',
        tag: undefined as string | undefined,
      },
      {
        key: 'google-default',
        getId: () => getProviderDefaultModel('google') ?? '',
        tag: undefined as string | undefined,
      },
      {
        key: 'xai-default',
        getId: () => getProviderDefaultModel('xai') ?? '',
        tag: undefined as string | undefined,
      },
      {
        key: 'moonshot-default',
        getId: () => getProviderDefaultModel('moonshot') ?? '',
        tag: undefined as string | undefined,
      },
      {
        key: 'qwen-fast',
        getId: () =>
          getTaskModelForProvider('qwen', 'fast_completion') ??
          getProviderDefaultModel('qwen') ??
          '',
        tag: 'Local' as string | undefined,
      },
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
  const storeModels = useChatModelStore((s) => s.models);

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
    if (!id) return;
    selectModel(id);
    onClose();
  };

  // Resolve display name: store first (live catalog), then models.json metadata, then bare ID.
  const resolveName = (modelId: string): string => {
    if (!modelId) return '';
    const fromStore = storeModels.find((m) => m.id === modelId);
    if (fromStore?.name) return fromStore.name;
    const meta = getModelMetadataById(modelId);
    return meta?.name ?? modelId;
  };

  // Deduplicate primary rows — e.g. if complex_reasoning and defaultModel resolve to same ID
  const seenPrimary = new Set<string>();
  const primaryRows = PRIMARY_MODELS.map((item) => {
    const id = item.getId();
    const dup = seenPrimary.has(id);
    seenPrimary.add(id);
    return { ...item, id, dup };
  }).filter((r) => r.id && !r.dup);

  return (
    <div
      ref={ref}
      className="absolute bottom-full right-0 z-50 mb-2 w-64 rounded-xl border py-2 shadow-lg"
      style={{
        background: 'var(--chat-surface-elevated)',
        borderColor: 'var(--chat-border)',
        boxShadow: 'var(--chat-shadow-lg, 0 8px 24px rgba(0,0,0,0.12))',
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* Primary 3 Anthropic models */}
      {primaryRows.map((item) => {
        const selected = selectedModelId === item.id;
        return (
          <button
            key={item.key}
            type="button"
            className={cn(
              'flex w-full items-center gap-3 px-3 py-2.5 transition-colors',
              'hover:bg-[var(--chat-surface-hover)]',
              selected && 'bg-[var(--chat-surface-hover)]',
            )}
            onClick={() => handleSelect(item.id)}
          >
            <div className="flex-1 text-left">
              <div className="text-sm font-medium" style={{ color: 'var(--chat-text-primary)' }}>
                {resolveName(item.id)}
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

      {/* Adaptive thinking toggle (iOS-style switch) */}
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

      {/* More models toggle */}
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3 py-2 text-sm font-medium transition-colors hover:bg-[var(--chat-surface-hover)]"
        style={{ color: 'var(--chat-text-secondary)' }}
        onClick={() => setMoreOpen((o) => !o)}
      >
        <span className="flex-1 text-left">More models</span>
        <ChevronRight
          size={13}
          className={cn('transition-transform duration-150', moreOpen && 'rotate-90')}
        />
      </button>

      {moreOpen && (
        <div className="pb-1">
          {MORE_GROUPS.map((group) => {
            // Deduplicate within each group
            const seen = new Set<string>(primaryRows.map((r) => r.id));
            const items = group.items
              .map((item) => ({ ...item, id: item.getId() }))
              .filter((item) => {
                if (!item.id || seen.has(item.id)) return false;
                seen.add(item.id);
                return true;
              });
            if (items.length === 0) return null;
            return (
              <div key={group.label}>
                <div
                  className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider"
                  style={{ color: 'var(--chat-text-muted)' }}
                >
                  {group.label}
                </div>
                {items.map((item) => {
                  const selected = selectedModelId === item.id;
                  return (
                    <button
                      key={item.key}
                      type="button"
                      className={cn(
                        'flex w-full items-center gap-2 px-3 py-1.5 text-sm transition-colors',
                        'hover:bg-[var(--chat-surface-hover)]',
                        selected && 'bg-[var(--chat-surface-hover)]',
                      )}
                      onClick={() => handleSelect(item.id)}
                    >
                      <span
                        className="flex-1 text-left"
                        style={{ color: 'var(--chat-text-primary)' }}
                      >
                        {resolveName(item.id)}
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
            );
          })}
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
        'transition-colors duration-200 ease-in-out',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-accent-primary)] focus-visible:ring-offset-2',
      )}
      style={{ background: on ? 'var(--chat-accent-primary)' : 'var(--chat-border)' }}
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
