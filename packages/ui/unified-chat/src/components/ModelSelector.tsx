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
import { AgiMark, useUiTranslation } from '@agiworkforce/ui';
import {
  siAnthropic,
  siGoogle,
  siDeepseek,
  siMinimax,
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
import { resolveClientChatExecutionMode } from '@agiworkforce/client-runtime';
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

interface IconData {
  path: string;
  hex: string;
}

const SIMPLE_ICON_MAP: Record<string, IconData | null> = {
  anthropic: siAnthropic,
  google: siGoogle,
  gemini: siGoogle,
  deepseek: siDeepseek,
  perplexity: siPerplexity,
  qwen: siQwen,
  ollama: siOllama,
  moonshot: siMoonshotai,
  minimax: siMinimax,
  openai: null,
  xai: null,
  zhipu: null,
  lmstudio: null,
  'custom-openai-compatible': null,
  'agi-cloud': null,
  managed_cloud: null,
};

function getProviderBrandColor(providerKey: string): string {
  const displayKey = providerKey as ProviderId;
  if (PROVIDER_DISPLAY[displayKey]) {
    return PROVIDER_DISPLAY[displayKey].brandColor;
  }
  const iconData = SIMPLE_ICON_MAP[providerKey];
  if (iconData) return `#${iconData.hex}`;
  return '#71717A';
}

function getProviderLabel(providerKey: string): string {
  const displayKey = providerKey as ProviderId;
  if (PROVIDER_DISPLAY[displayKey]) {
    return PROVIDER_DISPLAY[displayKey].label;
  }
  const fallback: Record<string, string> = {
    managed_cloud: 'AGI Cloud',
    mistral: 'Mistral AI',
    groq: 'Groq',
    nvidia_nim: 'NVIDIA NIM',
    open_router: 'OpenRouter',
  };
  return fallback[providerKey] ?? providerKey.charAt(0).toUpperCase() + providerKey.slice(1);
}

interface ProviderLogoProps {
  providerKey: string;
  size?: number;
}

function ProviderLogo({ providerKey, size = 16 }: ProviderLogoProps) {
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

interface TierBadgeProps {
  tier: ModelInfo['tier'];
  className?: string;
}

function TierBadge({ tier, className }: TierBadgeProps) {
  if (tier === 'fast') {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[12px] font-medium',
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
          'inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[12px] font-medium',
          'bg-[var(--chat-accent-primary)]/10 text-[var(--chat-accent-primary-text)]',
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
        'inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[12px] font-medium',
        'bg-[var(--chat-surface-hover)] text-[var(--chat-text-muted)]',
        className,
      )}
    >
      <Cpu size={9} />
      standard
    </span>
  );
}

