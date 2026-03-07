/**
 * MemoryPanel Component
 *
 * User-facing persistent memory management panel — the "Memory" feature that
 * makes AGI Workforce feel like it knows the user (like ChatGPT Memory).
 *
 * Shown as a tab inside the Settings dialog. Wraps the existing MemoryManager
 * with a header that exposes the enable/disable toggle, auto-inject toggle,
 * and token budget slider, making the full feature immediately discoverable.
 *
 * Memory settings (isEnabled, autoInject, maxTokens) are stored in localStorage
 * under "agi-memory-panel-settings" so the chat injection code can read them
 * without depending on React state.
 */

import { memo, useCallback, useEffect, useState } from 'react';
import { Brain, Zap } from 'lucide-react';

import { Switch } from '@/components/ui/Switch';
import { Label } from '@/components/ui/Label';
import { Slider } from '@/components/ui/Slider';
import { Separator } from '@/components/ui/Separator';
import { cn } from '@/lib/utils';
import { MemoryManager } from './MemoryManager';

// ---------------------------------------------------------------------------
// Settings helpers (shared with chat injection via localStorage)
// ---------------------------------------------------------------------------

export const MEMORY_SETTINGS_KEY = 'agi-memory-panel-settings';

export interface MemoryPanelSettings {
  isEnabled: boolean;
  autoInject: boolean;
  maxTokens: number;
}

const DEFAULT_SETTINGS: MemoryPanelSettings = {
  isEnabled: true,
  autoInject: true,
  maxTokens: 500,
};

export function readMemoryPanelSettings(): MemoryPanelSettings {
  try {
    const raw = localStorage.getItem(MEMORY_SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<MemoryPanelSettings>;
      return { ...DEFAULT_SETTINGS, ...parsed };
    }
  } catch {
    // ignore storage errors
  }
  return { ...DEFAULT_SETTINGS };
}

function writeMemoryPanelSettings(patch: Partial<MemoryPanelSettings>): void {
  try {
    const current = readMemoryPanelSettings();
    localStorage.setItem(MEMORY_SETTINGS_KEY, JSON.stringify({ ...current, ...patch }));
  } catch {
    // ignore storage errors
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface MemoryPanelProps {
  className?: string;
}

export const MemoryPanel = memo(function MemoryPanel({ className }: MemoryPanelProps) {
  const [settings, setSettings] = useState<MemoryPanelSettings>(readMemoryPanelSettings);

  // Re-read from localStorage when the panel mounts (another tab may have
  // changed the settings while this component was unmounted)
  useEffect(() => {
    setSettings(readMemoryPanelSettings());
  }, []);

  const updateSettings = useCallback((patch: Partial<MemoryPanelSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      writeMemoryPanelSettings(next);
      return next;
    });
  }, []);

  return (
    <div className={cn('flex flex-col gap-6', className)}>
      {/* ------------------------------------------------------------------ */}
      {/* Header                                                              */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex items-start gap-4">
        <div className="rounded-md bg-blue-500/10 p-3 border border-blue-500/20">
          <Brain className="h-6 w-6 text-blue-400" />
        </div>
        <div className="flex-1">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold">Memory</h3>
              <p className="text-sm text-muted-foreground mt-0.5">
                AGI Workforce remembers things you&apos;ve told it so you don&apos;t have to repeat
                yourself.
              </p>
            </div>
            <Switch
              id="memory-enabled"
              checked={settings.isEnabled}
              onCheckedChange={(val) => updateSettings({ isEnabled: val })}
            />
          </div>
        </div>
      </div>

      <Separator />

      {/* ------------------------------------------------------------------ */}
      {/* Controls                                                            */}
      {/* ------------------------------------------------------------------ */}
      <div
        className={cn(
          'space-y-5 transition-opacity duration-200',
          !settings.isEnabled && 'opacity-40 pointer-events-none select-none',
        )}
      >
        {/* Auto-inject toggle */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <Zap className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
            <div>
              <Label htmlFor="memory-auto-inject" className="font-medium cursor-pointer">
                Auto-inject into conversations
              </Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                Automatically include relevant memories in every message context
              </p>
            </div>
          </div>
          <Switch
            id="memory-auto-inject"
            checked={settings.autoInject}
            onCheckedChange={(val) => updateSettings({ autoInject: val })}
          />
        </div>

        {/* Token budget slider */}
        {settings.autoInject && (
          <div className="flex flex-col gap-3 pl-7">
            <div className="flex items-center justify-between">
              <Label className="text-sm">Token budget per request</Label>
              <span className="text-sm font-mono text-muted-foreground tabular-nums">
                {settings.maxTokens} tokens
              </span>
            </div>
            <Slider
              min={100}
              max={2000}
              step={100}
              value={[settings.maxTokens]}
              onValueChange={(vals) => updateSettings({ maxTokens: vals[0] ?? 500 })}
              className="w-full"
            />
            <p className="text-xs text-muted-foreground">
              Higher budgets include more memories but consume more context window. 500 is a good
              default.
            </p>
          </div>
        )}
      </div>

      <Separator />

      {/* ------------------------------------------------------------------ */}
      {/* Memory Manager                                                      */}
      {/* ------------------------------------------------------------------ */}
      <div
        className={cn(
          'transition-opacity duration-200',
          !settings.isEnabled && 'opacity-40 pointer-events-none select-none',
        )}
      >
        <MemoryManager showCreateButton showImportExport maxHeight="calc(100vh - 480px)" />
      </div>
    </div>
  );
});
