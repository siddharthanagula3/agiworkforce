import { useEffect, useMemo, useRef, useState } from 'react';
import * as Popover from '@radix-ui/react-popover';
import {
  Check,
  ChevronDown,
  ChevronRight,
  Settings,
  Zap,
  Star,
  Cpu,
  Brain,
  Sparkles,
} from 'lucide-react';
import { AgiMark } from '@agiworkforce/ui';
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
  getModelReasoning,
  getModelEffortOptions,
  getAutoRoutingProfiles,
  isAutoModeModelId,
  modelsById,
  type ProviderId,
  type CapabilityTier,
  type Effort,
  type ChatExecutionMode,
  type ModelQualityTier,
  type ModelReasoning,
} from '@agiworkforce/types';
import { cn } from '../lib/utils';
import { useModel } from '../hooks/useModel';
import {
  CLOUD_FALLBACK_MODELS,
  useModelStore,
  selectLastRoutingDecision,
} from '../stores/modelStore';
import { useTierStore, selectProviderSwitchGate } from '../stores/tierStore';
import { useChatStore } from '../stores/chatStore';
import { useHostBridge } from '../lib/hostBridge';
import type { ModelInfo } from '../lib/types';
import { TASK_LABEL } from '../lib/promptClassifier';
import { getModelsAdmittedForExecutionMode } from '../lib/modelAdmission';
import { isChatModelSelectable } from '../lib/modelInfo';

// ---------------------------------------------------------------------------
// Capability tier map — derived from models.json qualityTier (single source
// of truth per memory/rule-models-json.md). 'fast' -> 'fastest',
// 'balanced' -> 'balanced', 'best' -> 'most-capable'. Stale hand-typed IDs
// are dropped automatically; new entries in models.json appear without code
// edits.
// ---------------------------------------------------------------------------
function qualityTierToCapability(tier: ModelQualityTier | undefined): CapabilityTier {
  switch (tier) {
    case 'fast':
      return 'fastest';
    case 'best':
      return 'most-capable';
    case 'balanced':
      return 'balanced';
    default:
      return 'balanced';
  }
}

const MODEL_CAPABILITY: Record<string, CapabilityTier> = Object.fromEntries(
  Object.entries(modelsById).map(([id, model]) => [id, qualityTierToCapability(model.qualityTier)]),
);

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
    nvidia_nim: 'NVIDIA NIM',
    open_router: 'OpenRouter',
  };
  return fallback[providerKey] ?? providerKey.charAt(0).toUpperCase() + providerKey.slice(1);
}

function readPersistedDesktopMode(): 'local' | 'cloud' | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem('app-mode-store');
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { state?: { mode?: unknown } };
    return parsed.state?.mode === 'local' || parsed.state?.mode === 'cloud'
      ? parsed.state.mode
      : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Provider logo — SVG inline or brand-color dot
// ---------------------------------------------------------------------------
interface ProviderLogoProps {
  providerKey: string;
  size?: number;
}