function formatContext(tokens: number): string {
  if (tokens <= 0) return 'Unknown';
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(0)}M`;
  if (tokens >= 1_000) return `${Math.round(tokens / 1_000)}K`;
  return String(tokens);
}

interface ThinkingToggleProps {
  enabled: boolean;
  enabledEffort: Effort;
  onChange: (enabled: boolean) => void;
}

function ThinkingToggle({ enabled, enabledEffort, onChange }: ThinkingToggleProps) {
  const { t } = useUiTranslation('models');

  return (
    <button
      type="button"
      aria-label={
        enabled
          ? t('selector.disableThinking', 'Disable thinking mode')
          : t('selector.enableThinking', 'Enable thinking mode')
      }
      aria-pressed={enabled}
      title={t('selector.thinkingState', 'Thinking: {{state}}', {
        state: enabled ? EFFORT_LABEL[enabledEffort] : t('selector.thinkingOff', 'Off'),
      })}
      onClick={(e) => {
        e.stopPropagation();
        onChange(!enabled);
      }}
      className={cn(
        'flex shrink-0 items-center gap-0.5 rounded px-1 py-0.5',
        'text-[12px] font-medium transition-colors',
        'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--chat-accent-secondary)]',
        enabled
          ? 'bg-[var(--chat-accent-primary)]/10 text-[var(--chat-accent-primary-text)]'
          : 'text-[var(--chat-text-muted)] hover:bg-[var(--chat-surface-hover)] hover:text-[var(--chat-text-secondary)]',
      )}
    >
      <Brain size={8} />
      think
    </button>
  );
}

interface BestAutoRowProps {
  isSelected: boolean;
  onSelect: () => void;
  disabled?: boolean;
}

function BestAutoRow({ isSelected, onSelect, disabled = false }: BestAutoRowProps) {
  const { t } = useUiTranslation('models');
  const lastDecision = useModelStore(selectLastRoutingDecision);
  const routedModel = lastDecision?.wasRouted ? modelsById[lastDecision.routedModelId] : null;
  const taskLabel = lastDecision?.wasRouted
    ? (TASK_LABEL[lastDecision.taskType as keyof typeof TASK_LABEL] ?? lastDecision.taskType)
    : null;

  return (
    <Popover.Close asChild>
      <button
        type="button"
        disabled={disabled}
        onClick={onSelect}
        aria-pressed={isSelected}
        className={cn(
          'flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left transition-colors',
          'border border-transparent',
          disabled && 'cursor-not-allowed opacity-50',
          isSelected
            ? 'border-[var(--chat-accent-primary)]/30 bg-[var(--chat-accent-primary)]/10 text-[var(--chat-accent-primary-text)]'
            : 'text-[var(--chat-text-primary)] hover:bg-[var(--chat-surface-hover)]',
        )}
      >
        {/* AGI Cloud logo */}
        <ProviderLogo providerKey="agi-cloud" size={16} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-semibold leading-tight">
              {t('selector.bestAuto', 'Best (auto)')}
            </span>
            <span
              className={cn(
                'shrink-0 rounded px-1.5 py-0.5 text-[12px] font-semibold uppercase tracking-wide',
                isSelected
                  ? 'bg-[var(--chat-accent-primary)]/20 text-[var(--chat-accent-primary-text)]'
                  : 'bg-[var(--chat-surface-hover)] text-[var(--chat-text-muted)]',
              )}
            >
              auto
            </span>
          </div>
          {/* Routing decision badge, shown after first auto-routed message */}
          {isSelected && routedModel ? (
            <div className="mt-0.5 flex items-center gap-1">
              <Sparkles size={9} className="shrink-0 text-[var(--chat-accent-primary-text)]" />
              <span className="text-[12px] text-[var(--chat-accent-primary-text)]">
                {routedModel.name}
              </span>
              {taskLabel && (
                <span className="rounded bg-[var(--chat-accent-primary)]/10 px-1 py-px text-[12px] font-medium text-[var(--chat-accent-primary-text)]">
                  {taskLabel}
                </span>
              )}
            </div>
          ) : (
            <p className="mt-0.5 text-[12px] text-[var(--chat-text-muted)]">
              Routes to the best model for each task
            </p>
          )}
        </div>
        {isSelected && (
          <Check size={14} className="mt-0.5 shrink-0 text-[var(--chat-accent-primary-text)]" />
        )}
      </button>
    </Popover.Close>
  );
}

export interface ModelSelectorProps {
  onSettingsClick?: () => void;
  className?: string;
  allowFallbackModels?: boolean;
  effort?: Effort | null;
  onEffortChange?: (effort: Effort | null) => void;
  onProviderSwitchUpgradeRequired?: (info: {
    attemptedProvider: string;
    currentProvider: string;
    attemptedModelId: string;
  }) => void;
  disabled?: boolean;
}

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

export function ModelSelector({
  onSettingsClick,
  className,
  allowFallbackModels = true,
  effort,
  onEffortChange,
  onProviderSwitchUpgradeRequired,
  disabled = false,
}: ModelSelectorProps) {
  const { t } = useUiTranslation('models');
  const { models, selectedModelId, displayName, selectModel } = useModel();
  const modelCatalogStatus = useModelStore((state) => state.modelCatalogStatus);
  const modelCatalogError = useModelStore((state) => state.modelCatalogError);
  const hostBridge = useHostBridge();
  const activeConversation = useChatStore((state) =>
    state.conversations.find((conversation) => conversation.id === state.activeConversationId),
  );
  const executionMode: ChatExecutionMode =
    activeConversation?.executionMode ?? resolveClientChatExecutionMode();

  const usingFallback =
    allowFallbackModels &&
    modelCatalogStatus === 'ready' &&
    models.length === 0 &&
    executionMode === 'cloud_managed';
  const candidateModels = usingFallback ? CLOUD_FALLBACK_MODELS : models;
  const displayModels = useMemo(
    () => getModelsAdmittedForExecutionMode(candidateModels, executionMode),
    [candidateModels, executionMode],
  );
  const selectableModels = useMemo(
    () => displayModels.filter(isChatModelSelectable),
    [displayModels],
  );
  const catalogLoadingWithoutModels =
    modelCatalogStatus === 'loading' && displayModels.length === 0;
  const catalogErrorWithoutModels = modelCatalogStatus === 'error' && displayModels.length === 0;
  const previousConversationIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (modelCatalogStatus === 'loading') return;

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
            : executionMode === 'cloud_managed'
              ? (selectableModels[0]?.id ?? '')
              : '';

    if (nextModelId !== selectedModelId) {
      selectModel(nextModelId);
    }
  }, [
    activeConversation?.id,
    activeConversation?.model,
    selectModel,
    selectableModels,
    selectedModelId,
    modelCatalogStatus,
    executionMode,
  ]);

  const guardedSelectModel = (modelId: string) => {
    if (disabled) return;
    const target = displayModels.find((m) => m.id === modelId);
    if (!target || !isChatModelSelectable(target)) return;
    if (!onProviderSwitchUpgradeRequired) {
      selectModel(modelId);
      if (activeConversation?.id) {
        hostBridge?.setConversationModel?.(activeConversation.id, modelId);
      }
      return;
    }
    const tierState = useTierStore.getState();
    const gate = selectProviderSwitchGate(tierState, target.provider);
    if (gate === 'upgrade-required' && tierState.currentConversationProvider) {
      onProviderSwitchUpgradeRequired({
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

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const autoModels = displayModels.filter(
    (m) => m.provider === 'managed_cloud' || isAutoModeModelId(m.id),
  );
  const providerModels = displayModels.filter(
    (m) => m.provider !== 'managed_cloud' && !isAutoModeModelId(m.id),
  );

  const grouped = providerModels.reduce<Record<string, ModelInfo[]>>((acc, m) => {
    const key = m.provider.toLowerCase();
    if (!acc[key]) acc[key] = [];
    acc[key]!.push(m);
    return acc;
  }, {});

  const sortedGroups = Object.entries(grouped).sort(([a], [b]) => {
    return providerSortKey(a) - providerSortKey(b);
  });

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
          aria-label={t('selector.selectModel', 'Select model')}
          disabled={disabled}
          className={cn(
            'inline-flex items-center gap-1 rounded-lg px-2.5 py-1',
            'text-xs text-[var(--chat-text-secondary)] transition-colors duration-150',
            'hover:bg-[var(--chat-surface-hover)] hover:text-[var(--chat-text-primary)]',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-accent-secondary)]',
            'data-[state=open]:bg-[var(--chat-surface-hover)] data-[state=open]:text-[var(--chat-text-primary)]',
            disabled && 'cursor-not-allowed opacity-50',
            className,
          )}
        >
          <span className="max-w-[140px] truncate font-medium">
            {catalogLoadingWithoutModels
              ? t('selector.detectingModels', 'Detecting models…')
              : displayName}
          </span>
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
          )}
        >
          {/* Provider count badge, surfaces differentiator */}
          <div className="flex items-center justify-between border-b border-[var(--chat-border)] px-3 py-2">
            <span className="text-[12px] font-semibold uppercase tracking-wider text-[var(--chat-text-muted)]">
              {t('selector.model', 'Model')}
            </span>
            <span className="rounded-full bg-[var(--chat-accent-primary)]/10 px-2 py-0.5 text-[12px] font-semibold text-[var(--chat-accent-primary-text)]">
              {executionMode === 'local_only'
                ? t('selector.local', 'Local')
                : executionMode === 'byok'
                  ? 'BYOK'
                  : sortedGroups.length === 1
                    ? t('selector.providerCountOne', '{{count}} Provider', {
                        count: sortedGroups.length,
                      })
                    : t('selector.providerCountOther', '{{count}} Providers', {
                        count: sortedGroups.length,
                      })}
            </span>
          </div>

          {/* Scrollable model list */}
          <div className="max-h-80 overflow-y-auto p-1">
            {modelCatalogStatus === 'loading' && displayModels.length > 0 && (
              <div
                role="status"
                data-testid="model-catalog-refreshing"
                className="px-3 py-2 text-xs text-[var(--chat-text-muted)]"
              >
                {executionMode === 'local_only'
                  ? t('selector.refreshingLocalModels', 'Refreshing local models…')
                  : t('selector.refreshingModels', 'Refreshing available models…')}
              </div>
            )}

            {catalogLoadingWithoutModels && (
              <div
                role="status"
                data-testid="model-catalog-loading"
                className="px-3 py-4 text-sm text-[var(--chat-text-secondary)]"
              >
                <div className="font-medium text-[var(--chat-text-primary)]">
                  {executionMode === 'local_only'
                    ? t('selector.detectingLocalModels', 'Looking for available local models…')
                    : t('selector.detectingAvailableModels', 'Loading available models…')}
                </div>
                <p className="mt-1 text-xs leading-relaxed text-[var(--chat-text-muted)]">
                  {executionMode === 'local_only'
                    ? t(
                        'selector.detectingLocalModelsHint',
                        'Checking the local runtimes configured on this device.',
                      )
                    : t('selector.detectingModelsHint', 'Verifying models for this session.')}
                </p>
              </div>
            )}

            {catalogErrorWithoutModels && (
              <div
                role="alert"
                data-testid="model-catalog-failed"
                className="px-3 py-4 text-sm text-[var(--chat-text-secondary)]"
              >
                <div className="font-medium text-[var(--chat-text-primary)]">
                  {executionMode === 'local_only'
                    ? t('selector.localCatalogFailed', 'Local models could not be refreshed')
                    : t('selector.catalogFailed', 'Models could not be refreshed')}
                </div>
                <p className="mt-1 text-xs leading-relaxed text-[var(--chat-text-muted)]">
                  {modelCatalogError ??
                    t('selector.catalogFailedHint', 'Check the runtime connection and try again.')}
                </p>
                {onSettingsClick && executionMode !== 'cloud_managed' && (
                  <Popover.Close asChild>
                    <button
                      type="button"
                      onClick={onSettingsClick}
                      className="mt-3 rounded-lg border border-[var(--chat-border)] px-3 py-1.5 text-xs font-medium text-[var(--chat-text-primary)] transition-colors hover:bg-[var(--chat-surface-hover)]"
                    >
                      {executionMode === 'local_only'
                        ? t('selector.openLocalModelSettings', 'Open local model settings')
                        : t('selector.configureByok', 'Configure a provider key')}
                    </button>
                  </Popover.Close>
                )}
              </div>
            )}

            {displayModels.length === 0 &&
              modelCatalogStatus !== 'loading' &&
              modelCatalogStatus !== 'error' && (
                <div className="px-3 py-4 text-sm text-[var(--chat-text-secondary)]">
                  <div className="font-medium text-[var(--chat-text-primary)]">
                    {executionMode === 'local_only'
                      ? t('selector.noLocalModels', 'No local models detected')
                      : executionMode === 'byok'
                        ? t('selector.noByokModels', 'No BYOK models configured')
                        : t('selector.noManagedModels', 'No managed models available')}
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-[var(--chat-text-muted)]">
                    {executionMode === 'local_only'
                      ? t(
                          'selector.noLocalModelsHint',
                          'Start a local runtime and download a model.',
                        )
                      : executionMode === 'byok'
                        ? t('selector.noByokModelsHint', 'Add a provider API key in Models & Keys.')
                        : t(
                            'selector.noManagedModelsHint',
                            'Managed model capacity is currently unavailable.',
                          )}
                  </p>
                  {onSettingsClick && (
                    <Popover.Close asChild>
                      <button
                        type="button"
                        onClick={onSettingsClick}
                        aria-label={
                          executionMode === 'local_only'
                            ? t('selector.setUpLocalModel', 'Set up a local model')
                            : executionMode === 'byok'
                              ? t('selector.configureByok', 'Configure a provider key')
                              : t('selector.openModelsAndKeys', 'Open Models & Keys')
                        }
                        className="mt-3 rounded-lg border border-[var(--chat-border)] px-3 py-1.5 text-xs font-medium text-[var(--chat-text-primary)] transition-colors hover:bg-[var(--chat-surface-hover)]"
                      >
                        {executionMode === 'local_only'
                          ? t('selector.setUpLocalModel', 'Set up a local model')
                          : executionMode === 'byok'
                            ? t('selector.configureByok', 'Configure a provider key')
                            : t('selector.openModelsAndKeys', 'Open Models & Keys')}
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
                  disabled={disabled}
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
                  {/* Provider group header, collapsible */}
                  <button
                    type="button"
                    onClick={() => toggleGroup(providerKey)}
                    aria-expanded={!isCollapsed}
                    className="flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left transition-colors hover:bg-[var(--chat-surface-hover)]"
                  >
                    <ProviderLogo providerKey={providerKey} size={14} />
                    <p className="flex-1 text-[12px] font-semibold uppercase tracking-wider text-[var(--chat-text-muted)]">
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

                  {/* Model rows, hidden when collapsed */}
                  {!isCollapsed &&
                    provModels.map((m) => {
                      const isSelected = m.id === selectedModelId;
                      const isSelectable = isChatModelSelectable(m);
                      const hasCatalogQuality =
                        MODEL_CAPABILITY[m.id] !== undefined || isAutoModeModelId(m.id);
                      const capability = hasCatalogQuality ? getCapability(m) : null;
                      const runtimeCapabilityLabel =
                        m.metadataSource === 'runtime'
                          ? [
                              m.supportsVision ? t('selector.visionCapability', 'Vision') : null,
                              m.supportsTools
                                ? t('selector.functionToolsCapability', 'Function tools')
                                : null,
                              m.supportsThinking
                                ? t('selector.thinkingCapability', 'Thinking')
                                : null,
                            ]
                              .filter((label): label is string => Boolean(label))
                              .join(' · ') ||
                            t('selector.runtimeMetadataOnly', 'Runtime-reported model')
                          : t('selector.capabilitiesUnverified', 'Capabilities unverified');
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
                              disabled={disabled || !isSelectable}
                              onClick={() => guardedSelectModel(m.id)}
                              aria-pressed={isSelected}
                              title={!isSelectable ? m.unavailableReason : undefined}
                              className={cn(
                                'flex min-w-0 flex-1 items-start gap-2 rounded-lg px-2 py-1.5 text-left transition-colors',
                                !isSelectable
                                  ? 'cursor-not-allowed opacity-50'
                                  : isSelected
                                    ? 'bg-[var(--chat-accent-primary)]/10 text-[var(--chat-accent-primary-text)]'
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
                                    <span className="shrink-0 rounded px-1 py-0.5 text-[12px] font-semibold uppercase tracking-wide bg-[var(--chat-info)]/15 text-[var(--chat-info)]">
                                      local
                                    </span>
                                  )}
                                  {!isSelectable && (
                                    <span className="shrink-0 rounded px-1 py-0.5 text-[12px] font-semibold uppercase tracking-wide bg-[var(--chat-warning-bg)] text-[var(--chat-warning-fg)]">
                                      {m.availability === 'coming_soon'
                                        ? t('selector.comingSoon', 'Coming soon')
                                        : t('selector.unavailable', 'Unavailable')}
                                    </span>
                                  )}
                                </div>
                                {/* Verified capability/quality metadata + context */}
                                <div className="mt-0.5 flex flex-wrap items-center gap-1">
                                  <span
                                    className={cn(
                                      'text-[12px] font-medium',
                                      isSelected
                                        ? 'text-[var(--chat-accent-primary-text)]'
                                        : 'text-[var(--chat-text-muted)]',
                                    )}
                                  >
                                    {capability
                                      ? CAPABILITY_LABEL[capability]
                                      : runtimeCapabilityLabel}
                                  </span>
                                  {capability && (
                                    <>
                                      <span className="text-[var(--chat-text-muted)] text-[12px]">
                                        ·
                                      </span>
                                      <TierBadge tier={m.tier} />
                                    </>
                                  )}
                                  <span className="text-[12px] text-[var(--chat-text-muted)]">
                                    {formatContext(m.contextWindow)} ctx
                                  </span>
                                </div>
                              </div>

                              {/* Selected checkmark */}
                              {isSelected && !showThinkingToggle && (
                                <Check
                                  size={14}
                                  className="mt-0.5 shrink-0 text-[var(--chat-accent-primary-text)]"
                                />
                              )}
                            </button>
                          </Popover.Close>

                          {isSelected && reasoningIsMandatory && (
                            <span className="self-center pr-1 text-[12px] font-semibold uppercase tracking-wide text-[var(--chat-accent-primary-text)]">
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

          {/* Footer, manage API keys */}
          {onSettingsClick && !usingFallback && displayModels.length > 0 && (
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
                  <span>
                    {executionMode === 'local_only'
                      ? t('selector.manageLocalModels', 'Manage local models')
                      : t('selector.manageApiKeys', 'Manage API Keys')}
                  </span>
                </button>
              </Popover.Close>
            </div>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
