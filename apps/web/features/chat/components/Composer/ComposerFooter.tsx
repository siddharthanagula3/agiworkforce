'use client';

import { useCallback, useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, Check } from 'lucide-react';
import { Popover, PopoverTrigger, PopoverContent } from '@agiworkforce/ui';
import { useModelStore, AVAILABLE_MODELS, type AIModel } from '@shared/stores/model-store';
import { BudgetTrackerDisplay } from '@/features/chat/components/Budget/BudgetTrackerDisplay';
import { StyleSelector } from './StyleSelector';
import { Switch } from '@agiworkforce/ui';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@agiworkforce/ui';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@agiworkforce/ui';
import { assessModelSwitchCache } from '@agiworkforce/routing';
import { useChatStore } from '@shared/stores/web-chat-store';
import {
  EFFORT_LABEL,
  PROVIDER_DISPLAY,
  type Effort,
  type ProviderId,
  getPickerModelTier,
  evaluateModelEnvironment,
  type ModelEnvironment,
  type EnvironmentAvailability,
} from '@agiworkforce/types';
import { useBillingStore } from '@shared/stores/web-auth-store';
import {
  getAllowedAutoModesForTier,
  getBestAutoModeForTier,
  getModelReasoning,
  isModelAllowedForTier,
} from '@shared/config/llm';
import type { ModelReasoning } from '@agiworkforce/types';
import { FREE_TRIAL_MODELS } from '@/lib/free-trial-config';
import { ProviderMark, hasProviderMark } from '@shared/components/ProviderMark';
import { AgiMark } from '@shared/components/agi/AgiMark';
import { useThinkingStore } from '@shared/stores/thinking-store';

/**
 * Returns a human-readable daily usage label for free-tier users.
 * null when there is nothing worth showing (paid tier, no limit set, or
 * usage is comfortably low).
 */
function useDailyUsageLabel(): string | null {
  const tier = useBillingStore((s) => s.subscription?.tier ?? 'free');
  const dailyUsage_cents = useBillingStore((s) => s.dailyUsage_cents);
  const dailyLimit_cents = useBillingStore((s) => s.dailyLimit_cents);

  if (tier !== 'free') return null;
  if (!dailyLimit_cents || dailyLimit_cents <= 0) return null;

  const pct = dailyUsage_cents / dailyLimit_cents;
  if (pct < 0.8) return null;

  const remainingCents = Math.max(0, dailyLimit_cents - dailyUsage_cents);
  if (remainingCents <= 0) return 'Daily limit reached';

  // Approximate remaining messages assuming ~$0.01 average cost per message
  const approxMessages = Math.floor(remainingCents / 1);
  if (approxMessages <= 5) {
    return `~${approxMessages} message${approxMessages !== 1 ? 's' : ''} left today`;
  }
  return 'Approaching daily limit';
}

/**
 * Map a model-store providerKey (from models.json) to a ProviderId
 * as defined in PROVIDER_DISPLAY. Most keys are 1:1; managed_cloud
 * maps to agi-cloud.
 */
function toProviderId(providerKey: string): ProviderId | null {
  if (providerKey === 'managed_cloud') return 'agi-cloud';
  if (providerKey in PROVIDER_DISPLAY) return providerKey as ProviderId;
  return null;
}

/** Returns the /providers/<id>.svg URL or null when provider is unknown. */
function providerLogoUrl(providerKey: string): string | null {
  const id = toProviderId(providerKey);
  if (!id) return null;
  return `/providers/${id}.svg`;
}

/** Returns the brand hex color for a provider key. */
function providerBrandHex(providerKey: string): string {
  const id = toProviderId(providerKey);
  return id ? (PROVIDER_DISPLAY[id].brandColor ?? '#71717A') : '#71717A';
}

// ---------------------------------------------------------------------------
// Reasoning / effort capability (per-model, driven by models.json `reasoning`).
//
// The flyout is rendered off `model.reasoning.control` + `supportedEfforts` so
// each model shows ONLY the effort chips it actually accepts — fixing the prior
// "xhigh/max shown (and disabled) for every model" behaviour. See
// docs/research/reasoning-effort-capability-matrix-2026-07-10.md (UI adaptation).
// ---------------------------------------------------------------------------

/** The per-model reasoning block (absent ⇒ non-reasoning `none`). */
function reasoningFor(model: AIModel): ModelReasoning {
  return getModelReasoning(model.id);
}

/** Whether this model exposes any reasoning/effort control at all. */
function modelSupportsThinking(model: AIModel): boolean {
  const r = reasoningFor(model);
  return r.capable && r.control !== 'none';
}