function ProviderLogo({ providerKey, size = 16 }: ProviderLogoProps) {
  // AGI's own routed-auto provider gets the brand mark, not a generic dot —
  // matches web's ProviderLogo() convention for the same `managed_cloud` case.
  if (providerKey === 'agi-cloud' || providerKey === 'managed_cloud') {
    return <AgiMark size={size} mono />;
  }

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
  if (tokens <= 0) return 'Unknown';
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(0)}M`;
  if (tokens >= 1_000) return `${Math.round(tokens / 1_000)}K`;
  return String(tokens);
}

// ---------------------------------------------------------------------------
// Thinking toggle — shown only when the selected model allows reasoning off/on
// ---------------------------------------------------------------------------
interface ThinkingToggleProps {
  enabled: boolean;
  enabledEffort: Effort;
  onChange: (enabled: boolean) => void;
}

function ThinkingToggle({ enabled, enabledEffort, onChange }: ThinkingToggleProps) {
  return (
    <button
      type="button"
      aria-label={enabled ? 'Disable thinking mode' : 'Enable thinking mode'}
      aria-pressed={enabled}
      title={`Thinking: ${enabled ? EFFORT_LABEL[enabledEffort] : 'Off'}`}
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
  const lastDecision = useModelStore(selectLastRoutingDecision);
  const routedModel = lastDecision?.wasRouted ? modelsById[lastDecision.routedModelId] : null;
  const taskLabel = lastDecision?.wasRouted
    ? (TASK_LABEL[lastDecision.taskType as keyof typeof TASK_LABEL] ?? lastDecision.taskType)
    : null;

  return (
    <Popover.Close asChild>
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={isSelected}
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
          {/* Routing decision badge — shown after first auto-routed message */}
          {isSelected && routedModel ? (
            <div className="mt-0.5 flex items-center gap-1">
              <Sparkles size={9} className="shrink-0 text-[var(--chat-accent-primary)]/60" />
              <span className="text-[10px] text-[var(--chat-accent-primary)]/80">
                {routedModel.name}
              </span>
              {taskLabel && (
                <span className="rounded bg-[var(--chat-accent-primary)]/10 px-1 py-px text-[9px] font-medium text-[var(--chat-accent-primary)]/70">
                  {taskLabel}
                </span>
              )}
            </div>
          ) : (
            <p className="mt-0.5 text-[10px] text-[var(--chat-text-muted)]">
              Routes to the best model for each task
            </p>
          )}
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
  /** When false, an empty host model list shows setup messaging instead of cloud fallback models. */
  allowFallbackModels?: boolean;
  /** Current effort level for the thinking/reasoning toggle. */
  effort?: Effort | null;
  /** Called when the user toggles thinking on/off. ON = 'medium', OFF = null. */
  onEffortChange?: (effort: Effort | null) => void;
  /**
   * Called when a non-Pro+ user attempts to switch to a model from a
   * different provider mid-thread. Receives the attempted provider id and
   * the conversation's current provider. The host typically opens billing
   * or shows ProPlusUpgradePrompt. When omitted, the gate falls open
   * (back-compat — host hasn't wired Pro+ gating yet).
   */
  onProPlusRequired?: (info: {
    attemptedProvider: string;
    currentProvider: string;
    attemptedModelId: string;
  }) => void;
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

const REQUEST_EFFORTS = new Set<Effort>([
  'none',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
]);

function defaultEffortFor(reasoning: ModelReasoning): Effort {
  const candidate = reasoning.defaultEffort;
  return candidate && REQUEST_EFFORTS.has(candidate as Effort) ? (candidate as Effort) : 'medium';
}

function canToggleReasoning(reasoning: ModelReasoning): boolean {
  return (
    reasoning.capable && reasoning.control !== 'none' && reasoning.canDisableThinking !== false
  );
}

function requiresReasoning(reasoning: ModelReasoning): boolean {
  return (
    reasoning.capable && reasoning.control !== 'none' && reasoning.canDisableThinking === false
  );
}

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
  allowFallbackModels = true,
  effort,
  onEffortChange,
  onProPlusRequired,
}: ModelSelectorProps) {
  const { models, selectedModelId, displayName, selectModel } = useModel();
  const hostBridge = useHostBridge();
  const activeConversation = useChatStore((state) =>
    state.conversations.find((conversation) => conversation.id === state.activeConversationId),
  );
  const persistedDesktopMode = readPersistedDesktopMode();
  const executionMode: ChatExecutionMode =
    activeConversation?.executionMode ??
    (persistedDesktopMode === 'local' ? 'local_only' : 'cloud_managed');

  const usingFallback =
    allowFallbackModels && models.length === 0 && executionMode === 'cloud_managed';
  const candidateModels = usingFallback ? CLOUD_FALLBACK_MODELS : models;
  const displayModels = useMemo(
    () => getModelsAdmittedForExecutionMode(candidateModels, executionMode),
    [candidateModels, executionMode],
  );
  const selectableModels = useMemo(
    () => displayModels.filter(isChatModelSelectable),
    [displayModels],
  );
  const previousConversationIdRef = useRef<string | null>(null);

  useEffect(() => {
    const conversationId = activeConversation?.id ?? null;
    const conversationChanged = previousConversationIdRef.current !== conversationId;
    previousConversationIdRef.current = conversationId;

    const currentIsAdmitted = selectableModels.some((model) => model.id === selectedModelId);
    const preferredModelId = activeConversation?.model;
    const preferredIsAdmitted =
      Boolean(preferredModelId) && selectableModels.some((model) => model.id === preferredModelId);

    const nextModelId =
      conversationChanged && preferredIsAdmitted
        ? preferredModelId!
        : currentIsAdmitted
          ? selectedModelId
          : preferredIsAdmitted
            ? preferredModelId!
            : (selectableModels[0]?.id ?? '');

    if (nextModelId !== selectedModelId) {
      selectModel(nextModelId);
    }
  }, [
    activeConversation?.id,
    activeConversation?.model,
    selectModel,
    selectableModels,
    selectedModelId,
  ]);

  // Pro+ gate — when a non-Pro+ user picks a model from a different provider
  // than the conversation's current provider, fire onProPlusRequired instead
  // of switching. The conversation's provider is set by the host once the
  // first message is sent (see tierStore.setCurrentConversationProvider).
  const guardedSelectModel = (modelId: string) => {
    const target = displayModels.find((m) => m.id === modelId);
    if (!target || !isChatModelSelectable(target)) return;
    if (!onProPlusRequired) {
      selectModel(modelId);
      if (activeConversation?.id) {
        hostBridge?.setConversationModel?.(activeConversation.id, modelId);
      }
      return;
    }
    const tierState = useTierStore.getState();
    const gate = selectProviderSwitchGate(tierState, target.provider);
    if (gate === 'upgrade-required' && tierState.currentConversationProvider) {
      onProPlusRequired({
        attemptedProvider: target.provider,
        currentProvider: tierState.currentConversationProvider,
        attemptedModelId: modelId,
      });
      return;
    }
    selectModel(modelId);
    if (activeConversation?.id) {
      hostBridge?.setConversationModel?.(activeConversation.id, modelId);
    }
  };

  // Track which provider groups are collapsed
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  // Separate out auto / managed_cloud models — "Best (auto)" lives in its own header section.
  // Everything else goes in provider groups.
  //
  // AUDIT-FIX CMP-21: the partition used `m.id.startsWith('auto')`, a string
  // prefix that both over-matches (any future model id beginning "auto") and
  // under-matches (an Auto alias the catalog names differently). The catalog
  // exposes the authoritative predicate.
  const autoModels = displayModels.filter(
    (m) => m.provider === 'managed_cloud' || isAutoModeModelId(m.id),
  );
  const providerModels = displayModels.filter(
    (m) => m.provider !== 'managed_cloud' && !isAutoModeModelId(m.id),
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

  // Determine the primary "Best (auto)" model ID to select.
  //
  // AUDIT-FIX CMP-21: this hardcoded 'auto' then fell back to 'auto-balanced' —
  // an alias the catalog marks `selectable: false` in routing-policies.json, so
  // the fallback could name a profile the catalog deliberately excludes from
  // pickers. `getAutoRoutingProfiles()` returns exactly the selectable profiles
  // in catalog order, so the preferred id and its fallbacks all come from the
  // registry (repo rule: model IDs come from the catalog, never from code).
  const selectableAutoProfileIds = getAutoRoutingProfiles().map((profile) => profile.id);
  const bestAutoId =
    selectableAutoProfileIds.map((id) => autoModels.find((m) => m.id === id)?.id).find(Boolean) ??
    autoModels[0]?.id;

  const isBestAutoSelected =
    selectedModelId === bestAutoId ||
    (autoModels.length > 0 && autoModels.some((m) => m.id === selectedModelId));

  const selectedReasoning = getModelReasoning(selectedModelId);
  const selectedRequiresReasoning = requiresReasoning(selectedReasoning);

  useEffect(() => {
    if (selectedRequiresReasoning && effort == null && onEffortChange) {
      onEffortChange(defaultEffortFor(selectedReasoning));
    }
  }, [effort, onEffortChange, selectedReasoning, selectedRequiresReasoning]);

  // Enabling uses this model's catalog default rather than a provider-wide
  // hardcoded value (for example, current Claude models default to high).
  const handleThinkingToggle = (enabled: boolean, reasoning: ModelReasoning) => {
    onEffortChange?.(enabled ? defaultEffortFor(reasoning) : null);
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
              {executionMode === 'local_only'
                ? 'Local'
                : executionMode === 'byok'
                  ? 'BYOK'
                  : `${sortedGroups.length} ${sortedGroups.length === 1 ? 'Provider' : 'Providers'}`}
            </span>
          </div>

          {/* Scrollable model list */}
          <div className="max-h-80 overflow-y-auto p-1">
            {displayModels.length === 0 && (
              <div className="px-3 py-4 text-sm text-[var(--chat-text-secondary)]">
                <div className="font-medium text-[var(--chat-text-primary)]">
                  {executionMode === 'local_only'
                    ? 'No local models detected'
                    : executionMode === 'byok'
                      ? 'No BYOK models configured'
                      : 'No managed models available'}
                </div>
                <p className="mt-1 text-xs leading-relaxed text-[var(--chat-text-muted)]">
                  {executionMode === 'local_only'
                    ? 'Start a local runtime and download a model.'
                    : executionMode === 'byok'
                      ? 'Add a provider API key in Models & Keys.'
                      : 'Managed model capacity is currently unavailable.'}
                </p>
                {onSettingsClick && (
                  <Popover.Close asChild>
                    <button
                      type="button"
                      onClick={onSettingsClick}
                      className="mt-3 rounded-lg border border-[var(--chat-border)] px-3 py-1.5 text-xs font-medium text-[var(--chat-text-primary)] transition-colors hover:bg-[var(--chat-surface-hover)]"
                    >
                      Open Models & Keys
                    </button>
                  </Popover.Close>
                )}
              </div>
            )}

            {/* Best (auto) synthetic option at top */}
            {autoModels.length > 0 && bestAutoId && (
              <div className="mb-1">
                <BestAutoRow
                  isSelected={isBestAutoSelected}
                  onSelect={() => guardedSelectModel(bestAutoId)}
                />
                <div className="mx-2 my-1 border-t border-[var(--chat-border)]" />
              </div>
            )}

            {/* Provider groups */}
            {sortedGroups.map(([providerKey, provModels]) => {
              const label = getProviderLabel(providerKey);
              const isCollapsed = collapsed[providerKey] === true;

              return (
                <div key={providerKey} className="mb-0.5">
                  {/* Provider group header — collapsible */}
                  <button
                    type="button"
                    onClick={() => toggleGroup(providerKey)}
                    aria-expanded={!isCollapsed}
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
                      const isSelectable = isChatModelSelectable(m);
                      const capability = getCapability(m);
                      const isThinkingEnabled = isSelected && effort != null;
                      const reasoning = getModelReasoning(m.id);
                      const showThinkingToggle =
                        isSelected &&
                        canToggleReasoning(reasoning) &&
                        getModelEffortOptions(m.id).length > 0 &&
                        Boolean(onEffortChange);
                      const reasoningIsMandatory = requiresReasoning(reasoning);

                      return (
                        <div key={m.id} className="flex items-start gap-0">
                          <Popover.Close asChild>
                            <button
                              type="button"
                              disabled={!isSelectable}
                              onClick={() => guardedSelectModel(m.id)}
                              aria-pressed={isSelected}
                              title={!isSelectable ? m.unavailableReason : undefined}
                              className={cn(
                                'flex min-w-0 flex-1 items-start gap-2 rounded-lg px-2 py-1.5 text-left transition-colors',
                                !isSelectable
                                  ? 'cursor-not-allowed opacity-50'
                                  : isSelected
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
                                  {!isSelectable && (
                                    <span className="shrink-0 rounded px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide bg-[var(--chat-warning-bg)] text-[var(--chat-warning-fg)]">
                                      {m.availability === 'coming_soon'
                                        ? 'Coming soon'
                                        : 'Unavailable'}
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
                              {isSelected && !showThinkingToggle && (
                                <Check
                                  size={14}
                                  className="mt-0.5 shrink-0 text-[var(--chat-accent-primary)]"
                                />
                              )}
                            </button>
                          </Popover.Close>

                          {isSelected && reasoningIsMandatory && (
                            <span className="self-center pr-1 text-[9px] font-semibold uppercase tracking-wide text-[var(--chat-accent-primary)]">
                              always
                            </span>
                          )}

                          {/* Thinking toggle follows this model's reasoning contract. */}
                          {showThinkingToggle && (
                            <div className="flex shrink-0 items-center self-center pr-1">
                              <ThinkingToggle
                                enabled={isThinkingEnabled}
                                enabledEffort={effort ?? defaultEffortFor(reasoning)}
                                onChange={(enabled) => handleThinkingToggle(enabled, reasoning)}
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
