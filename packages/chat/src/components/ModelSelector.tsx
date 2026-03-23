import * as Popover from '@radix-ui/react-popover';
import { Check, ChevronDown, Settings, Zap, Star, Cpu } from 'lucide-react';
import { cn } from '../lib/utils';
import { useModel } from '../hooks/useModel';
import type { ModelInfo } from '../lib/types';

// ---------------------------------------------------------------------------
// Fallback models shown when no models have been loaded from the store
// ---------------------------------------------------------------------------
const FALLBACK_MODELS: ModelInfo[] = [
  {
    id: 'claude-haiku-4-5-20251001',
    name: 'Claude 3.5 Haiku',
    provider: 'anthropic',
    tier: 'fast',
    supportsThinking: false,
    supportsVision: true,
    supportsTools: true,
    contextWindow: 200000,
    isLocal: false,
    isByok: false,
  },
  {
    id: 'gpt-4o-mini',
    name: 'GPT-4o Mini',
    provider: 'openai',
    tier: 'fast',
    supportsThinking: false,
    supportsVision: true,
    supportsTools: true,
    contextWindow: 128000,
    isLocal: false,
    isByok: false,
  },
  {
    id: 'llama-3.2-3b-instruct',
    name: 'Llama 3.2',
    provider: 'ollama',
    tier: 'fast',
    supportsThinking: false,
    supportsVision: false,
    supportsTools: false,
    contextWindow: 128000,
    isLocal: true,
    isByok: false,
  },
];

// ---------------------------------------------------------------------------
// Provider display config
// ---------------------------------------------------------------------------
interface ProviderConfig {
  label: string;
  icon: string;
}

const PROVIDER_CONFIG: Record<string, ProviderConfig> = {
  anthropic: { label: 'Anthropic', icon: 'A' },
  openai: { label: 'OpenAI', icon: 'O' },
  google: { label: 'Google', icon: 'G' },
  gemini: { label: 'Google', icon: 'G' },
  ollama: { label: 'Ollama', icon: '⊙' },
  groq: { label: 'Groq', icon: 'Q' },
  mistral: { label: 'Mistral', icon: 'M' },
  deepseek: { label: 'DeepSeek', icon: 'D' },
  xai: { label: 'xAI', icon: 'X' },
  cohere: { label: 'Cohere', icon: 'C' },
  managed_cloud: { label: 'Cloud', icon: '☁' },
};

function getProviderConfig(provider: string): ProviderConfig {
  const normalized = provider.toLowerCase();
  return PROVIDER_CONFIG[normalized] ?? { label: provider, icon: provider.charAt(0).toUpperCase() };
}

// ---------------------------------------------------------------------------
// Tier badge
// ---------------------------------------------------------------------------
interface TierBadgeProps {
  tier: ModelInfo['tier'];
  className?: string;
}

function TierBadge({ tier, className }: TierBadgeProps) {
  if (tier === 'fast') {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium',
          'bg-[var(--chat-info)]/15 text-[var(--chat-info)]',
          className,
        )}
      >
        <Zap size={9} />
        fast
      </span>
    );
  }
  if (tier === 'flagship') {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium',
          'bg-[var(--chat-accent-primary)]/15 text-[var(--chat-accent-primary)]',
          className,
        )}
      >
        <Star size={9} />
        premium
      </span>
    );
  }
  // standard
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium',
        'bg-[var(--chat-surface-hover)] text-[var(--chat-text-muted)]',
        className,
      )}
    >
      <Cpu size={9} />
      standard
    </span>
  );
}

