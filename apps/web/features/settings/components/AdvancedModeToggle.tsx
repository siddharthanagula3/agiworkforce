'use client';

/**
 * AdvancedModeToggle — tier-gated manual model picker for Pro and Max users.
 *
 * Design decisions (per parallel-spinning-hedgehog.md §2 Round 13):
 * - Toggle is only rendered when `getTierPolicy(tier).allowManualSelection === true`.
 *   Hobby and Free tiers never see the toggle.
 * - When toggle is OFF, chat uses auto-routing.
 * - When toggle is ON, the model dropdown appears and the picked model is stored
 *   in `settingsStore.advancedModelId` (localStorage-persisted).
 * - The parent page (ChatTab / SettingsPage) is responsible for reading
 *   `advancedMode` and `advancedModelId` and passing the override to the
 *   model store — see integration note below.
 *
 * Integration note: callers should do:
 *   const { advancedMode, advancedModelId } = useSettingsStore();
 *   const setSelectedModelId = useModelStore((s) => s.setSelectedModelId);
 *   useEffect(() => {
 *     if (advancedMode && advancedModelId) setSelectedModelId(advancedModelId);
 *     else setSelectedModelId('auto-balanced');
 *   }, [advancedMode, advancedModelId, setSelectedModelId]);
 *
 * Vercel React Best Practices applied:
 * - `rerender-no-inline-components`: AdvancedModelDropdown and AdvancedModeRow
 *   are extracted as top-level components.
 * - `rerender-memo-with-default-value`: EMPTY_SLOTS hoisted at module scope.
 * - `rendering-conditional-render`: ternary used, never `&&`.
 * - `bundle-analyzable-paths`: named imports only from shadcn/ui.
 */

import React, { memo } from 'react';
import { Switch } from '@shared/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@shared/ui/select';
import { Label } from '@shared/ui/label';
import { Badge } from '@shared/ui/badge';
import { getTierPolicy, SLOT_REGISTRY } from '@agiworkforce/types';
import type { RoutingSlot } from '@agiworkforce/types';
import { getModelMetadata } from '@/constants/llm';
import { useSettingsStore } from '@/stores/settingsStore';

// ---------------------------------------------------------------------------
// Module-scope constants (rerender-memo-with-default-value)
// ---------------------------------------------------------------------------

/** Fallback for `allowedSlots` before tier policy resolves. */
const EMPTY_SLOTS: readonly string[] = Object.freeze([]);

/** Model item shape for the picker dropdown. */
interface ModelDropdownItem {
  modelId: string;
  slotLabel: string;
  modelName: string;
  slot: string;
}

// ---------------------------------------------------------------------------
// Helper: resolve allowedSlots to picker items
// ---------------------------------------------------------------------------

function resolveDropdownItems(allowedSlots: readonly string[]): ModelDropdownItem[] {
  const items: ModelDropdownItem[] = [];
  for (const slotName of allowedSlots) {
    const slotDef = SLOT_REGISTRY[slotName as RoutingSlot];
    if (!slotDef) continue;
    // Skip image/video generation and voice slots from the chat model picker —
    // they are specialty slots not surfaced as general chat models.
    if (
      slotName === 'image_generation' ||
      slotName === 'video_generation' ||
      slotName === 'voice_transcription' ||
      slotName === 'voice_rewrite'
    ) {
      continue;
    }
    const meta = getModelMetadata(slotDef.modelId);
    const modelName = meta?.name ?? slotDef.modelId;
    items.push({
      modelId: slotDef.modelId,
      slotLabel: slotDef.label,
      modelName,
      slot: slotName,
    });
  }
  // Deduplicate by modelId while preserving order (multiple slots may point to
  // the same model, e.g. workhorse_general used as both fallback and primary).
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.modelId)) return false;
    seen.add(item.modelId);
    return true;
  });
}

// ---------------------------------------------------------------------------
// Sub-component: AdvancedModelDropdown (rerender-no-inline-components)
// ---------------------------------------------------------------------------

interface AdvancedModelDropdownProps {
  items: ModelDropdownItem[];
  selectedModelId: string | null;
  onSelect: (modelId: string) => void;
}

