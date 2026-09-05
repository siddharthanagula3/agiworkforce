'use client';

import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import {
  Brain,
  ChevronDown,
  ChevronRight,
  Check,
  Code,
  Globe,
  Image as ImageIcon,
  Plug,
  type Icon,
} from '@agiworkforce/icons';
import { toast } from 'sonner';
import { Popover, PopoverTrigger, PopoverContent, Slider, useMenuKeyboard } from '@agiworkforce/ui';
import { useModelStore, AVAILABLE_MODELS, type AIModel } from '@shared/stores/model-store';
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
  getReasoningDepthIndicator,
  type ModelEnvironment,
  type EnvironmentAvailability,
} from '@agiworkforce/types';
import { useBillingStore } from '@shared/stores/web-auth-store';
import { isBillingPolicyReady } from '@shared/stores/billing-policy';
import {
  getAllowedAutoModesForTier,
  getBestAutoModeForTier,
  getModelMetadata,
  getModelReasoning,
  isModelAllowedForTier,
  splitEffortsByEntitlement,
  type ModelCapabilities,
} from '@shared/config/llm';
import type { ModelReasoning } from '@agiworkforce/types';
import { FREE_TRIAL_MODELS } from '@/lib/free-trial-config';
import { ProviderMark, hasProviderMark } from '@shared/components/ProviderMark';
import { AgiMark } from '@shared/components/agi/AgiMark';
import { useThinkingStore } from '@shared/stores/thinking-store';
import {
  resolveFreeLaneUiBuildEnabled,
  resolveFreeLaneUiEnabled,
} from '@features/chat/lib/free-lane-ui-gate';

const FREE_LANE_SLOT_TEXT = 'Auto (free) · community models, capacity varies';
const TRIAL_SLOT_SUFFIX = 'is selected for the free web trial';
const MODEL_CATALOG_ENDPOINT = '/api/models';

/** Locked slot (upgrade prompt): a bordered pill signals it is not a live picker. */
const MODEL_LOCKED_TRIGGER_CLASS =
  'flex items-center gap-1.5 rounded-md border border-border/50 bg-muted/35 px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-muted/55 hover:text-foreground';
/** Live model trigger: plain text plus a chevron, no border or fill. */
const MODEL_TRIGGER_CLASS =
  'flex min-h-6 min-w-0 items-center gap-1.5 rounded-md px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground';

const PICKER_SEARCH_MIN_ROSTER = 8;
const PICKER_VIEWPORT_INSET_PX = 16;
const PICKER_ANCHOR_OFFSET_PX = 6;
const PICKER_ROW_ATTR = 'data-picker-row';
const PICKER_ITEM_SELECTOR = `[${PICKER_ROW_ATTR}]`;
const PICKER_ROW_CLASS =
  'flex h-12 w-full shrink-0 items-center gap-2.5 rounded-md px-3 text-left transition-colors focus-visible:outline-none';
const PICKER_ROW_NAME_CLASS = 'block truncate text-sm leading-5';
const PICKER_ROW_GUIDANCE_CLASS = 'block truncate text-xs leading-4 text-muted-foreground';
const PICKER_BADGE_CLASS =
  'shrink-0 rounded-full px-1.5 py-px text-xs font-semibold uppercase tracking-wide';
const PICKER_DIVIDER_CLASS = 'shrink-0 border-b border-[var(--chat-border)]';
const PICKER_GLYPH_CLASS = 'h-3 w-3';
const PICKER_ICON_SIZE = 16;
const PICKER_TRIGGER_ICON_SIZE = 12;

const CAPABILITY_MARKS: readonly { key: keyof ModelCapabilities; label: string; Glyph: Icon }[] = [
  { key: 'vision', label: 'Vision', Glyph: ImageIcon },
  { key: 'thinking', label: 'Reasoning', Glyph: Brain },
  { key: 'search', label: 'Search', Glyph: Globe },
  { key: 'tools', label: 'Tools', Glyph: Plug },
  { key: 'codeExecution', label: 'Code', Glyph: Code },
];

type ProviderAvailability = { state: 'degraded'; reason: string; until: string };

interface ModelCatalogEntry {
  provider: string;
  availability: { state: 'available' } | ProviderAvailability;
}

