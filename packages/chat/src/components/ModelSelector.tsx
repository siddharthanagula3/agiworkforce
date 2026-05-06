import { useState } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { Check, ChevronDown, ChevronRight, Settings, Zap, Star, Cpu, Brain } from 'lucide-react';
import {
  siAnthropic,
  siGoogle,
  siDeepseek,
  siPerplexity,
  siQwen,
  siOllama,
  siMoonshotai,
} from 'simple-icons';
import {
  PROVIDER_DISPLAY,
  CAPABILITY_LABEL,
  EFFORT_LABEL,
  type ProviderId,
  type CapabilityTier,
  type Effort,
} from '@agiworkforce/types';
import { cn } from '../lib/utils';
import { useModel } from '../hooks/useModel';
import { CLOUD_FALLBACK_MODELS } from '../stores/modelStore';
import type { ModelInfo } from '../lib/types';

// ---------------------------------------------------------------------------
// Capability tier map — derived from models.json qualityTier.
// 'fast' -> 'fastest', 'balanced' -> 'balanced', 'best' -> 'most-capable'.
// Default for unknown models is 'balanced'.
// ---------------------------------------------------------------------------
const MODEL_CAPABILITY: Record<string, CapabilityTier> = {
  // managed_cloud / auto modes
  auto: 'balanced',
  'auto-economy': 'fastest',
  'auto-balanced': 'balanced',
  'auto-premium': 'most-capable',
  // Anthropic
  'claude-haiku-4.5': 'fastest',
  'claude-sonnet-4.5': 'balanced',
  'claude-sonnet-4.6': 'balanced',
  'claude-opus-4.6': 'most-capable',
  'claude-opus-4.7': 'most-capable',
  // OpenAI
  'gpt-5.4-nano': 'fastest',
  'gpt-5.4-mini': 'balanced',
  'gpt-5.4': 'most-capable',
  'gpt-5.4-codex': 'balanced',
  'gpt-5.4-codex-low': 'balanced',
  'gpt-5.4-codex-medium': 'balanced',
  'gpt-5.4-codex-high': 'most-capable',
  'gpt-5.4-codex-xhigh': 'most-capable',
  'gpt-5.4-pro': 'most-capable',
  'gpt-5.5': 'most-capable',
  o3: 'most-capable',
  // Google
  'gemini-3.1-flash-lite': 'fastest',
  'gemini-3.1-flash-image': 'balanced',
  'gemini-3.1-pro-preview': 'balanced',
  'gemini-3-flash-preview': 'fastest',
  'gemini-3-pro-preview': 'balanced',
  'gemini-3-ultra': 'most-capable',
  // xAI
  'grok-4-fast': 'fastest',
  'grok-4-fast-non-reasoning': 'fastest',
  'grok-4-mini': 'fastest',
  'grok-4': 'balanced',
  'grok-4-fast-reasoning': 'balanced',
  'grok-4-1-fast-reasoning': 'balanced',
  'grok-4.3': 'most-capable',
  // DeepSeek
  'deepseek-v4-flash': 'fastest',
  'deepseek-chat': 'balanced',
  'deepseek-reasoner': 'balanced',
  'deepseek-v4-pro': 'most-capable',
  // Qwen
  'qwen-flash': 'fastest',
  'qwen-turbo': 'fastest',
  'qwen-coder-flash': 'fastest',
  'qwen-max': 'balanced',
  'qwen-3.6-plus': 'balanced',
  'qwen-coder-plus': 'balanced',
  // Moonshot
  'kimi-k2.5-turbo': 'fastest',
  'kimi-k2.5': 'balanced',
  'kimi-k2.5-thinking': 'most-capable',
  'kimi-k2.6': 'most-capable',
  // Zhipu
  'glm-4.6v-flash': 'fastest',
  'glm-4.7': 'balanced',
  'glm-4.6v': 'balanced',
  'glm-5.1': 'most-capable',
  // Perplexity
  sonar: 'fastest',
  'sonar-reasoning': 'balanced',
  'sonar-reasoning-pro': 'balanced',
  'sonar-pro': 'balanced',
  'sonar-deep-research': 'most-capable',
  // Mistral
  'mistral-small-3': 'fastest',
  'codestral-2': 'fastest',
  'pixtral-large': 'balanced',
  'mistral-medium-3': 'balanced',
  'mistral-large-3': 'balanced',
};

/** Map ModelInfo.tier to CapabilityTier for models not in MODEL_CAPABILITY. */
function tierToCapability(tier: ModelInfo['tier']): CapabilityTier {
  switch (tier) {
    case 'fast':
      return 'fastest';
    case 'flagship':
      return 'most-capable';
    default:
      return 'balanced';
  }
}