/** Effort chip labels — extended to cover the provider vocab (`none`, `minimal`). */
const EFFORT_CHIP_LABEL: Record<string, string> = {
  none: 'None',
  minimal: 'Minimal',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  xhigh: 'xHigh',
  max: 'Max',
};

const EFFORT_CHIP_DESCRIPTION: Record<string, string> = {
  none: 'No reasoning — fastest, lowest token use',
  minimal: 'Minimal reasoning',
  low: 'Fastest, lowest token use',
  medium: 'Balanced default for daily work',
  high: 'More thorough for complex work',
  xhigh: 'Extra-high for long-horizon work',
  max: 'Most capable, highest token use',
};

/**
 * The effort chips to render for a model. `effort_levels`/`always_on` use the
 * model's exact `supportedEfforts`; `thinking_budget` maps low/medium/high chips
 * to budget presets when no explicit set is declared. `thinking_toggle` without a
 * set renders no chips (the on/off switch is the whole control).
 */
function effortChipsFor(r: ModelReasoning): string[] {
  const base =
    r.control === 'thinking_budget'
      ? r.supportedEfforts && r.supportedEfforts.length > 0
        ? r.supportedEfforts
        : ['low', 'medium', 'high']
      : (r.supportedEfforts ?? []);
  // The UI store's Effort vocab (low|medium|high|xhigh|max) cannot represent
  // `minimal`, so `minimal` maps to `low` (chipToStoreEffort). When a model's set
  // has BOTH, drop `minimal` to avoid two chips resolving to the same store value
  // (which would double-highlight and make clicking `minimal` light up `low`). The
  // request path treats them equivalently (non-union effort values are dropped to
  // the provider default). No catalog model has `minimal` without `low`.
  return base.includes('minimal') && base.includes('low')
    ? base.filter((e) => e !== 'minimal')
    : base;
}

/** Whether the flyout should show a separate on/off switch (vs a `none` chip). */
function showsThinkingSwitch(r: ModelReasoning): boolean {
  if (r.control === 'none' || r.control === 'always_on') return false;
  // effort_levels with a `none` chip encodes off in the chip row itself.
  if (r.control === 'effort_levels' && (r.supportedEfforts ?? []).includes('none')) return false;
  return r.canDisableThinking ?? true;
}

/** Map a display chip to the thinking-store effort (or 'off'). */
function chipToStoreEffort(chip: string): Effort | 'off' {
  if (chip === 'none') return 'off';
  if (chip === 'minimal') return 'low'; // closest representable; request path drops non-union values
  return chip as Effort;
}

/** The model's default effort as a store value. */
function defaultStoreEffort(r: ModelReasoning): Effort {
  const mapped = r.defaultEffort ? chipToStoreEffort(r.defaultEffort) : 'medium';
  return mapped === 'off' ? 'medium' : mapped;
}

function isModelSelectableForTier(model: AIModel, tier: string): boolean {
  // Free users may select any of the cost-efficient tool-capable trial models
  // (so they can experience the tool-calling UI); the 3-prompt cap covers the set.
  if (FREE_TRIAL_MODELS.includes(model.id)) return true;
  if (model.providerKey === 'managed_cloud') {
    return getAllowedAutoModesForTier(tier).includes(model.id);
  }
  if (tier === 'free' || tier === 'hobby') return false;
  return isModelAllowedForTier(model.id, tier);
}

// ---------------------------------------------------------------------------
// Environment gating (Phase A — Phase B replaces environmentAvailability with
// the real managed-compute-beta signal once the E2B client is wired in).
// ---------------------------------------------------------------------------

/**
 * Return the current availability of a model's required execution environment.
 *
 * PHASE A: returns { configured: false } for every environment, locking all
 * env-gated models until Phase B wires the real managed-compute-beta signal.
 * No current model sets requiresEnvironment, so this never triggers today.
 *
 * PHASE B: replace the body with a hook/context read that checks whether the
 * managed-compute beta is enabled for the current user and whether E2B is
 * currently reachable, then return { configured: true, available: <ping> }.
 */
function environmentAvailability(_env: ModelEnvironment): EnvironmentAvailability {
  // Phase A: all environments are unconfigured — env-gated models stay locked.
  return { configured: false };
}

