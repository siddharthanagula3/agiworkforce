'use client';

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import {
  Brain,
  ChevronDown,
  ChevronRight,
  Check,
  Code,
  Globe,
  Image as ImageIcon,
  ImagePlus,
  Lock,
  Plug,
  Video,
  type Icon,
} from '@agiworkforce/icons';
import { toast } from 'sonner';
import { Popover, PopoverTrigger, PopoverContent, Slider, useMenuKeyboard } from '@agiworkforce/ui';
import { useModelStore, AVAILABLE_MODELS, type AIModel } from '@shared/stores/model-store';
import { StyleSelector } from './StyleSelector';
import { Switch } from '@agiworkforce/ui';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@agiworkforce/ui';
import { assessModelSwitchCache } from '@agiworkforce/routing';
import { useChatStore } from '@shared/stores/web-chat-store';
import {
  EFFORT_LABEL,
  type Effort,
  getPickerModelTier,
  evaluateModelEnvironment,
  isFreeBillingPlanTier,
  type ModelEnvironment,
  type EnvironmentAvailability,
} from '@agiworkforce/types';
import { useBillingStore } from '@shared/stores/web-auth-store';
import { isBillingPolicyReady } from '@shared/stores/billing-policy';
import {
  getAllowedAutoModesForTier,
  getBestAutoModeForTier,
  getModelReasoning,
  isModelAllowedForTier,
  splitEffortsByEntitlement,
} from '@shared/config/llm';
import type { ModelReasoning } from '@agiworkforce/types';
import { FREE_TRIAL_MODELS } from '@/lib/free-trial-config';
import { useThinkingStore } from '@shared/stores/thinking-store';
import {
  resolveFreeLaneUiBuildEnabled,
  resolveFreeLaneUiEnabled,
} from '@features/chat/lib/free-lane-ui-gate';
import { MODEL_SELECTOR_TRIGGER_ID } from '@features/chat/lib/model-picker-trigger';
import { ProviderLogo } from './ProviderLogo';
import { ModelCatalogue } from './ModelCatalogue';
import { useModelCatalogue } from '@features/chat/lib/use-model-catalogue';
import { useModelFavourites } from '@features/chat/lib/use-model-favourites';
import {
  buildModelPickerShortList,
  resolvePlanLockLabel,
  type ModelPickerAutoRow,
  type ModelPickerCapabilityKey,
  type ModelPickerLock,
  type ModelPickerPriceBand,
  type ModelPickerRowModel,
} from '@agiworkforce/unified-chat/model-picker';

const FREE_LANE_SLOT_TEXT = 'Auto (free) · community models, capacity varies';
const TRIAL_SLOT_SUFFIX = 'is selected for the free web trial';
const MODEL_CATALOG_ENDPOINT = '/api/models';

/** Locked slot (upgrade prompt): a bordered pill signals it is not a live picker. */
const MODEL_LOCKED_TRIGGER_CLASS =
  'flex items-center gap-1.5 rounded-md border border-border/50 bg-muted/35 px-2 py-0.5 text-xs sm:px-2.5 sm:py-1 sm:text-sm text-muted-foreground transition-colors hover:bg-muted/55 hover:text-foreground';
/** Live model trigger: plain text plus a chevron, no border or fill. */
const EFFORT_TRIGGER_CLASS =
  'flex min-h-7 shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground sm:min-h-8 sm:gap-1.5 sm:px-2.5 sm:py-1 sm:text-sm';
const EFFORT_THUMB_INSET = '0.875rem';
const EFFORT_TRACK_CLASS = 'h-7 rounded-full bg-muted';
const EFFORT_RANGE_CLASS = 'bg-info';
const EFFORT_THUMB_CLASS = 'h-7 w-7 border-0 bg-[var(--chat-accent-on-secondary)] shadow-md';
const LADDER_FULL_PERCENT = 100;
function ladderOffset(index: number, length: number): string {
  return `${(index / Math.max(length - 1, 1)) * LADDER_FULL_PERCENT}%`;
}
const EFFORT_OFF_LABEL = 'Off';
const MODEL_TRIGGER_CLASS =
  'flex min-h-7 min-w-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground sm:min-h-8 sm:gap-1.5 sm:px-2.5 sm:py-1 sm:text-sm';