// ---------------------------------------------------------------------------
// Context window formatter
// ---------------------------------------------------------------------------
function formatContext(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(0)}M`;
  if (tokens >= 1_000) return `${Math.round(tokens / 1_000)}K`;
  return String(tokens);
}

// ---------------------------------------------------------------------------
// Provider icon pill
// ---------------------------------------------------------------------------
interface ProviderIconProps {
  provider: string;
}

function ProviderIcon({ provider }: ProviderIconProps) {
  const config = getProviderConfig(provider);
  return (
    <span
      className={cn(
        'flex h-5 w-5 shrink-0 items-center justify-center rounded text-[10px] font-bold',
        'bg-[var(--chat-surface-hover)] text-[var(--chat-text-secondary)]',
      )}
      aria-hidden
    >
      {config.icon}
    </span>
  );
}

// ---------------------------------------------------------------------------
// ModelSelector props
// ---------------------------------------------------------------------------
export interface ModelSelectorProps {
  /** Called when the user clicks "Manage API Keys" at the bottom of the popover. */
  onSettingsClick?: () => void;
  className?: string;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export function ModelSelector({ onSettingsClick, className }: ModelSelectorProps) {
  const { models, selectedModelId, displayName, selectModel } = useModel();

  const displayModels = models.length > 0 ? models : FALLBACK_MODELS;

  // Group by provider, preserving insertion order
  const grouped = displayModels.reduce<Record<string, ModelInfo[]>>((acc, m) => {
    const key = m.provider.toLowerCase();
    if (!acc[key]) acc[key] = [];
    acc[key]!.push(m);
    return acc;
  }, {});

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label="Select model"
          className={cn(
            'inline-flex items-center gap-1 rounded-lg px-2.5 py-1',
            'text-xs text-[var(--chat-text-secondary)] transition-colors duration-150',
            'hover:bg-[var(--chat-surface-hover)] hover:text-[var(--chat-text-primary)]',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-accent-secondary)]',
            'data-[state=open]:bg-[var(--chat-surface-hover)] data-[state=open]:text-[var(--chat-text-primary)]',
            className,
          )}
        >
          <span className="max-w-[140px] truncate font-medium">{displayName}</span>
          <ChevronDown size={12} className="shrink-0 opacity-60" />
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          side="top"
          align="end"
          sideOffset={6}
          className={cn(
            'z-50 w-72 overflow-hidden rounded-xl shadow-lg',
            'border border-[var(--chat-border)] bg-[var(--chat-surface-elevated)]',
            'animate-in fade-in-0 zoom-in-95',
            'data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2',
          )}
        >
          {/* Scrollable model list */}
          <div className="max-h-80 overflow-y-auto p-1">
            {Object.entries(grouped).map(([providerKey, providerModels]) => {
              const config = getProviderConfig(providerKey);
              return (
                <div key={providerKey}>
                  {/* Provider group header */}
                  <div className="flex items-center gap-1.5 px-2 py-1.5">
                    <ProviderIcon provider={providerKey} />
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--chat-text-muted)]">
                      {config.label}
                    </p>
                  </div>

                  {/* Model rows */}
                  {providerModels.map((m) => {
                    const isSelected = m.id === selectedModelId;
                    return (
                      <Popover.Close asChild key={m.id}>
                        <button
                          type="button"
                          onClick={() => selectModel(m.id)}
                          className={cn(
                            'flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left transition-colors',
                            isSelected
                              ? 'bg-[var(--chat-accent-primary)]/10 text-[var(--chat-accent-primary)]'
                              : 'text-[var(--chat-text-primary)] hover:bg-[var(--chat-surface-hover)]',
                          )}
                        >
                          {/* Model name + badges */}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className="truncate text-sm font-medium leading-tight">
                                {m.name}
                              </span>
                              {m.isLocal && (
                                <span className="shrink-0 rounded px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide bg-[var(--chat-info)]/15 text-[var(--chat-info)]">
                                  local
                                </span>
                              )}
                            </div>
                            <div className="mt-0.5 flex items-center gap-1.5">
                              <TierBadge tier={m.tier} />
                              <span className="text-[10px] text-[var(--chat-text-muted)]">
                                {formatContext(m.contextWindow)} ctx
                              </span>
                            </div>
                          </div>

                          {/* Selected checkmark */}
                          {isSelected && (
                            <Check
                              size={14}
                              className="mt-0.5 shrink-0 text-[var(--chat-accent-primary)]"
                            />
                          )}
                        </button>
                      </Popover.Close>
                    );
                  })}
                </div>
              );
            })}
          </div>

          {/* Footer — manage API keys */}
          {onSettingsClick && (
            <div className="border-t border-[var(--chat-border)] p-1">
              <Popover.Close asChild>
                <button
                  type="button"
                  onClick={onSettingsClick}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm',
                    'text-[var(--chat-text-secondary)] hover:bg-[var(--chat-surface-hover)]',
                    'transition-colors duration-150',
                  )}
                >
                  <Settings size={13} />
                  <span>Manage API Keys</span>
                </button>
              </Popover.Close>
            </div>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