/**
 * Combined lock decision: tier gate first, then environment gate.
 *
 * Keeping these two separate signals in one function means every call-site
 * (search branch, partition, "More models" inline, reset effect) routes through
 * the same logic — no gating leak is possible from a partial update.
 *
 * Returns:
 *   locked:  true  → row is grayed/disabled
 *   reason:  string → shown in aria-label / tooltip (env-lock only; tier-lock
 *                      keeps existing "requires upgrade" wording)
 *   kind:    'tier' | 'env' → determines click behaviour and badge copy
 *
 * CRITICAL SAFETY: a model WITHOUT requiresEnvironment returns the same result
 * as the old isModelSelectableForTier call, so no current model is affected.
 */
function modelLock(
  model: AIModel,
  tier: string,
): { locked: boolean; reason?: string; kind: 'tier' | 'env' | 'coming_soon' } {
  // Availability check FIRST — a coming_soon/unavailable model is display-only:
  // never selectable, never routable, regardless of tier. This is the picker
  // side of the availability invariant (guardrail-enforced in the catalog).
  if (model.availability && model.availability !== 'live') {
    return {
      locked: true,
      kind: 'coming_soon',
      // `unavailableReason` in models.json is an internal ops record (probe
      // results, key provisioning) — never surface it to users.
      reason: 'Coming soon — not yet available',
    };
  }
  // Tier check next (existing pure logic).
  if (!isModelSelectableForTier(model, tier)) {
    return { locked: true, kind: 'tier' };
  }
  // Environment check (new; no-op when requiresEnvironment is absent).
  const envResult = evaluateModelEnvironment(
    model.requiresEnvironment,
    model.requiresEnvironment ? environmentAvailability(model.requiresEnvironment) : undefined,
  );
  if (!envResult.selectable) {
    return { locked: true, reason: envResult.reason, kind: 'env' };
  }
  return { locked: false, kind: 'tier' };
}

/** True when the model name contains "Opus" · used to show usage-rate tooltip. */
function isOpusModel(model: AIModel): boolean {
  return model.name.toLowerCase().includes('opus');
}

/**
 * Partition models into "recommended" (top ~4 for the user's tier) and
 * "more" (the rest). Flagship (locked) models always appear in recommended
 * with an isLocked flag so free users see them with an inline Upgrade link.
 *
 * When a search query is present we skip partitioning so the user sees all
 * matching results in a flat list.
 *
 * Uses modelLock() for all lock decisions so tier gating and env gating are
 * always applied together — no partial-update leak.
 */
function partitionModels(
  models: AIModel[],
  tier: string,
  searchQuery: string,
): {
  recommended: (AIModel & {
    isLocked: boolean;
    lockKind: 'tier' | 'env' | 'coming_soon';
    lockReason?: string;
  })[];
  more: AIModel[];
  isSearching: boolean;
} {
  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase();
    const matches = models.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        m.provider.toLowerCase().includes(q) ||
        m.description.toLowerCase().includes(q),
    );
    return {
      recommended: matches.map((m) => {
        const lock = modelLock(m, tier);
        return { ...m, isLocked: lock.locked, lockKind: lock.kind, lockReason: lock.reason };
      }),
      more: [],
      isSearching: true,
    };
  }

  // Top group = everything available in the user's tier (Auto modes first, then
  // manual models). Bottom ("More models") = everything that needs an upgrade,
  // Auto modes first there too. So free users see Auto (Economy) + their Hobby
  // models up top, and Auto Balanced/Best + flagships below with an Upgrade link.
  const isAuto = (m: AIModel) => m.providerKey === 'managed_cloud';
  const available = models.filter((m) => !modelLock(m, tier).locked);
  const locked = models.filter((m) => modelLock(m, tier).locked);

  const orderAutoFirst = (list: AIModel[]) => [
    ...list.filter(isAuto),
    ...list.filter((m) => !isAuto(m)),
  ];

  const recommended = orderAutoFirst(available).map((m) => ({
    ...m,
    isLocked: false,
    lockKind: 'tier' as const,
  }));
  const more = orderAutoFirst(locked);

  return { recommended, more, isSearching: false };
}