const CACHE_RESET_NOTE_TEXT = 'Starts a new prompt cache';
const CACHE_RESET_NOTE_MS = 3000;
const CACHE_RESET_NOTE_CLASS =
  'pointer-events-none absolute right-0 top-full z-10 mt-1 whitespace-nowrap text-xs leading-4 text-muted-foreground';

const PICKER_VIEWPORT_INSET_PX = 16;
const PICKER_ANCHOR_OFFSET_PX = 6;
const PICKER_ROW_ATTR = 'data-picker-row';
const PICKER_ITEM_SELECTOR = `[${PICKER_ROW_ATTR}]`;
const PICKER_FOCUSABLE_SELECTOR = 'button:not([disabled]), input, a[href], [tabindex="0"]';
const PICKER_ROW_CLASS =
  'flex h-12 w-full shrink-0 items-center gap-2.5 rounded-md px-3 text-left transition-colors focus-visible:outline-none';
const PICKER_ROW_NAME_CLASS = 'block truncate text-sm leading-5';
const PICKER_ROW_GUIDANCE_CLASS = 'block truncate text-xs leading-4 text-muted-foreground';
const PICKER_ROW_WRAPPED_GUIDANCE_CLASS = 'block text-xs leading-4 text-muted-foreground';
const PICKER_BADGE_CLASS =
  'shrink-0 rounded-full px-1.5 py-px text-xs font-semibold uppercase tracking-wide';
const PICKER_ICON_SIZE = 16;
const PICKER_TRIGGER_ICON_SIZE = 12;
const PICKER_PANEL_WIDTH_CLASS = 'w-80';
const PICKER_CATALOGUE_WIDTH_CLASS = 'w-[min(40rem,calc(100vw-1rem))]';
const PICKER_SECTION_LABEL_CLASS = 'px-3 pb-1 pt-2 text-xs font-medium text-muted-foreground';

const CAPABILITY_GLYPHS: Readonly<
  Record<ModelPickerCapabilityKey, { label: string; Glyph: Icon }>
> = {
  vision: { label: 'Vision', Glyph: ImageIcon },
  thinking: { label: 'Reasoning', Glyph: Brain },
  tools: { label: 'Tools', Glyph: Plug },
  search: { label: 'Search', Glyph: Globe },
  codeExecution: { label: 'Code', Glyph: Code },
  imageGen: { label: 'Image output', Glyph: ImagePlus },
  videoGen: { label: 'Video output', Glyph: Video },
};

const PLAN_PAGE_HREF = '/pricing';
const PLAN_PAGE_LINK_TEXT = 'What each plan includes';
const AUTO_GUIDANCE = 'Picks the best model for each message';
const PICKER_TITLE = 'Models';
const PICKER_QUERY_LABEL = 'Matching';
const PICKER_COMPOSER_CARD_ID = 'chat-composer';
const PICKER_COMPOSER_CARD_GAP_PX = 8;
const MANAGED_CLOUD_PROVIDER_KEY = 'managed_cloud';
const COMING_SOON_LOCK_LABEL = 'Coming soon';
const ENVIRONMENT_LOCK_LABEL = 'Beta';
const autoContinuityGuidance = (displayName: string) => `Stays on ${displayName} for this chat`;
const lockedRowLabel = (planLabel: string) => `${planLabel} and above`;

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
  if (isFreeBillingPlanTier(tier)) return false;
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
 * routes through the same logic, no gating leak is possible from a partial
 * update.
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

type CapabilityMark = { key: ModelPickerCapabilityKey; label: string; Glyph: Icon };

function capabilityMarks(keys: readonly ModelPickerCapabilityKey[]): CapabilityMark[] {
  return keys.map((key) => ({ key, ...CAPABILITY_GLYPHS[key] }));
}

