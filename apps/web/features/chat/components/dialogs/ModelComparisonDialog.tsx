'use client';

/**
 * ModelComparisonDialog - Select models for side-by-side comparison
 *
 * Lets users pick 2-3 models from the available catalog, with quick presets
 * for common comparison scenarios. Launches the ModelComparisonView on confirm.
 */

import React, { useCallback, useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@shared/ui/dialog';
import { Button } from '@shared/ui/button';
import { Badge } from '@shared/ui/badge';
import { Label } from '@shared/ui/label';
import { ScrollArea } from '@shared/ui/scroll-area';
import { Checkbox } from '@shared/ui/checkbox';
import { cn } from '@shared/lib/utils';
import { Zap, Brain, DollarSign, GitCompareArrows } from 'lucide-react';
import { type AIModel, AVAILABLE_MODELS } from '@shared/stores/model-store';

// ---------------------------------------------------------------------------
// Provider colors
// ---------------------------------------------------------------------------

const PROVIDER_COLORS: Record<string, string> = {
  OpenAI: 'bg-emerald-500',
  Anthropic: 'bg-orange-400',
  Google: 'bg-blue-500',
  DeepSeek: 'bg-indigo-500',
  Perplexity: 'bg-teal-500',
  xAI: 'bg-zinc-400',
  Mistral: 'bg-violet-500',
};

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------

interface Preset {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  modelIds: string[];
}

const PRESETS: Preset[] = [
  {
    id: 'fast-vs-smart',
    name: 'Fast vs Smart',
    description: 'Speed against depth',
    icon: <Zap className="h-4 w-4" />,
    modelIds: ['gpt-4o-mini', 'claude-opus-4-6', 'gemini-2.0-flash'],
  },
  {
    id: 'open-vs-closed',
    name: 'Open vs Closed',
    description: 'Open-weight vs proprietary',
    icon: <GitCompareArrows className="h-4 w-4" />,
    modelIds: ['deepseek-chat', 'gpt-4o', 'mistral-large-latest'],
  },
  {
    id: 'budget-vs-premium',
    name: 'Budget vs Premium',
    description: 'Cost-efficient vs top-tier',
    icon: <DollarSign className="h-4 w-4" />,
    modelIds: ['gpt-4o-mini', 'claude-opus-4-6', 'gemini-2.0-flash-lite'],
  },
  {
    id: 'reasoning',
    name: 'Reasoning Models',
    description: 'Chain-of-thought specialists',
    icon: <Brain className="h-4 w-4" />,
    modelIds: ['o3-mini', 'deepseek-reasoner', 'claude-sonnet-4-6'],
  },
];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ModelComparisonDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called when user confirms selection. Returns selected AIModel objects. */
  onCompare: (models: AIModel[]) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function groupByProvider(models: readonly AIModel[]) {
  return models.reduce<Record<string, AIModel[]>>((acc, model) => {
    if (!acc[model.provider]) acc[model.provider] = [];
    acc[model.provider]!.push(model);
    return acc;
  }, {});
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const MIN_MODELS = 2;
const MAX_MODELS = 3;

export function ModelComparisonDialog({
  open,
  onOpenChange,
  onCompare,
}: ModelComparisonDialogProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const grouped = useMemo(() => groupByProvider(AVAILABLE_MODELS), []);

  const toggleModel = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else if (next.size < MAX_MODELS) {
        next.add(id);
      }
      return next;
    });
  }, []);

  const applyPreset = useCallback((preset: Preset) => {
    // Only include IDs that actually exist in AVAILABLE_MODELS
    const validIds = preset.modelIds.filter((id) => AVAILABLE_MODELS.some((m) => m.id === id));
    setSelectedIds(new Set(validIds.slice(0, MAX_MODELS)));
  }, []);

  const handleCompare = useCallback(() => {
    const models = AVAILABLE_MODELS.filter((m) => selectedIds.has(m.id));
    if (models.length < MIN_MODELS) return;
    onCompare(models);
    onOpenChange(false);
    // Reset for next open
    setSelectedIds(new Set());
  }, [selectedIds, onCompare, onOpenChange]);

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) {
        setSelectedIds(new Set());
      }
      onOpenChange(nextOpen);
    },
    [onOpenChange],
  );

  const canCompare = selectedIds.size >= MIN_MODELS;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Compare models</DialogTitle>
          <DialogDescription>
            Select {MIN_MODELS}-{MAX_MODELS} models to compare side by side. The same prompt will be
            sent to each model simultaneously.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Quick presets */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Quick presets</Label>
            <div className="grid grid-cols-2 gap-2">
              {PRESETS.map((preset) => {
                const isActive = preset.modelIds
                  .filter((id) => AVAILABLE_MODELS.some((m) => m.id === id))
                  .every((id) => selectedIds.has(id));
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => applyPreset(preset)}
                    className={cn(
                      'flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors',
                      isActive
                        ? 'border-primary bg-primary/5 text-foreground'
                        : 'border-border text-muted-foreground hover:border-border/80 hover:bg-muted/50',
                    )}
                  >
                    <span className="shrink-0">{preset.icon}</span>
                    <span className="min-w-0">
                      <span className="block font-medium leading-tight">{preset.name}</span>
                      <span className="block text-xs text-muted-foreground">
                        {preset.description}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Model picker */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Models</Label>
              <span className="text-xs text-muted-foreground">
                {selectedIds.size}/{MAX_MODELS} selected
              </span>
            </div>

            <ScrollArea className="h-[240px] rounded-md border border-border/50">
              <div className="p-2 space-y-3">
                {Object.entries(grouped).map(([provider, models]) => (
                  <div key={provider}>
                    <p className="mb-1.5 px-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                      {provider}
                    </p>
                    <div className="space-y-0.5">
                      {models.map((model) => {
                        const isChecked = selectedIds.has(model.id);
                        const isDisabled = !isChecked && selectedIds.size >= MAX_MODELS;
                        const dot = PROVIDER_COLORS[model.provider] ?? 'bg-muted-foreground';
                        return (
                          <label
                            key={model.id}
                            className={cn(
                              'flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 transition-colors',
                              isChecked
                                ? 'bg-primary/5'
                                : isDisabled
                                  ? 'cursor-not-allowed opacity-50'
                                  : 'hover:bg-muted/50',
                            )}
                          >
                            <Checkbox
                              checked={isChecked}
                              onCheckedChange={() => {
                                if (!isDisabled || isChecked) toggleModel(model.id);
                              }}
                              disabled={isDisabled && !isChecked}
                              aria-label={`Select ${model.name}`}
                            />
                            <span className={`h-2 w-2 shrink-0 rounded-full ${dot}`} />
                            <span className="flex-1 min-w-0">
                              <span className="block text-sm leading-tight">{model.name}</span>
                              <span className="block text-xs text-muted-foreground truncate">
                                {model.description}
                              </span>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>

          {/* Selection summary */}
          {selectedIds.size > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {Array.from(selectedIds).map((id) => {
                const model = AVAILABLE_MODELS.find((m) => m.id === id);
                if (!model) return null;
                const dot = PROVIDER_COLORS[model.provider] ?? 'bg-muted-foreground';
                return (
                  <Badge
                    key={id}
                    variant="secondary"
                    className="flex items-center gap-1.5 text-xs cursor-pointer hover:bg-destructive/10 hover:text-destructive transition-colors"
                    onClick={() => toggleModel(id)}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
                    {model.name}
                    <span className="text-muted-foreground/60 ml-0.5">&times;</span>
                  </Badge>
                );
              })}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleCompare} disabled={!canCompare}>
            <GitCompareArrows className="mr-2 h-4 w-4" />
            Compare{canCompare ? ` (${selectedIds.size})` : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