const AdvancedModelDropdown = memo(function AdvancedModelDropdown({
  items,
  selectedModelId,
  onSelect,
}: AdvancedModelDropdownProps) {
  return (
    <div className="mt-3 space-y-1.5">
      <Label htmlFor="advanced-model-select" className="text-sm font-medium">
        Model
      </Label>
      <Select value={selectedModelId ?? ''} onValueChange={onSelect}>
        <SelectTrigger
          id="advanced-model-select"
          className="w-full border-white/[0.06] bg-white/[0.03]"
        >
          <SelectValue placeholder="Select a model..." />
        </SelectTrigger>
        <SelectContent>
          {items.map((item) => (
            <AdvancedModelOption key={item.modelId} item={item} />
          ))}
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">
        Override auto-routing for this session. Auto-routing resumes when Advanced mode is off.
      </p>
    </div>
  );
});

// ---------------------------------------------------------------------------
// Sub-component: AdvancedModelOption (rerender-no-inline-components)
// ---------------------------------------------------------------------------

interface AdvancedModelOptionProps {
  item: ModelDropdownItem;
}

const AdvancedModelOption = memo(function AdvancedModelOption({ item }: AdvancedModelOptionProps) {
  return (
    <SelectItem value={item.modelId}>
      <span className="flex flex-col">
        <span className="font-medium">{item.modelName}</span>
        <span className="text-xs text-muted-foreground">{item.slotLabel}</span>
      </span>
    </SelectItem>
  );
});

// ---------------------------------------------------------------------------
// Sub-component: AdvancedModeRow (rerender-no-inline-components)
// ---------------------------------------------------------------------------

interface AdvancedModeRowProps {
  advancedMode: boolean;
  onToggle: (checked: boolean) => void;
}

const AdvancedModeRow = memo(function AdvancedModeRow({
  advancedMode,
  onToggle,
}: AdvancedModeRowProps) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="space-y-0.5">
        <div className="flex items-center gap-2">
          <Label htmlFor="advanced-mode-switch" className="text-sm font-medium cursor-pointer">
            Advanced mode
          </Label>
          <Badge
            variant="outline"
            className="border-violet-500/30 bg-violet-500/10 text-xs text-violet-400"
          >
            Pro
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          Pick a specific model instead of letting the system route automatically.
        </p>
      </div>
      <Switch
        id="advanced-mode-switch"
        checked={advancedMode}
        onCheckedChange={onToggle}
        aria-label="Toggle Advanced mode"
      />
    </div>
  );
});

// ---------------------------------------------------------------------------
// Main export: AdvancedModeToggle
// ---------------------------------------------------------------------------

export interface AdvancedModeToggleProps {
  /**
   * The user's current subscription tier string (e.g. 'pro', 'max', 'hobby').
   * Accepts any value — normalisation is done internally via `getTierPolicy`.
   */
  tier: string | null | undefined;
}

/**
 * Renders the Advanced mode toggle and (when ON) the model dropdown.
 * Hidden entirely when the tier policy does not allow manual selection.
 */
export function AdvancedModeToggle({ tier }: AdvancedModeToggleProps) {
  const policy = getTierPolicy(tier);
  const allowManualSelection = policy.manualModelSelection;

  const advancedMode = useSettingsStore((s) => s.advancedMode);
  const advancedModelId = useSettingsStore((s) => s.advancedModelId);
  const setAdvancedMode = useSettingsStore((s) => s.setAdvancedMode);
  const setAdvancedModelId = useSettingsStore((s) => s.setAdvancedModelId);

  const allowedSlots = allowManualSelection ? policy.allowedSlots : EMPTY_SLOTS;
  const items = React.useMemo(() => resolveDropdownItems(allowedSlots), [allowedSlots]);

  const handleToggle = React.useCallback(
    (checked: boolean) => {
      setAdvancedMode(checked);
      // When turning off, clear the manual model so auto-routing resumes.
      if (!checked) setAdvancedModelId(null);
    },
    [setAdvancedMode, setAdvancedModelId],
  );

  const handleModelSelect = React.useCallback(
    (modelId: string) => {
      setAdvancedModelId(modelId);
    },
    [setAdvancedModelId],
  );

  // rendering-conditional-render: ternary, not &&
  return allowManualSelection ? (
    <div data-testid="advanced-mode-section" className="space-y-1">
      <AdvancedModeRow advancedMode={advancedMode} onToggle={handleToggle} />
      {advancedMode ? (
        <AdvancedModelDropdown
          items={items}
          selectedModelId={advancedModelId}
          onSelect={handleModelSelect}
        />
      ) : null}
    </div>
  ) : null;
}