function rowGuidance(
  model: AIModel,
  row: ModelPickerRowModel | undefined,
  degraded: ProviderAvailability | undefined,
  deprecation: { shortLabel: string } | null,
): string {
  if (degraded) return 'Unavailable right now';
  if (deprecation) return `Leaving ${deprecation.shortLabel}`;
  return row?.guidance ?? model.provider;
}

function PriceBand({ band }: { band: ModelPickerPriceBand }) {
  return (
    <span
      role="img"
      aria-label={`Price band ${band.filled} of ${band.scale}`}
      title={`Price band ${band.filled} of ${band.scale}`}
      className="flex shrink-0 items-end gap-px"
    >
      {Array.from({ length: band.scale }, (_, index) => (
        <span
          key={index}
          aria-hidden="true"
          className={[
            'w-0.5 rounded-sm',
            index < band.filled ? 'bg-foreground/45' : 'bg-muted-foreground/25',
          ].join(' ')}
          style={{ height: `${(index + 1) * 2 + 2}px` }}
        />
      ))}
    </span>
  );
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

function AutoRow({
  auto,
  isSelected,
  onSelect,
}: {
  auto: ModelPickerAutoRow;
  isSelected: boolean;
  onSelect?: () => void;
}) {
  return (
    <button
      type="button"
      {...{ [PICKER_ROW_ATTR]: '' }}
      className={[
        PICKER_ROW_CLASS,
        'h-auto min-h-12 py-2',
        'cursor-pointer hover:bg-muted/60 focus-visible:bg-muted/60',
      ].join(' ')}
      onClick={onSelect}
      aria-pressed={isSelected}
      aria-label={auto.label}
    >
      <ProviderLogo providerKey={MANAGED_CLOUD_PROVIDER_KEY} size={PICKER_ICON_SIZE} />
      <span className="min-w-0 flex-1">
        <span
          className={[
            PICKER_ROW_NAME_CLASS,
            isSelected ? 'font-medium text-foreground' : 'text-foreground/85',
          ].join(' ')}
        >
          {auto.label}
        </span>
        <span className={PICKER_ROW_WRAPPED_GUIDANCE_CLASS}>{auto.guidance}</span>
        {auto.continuity && (
          <span className={PICKER_ROW_WRAPPED_GUIDANCE_CLASS}>{auto.continuity}</span>
        )}
      </span>
      {isSelected && <Check className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />}
    </button>
  );
}

function ModelRow({
  model,
  row,
  isSelected,
  isLocked,
  lockKind = 'tier',
  lockReason,
  onSelect,
  onUpgradeRequest,
  degraded,
}: {
  model: AIModel;
  row?: ModelPickerRowModel;
  isSelected: boolean;
  isLocked: boolean;
  lockKind?: 'tier' | 'env' | 'coming_soon';
  lockReason?: string;
  onSelect?: () => void;
  onUpgradeRequest?: () => void;
  degraded?: ProviderAvailability;
}) {
  const planLockLabel = row?.lock
    ? row.lock.kind === 'plan'
      ? lockedRowLabel(row.lock.label)
      : row.lock.label
    : null;
  const isEnvLocked = isLocked && lockKind === 'env';
  const isComingSoon = isLocked && lockKind === 'coming_soon';
  const isHardDisabled = isEnvLocked || isComingSoon;
  const marks = capabilityMarks(row?.capabilityKeys ?? []);
  const deprecationWarning = deprecationWarningFor(model);
  const guidance = rowGuidance(model, row, degraded, deprecationWarning);

  const handleLockedClick = () => {
    if (isHardDisabled) return;
    onUpgradeRequest?.();
  };

  const baseAriaLabel = isComingSoon
    ? `${model.name} - ${lockReason ?? 'coming soon'} (not yet available)`
    : isEnvLocked
      ? `${model.name} - ${lockReason ?? 'environment not available'}`
      : isLocked
        ? `${model.name} - ${planLockLabel ?? 'requires upgrade'}`
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
              : 'font-normal text-foreground',
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
      <span className="ml-auto flex shrink-0 items-center gap-2">
        {row?.priceBand && <PriceBand band={row.priceBand} />}
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
            className={`${PICKER_BADGE_CLASS} shrink-0 whitespace-nowrap bg-primary/10 normal-case text-primary`}
            aria-label={planLockLabel ?? 'Requires upgrade'}
          >
            <Lock className="mr-0.5 inline h-2.5 w-2.5 align-[-0.1em]" aria-hidden="true" />
            {planLockLabel ?? 'Upgrade'}
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
  onUpgradeRequest,
  onModelChange,
  lockModelSelector = false,
  showStyleSelector = true,
  inline = false,
  className,
}: ComposerFooterProps) {
  const effortPanelId = useId();
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [catalogueOpen, setCatalogueOpen] = useState(false);
  const [effortOpen, setEffortOpen] = useState(false);
  const [providerAvailability, setProviderAvailability] = useState<
    Record<string, ProviderAvailability>
  >({});
  const [composerClearancePx, setComposerClearancePx] = useState(0);
  const modelTriggerRef = useRef<HTMLButtonElement>(null);
  const pickerPanelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const trigger = modelTriggerRef.current;
    const card = document.getElementById(PICKER_COMPOSER_CARD_ID);
    if (!trigger || !card) {
      setComposerClearancePx(0);
      return;
    }
    const overlap = trigger.getBoundingClientRect().top - card.getBoundingClientRect().top;
    setComposerClearancePx(
      overlap > 0 ? overlap + PICKER_COMPOSER_CARD_GAP_PX - PICKER_ANCHOR_OFFSET_PX : 0,
    );
  }, [open]);

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
    setCatalogueOpen(false);
  }, []);

  const closeCatalogue = useCallback(() => {
    setCatalogueOpen(false);
    setSearchQuery('');
  }, []);

  /**
   * A dialog keeps Tab inside itself. jsdom moves no focus on Tab and the
   * popover is not modal, so the cycle is explicit here.
   */
  const handleCatalogueKeys = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      const panel = pickerPanelRef.current;
      if (!panel) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        closeCatalogue();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = Array.from(
        panel.querySelectorAll<HTMLElement>(PICKER_FOCUSABLE_SELECTOR),
      ).filter((element) => !element.hasAttribute('disabled'));
      if (focusable.length === 0) return;
      event.preventDefault();
      event.stopPropagation();
      const current = focusable.indexOf(document.activeElement as HTMLElement);
      const step = event.shiftKey ? -1 : 1;
      const next = current === -1 ? 0 : (current + step + focusable.length) % focusable.length;
      focusable[next]?.focus();
    },
    [closeCatalogue],
  );

  const handlePickerTypeAhead = useCallback((event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.key === 'Backspace') {
      event.stopPropagation();
      setSearchQuery((query) => query.slice(0, -1));
      return;
    }
    if (event.key.length !== 1 || event.key === ' ') return;
    event.stopPropagation();
    // preventDefault matters: without it the browser also delivers this same
    // character to the catalogue's field once it mounts and autofocuses, so the
    // query opened with its first letter doubled. jsdom cannot see that.
    event.preventDefault();
    // The search field lives in the catalogue only, so a typed character opens
    // the disclosure on that query rather than filtering the short list.
    setCatalogueOpen(true);
    setSearchQuery((query) => query + event.key);
  }, []);

  useMenuKeyboard({
    open: open && !catalogueOpen,
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

  // Prompt-cache accounting: switching the model mid-conversation resets the cache and re-bills
  // prior context at full input price (caching is per-model). The switch itself is never blocked;
  // the note is the disclosure. Logic lives in the shared @agiworkforce/routing policy.
  //
  // Count only COMPLETED assistant turns in an ACTIVE conversation:
  //   - `activeConversationId` gate: an empty/new chat holds no cached prefix.
  //   - `!m.isStreaming` gate: the assistant message added at the START of the
  //     very first turn is an empty streaming placeholder, not cached context.
  const assistantTurnCount = useChatStore((s) =>
    s.activeConversationId
      ? s.messages.filter((m) => m.role === 'assistant' && !m.isStreaming).length
      : 0,
  );
  const conversationModelId = useChatStore(
    (s) =>
      s.conversations.find((conversation) => conversation.id === s.activeConversationId)?.model ??
      null,
  );
  const [cacheResetNoteVisible, setCacheResetNoteVisible] = useState(false);
  const cacheResetNoteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [modelChangePending, setModelChangePending] = useState(false);

  useEffect(
    () => () => {
      if (cacheResetNoteTimer.current) clearTimeout(cacheResetNoteTimer.current);
    },
    [],
  );

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
      if (assessment.resetsCache) {
        if (cacheResetNoteTimer.current) clearTimeout(cacheResetNoteTimer.current);
        setCacheResetNoteVisible(true);
        cacheResetNoteTimer.current = setTimeout(
          () => setCacheResetNoteVisible(false),
          CACHE_RESET_NOTE_MS,
        );
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

  const catalogue = useModelCatalogue(open);
  const { favouriteModelIds, toggleFavourite } = useModelFavourites();

  const lockOverrides = useMemo(() => {
    const overrides = new Map<string, ModelPickerLock>();
    for (const model of AVAILABLE_MODELS) {
      const lock = modelLock(model, knownTier);
      if (!lock.locked) continue;
      if (lock.kind === 'coming_soon') {
        overrides.set(model.id, { kind: 'unavailable', label: COMING_SOON_LOCK_LABEL });
      } else if (lock.kind === 'env') {
        overrides.set(model.id, { kind: 'environment', label: ENVIRONMENT_LOCK_LABEL });
      } else {
        const planLabel = resolvePlanLockLabel(model.id);
        if (planLabel) overrides.set(model.id, { kind: 'plan', label: planLabel });
      }
    }
    return overrides;
  }, [knownTier]);

  const shortList = useMemo(
    () =>
      buildModelPickerShortList({
        models: AVAILABLE_MODELS.map((model) => ({
          id: model.id,
          displayName: model.name,
          providerKey: model.providerKey,
          guidance: model.description,
        })),
        planTier: knownTier,
        favouriteModelIds,
        conversationModelId,
        selectedModelId,
        admitsModel: (modelId) => {
          const candidate = AVAILABLE_MODELS.find((model) => model.id === modelId);
          return candidate ? !modelLock(candidate, knownTier).locked : false;
        },
        lockOverrides,
        autoGuidance: AUTO_GUIDANCE,
        autoContinuityGuidance,
      }),
    [conversationModelId, favouriteModelIds, lockOverrides, knownTier, selectedModelId],
  );

  const searchMatches = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return null;
    return AVAILABLE_MODELS.filter(
      (model) =>
        model.name.toLowerCase().includes(query) ||
        model.provider.toLowerCase().includes(query) ||
        model.description.toLowerCase().includes(query),
    );
  }, [searchQuery]);

  const triggerReceipt =
    selectedModelId === shortList.auto?.id
      ? (shortList.auto.continuity ?? shortList.auto.guidance)
      : `${selectedModel.provider} · ${selectedModel.description}`;

  const renderModelRow = (model: AIModel) => {
    const row = shortList.rowsById.get(model.id);
    const lock = modelLock(model, knownTier);
    return (
      <ModelRow
        key={model.id}
        model={model}
        row={row}
        isSelected={model.id === selectedModelId}
        isLocked={lock.locked}
        lockKind={lock.kind}
        lockReason={lock.reason}
        degraded={providerAvailability[model.providerKey]}
        onUpgradeRequest={lock.kind === 'tier' ? onUpgradeRequest : undefined}
        onSelect={lock.locked || modelChangePending ? undefined : () => handleSelectModel(model)}
      />
    );
  };

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
  const effortLadder = [...effortChips, ...gatedEffortChips];
  const firstGatedIndex = gatedEffortChips.length > 0 ? effortChips.length : -1;
  const effortMarks = effortLadder
    .map((_, index) => index)
    .filter((index) => index !== firstGatedIndex);

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
        <div className="relative flex min-w-0 items-center gap-2">
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
                  id={MODEL_SELECTOR_TRIGGER_ID}
                  disabled={modelChangePending}
                  className={MODEL_TRIGGER_CLASS}
                  aria-label={modelChangePending ? 'Saving model selection' : 'Change model'}
                  title={triggerReceipt ?? undefined}
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
                  <span className="min-w-[3.5rem] max-w-[6rem] shrink truncate font-medium sm:max-w-[140px]">
                    {modelChangePending ? 'Saving…' : selectedModel.name}
                  </span>
                  <ChevronDown className="h-3 w-3 shrink-0" />
                </button>
              </PopoverTrigger>
              <PopoverContent
                ref={pickerPanelRef}
                side="bottom"
                align="end"
                sideOffset={PICKER_ANCHOR_OFFSET_PX}
                alignOffset={0}
                collisionPadding={PICKER_VIEWPORT_INSET_PX}
                style={{ '--picker-flip-offset': `${composerClearancePx}px` } as CSSProperties}
                data-catalogue-open={catalogueOpen ? 'true' : 'false'}
                className={`flex overflow-y-hidden max-h-[min(34rem,var(--radix-popover-content-available-height))] ${catalogueOpen ? PICKER_CATALOGUE_WIDTH_CLASS : PICKER_PANEL_WIDTH_CLASS} flex-col rounded-lg border-[var(--chat-border)] p-0 data-[side=top]:max-h-[min(34rem,calc(var(--radix-popover-content-available-height)_-_var(--picker-flip-offset)))] data-[side=top]:-translate-y-[var(--picker-flip-offset)]`}
                aria-label={PICKER_TITLE}
                onKeyDownCapture={catalogueOpen ? handleCatalogueKeys : handlePickerTypeAhead}
                onEscapeKeyDown={(event) => {
                  if (!catalogueOpen) return;
                  event.preventDefault();
                  closeCatalogue();
                }}
                onCloseAutoFocus={(event) => {
                  event.preventDefault();
                  modelTriggerRef.current?.focus();
                }}
              >
                <TooltipProvider>
                  {catalogueOpen ? (
                    <ModelCatalogue
                      entries={catalogue.entries}
                      providers={catalogue.providers}
                      favouriteModelIds={favouriteModelIds}
                      selectedModelId={selectedModelId}
                      query={searchQuery}
                      onQueryChange={setSearchQuery}
                      onSelect={(modelId) => {
                        const target = AVAILABLE_MODELS.find((model) => model.id === modelId);
                        if (target) handleSelectModel(target);
                        else void commitModel(modelId);
                      }}
                      onToggleFavourite={toggleFavourite}
                      onUpgradeRequest={onUpgradeRequest}
                      isEnvironmentLocked={(requiresEnvironment) => {
                        const result = evaluateModelEnvironment(
                          requiresEnvironment as ModelEnvironment,
                          environmentAvailability(requiresEnvironment as ModelEnvironment),
                        );
                        return result.selectable
                          ? { locked: false }
                          : { locked: true, ...(result.reason ? { reason: result.reason } : {}) };
                      }}
                      onBack={closeCatalogue}
                    />
                  ) : (
                    <div className="min-h-0 flex-1 overflow-y-auto p-1">
                      {searchMatches ? (
                        <>
                          <p className={PICKER_SECTION_LABEL_CLASS} role="status">
                            {`${PICKER_QUERY_LABEL} ${searchQuery}`}
                          </p>
                          {searchMatches.length > 0 ? (
                            searchMatches.map(renderModelRow)
                          ) : (
                            <p className="px-3 py-4 text-center text-xs text-muted-foreground">
                              No models match
                            </p>
                          )}
                        </>
                      ) : (
                        <>
                          {shortList.auto && (
                            <AutoRow
                              auto={shortList.auto}
                              isSelected={shortList.auto.id === selectedModelId}
                              onSelect={
                                modelChangePending
                                  ? undefined
                                  : () => {
                                      const autoModel = AVAILABLE_MODELS.find(
                                        (model) => model.id === shortList.auto?.id,
                                      );
                                      if (autoModel) handleSelectModel(autoModel);
                                    }
                              }
                            />
                          )}

                          {shortList.current &&
                            (() => {
                              const model = AVAILABLE_MODELS.find(
                                (candidate) => candidate.id === shortList.current?.id,
                              );
                              return model ? renderModelRow(model) : null;
                            })()}

                          {shortList.recommended.length > 0 && (
                            <>
                              <p className={PICKER_SECTION_LABEL_CLASS}>Recommended</p>
                              {shortList.recommended.map((row) => {
                                const model = AVAILABLE_MODELS.find(
                                  (candidate) => candidate.id === row.id,
                                );
                                return model ? renderModelRow(model) : null;
                              })}
                            </>
                          )}

                          {shortList.favourites.length > 0 && (
                            <>
                              <p className={PICKER_SECTION_LABEL_CLASS}>Favourites</p>
                              {shortList.favourites.map((row) => {
                                const model = AVAILABLE_MODELS.find(
                                  (candidate) => candidate.id === row.id,
                                );
                                return model ? renderModelRow(model) : null;
                              })}
                            </>
                          )}

                          <div className="my-1 border-t border-[var(--chat-border)]" />
                          <button
                            type="button"
                            {...{ [PICKER_ROW_ATTR]: '' }}
                            className={`${PICKER_ROW_CLASS} hover:bg-muted/60 focus-visible:bg-muted/60`}
                            onClick={() => setCatalogueOpen(true)}
                            aria-expanded={false}
                          >
                            <span className="min-w-0 flex-1">
                              <span className={`${PICKER_ROW_NAME_CLASS} text-foreground`}>
                                All models
                              </span>
                            </span>
                            <span className="shrink-0 text-xs text-muted-foreground">
                              {catalogue.status === 'ready'
                                ? catalogue.count
                                : shortList.totalCount}
                            </span>
                            <ChevronRight
                              className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                              aria-hidden="true"
                            />
                          </button>
                        </>
                      )}
                    </div>
                  )}
                  {!catalogueOpen && !shortList.plan.admitsEveryModel && (
                    <div className="shrink-0 border-t border-[var(--chat-border)] p-1">
                      <a
                        {...{ [PICKER_ROW_ATTR]: '' }}
                        href={PLAN_PAGE_HREF}
                        className={`${PICKER_ROW_CLASS} h-9 text-xs font-medium text-primary hover:bg-muted/60 focus-visible:bg-muted/60`}
                      >
                        {PLAN_PAGE_LINK_TEXT}
                      </a>
                    </div>
                  )}
                </TooltipProvider>
              </PopoverContent>
            </Popover>
          )}

          {showModelSelector && !lockModelSelector && hasEffortControl && (
            <Popover open={effortOpen} onOpenChange={setEffortOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className={EFFORT_TRIGGER_CLASS}
                  aria-label={`Reasoning effort: ${effortSliderVisible ? selectedEffortLabel : EFFORT_OFF_LABEL}`}
                  aria-expanded={effortOpen}
                  title="Reasoning effort"
                >
                  <Brain className="hidden h-3.5 w-3.5 shrink-0 sm:block" aria-hidden="true" />
                  <span className="font-medium">
                    {effortSliderVisible ? selectedEffortLabel : EFFORT_OFF_LABEL}
                  </span>
                  <ChevronDown className="h-3 w-3 shrink-0" />
                </button>
              </PopoverTrigger>
              <PopoverContent
                side="top"
                align="end"
                sideOffset={PICKER_ANCHOR_OFFSET_PX}
                className="w-72 rounded-lg border-[var(--chat-border)] p-3"
                aria-label="Reasoning effort"
              >
                {(showThinkingSwitch || !effortSliderVisible) && (
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium text-foreground">Effort</span>
                    {showThinkingSwitch && (
                      <Switch
                        checked={thinkingEnabled}
                        onCheckedChange={handleThinkingEnabledChange}
                        aria-label="Toggle extended thinking"
                        className="h-5 w-9"
                      />
                    )}
                  </div>
                )}
                {effortSliderVisible && (
                  <div id={effortPanelId} className={showThinkingSwitch ? 'mt-3' : 'mt-1'}>
                    <button
                      type="button"
                      onClick={() => {
                        setEffortOpen(false);
                        setOpen(true);
                      }}
                      className="flex w-full items-center gap-2 rounded-md px-1 py-1 text-sm transition-colors hover:bg-muted/60"
                      aria-label={`${selectedModel.name} ${selectedEffortLabel}. Change model`}
                    >
                      <Brain
                        className="h-4 w-4 shrink-0 text-muted-foreground"
                        aria-hidden="true"
                      />
                      <span className="min-w-0 flex-1 truncate text-center font-semibold text-foreground">
                        {selectedModel.name}{' '}
                        <span className="font-normal text-muted-foreground">
                          {selectedEffortLabel}
                        </span>
                      </span>
                      <ChevronRight
                        className="h-4 w-4 shrink-0 text-muted-foreground"
                        aria-hidden="true"
                      />
                    </button>
                    <div className="relative mt-2">
                      <Slider
                        min={0}
                        max={effortLadder.length - 1}
                        step={1}
                        value={[effortSliderIndex]}
                        onValueChange={(value) => {
                          const chip = effortChips[value[0] ?? -1];
                          if (chip) handleEffortChip(chip);
                        }}
                        onValueCommit={(value) => {
                          if ((value[0] ?? 0) >= effortChips.length) onUpgradeRequest?.();
                        }}
                        marks={effortMarks}
                        markInset={EFFORT_THUMB_INSET}
                        thumbAriaLabel="Reasoning effort"
                        valueLabel={selectedEffortLabel}
                        trackClassName={EFFORT_TRACK_CLASS}
                        rangeClassName={EFFORT_RANGE_CLASS}
                        thumbClassName={EFFORT_THUMB_CLASS}
                      />
                      {firstGatedIndex >= 0 && (
                        <span
                          aria-hidden="true"
                          className="pointer-events-none absolute inset-y-0"
                          style={{ left: EFFORT_THUMB_INSET, right: EFFORT_THUMB_INSET }}
                        >
                          <span
                            className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 text-muted-foreground"
                            style={{ left: ladderOffset(firstGatedIndex, effortLadder.length) }}
                          >
                            <Lock className="h-3.5 w-3.5" />
                          </span>
                        </span>
                      )}
                    </div>
                  </div>
                )}
                <p className="mt-2 text-xs text-muted-foreground">
                  {isAlwaysOn
                    ? 'Always on for this model'
                    : effortSliderVisible
                      ? 'Higher effort thinks longer before it answers.'
                      : 'Extended thinking is off for this model.'}
                </p>
                {gatedEffortChips.length > 0 && (
                  <p className="mt-2 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                    <span>
                      {gatedEffortChips.map((chip) => EFFORT_LABEL[chip]).join(', ')}{' '}
                      {gatedEffortChips.length > 1 ? 'effort levels are' : 'effort is'} not included
                      in your plan.
                    </span>
                    {onUpgradeRequest && (
                      <button
                        type="button"
                        onClick={onUpgradeRequest}
                        className="font-medium text-primary underline-offset-2 hover:underline"
                      >
                        Upgrade
                      </button>
                    )}
                  </p>
                )}
              </PopoverContent>
            </Popover>
          )}

          {cacheResetNoteVisible && (
            <span role="status" className={CACHE_RESET_NOTE_CLASS}>
              {CACHE_RESET_NOTE_TEXT}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