/** Provider logo: AGI mark for Auto modes → official vector mark → local SVG → brand dot. */
function ProviderLogo({ providerKey, size = 14 }: { providerKey?: string; size?: number }) {
  // No resolved provider (e.g. a model without a provider) → render no logo
  // rather than crashing on providerKey.toLowerCase().
  if (!providerKey) return null;
  // Auto modes (managed cloud) carry the AGI brand mark in the brand accent colour.
  if (providerKey === 'managed_cloud') {
    return (
      <span className="inline-flex shrink-0 items-center justify-center text-[var(--chat-accent-primary)]">
        <AgiMark size={size} mono />
      </span>
    );
  }

  // Prefer the official, theme-adaptive mark (OpenAI/Claude/Gemini/DeepSeek/etc.).
  const markKey = toProviderId(providerKey) ?? providerKey;
  if (hasProviderMark(markKey)) {
    return (
      <span className="inline-flex shrink-0 items-center justify-center text-[var(--chat-text-secondary)]">
        <ProviderMark providerKey={markKey} size={size} />
      </span>
    );
  }

  const logoUrl = providerLogoUrl(providerKey);
  const hex = providerBrandHex(providerKey);

  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt=""
        aria-hidden="true"
        width={size}
        height={size}
        style={{ width: size, height: size }}
        className="shrink-0 rounded-sm object-contain"
        onError={(e) => {
          // Fallback: hide image; parent still has brand-color dot as sibling
          (e.target as HTMLImageElement).style.display = 'none';
        }}
      />
    );
  }

  return (
    <span
      className="shrink-0 rounded-full"
      style={{ width: size, height: size, background: hex, display: 'inline-block' }}
      aria-hidden="true"
    />
  );
}

/**
 * Renders a single model row.
 * Tier-locked rows are fully clickable and open the upgrade dialog.
 * Env-locked rows are truly disabled (not clickable, no upgrade CTA) because
 * upgrading a subscription cannot satisfy an environment requirement.
 */
function ModelRow({
  model,
  isSelected,
  isLocked,
  lockKind = 'tier',
  lockReason,
  onSelect,
  onUpgradeRequest,
}: {
  model: AIModel;
  isSelected: boolean;
  isLocked: boolean;
  /** Whether the lock is a tier restriction, an environment requirement, or coming-soon. */
  lockKind?: 'tier' | 'env' | 'coming_soon';
  /** Human-readable reason for env-locked / coming_soon models. */
  lockReason?: string;
  onSelect?: () => void;
  onUpgradeRequest?: () => void;
}) {
  // Derive which picker tier this model belongs to so we can label the badge
  // accurately (Balanced vs Premium) without hard-coding model IDs.
  const pickerTier = isLocked && lockKind === 'tier' ? getPickerModelTier(model.id) : 'economy';

  const isEnvLocked = isLocked && lockKind === 'env';
  const isComingSoon = isLocked && lockKind === 'coming_soon';
  // Env-locked and coming_soon rows are HARD-disabled: not clickable, not
  // focusable, no upgrade CTA (upgrading can't satisfy either). Only tier-locked
  // rows are clickable (they open the upgrade dialog).
  const isHardDisabled = isEnvLocked || isComingSoon;

  const handleLockedClick = () => {
    if (isHardDisabled) return;
    onUpgradeRequest?.();
  };

  const ariaLabel = isComingSoon
    ? `${model.name} - ${lockReason ?? 'coming soon'} (not yet available)`
    : isEnvLocked
      ? `${model.name} - ${lockReason ?? 'environment not available'}`
      : isLocked
        ? `${model.name} - requires upgrade`
        : model.name;

  const rowContent = (
    <button
      type="button"
      disabled={isHardDisabled}
      className={[
        'flex w-full items-center gap-2 rounded px-3 py-1.5 text-left transition-colors',
        isComingSoon
          ? 'cursor-not-allowed opacity-45'
          : isEnvLocked
            ? 'cursor-not-allowed opacity-80'
            : isLocked
              ? 'cursor-pointer hover:bg-muted/40 opacity-80 hover:opacity-100'
              : 'cursor-pointer hover:bg-muted/60',
        isSelected ? 'bg-muted/40' : '',
      ].join(' ')}
      onClick={isLocked ? handleLockedClick : onSelect}
      aria-pressed={isSelected && !isLocked}
      aria-label={ariaLabel}
      title={isComingSoon ? lockReason : undefined}
    >
      <ProviderLogo providerKey={model.providerKey} size={14} />
      <span className="min-w-0 flex-1">
        <span
          className={[
            'block truncate text-sm',
            isLocked
              ? 'text-foreground/60'
              : isSelected
                ? 'font-medium text-foreground'
                : 'text-foreground/80',
          ].join(' ')}
        >
          {model.name}
        </span>
        {model.description && (
          <span className="block truncate text-xs text-muted-foreground">{model.description}</span>
        )}
      </span>
      {isComingSoon && (
        <span
          className="ml-auto shrink-0 rounded-full bg-muted/50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
          aria-label={lockReason ?? 'coming soon'}
          title={lockReason}
        >
          Coming soon
        </span>
      )}
      {isEnvLocked && (
        <span
          className="ml-auto shrink-0 rounded-full bg-muted/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
          aria-label={lockReason ?? 'environment not available'}
          title={lockReason}
        >
          Beta
        </span>
      )}
      {!isHardDisabled && isLocked && (
        <span
          className="ml-auto shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary"
          aria-label="Requires upgrade"
        >
          {pickerTier === 'premium' ? 'Pro' : 'Upgrade'}
        </span>
      )}
      {isSelected && !isLocked && (
        <Check className="ml-auto h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
      )}
    </button>
  );

  if (isOpusModel(model)) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div>{rowContent}</div>
          </TooltipTrigger>
          <TooltipContent side="left" sideOffset={8}>
            Opus consumes usage limits faster than other models
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return rowContent;
}