async function fetchProviderAvailability(
  signal: AbortSignal,
): Promise<Record<string, ProviderAvailability>> {
  const response = await fetch(MODEL_CATALOG_ENDPOINT, { signal });
  if (!response.ok) return {};
  const body = (await response.json()) as { models?: ModelCatalogEntry[] };
  const byProvider: Record<string, ProviderAvailability> = {};
  for (const entry of body.models ?? []) {
    if (entry.availability.state === 'degraded') byProvider[entry.provider] = entry.availability;
  }
  return byProvider;
}

/**
 * The gate's two overrides are client-only, so a server render that honoured
 * them would label this slot differently from the markup the browser hydrates
 * against. `getServerSnapshot` pins the first client render to the build
 * default, and React re-renders once hydration is done.
 */
const subscribeToFreeLaneUiMode = () => () => {};

function useFreeLaneUiEnabled(): boolean {
  return useSyncExternalStore(
    subscribeToFreeLaneUiMode,
    resolveFreeLaneUiEnabled,
    resolveFreeLaneUiBuildEnabled,
  );
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
// each model shows ONLY the effort marks it actually accepts, fixing the prior
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

/** Whether the flyout should show a separate on/off switch (vs a `none` mark). */
function showsThinkingSwitch(r: ModelReasoning): boolean {
  if (r.control === 'none' || r.control === 'always_on') return false;
  // effort_levels with a `none` mark encodes off in the slider itself.
  if (r.control === 'effort_levels' && (r.supportedEfforts ?? []).includes('none')) return false;
  return r.canDisableThinking ?? true;
}

/** Map an exact catalog value to the shared thinking-store effort vocabulary. */
function chipToStoreEffort(chip: string): Effort {
  return chip as Effort;
}

/** The model's default effort as a store value. */
function defaultStoreEffort(r: ModelReasoning): Effort {
  return r.defaultEffort ?? 'medium';
}

function isModelSelectableForTier(model: AIModel, tier: string | null): boolean {
  // A null tier means the plan is not known yet. Guessing "free" here told
  // paying subscribers to upgrade whenever /api/me was slow or answered 401,
  // so the tier gate withholds its claim until the plan resolves; the server
  // still enforces the real entitlement on send.
  if (tier === null) return true;
  // Free users may select any of the cost-efficient tool-capable trial models
  // while the server privately enforces the unpublished dynamic usage ceiling.
  if (FREE_TRIAL_MODELS.includes(model.id)) return true;
  if (model.providerKey === 'managed_cloud') {
    return getAllowedAutoModesForTier(tier).includes(model.id);
  }
  if (tier === 'free') return false;
  return isModelAllowedForTier(model.id, tier);
}

// ---------------------------------------------------------------------------
// Environment gating (Phase A, Phase B replaces environmentAvailability with
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
  // Phase A: all environments are unconfigured, env-gated models stay locked.
  return { configured: false };
}

/**
 * Combined lock decision: tier gate first, then environment gate.
 *
 * Keeping these two separate signals in one function means every call-site
 * (search branch, partition, "More models" inline, reset effect) routes through
 * the same logic, no gating leak is possible from a partial update.
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
  tier: string | null,
): { locked: boolean; reason?: string; kind: 'tier' | 'env' | 'coming_soon' } {
  // Availability check FIRST, a coming_soon/unavailable model is display-only:
  // never selectable, never routable, regardless of tier. This is the picker
  // side of the availability invariant (guardrail-enforced in the catalog).
  if (model.availability && model.availability !== 'live') {
    return {
      locked: true,
      kind: 'coming_soon',
      // `unavailableReason` in models.json is an internal ops record (probe
      // results, key provisioning), never surface it to users.
      reason: 'Coming soon, not yet available',
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

/**
 * True for models that burn plan usage fastest · drives the usage-rate tooltip.
 *
 * AUDIT-FIX CMP-25: this used to be `model.name.toLowerCase().includes('opus')`
 *, a substring match on a DISPLAY NAME. It silently missed every other premium
 * model (and would have fired on any unrelated model whose name happened to
 * contain the word). `getPickerModelTier` is the catalog's own answer to
 * "which bucket is this model in", and is already what the picker's Pro badge
 * uses, so the tooltip and the badge can no longer disagree.
 */
function isHighUsageRateModel(model: AIModel): boolean {
  return getPickerModelTier(model.id) === 'premium';
}

// ---------------------------------------------------------------------------
// Deprecation advance-warning (CLR-01 / mqp-08). `model.deprecationDate`
// (model-store.ts) is only ever set to a date still in the future, the
// picker already drops a model outright once its deprecation_date has
// passed (isCurrentModel). This renders the advance notice for the window
// leading up to that deadline, matching ChatGPT's in-picker "Leaving on
// <date>" countdown instead of letting the model vanish with zero warning.
// ---------------------------------------------------------------------------