function getCapability(model: ModelInfo): CapabilityTier {
  return MODEL_CAPABILITY[model.id] ?? tierToCapability(model.tier);
}

// ---------------------------------------------------------------------------
// Simple-Icons SVG logo helper
// ---------------------------------------------------------------------------
interface IconData {
  path: string;
  hex: string;
}

/** Map from normalized provider key to simple-icons data (or null for dot fallback). */
const SIMPLE_ICON_MAP: Record<string, IconData | null> = {
  anthropic: siAnthropic,
  google: siGoogle,
  gemini: siGoogle,
  deepseek: siDeepseek,
  perplexity: siPerplexity,
  qwen: siQwen,
  ollama: siOllama,
  moonshot: siMoonshotai,
  // No simple-icons for these — use brand-color dot:
  openai: null,
  xai: null,
  zhipu: null,
  lmstudio: null,
  'custom-openai-compatible': null,
  'agi-cloud': null,
  managed_cloud: null,
};

// ---------------------------------------------------------------------------
// Provider brand color — prefers PROVIDER_DISPLAY, fallback to simple-icon hex
// ---------------------------------------------------------------------------
function getProviderBrandColor(providerKey: string): string {
  const displayKey = providerKey as ProviderId;
  if (PROVIDER_DISPLAY[displayKey]) {
    return PROVIDER_DISPLAY[displayKey].brandColor;
  }
  const iconData = SIMPLE_ICON_MAP[providerKey];
  if (iconData) return `#${iconData.hex}`;
  return '#71717A';
}

// ---------------------------------------------------------------------------
// Provider label
// ---------------------------------------------------------------------------
function getProviderLabel(providerKey: string): string {
  const displayKey = providerKey as ProviderId;
  if (PROVIDER_DISPLAY[displayKey]) {
    return PROVIDER_DISPLAY[displayKey].label;
  }
  // Fallback for providers not in PROVIDER_DISPLAY (mistral, groq, etc.)
  const fallback: Record<string, string> = {
    managed_cloud: 'AGI Cloud',
    mistral: 'Mistral AI',
    groq: 'Groq',
    cohere: 'Cohere',
    nvidia_nim: 'NVIDIA NIM',
    open_router: 'OpenRouter',
  };
  return fallback[providerKey] ?? providerKey.charAt(0).toUpperCase() + providerKey.slice(1);
}

// ---------------------------------------------------------------------------
// Provider logo — SVG inline or brand-color dot
// ---------------------------------------------------------------------------
interface ProviderLogoProps {
  providerKey: string;
  size?: number;
}

function ProviderLogo({ providerKey, size = 16 }: ProviderLogoProps) {
  const iconData = SIMPLE_ICON_MAP[providerKey];
  const brandColor = getProviderBrandColor(providerKey);

  if (iconData) {
    return (
      <svg
        role="img"
        viewBox="0 0 24 24"
        width={size}
        height={size}
        style={{ fill: brandColor, flexShrink: 0 }}
        aria-hidden
      >
        <path d={iconData.path} />
      </svg>
    );
  }

  // Brand-color dot fallback
  return (
    <span
      style={{
        display: 'inline-block',
        width: size,
        height: size,
        borderRadius: '50%',
        backgroundColor: brandColor,
        flexShrink: 0,
      }}
      aria-hidden
    />
  );
}

// ---------------------------------------------------------------------------
// Tier badge (unchanged — kept per spec)
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
// Thinking toggle — shown on model row when provider supportsEffort
// ---------------------------------------------------------------------------
interface ThinkingToggleProps {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
}

function ThinkingToggle({ enabled, onChange }: ThinkingToggleProps) {
  return (
    <button
      type="button"
      aria-label={enabled ? 'Disable thinking mode' : 'Enable thinking mode'}
      aria-pressed={enabled}
      title={`Thinking: ${enabled ? EFFORT_LABEL['medium'] : 'Off'}`}
      onClick={(e) => {
        e.stopPropagation();
        onChange(!enabled);
      }}
      className={cn(
        'flex shrink-0 items-center gap-0.5 rounded px-1 py-0.5',
        'text-[10px] font-medium transition-colors',
        'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--chat-accent-secondary)]',
        enabled
          ? 'bg-[var(--chat-accent-primary)]/15 text-[var(--chat-accent-primary)]'
          : 'text-[var(--chat-text-muted)] hover:bg-[var(--chat-surface-hover)] hover:text-[var(--chat-text-secondary)]',
      )}
    >
      <Brain size={8} />
      think
    </button>
  );
}