interface ComposerFooterProps {
  showModelSelector?: boolean;
  /** When true, shows a search input inside the model dropdown (code surface only). */
  showModelSearch?: boolean;
  onUpgradeRequest?: () => void;
  /** When true, render the selected model as a locked status pill instead of a dropdown. */
  lockModelSelector?: boolean;
  /** Controls whether the response style selector is visible. */
  showStyleSelector?: boolean;
  /** Free-trial prompt usage label, e.g. "2/3 prompts left". */
  trialUsageLabel?: string | null;
  /**
   * Inline mode: render ONLY the model/style selector cluster (no hint, budget,
   * or usage rows) so it can be dropped directly into the composer's control
   * row. Used by the empty-state composer to keep everything on one bottom row.
   */
  inline?: boolean;
  /** Extra classes applied to the outer element (e.g. flex order / ml-auto). */
  className?: string;
}

export function ComposerFooter({
  showModelSelector = true,
  showModelSearch = false,
  onUpgradeRequest,
  lockModelSelector = false,
  showStyleSelector = true,
  trialUsageLabel,
  inline = false,
  className,
}: ComposerFooterProps) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [moreExpanded, setMoreExpanded] = useState(false);
  const selectedModelId = useModelStore((s) => s.selectedModelId);
  const setSelectedModelId = useModelStore((s) => s.setSelectedModelId);
  const getSelectedModel = useModelStore((s) => s.getSelectedModel);
  const thinkingEnabled = useThinkingStore((s) => s.enabled);
  const thinkingEffort = useThinkingStore((s) => s.effort);
  const setThinkingEnabled = useThinkingStore((s) => s.setEnabled);
  const setThinkingEffort = useThinkingStore((s) => s.setEffort);
  const subscription = useBillingStore((s) => s.subscription);
  const tier = subscription?.tier ?? 'free';

  const selectedModel = getSelectedModel();

  // Prompt-cache safety: switching the model mid-conversation resets the cache and re-bills
  // prior context at full input price (caching is per-model). Warn before committing such a
  // switch. Logic lives in the shared @agiworkforce/routing policy (reused by all surfaces).
  //
  // Count only COMPLETED assistant turns in an ACTIVE conversation:
  //   - `activeConversationId` gate: an empty/new chat holds no cached prefix.
  //   - `!m.isStreaming` gate: the assistant message added at the START of the
  //     very first turn is an empty streaming placeholder. Counting it made the
  //     "Switch model mid-conversation?" dialog fire on a brand-new chat that has
  //     no real prior context yet (coordinator audit — Claude/DeepSeek/Moonshot,
  //     the caching-capable providers). A completed turn (isStreaming=false) is
  //     real cached context and still warns.
  const assistantTurnCount = useChatStore((s) =>
    s.activeConversationId
      ? s.messages.filter((m) => m.role === 'assistant' && !m.isStreaming).length
      : 0,
  );
  const [pendingSwitch, setPendingSwitch] = useState<{ id: string; message: string } | null>(null);

  const commitModel = useCallback(
    (id: string) => {
      setSelectedModelId(id);
      setOpen(false);
    },
    [setSelectedModelId],
  );

  const handleSelectModel = useCallback(
    (model: AIModel) => {
      if (model.id === selectedModelId) {
        setOpen(false);
        return;
      }
      const assessment = assessModelSwitchCache({
        priorModelId: selectedModelId,
        nextModelId: model.id,
        priorTurnCount: assistantTurnCount,
        priorModelLabel: selectedModel?.name,
        nextModelLabel: model.name,
      });
      if (assessment.warn) {
        setPendingSwitch({ id: model.id, message: assessment.message });
        setOpen(false);
        return;
      }
      commitModel(model.id);
    },
    [selectedModelId, assistantTurnCount, selectedModel, commitModel],
  );

  const lockedDisplayModel =
    AVAILABLE_MODELS.find((model) => model.id === getBestAutoModeForTier('free')) ?? selectedModel;
  const dailyUsageLabel = useDailyUsageLabel();
  const usageLabel = trialUsageLabel ?? dailyUsageLabel;

  // Partition into recommended / more, respecting current tier and search
  const { recommended, more, isSearching } = partitionModels(AVAILABLE_MODELS, tier, searchQuery);

  // Auto-expand "More models" section when the selected model lives there
  const selectedInMore = more.some((m) => m.id === selectedModelId);
  const showMore = moreExpanded || selectedInMore || isSearching;

  const selectedProviderKey = (lockModelSelector ? lockedDisplayModel : selectedModel).providerKey;
  const reasoning = reasoningFor(selectedModel);
  const supportsAdaptive = modelSupportsThinking(selectedModel);
  const isAlwaysOn =
    reasoning.control === 'always_on' ||
    (reasoning.capable && reasoning.canDisableThinking === false);
  const effortChips = effortChipsFor(reasoning);
  const showThinkingSwitch = showsThinkingSwitch(reasoning);
  // Store efforts this model actually supports (for clamping the persisted pref).
  const supportedStoreEfforts = new Set<Effort>(
    effortChips.map(chipToStoreEffort).filter((e): e is Effort => e !== 'off'),
  );

  useEffect(() => {
    // modelLock covers tier, env AND availability gates — closing the selection-
    // reset leak where a now-invalid model could remain selected after the tier
    // changed. (coming_soon models can never be selected in the first place, but
    // this also recovers if a live model is retired.)
    if (modelLock(selectedModel, tier).locked) {
      setSelectedModelId(getBestAutoModeForTier(tier));
    }
  }, [selectedModel, setSelectedModelId, tier]);

  useEffect(() => {
    // always_on reasoners keep thinking on. If thinking is enabled but the current
    // persisted effort isn't in this model's supported set, snap it to the model's
    // default so we never send an effort the model would reject.
    if (isAlwaysOn && !thinkingEnabled) {
      setThinkingEnabled(true);
    }
    if (
      thinkingEnabled &&
      supportedStoreEfforts.size > 0 &&
      !supportedStoreEfforts.has(thinkingEffort)
    ) {
      setThinkingEffort(defaultStoreEffort(reasoning));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedModelId, isAlwaysOn, thinkingEnabled, thinkingEffort]);

  const handleThinkingEnabledChange = (checked: boolean) => {
    if (!checked) {
      setThinkingEnabled(false);
      return;
    }
    // Enabling: snap effort into the model's supported set if needed.
    if (supportedStoreEfforts.size > 0 && !supportedStoreEfforts.has(thinkingEffort)) {
      setThinkingEffort(defaultStoreEffort(reasoning));
      return; // setEffort also enables
    }
    setThinkingEnabled(true);
  };

  // Select an effort chip. `none` = off; other chips enable + set the level.
  const handleEffortChip = (chip: string) => {
    const store = chipToStoreEffort(chip);
    if (store === 'off') {
      setThinkingEnabled(false);
      return;
    }
    setThinkingEffort(store); // setEffort also enables thinking
  };

  // Whether a chip is the active selection.
  const isEffortChipActive = (chip: string): boolean => {
    const store = chipToStoreEffort(chip);
    if (store === 'off') return !thinkingEnabled;
    return thinkingEnabled && thinkingEffort === store;
  };

  // Whether the effort chip row is visible. When there's a separate on/off
  // switch, chips only show while thinking is enabled. When the row itself
  // carries the off state (a `none` chip) or the model is always-on, chips are
  // always shown.
  const effortChipsVisible =
    supportsAdaptive && effortChips.length > 0 && (showThinkingSwitch ? thinkingEnabled : true);

  return (
    <div
      className={[inline ? 'flex min-w-0 items-center' : 'mt-2 space-y-2', className ?? '']
        .filter(Boolean)
        .join(' ')}
    >
      {/* Budget display · renders only when tokens have been used */}
      {!inline && <BudgetTrackerDisplay className="mx-1" />}

      {/* Usage label · trial prompt count takes precedence over daily-cost hints. */}
      {!inline && usageLabel && (
        <div className="flex items-center gap-1.5 px-1">
          <span
            className={[
              'text-xs font-medium',
              usageLabel === 'Daily limit reached' ? 'text-rose-400' : 'text-amber-400',
            ].join(' ')}
          >
            {usageLabel}
          </span>
          {usageLabel === 'Daily limit reached' && (
            <button
              type="button"
              onClick={onUpgradeRequest}
              className="text-xs text-amber-400 underline underline-offset-2 hover:text-amber-300"
            >
              Upgrade
            </button>
          )}
        </div>
      )}

      <div
        className={
          inline ? 'flex min-w-0 items-center gap-2' : 'flex items-center justify-end gap-2 px-1'
        }
      >
        {/* min-w-0 so the model selector button below can shrink (its name span
            truncates) instead of forcing the control row to wrap. No persistent
            keyboard hint (founder directive, matches claude.ai). Send behavior in
            ChatComposerNew: plain Enter sends, Shift+Enter newline (ChatGPT/Claude
            convention), Cmd/Ctrl+Enter also sends. */}
        <div className="flex min-w-0 items-center gap-2">
          {/* Response style selector · hidden below sm so the model selector keeps a
              usable width on the narrow (mobile) composer row. Style is a secondary
              control and, like claude.ai's mobile composer, is dropped at small widths
              rather than crushing the model picker. */}
          {showStyleSelector && (
            <div className="hidden sm:block">
              <StyleSelector />
            </div>
          )}

          {/* Model selector */}
          {showModelSelector && lockModelSelector && (
            <button
              type="button"
              onClick={onUpgradeRequest}
              className="flex items-center gap-1.5 rounded-md border border-border/50 bg-muted/35 px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-muted/55 hover:text-foreground"
              aria-label="Auto Economy is selected for the free web trial"
            >
              <ProviderLogo providerKey={selectedProviderKey} size={12} />
              <span className="max-w-[150px] truncate">{lockedDisplayModel.name}</span>
            </button>
          )}

          {showModelSelector && !lockModelSelector && (
            <Popover
              open={open}
              onOpenChange={(o) => {
                setOpen(o);
                if (!o) {
                  setSearchQuery('');
                  setMoreExpanded(false);
                }
              }}
            >
              <PopoverTrigger asChild>
                <button
                  id="model-selector"
                  className="flex min-w-0 items-center gap-1.5 rounded-md px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
                  aria-label="Change model"
                >
                  <ProviderLogo providerKey={selectedProviderKey} size={12} />
                  {/* truncate lets the model name shrink so the composer bottom row
                      stays a single line at narrow widths, while min-w-[3.5rem] gives it
                      a GUARANTEED floor (~56px) so the label can never collapse to 0px
                      (which previously left only the ~12px provider icon, overflowing
                      UNDER the Send button at 375px). max-w-[140px] caps it on wide
                      layouts. Floor + the narrow-width control trims in ChatComposerNew
                      keep this selector visible, tappable, and clear of Send down to
                      ~320px. */}
                  <span className="min-w-[3.5rem] max-w-[140px] shrink truncate">
                    {selectedModel.name}
                  </span>
                  {supportsAdaptive && thinkingEnabled && (
                    <span className="text-xs text-muted-foreground/70">
                      {EFFORT_LABEL[thinkingEffort]}
                    </span>
                  )}
                  <ChevronDown className="h-3 w-3 shrink-0" />
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" sideOffset={6} className="w-72 p-0">
                {/* Header · model count badge removed per Claude reference */}
                <div className="flex items-center border-b border-border/40 px-3 py-2">
                  <span className="text-xs font-medium text-foreground">Models</span>
                </div>

                {/* Search input · shown only in code surface */}
                {showModelSearch && (
                  <div className="border-b border-border/40 px-3 py-1.5">
                    <input
                      className="w-full bg-transparent text-xs outline-none placeholder:text-muted-foreground"
                      name="model-search"
                      autoComplete="off"
                      placeholder="Search models…"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      aria-label="Search models"
                    />
                  </div>
                )}

                <div className="max-h-[320px] overflow-y-auto py-1">
                  {/* Recommended section label */}
                  {!isSearching && (
                    <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                      Available
                    </div>
                  )}
                  {recommended.map((model) => {
                    const isSelected = model.id === selectedModelId;
                    return (
                      <ModelRow
                        key={model.id}
                        model={model}
                        isSelected={isSelected}
                        isLocked={model.isLocked}
                        lockKind={model.lockKind}
                        lockReason={model.lockReason}
                        onUpgradeRequest={model.lockKind === 'tier' ? onUpgradeRequest : undefined}
                        onSelect={model.isLocked ? undefined : () => handleSelectModel(model)}
                      />
                    );
                  })}

                  {/* Reasoning / effort control · rendered off the selected model's
                      reasoning.control. Non-reasoning models render NOTHING here
                      (no dead effort control). Effort chips are the model's exact
                      supportedEfforts — never a global low/medium/high/xhigh/max. */}
                  {!isSearching && supportsAdaptive && (
                    <>
                      <div className="my-1 border-t border-border/40" />
                      {isAlwaysOn ? (
                        // Reasoner-only: reasoning is always on, cannot be disabled.
                        <div className="flex items-center gap-2 px-3 py-1.5">
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm text-foreground/80">Reasoning</span>
                            <span className="block text-xs text-muted-foreground">
                              Always on for this model
                            </span>
                          </span>
                          <span className="shrink-0 rounded-full bg-muted/50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                            Always on
                          </span>
                        </div>
                      ) : showThinkingSwitch ? (
                        // On/off switch (thinking_toggle / thinking_budget / effort_levels
                        // whose supported set has no `none` chip).
                        <div className="flex items-center gap-2 px-3 py-1.5">
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm text-foreground/80">
                              Extended thinking
                            </span>
                            <span className="block text-xs text-muted-foreground">
                              Thinks for more complex tasks
                            </span>
                          </span>
                          <Switch
                            checked={thinkingEnabled}
                            onCheckedChange={handleThinkingEnabledChange}
                            aria-label="Toggle extended thinking"
                            className="h-5 w-9"
                          />
                        </div>
                      ) : (
                        // effort_levels with a `none` chip: the chip row itself carries
                        // the off state — just a label above the chips.
                        <div className="px-3 py-1.5">
                          <span className="block text-sm text-foreground/80">Reasoning effort</span>
                        </div>
                      )}
                      {effortChipsVisible && (
                        <div className="px-2 pb-1" role="group" aria-label="Reasoning effort level">
                          {effortChips.map((chip) => {
                            const isActive = isEffortChipActive(chip);
                            return (
                              <button
                                key={chip}
                                type="button"
                                title={EFFORT_CHIP_DESCRIPTION[chip] ?? chip}
                                onClick={() => handleEffortChip(chip)}
                                className={[
                                  'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left transition-colors',
                                  isActive ? 'bg-muted/50' : 'hover:bg-muted/40',
                                ].join(' ')}
                              >
                                <span className="min-w-0 flex-1">
                                  <span className="block text-sm text-foreground/85">
                                    {EFFORT_CHIP_LABEL[chip] ?? chip}
                                  </span>
                                  <span className="block text-xs text-muted-foreground">
                                    {EFFORT_CHIP_DESCRIPTION[chip] ?? ''}
                                  </span>
                                </span>
                                {isActive && (
                                  <Check
                                    className="h-3.5 w-3.5 shrink-0 text-primary"
                                    aria-hidden="true"
                                  />
                                )}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </>
                  )}

                  {/* More models section · only shown when not searching */}
                  {!isSearching && more.length > 0 && (
                    <>
                      <div className="my-1 border-t border-border/40" />
                      <button
                        className="flex w-full items-center gap-1.5 px-3 py-1.5 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
                        onClick={() => setMoreExpanded((v) => !v)}
                        aria-expanded={showMore}
                      >
                        <ChevronRight
                          className={[
                            'h-3 w-3 shrink-0 transition-transform',
                            showMore ? 'rotate-90' : '',
                          ].join(' ')}
                          aria-hidden="true"
                        />
                        More models
                        <span className="ml-auto rounded bg-muted/50 px-1 text-[10px]">
                          {more.length}
                        </span>
                      </button>
                      {showMore &&
                        more.map((model) => {
                          const lock = modelLock(model, tier);
                          const isSelected = model.id === selectedModelId;
                          return (
                            <ModelRow
                              key={model.id}
                              model={model}
                              isSelected={isSelected}
                              isLocked={lock.locked}
                              lockKind={lock.kind}
                              lockReason={lock.reason}
                              onUpgradeRequest={lock.kind === 'tier' ? onUpgradeRequest : undefined}
                              onSelect={lock.locked ? undefined : () => handleSelectModel(model)}
                            />
                          );
                        })}
                    </>
                  )}

                  {recommended.length === 0 && isSearching && (
                    <p className="px-3 py-4 text-center text-xs text-muted-foreground">
                      No models match
                    </p>
                  )}
                </div>
              </PopoverContent>
            </Popover>
          )}
        </div>
      </div>
      <AlertDialog
        open={pendingSwitch !== null}
        onOpenChange={(o) => {
          if (!o) setPendingSwitch(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Switch model mid-conversation?</AlertDialogTitle>
            <AlertDialogDescription>{pendingSwitch?.message}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingSwitch(null)}>
              Keep current model
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingSwitch) commitModel(pendingSwitch.id);
                setPendingSwitch(null);
              }}
            >
              Switch anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