/** How many days ahead of the scheduled retirement the picker starts warning. */
const DEPRECATION_WARNING_WINDOW_DAYS = 30;

/** Inline "Leaving on <date>" label for a model within its warning window. */
function deprecationWarningFor(model: AIModel): { shortLabel: string; fullLabel: string } | null {
  if (!model.deprecationDate) return null;
  const retiresAt = Date.parse(model.deprecationDate);
  if (Number.isNaN(retiresAt)) return null;
  const daysUntil = (retiresAt - Date.now()) / (1000 * 60 * 60 * 24);
  if (daysUntil <= 0 || daysUntil > DEPRECATION_WARNING_WINDOW_DAYS) return null;
  const date = new Date(retiresAt);
  return {
    shortLabel: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    fullLabel: date.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    }),
  };
}

function modelCapabilityMarks(modelId: string): (typeof CAPABILITY_MARKS)[number][] {
  const capabilities = getModelMetadata(modelId)?.capabilities;
  if (!capabilities) return [];
  return CAPABILITY_MARKS.filter((mark) => capabilities[mark.key]);
}

function rowGuidance(
  model: AIModel,
  marks: (typeof CAPABILITY_MARKS)[number][],
  degraded: ProviderAvailability | undefined,
  deprecation: { shortLabel: string } | null,
): string {
  if (degraded) return 'Unavailable right now';
  if (deprecation) return `Leaving ${deprecation.shortLabel}`;
  if (model.description) return model.description;
  if (marks.length > 0) return marks.map((mark) => mark.label).join(', ');
  return model.provider;
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
 * always applied together, no partial-update leak.
 */
function partitionModels(
  models: AIModel[],
  tier: string | null,
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
      <span className="inline-flex shrink-0 items-center justify-center text-[var(--chat-accent-primary-text)]">
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

function CapabilityGlyph({ label, Glyph }: { label: string; Glyph: Icon }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex text-muted-foreground" aria-hidden="true">
          <Glyph className={PICKER_GLYPH_CLASS} />
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={4}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

function ModelRow({
  model,
  isSelected,
  isLocked,
  lockKind = 'tier',
  lockReason,
  onSelect,
  onUpgradeRequest,
  degraded,
}: {
  model: AIModel;
  isSelected: boolean;
  isLocked: boolean;
  lockKind?: 'tier' | 'env' | 'coming_soon';
  lockReason?: string;
  onSelect?: () => void;
  onUpgradeRequest?: () => void;
  degraded?: ProviderAvailability;
}) {
  const pickerTier = isLocked && lockKind === 'tier' ? getPickerModelTier(model.id) : 'economy';
  const isEnvLocked = isLocked && lockKind === 'env';
  const isComingSoon = isLocked && lockKind === 'coming_soon';
  const isHardDisabled = isEnvLocked || isComingSoon;
  const marks = modelCapabilityMarks(model.id);
  const reasoningDepth = getReasoningDepthIndicator(model.id);
  const deprecationWarning = deprecationWarningFor(model);
  const guidance = rowGuidance(model, marks, degraded, deprecationWarning);

  const handleLockedClick = () => {
    if (isHardDisabled) return;
    onUpgradeRequest?.();
  };

  const baseAriaLabel = isComingSoon
    ? `${model.name} - ${lockReason ?? 'coming soon'} (not yet available)`
    : isEnvLocked
      ? `${model.name} - ${lockReason ?? 'environment not available'}`
      : isLocked
        ? `${model.name} - requires upgrade`
        : model.name;
  const ariaLabel = [
    baseAriaLabel,
    deprecationWarning ? `Leaving on ${deprecationWarning.fullLabel}` : null,
    degraded ? degraded.reason : null,
  ]
    .filter(Boolean)
    .join(' - ');
  const capabilityDescriptionId = useId();
  const capabilityDescription = marks.map((mark) => mark.label).join(', ');

  const tooltipText = degraded
    ? degraded.reason
    : isHighUsageRateModel(model)
      ? `${model.name} consumes usage limits faster than other models`
      : null;

  const textBlock = (
    <span className="min-w-0 flex-1">
      <span
        className={[
          PICKER_ROW_NAME_CLASS,
          isLocked
            ? 'text-foreground/60'
            : isSelected
              ? 'font-medium text-foreground'
              : 'text-foreground/85',
        ].join(' ')}
      >
        {model.name}
      </span>
      <span className={PICKER_ROW_GUIDANCE_CLASS}>{guidance}</span>
    </span>
  );

  return (
    <button
      type="button"
      disabled={isHardDisabled}
      {...{ [PICKER_ROW_ATTR]: '' }}
      className={[
        PICKER_ROW_CLASS,
        isComingSoon
          ? 'cursor-not-allowed opacity-45'
          : isEnvLocked
            ? 'cursor-not-allowed opacity-80'
            : isLocked
              ? 'cursor-pointer opacity-80 hover:bg-muted/40 hover:opacity-100 focus-visible:bg-muted/40 focus-visible:opacity-100'
              : 'cursor-pointer hover:bg-muted/60 focus-visible:bg-muted/60',
      ].join(' ')}
      onClick={isLocked ? handleLockedClick : onSelect}
      aria-pressed={isSelected && !isLocked}
      aria-label={ariaLabel}
      aria-describedby={capabilityDescription ? capabilityDescriptionId : undefined}
      title={isComingSoon ? lockReason : undefined}
    >
      <ProviderLogo providerKey={model.providerKey} size={PICKER_ICON_SIZE} />
      {capabilityDescription && (
        <span id={capabilityDescriptionId} className="sr-only">
          {capabilityDescription}
        </span>
      )}
      {tooltipText ? (
        <Tooltip>
          <TooltipTrigger asChild>{textBlock}</TooltipTrigger>
          <TooltipContent side="left" sideOffset={8}>
            {tooltipText}
          </TooltipContent>
        </Tooltip>
      ) : (
        textBlock
      )}
      <span className="ml-auto flex shrink-0 items-center gap-1.5">
        {marks.length > 0 && (
          <span className="flex items-center gap-0.5">
            {marks.map((mark) => (
              <CapabilityGlyph key={mark.key} label={mark.label} Glyph={mark.Glyph} />
            ))}
          </span>
        )}
        {reasoningDepth && (
          <span
            role="img"
            aria-label={`Reasoning depth ${reasoningDepth.filled} of ${reasoningDepth.scale}`}
            title={`Reasoning depth ${reasoningDepth.filled} of ${reasoningDepth.scale}`}
            className="flex items-center gap-px"
          >
            {Array.from({ length: reasoningDepth.scale }, (_, index) => (
              <span
                key={index}
                aria-hidden="true"
                className={[
                  'h-1 w-1 rounded-full',
                  index < reasoningDepth.filled ? 'bg-foreground/45' : 'bg-muted-foreground/25',
                ].join(' ')}
              />
            ))}
          </span>
        )}
        {isComingSoon && (
          <span
            className={`${PICKER_BADGE_CLASS} bg-muted/50 text-muted-foreground`}
            aria-label={lockReason ?? 'coming soon'}
            title={lockReason}
          >
            Coming soon
          </span>
        )}
        {isEnvLocked && (
          <span
            className={`${PICKER_BADGE_CLASS} bg-muted/60 text-muted-foreground`}
            aria-label={lockReason ?? 'environment not available'}
            title={lockReason}
          >
            Beta
          </span>
        )}
        {!isHardDisabled && isLocked && (
          <span
            className={`${PICKER_BADGE_CLASS} bg-primary/10 text-primary`}
            aria-label="Requires upgrade"
          >
            {pickerTier === 'premium' ? 'Pro' : 'Upgrade'}
          </span>
        )}
        {isSelected && !isLocked && (
          <Check className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
        )}
      </span>
    </button>
  );
}

interface ComposerFooterProps {
  showModelSelector?: boolean;
  /**
   * Shows a search input inside the model dropdown.
   *
   * AUDIT-FIX CMP-30: this defaulted to `false` and the chat composer never
   * passed it, so the search field AND the entire `isSearching` branch of
   * `partitionModels` were unreachable dead code on the only surface that
   * mounts this component. It now defaults to true and is rendered whenever the
   * roster is long enough for search to be useful.
   */
  showModelSearch?: boolean;
  onUpgradeRequest?: () => void;
  /**
   * Durably change the active conversation's model. When absent (for example
   * the Settings default-model row), selection remains local-only.
   */
  onModelChange?: (modelId: string) => Promise<boolean>;
  /** When true, render the selected model as a locked status pill instead of a dropdown. */
  lockModelSelector?: boolean;
  /** Controls whether the response style selector is visible. */
  showStyleSelector?: boolean;
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
  showModelSearch = true,
  onUpgradeRequest,
  onModelChange,
  lockModelSelector = false,
  showStyleSelector = true,
  inline = false,
  className,
}: ComposerFooterProps) {
  const modelSelectorTitleId = useId();
  const effortPanelId = useId();
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [moreExpanded, setMoreExpanded] = useState(false);
  const [effortExpanded, setEffortExpanded] = useState(false);
  const [providerAvailability, setProviderAvailability] = useState<
    Record<string, ProviderAvailability>
  >({});
  const modelTriggerRef = useRef<HTMLButtonElement>(null);
  const pickerPanelRef = useRef<HTMLDivElement>(null);
  const effortPanelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!effortExpanded) return;
    effortPanelRef.current?.querySelector<HTMLElement>('[role="slider"]')?.focus();
  }, [effortExpanded]);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    fetchProviderAvailability(controller.signal)
      .then(setProviderAvailability)
      .catch(() => undefined);
    return () => controller.abort();
  }, [open]);

  const closeModelPopover = useCallback(() => {
    setOpen(false);
    setSearchQuery('');
    setMoreExpanded(false);
    setEffortExpanded(false);
  }, []);

  useMenuKeyboard({
    open,
    onClose: closeModelPopover,
    panelRef: pickerPanelRef,
    triggerRef: modelTriggerRef,
    itemSelector: PICKER_ITEM_SELECTOR,
  });

  const selectedModelId = useModelStore((s) => s.selectedModelId);
  const setSelectedModelId = useModelStore((s) => s.setSelectedModelId);
  const getSelectedModel = useModelStore((s) => s.getSelectedModel);
  const thinkingEnabled = useThinkingStore((s) => s.enabled);
  const thinkingEffort = useThinkingStore((s) => s.effort);
  const setThinkingEnabled = useThinkingStore((s) => s.setEnabled);
  const setThinkingEffort = useThinkingStore((s) => s.setEffort);
  const subscription = useBillingStore((s) => s.subscription);
  const billingPolicyReady = useBillingStore(isBillingPolicyReady);
  const billingUnauthenticated = useBillingStore((s) => s.unauthenticated === true);
  const tier = subscription?.tier ?? 'free';
  // Free is the right answer for a signed-out visitor and for a resolved Free
  // subscription; it is a guess in every other state, and this picker turns a
  // guess into an "requires upgrade" claim against paying subscribers.
  const knownTier = billingPolicyReady || billingUnauthenticated ? tier : null;

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
  //     no real prior context yet (coordinator audit, Claude/DeepSeek/Moonshot,
  //     the caching-capable providers). A completed turn (isStreaming=false) is
  //     real cached context and still warns.
  const assistantTurnCount = useChatStore((s) =>
    s.activeConversationId
      ? s.messages.filter((m) => m.role === 'assistant' && !m.isStreaming).length
      : 0,
  );
  const [pendingSwitch, setPendingSwitch] = useState<{ id: string; message: string } | null>(null);
  const [modelChangePending, setModelChangePending] = useState(false);

  const commitModel = useCallback(
    async (id: string) => {
      closeModelPopover();
      if (!onModelChange) {
        setSelectedModelId(id);
        return;
      }
      if (modelChangePending) return;
      setModelChangePending(true);
      try {
        const saved = await onModelChange(id);
        if (!saved) {
          toast.error(
            'Could not save the model for this conversation. The previous model remains active.',
          );
        }
      } catch {
        toast.error(
          'Could not save the model for this conversation. The previous model remains active.',
        );
      } finally {
        setModelChangePending(false);
      }
    },
    [closeModelPopover, modelChangePending, onModelChange, setSelectedModelId],
  );

  const handleSelectModel = useCallback(
    (model: AIModel) => {
      if (model.id === selectedModelId) {
        closeModelPopover();
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
        closeModelPopover();
        return;
      }
      void commitModel(model.id);
    },
    [selectedModelId, assistantTurnCount, selectedModel, commitModel, closeModelPopover],
  );

  const lockedDisplayModel =
    AVAILABLE_MODELS.find((model) => model.id === getBestAutoModeForTier('free')) ?? selectedModel;

  const freeLaneUiEnabled = useFreeLaneUiEnabled();
  const lockedSlotText = freeLaneUiEnabled ? FREE_LANE_SLOT_TEXT : lockedDisplayModel.name;
  const lockedSlotLabel = freeLaneUiEnabled
    ? FREE_LANE_SLOT_TEXT
    : `${lockedDisplayModel.name} ${TRIAL_SLOT_SUFFIX}`;

  // Partition into recommended / more, respecting current tier and search
  const { recommended, more, isSearching } = partitionModels(
    AVAILABLE_MODELS,
    knownTier,
    searchQuery,
  );
  // AUDIT-FIX CMP-30: a roster short enough to read at a glance needs no
  // search field; anything longer gets one (and with it the previously
  // unreachable `isSearching` branch of partitionModels).
  const modelSearchVisible = showModelSearch && AVAILABLE_MODELS.length > PICKER_SEARCH_MIN_ROSTER;

  // Auto-expand "More models" section when the selected model lives there
  const selectedInMore = more.some((m) => m.id === selectedModelId);
  const showMore = moreExpanded || selectedInMore || isSearching;

  const selectedProviderKey = (lockModelSelector ? lockedDisplayModel : selectedModel).providerKey;
  const reasoning = reasoningFor(selectedModel);
  const supportsAdaptive = modelSupportsThinking(selectedModel);
  const isAlwaysOn =
    reasoning.control === 'always_on' ||
    (reasoning.capable && reasoning.canDisableThinking === false);
  const { allowed: effortChips, gated: gatedEffortChips } =
    knownTier === null
      ? { allowed: reasoning.supportedEfforts ?? [], gated: [] as Effort[] }
      : splitEffortsByEntitlement(reasoning, knownTier);
  // A model can support provider-managed thinking without accepting a user
  // effort value (Haiku 4.5 is the important case). Only an explicit catalog
  // effort ladder earns UI; never turn a token-budget capability into a dead
  // or misleading effort switch.
  const hasEffortControl = supportsAdaptive && effortChips.length > 0;
  const showThinkingSwitch = showsThinkingSwitch(reasoning);
  // Store efforts this model actually supports (for clamping the persisted pref).
  const supportedStoreEfforts = new Set<Effort>(effortChips.map(chipToStoreEffort));
  const effectiveEffort = supportedStoreEfforts.has(thinkingEffort)
    ? thinkingEffort
    : defaultStoreEffort(reasoning);

  useEffect(() => {
    if (!billingPolicyReady) return;
    // modelLock covers tier, env AND availability gates, closing the selection-
    // reset leak where a now-invalid model could remain selected after the tier
    // changed. (coming_soon models can never be selected in the first place, but
    // this also recovers if a live model is retired.)
    if (modelLock(selectedModel, tier).locked) {
      setSelectedModelId(getBestAutoModeForTier(tier));
    }
  }, [billingPolicyReady, selectedModel, setSelectedModelId, tier]);

  useEffect(() => {
    // always_on reasoners keep thinking on. If thinking is enabled but the current
    // persisted effort isn't in this model's supported set, snap it to the model's
    // default so we never send an effort the model would reject.
    if (isAlwaysOn && !thinkingEnabled) {
      setThinkingEnabled(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedModelId, isAlwaysOn, thinkingEnabled]);

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

  // Select an exact provider effort mark, including `none` and `minimal`.
  const handleEffortChip = (chip: string) => {
    setThinkingEffort(chipToStoreEffort(chip));
  };

  // Whether an effort mark is the active selection.
  const isEffortChipActive = (chip: string): boolean => {
    return effectiveEffort === chipToStoreEffort(chip);
  };

  // Whether the effort slider is visible. When there's a separate on/off
  // switch, it only shows while thinking is enabled. When the slider itself
  // carries the off state (a `none` mark) or the model is always-on, it is
  // always shown.
  const effortChipsVisible = hasEffortControl;
  const selectedEffortIndex = effortChips.findIndex(isEffortChipActive);
  const defaultEffortIndex = effortChips.findIndex(
    (chip) => chipToStoreEffort(chip) === defaultStoreEffort(reasoning),
  );
  const effortSliderIndex =
    selectedEffortIndex >= 0 ? selectedEffortIndex : Math.max(defaultEffortIndex, 0);
  const selectedEffortChip = effortChips[effortSliderIndex];
  const selectedEffortLabel = selectedEffortChip ? EFFORT_LABEL[selectedEffortChip] : '';
  const effortSliderVisible =
    effortChipsVisible && effortChips.length > 1 && (!showThinkingSwitch || thinkingEnabled);

  return (
    <div
      className={[inline ? 'flex min-w-0 items-center' : 'mt-2 space-y-2', className ?? '']
        .filter(Boolean)
        .join(' ')}
    >
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
          {/* Response style selector, dropped below sm so the model trigger,
              mic and send keep the control row to a single line on a phone.
              claude.ai's mobile composer drops it for the same reason. */}
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
              className={MODEL_LOCKED_TRIGGER_CLASS}
              aria-label={lockedSlotLabel}
            >
              <ProviderLogo providerKey={selectedProviderKey} size={PICKER_TRIGGER_ICON_SIZE} />
              <span className="max-w-[150px] truncate">{lockedSlotText}</span>
            </button>
          )}

          {showModelSelector && !lockModelSelector && (
            <Popover
              open={open}
              onOpenChange={(o) => {
                if (o) setOpen(true);
                else closeModelPopover();
              }}
            >
              <PopoverTrigger asChild>
                <button
                  ref={modelTriggerRef}
                  id="model-selector"
                  disabled={modelChangePending}
                  className={MODEL_TRIGGER_CLASS}
                  aria-label={modelChangePending ? 'Saving model selection' : 'Change model'}
                >
                  <ProviderLogo providerKey={selectedProviderKey} size={PICKER_TRIGGER_ICON_SIZE} />
                  {/* truncate lets the model name shrink so the composer bottom row
                      stays a single line at narrow widths, while min-w-[3.5rem] gives it
                      a GUARANTEED floor (~56px) so the label can never collapse to 0px
                      (which previously left only the ~12px provider icon, overflowing
                      UNDER the Send button at 375px). max-w-[140px] caps it on wide
                      layouts. Floor + the narrow-width control trims in ChatComposerNew
                      keep this selector visible, tappable, and clear of Send down to
                      ~320px. */}
                  <span className="min-w-[3.5rem] max-w-[140px] shrink truncate font-medium">
                    {modelChangePending ? 'Saving…' : selectedModel.name}
                  </span>
                  {hasEffortControl && (
                    <span className="shrink-0 font-normal text-muted-foreground">
                      {EFFORT_LABEL[effectiveEffort]}
                    </span>
                  )}
                  <ChevronDown className="h-3 w-3 shrink-0" />
                </button>
              </PopoverTrigger>
              <PopoverContent
                ref={pickerPanelRef}
                align="end"
                sideOffset={PICKER_ANCHOR_OFFSET_PX}
                collisionPadding={PICKER_VIEWPORT_INSET_PX}
                className="flex max-h-[min(34rem,var(--radix-popover-content-available-height))] w-72 flex-col rounded-lg border-[var(--chat-border)] p-0"
                aria-labelledby={modelSelectorTitleId}
                onCloseAutoFocus={(event) => {
                  event.preventDefault();
                  modelTriggerRef.current?.focus();
                }}
              >
                <TooltipProvider>
                  <div className={`${PICKER_DIVIDER_CLASS} flex items-center px-3 py-2`}>
                    <span id={modelSelectorTitleId} className="text-xs font-medium text-foreground">
                      Models
                    </span>
                  </div>

                  {modelSearchVisible && (
                    <div className={`${PICKER_DIVIDER_CLASS} px-3 py-1.5`}>
                      <input
                        {...{ [PICKER_ROW_ATTR]: '' }}
                        className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                        name="model-search"
                        autoComplete="off"
                        placeholder="Search models…"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        aria-label="Search models"
                      />
                    </div>
                  )}

                  {!isSearching && (showThinkingSwitch || effortSliderVisible) && (
                    <div className={`${PICKER_DIVIDER_CLASS} p-1`}>
                      {showThinkingSwitch && (
                        <div className={PICKER_ROW_CLASS}>
                          <span className="min-w-0 flex-1">
                            <span className={`${PICKER_ROW_NAME_CLASS} text-foreground`}>
                              Extended thinking
                            </span>
                            <span className={PICKER_ROW_GUIDANCE_CLASS}>
                              Thinks for more complex tasks
                            </span>
                          </span>
                          <Switch
                            {...{ [PICKER_ROW_ATTR]: '' }}
                            checked={thinkingEnabled}
                            onCheckedChange={handleThinkingEnabledChange}
                            aria-label="Toggle extended thinking"
                            className="h-5 w-9"
                          />
                        </div>
                      )}

                      {effortSliderVisible && (
                        <>
                          <button
                            type="button"
                            {...{ [PICKER_ROW_ATTR]: '' }}
                            className={`${PICKER_ROW_CLASS} hover:bg-muted/60 focus-visible:bg-muted/60`}
                            onClick={() => setEffortExpanded((v) => !v)}
                            aria-expanded={effortExpanded}
                            aria-controls={effortPanelId}
                          >
                            <span className="min-w-0 flex-1">
                              <span className={`${PICKER_ROW_NAME_CLASS} text-foreground`}>
                                Effort
                              </span>
                              <span className={PICKER_ROW_GUIDANCE_CLASS}>
                                {isAlwaysOn
                                  ? 'Always on for this model'
                                  : 'Choose how much reasoning to use'}
                              </span>
                            </span>
                            <span className="shrink-0 text-xs text-muted-foreground">
                              {selectedEffortLabel}
                            </span>
                            <ChevronRight
                              className={[
                                'h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform',
                                effortExpanded ? 'rotate-90' : '',
                              ].join(' ')}
                              aria-hidden="true"
                            />
                          </button>
                          {effortExpanded && (
                            <div
                              id={effortPanelId}
                              ref={effortPanelRef}
                              role="group"
                              aria-label="Reasoning effort level"
                              className="px-3 pb-3 pt-1"
                            >
                              <div className="rounded-full border border-[var(--chat-border)] bg-muted/35 px-3 py-3">
                                <Slider
                                  min={0}
                                  max={effortChips.length - 1}
                                  step={1}
                                  value={[effortSliderIndex]}
                                  onValueChange={(value) => {
                                    const chip = effortChips[value[0] ?? -1];
                                    if (chip) handleEffortChip(chip);
                                  }}
                                  thumbAriaLabel="Reasoning effort"
                                  valueLabel={selectedEffortLabel}
                                  className="px-0.5"
                                />
                              </div>
                              {gatedEffortChips.length > 0 && (
                                <p className="mt-2 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                                  <span>
                                    {gatedEffortChips.map((chip) => EFFORT_LABEL[chip]).join(', ')}{' '}
                                    {gatedEffortChips.length > 1
                                      ? 'effort levels are'
                                      : 'effort is'}{' '}
                                    not included in your plan.
                                  </span>
                                  {onUpgradeRequest && (
                                    <button
                                      type="button"
                                      {...{ [PICKER_ROW_ATTR]: '' }}
                                      onClick={onUpgradeRequest}
                                      className="font-medium text-primary underline-offset-2 hover:underline"
                                    >
                                      Upgrade
                                    </button>
                                  )}
                                </p>
                              )}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}

                  <div className="min-h-0 flex-1 overflow-y-auto p-1">
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
                          degraded={providerAvailability[model.providerKey]}
                          onUpgradeRequest={
                            model.lockKind === 'tier' ? onUpgradeRequest : undefined
                          }
                          onSelect={
                            model.isLocked || modelChangePending
                              ? undefined
                              : () => handleSelectModel(model)
                          }
                        />
                      );
                    })}

                    {!isSearching && more.length > 0 && (
                      <>
                        <div className="my-1 border-t border-[var(--chat-border)]" />
                        <button
                          type="button"
                          {...{ [PICKER_ROW_ATTR]: '' }}
                          className={`${PICKER_ROW_CLASS} hover:bg-muted/60 focus-visible:bg-muted/60`}
                          onClick={() => setMoreExpanded((v) => !v)}
                          aria-expanded={showMore}
                        >
                          <span className="min-w-0 flex-1">
                            <span className={`${PICKER_ROW_NAME_CLASS} text-foreground`}>
                              More models
                            </span>
                          </span>
                          <span className="shrink-0 text-xs text-muted-foreground">
                            {more.length}
                          </span>
                          <ChevronRight
                            className={[
                              'h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform',
                              showMore ? 'rotate-90' : '',
                            ].join(' ')}
                            aria-hidden="true"
                          />
                        </button>
                        {showMore &&
                          more.map((model) => {
                            const lock = modelLock(model, knownTier);
                            const isSelected = model.id === selectedModelId;
                            return (
                              <ModelRow
                                key={model.id}
                                model={model}
                                isSelected={isSelected}
                                isLocked={lock.locked}
                                lockKind={lock.kind}
                                lockReason={lock.reason}
                                degraded={providerAvailability[model.providerKey]}
                                onUpgradeRequest={
                                  lock.kind === 'tier' ? onUpgradeRequest : undefined
                                }
                                onSelect={
                                  lock.locked || modelChangePending
                                    ? undefined
                                    : () => handleSelectModel(model)
                                }
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
                </TooltipProvider>
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
                if (pendingSwitch) void commitModel(pendingSwitch.id);
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