// ---------------------------------------------------------------------------
// "Best (auto)" header row — visually distinct synthetic option
// ---------------------------------------------------------------------------
interface BestAutoRowProps {
  isSelected: boolean;
  onSelect: () => void;
}

function BestAutoRow({ isSelected, onSelect }: BestAutoRowProps) {
  return (
    <Popover.Close asChild>
      <button
        type="button"
        onClick={onSelect}
        className={cn(
          'flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left transition-colors',
          'border border-transparent',
          isSelected
            ? 'border-[var(--chat-accent-primary)]/30 bg-[var(--chat-accent-primary)]/10 text-[var(--chat-accent-primary)]'
            : 'text-[var(--chat-text-primary)] hover:bg-[var(--chat-surface-hover)]',
        )}
      >
        {/* AGI Cloud logo */}
        <ProviderLogo providerKey="agi-cloud" size={16} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-semibold leading-tight">Best (auto)</span>
            <span
              className={cn(
                'shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide',
                isSelected
                  ? 'bg-[var(--chat-accent-primary)]/20 text-[var(--chat-accent-primary)]'
                  : 'bg-[var(--chat-surface-hover)] text-[var(--chat-text-muted)]',
              )}
            >
              auto
            </span>
          </div>
          <p className="mt-0.5 text-[10px] text-[var(--chat-text-muted)]">
            Routes to the best available model
          </p>
        </div>
        {isSelected && (
          <Check size={14} className="mt-0.5 shrink-0 text-[var(--chat-accent-primary)]" />
        )}
      </button>
    </Popover.Close>
  );
}

// ---------------------------------------------------------------------------
// ModelSelector props
// ---------------------------------------------------------------------------
export interface ModelSelectorProps {
  /** Called when the user clicks "Manage API Keys" at the bottom of the popover. */
  onSettingsClick?: () => void;
  className?: string;
  /** Current effort level for the thinking/reasoning toggle. */
  effort?: Effort | null;
  /** Called when the user toggles thinking on/off. ON = 'medium', OFF = null. */
  onEffortChange?: (effort: Effort | null) => void;
}

// ---------------------------------------------------------------------------
// Provider order — groups shown in this sequence
// ---------------------------------------------------------------------------
const PROVIDER_ORDER = [
  'anthropic',
  'openai',
  'google',
  'xai',
  'deepseek',
  'perplexity',
  'qwen',
  'moonshot',
  'zhipu',
  'ollama',
  'lmstudio',
  'custom-openai-compatible',
  'managed_cloud',
];

function providerSortKey(key: string): number {
  const idx = PROVIDER_ORDER.indexOf(key);
  return idx === -1 ? PROVIDER_ORDER.length : idx;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export function ModelSelector({
  onSettingsClick,
  className,
  effort,
  onEffortChange,
}: ModelSelectorProps) {
  const { models, selectedModelId, displayName, selectModel } = useModel();

  const usingFallback = models.length === 0;
  const displayModels = usingFallback ? CLOUD_FALLBACK_MODELS : models;

  // Track which provider groups are collapsed
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  // Separate out auto / managed_cloud models — "Best (auto)" lives in its own header section.
  // Everything else goes in provider groups.
  const autoModels = displayModels.filter(
    (m) => m.provider === 'managed_cloud' || m.id.startsWith('auto'),
  );
  const providerModels = displayModels.filter(
    (m) => m.provider !== 'managed_cloud' && !m.id.startsWith('auto'),
  );

  // Group by provider, sorted per PROVIDER_ORDER
  const grouped = providerModels.reduce<Record<string, ModelInfo[]>>((acc, m) => {
    const key = m.provider.toLowerCase();
    if (!acc[key]) acc[key] = [];
    acc[key]!.push(m);
    return acc;
  }, {});

  const sortedGroups = Object.entries(grouped).sort(([a], [b]) => {
    return providerSortKey(a) - providerSortKey(b);
  });

  // Determine the primary "Best (auto)" model ID to select
  const bestAutoId =
    autoModels.find((m) => m.id === 'auto')?.id ??
    autoModels.find((m) => m.id === 'auto-balanced')?.id ??
    autoModels[0]?.id;

  const isBestAutoSelected =
    selectedModelId === bestAutoId ||
    (autoModels.length > 0 && autoModels.some((m) => m.id === selectedModelId));

  // Effort toggle helper
  const handleThinkingToggle = (providerKey: string, isCurrentlyEnabled: boolean) => {
    if (onEffortChange) {
      onEffortChange(isCurrentlyEnabled ? null : 'medium');
    } else {
      // No-op when prop not provided (Phase 3 wiring pending)
      void providerKey;
    }
  };

  const toggleGroup = (key: string) => {
    setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));
  };

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
            'z-50 w-80 overflow-hidden rounded-xl shadow-lg',
            'border border-[var(--chat-border)] bg-[var(--chat-surface-elevated)]',
            'animate-in fade-in-0 zoom-in-95',
            'data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2',
          )}
        >
          {/* Provider count badge — surfaces differentiator */}
          <div className="flex items-center justify-between border-b border-[var(--chat-border)] px-3 py-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--chat-text-muted)]">
              Model
            </span>
            <span className="rounded-full bg-[var(--chat-accent-primary)]/10 px-2 py-0.5 text-[10px] font-semibold text-[var(--chat-accent-primary)]">
              13+ Providers
            </span>
          </div>

          {/* Scrollable model list */}
          <div className="max-h-80 overflow-y-auto p-1">
            {/* Best (auto) synthetic option at top */}
            {autoModels.length > 0 && bestAutoId && (
              <div className="mb-1">
                <BestAutoRow
                  isSelected={isBestAutoSelected}
                  onSelect={() => selectModel(bestAutoId)}
                />
                <div className="mx-2 my-1 border-t border-[var(--chat-border)]" />
              </div>
            )}

            {/* Provider groups */}
            {sortedGroups.map(([providerKey, provModels]) => {
              const label = getProviderLabel(providerKey);
              const isCollapsed = collapsed[providerKey] === true;
              const supportsEffort =
                PROVIDER_DISPLAY[providerKey as ProviderId]?.supportsEffort ?? false;

              return (
                <div key={providerKey} className="mb-0.5">
                  {/* Provider group header — collapsible */}
                  <button
                    type="button"
                    onClick={() => toggleGroup(providerKey)}
                    className="flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left transition-colors hover:bg-[var(--chat-surface-hover)]"
                  >
                    <ProviderLogo providerKey={providerKey} size={14} />
                    <p className="flex-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--chat-text-muted)]">
                      {label}
                    </p>
                    <ChevronRight
                      size={10}
                      className={cn(
                        'shrink-0 text-[var(--chat-text-muted)] transition-transform',
                        !isCollapsed && 'rotate-90',
                      )}
                    />
                  </button>

                  {/* Model rows — hidden when collapsed */}
                  {!isCollapsed &&
                    provModels.map((m) => {
                      const isSelected = m.id === selectedModelId;
                      const capability = getCapability(m);
                      const isThinkingEnabled = isSelected && effort != null;

                      return (
                        <div key={m.id} className="flex items-start gap-0">
                          <Popover.Close asChild>
                            <button
                              type="button"
                              onClick={() => selectModel(m.id)}
                              className={cn(
                                'flex min-w-0 flex-1 items-start gap-2 rounded-lg px-2 py-1.5 text-left transition-colors',
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
                                {/* Capability sub-label + tier badge + context */}
                                <div className="mt-0.5 flex flex-wrap items-center gap-1">
                                  <span
                                    className={cn(
                                      'text-[10px] font-medium',
                                      isSelected
                                        ? 'text-[var(--chat-accent-primary)]/80'
                                        : 'text-[var(--chat-text-muted)]',
                                    )}
                                  >
                                    {CAPABILITY_LABEL[capability]}
                                  </span>
                                  <span className="text-[var(--chat-text-muted)] text-[10px]">
                                    ·
                                  </span>
                                  <TierBadge tier={m.tier} />
                                  <span className="text-[10px] text-[var(--chat-text-muted)]">
                                    {formatContext(m.contextWindow)} ctx
                                  </span>
                                </div>
                              </div>

                              {/* Selected checkmark */}
                              {isSelected && !supportsEffort && (
                                <Check
                                  size={14}
                                  className="mt-0.5 shrink-0 text-[var(--chat-accent-primary)]"
                                />
                              )}
                            </button>
                          </Popover.Close>

                          {/* Thinking toggle — only for providers with supportsEffort, only on selected row */}
                          {isSelected && supportsEffort && (
                            <div className="flex shrink-0 items-center self-center pr-1">
                              <ThinkingToggle
                                enabled={isThinkingEnabled}
                                onChange={(enabled) => handleThinkingToggle(providerKey, !enabled)}
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
                </div>
              );
            })}
          </div>

          {/* Footer — manage API keys */}
          {onSettingsClick && !usingFallback && (
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
