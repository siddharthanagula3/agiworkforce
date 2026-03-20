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

import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Brain, Download, Pause, Play, Upload, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { save, open as openFilePicker } from '@tauri-apps/plugin-dialog';
import { writeTextFile, readTextFile } from '@tauri-apps/plugin-fs';

import { Switch } from '@/components/ui/Switch';
import { Label } from '@/components/ui/Label';
import { Slider } from '@/components/ui/Slider';
import { Separator } from '@/components/ui/Separator';
import { Button } from '@/components/ui/Button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/Tooltip';
import { cn } from '@/lib/utils';
import { isTauri } from '@/lib/tauri-mock';
import { exportToJson, importFromJsonString } from '@/api/memory';
import { MemoryManager } from './MemoryManager';

// ---------------------------------------------------------------------------
// Settings helpers (shared with chat injection via localStorage)
// ---------------------------------------------------------------------------

export const MEMORY_SETTINGS_KEY = 'agi-memory-panel-settings';

export interface MemoryPanelSettings {
  isEnabled: boolean;
  autoInject: boolean;
  maxTokens: number;
  isPaused: boolean;
}

const DEFAULT_SETTINGS: MemoryPanelSettings = {
  isEnabled: true,
  autoInject: true,
  maxTokens: 500,
  isPaused: false,
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
  const importInputRef = useRef<HTMLInputElement>(null);

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

  const handlePauseToggle = useCallback(() => {
    updateSettings({ isPaused: !settings.isPaused });
    toast.info(settings.isPaused ? 'Memory creation resumed' : 'Memory creation paused');
  }, [settings.isPaused, updateSettings]);

  const handleExport = useCallback(async () => {
    try {
      const data = await exportToJson();
      const json = typeof data === 'string' ? data : JSON.stringify(data, null, 2);

      if (isTauri) {
        const savePath = await save({
          defaultPath: `memories-export-${new Date().toISOString().split('T')[0]}.json`,
          filters: [{ name: 'JSON', extensions: ['json'] }],
        });
        if (savePath) {
          await writeTextFile(savePath, json);
          toast.success('Memories exported successfully');
        }
      } else {
        // Web fallback: trigger browser download
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `memories-export-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        toast.success('Memories exported successfully');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Export failed';
      toast.error(`Export failed: ${message}`);
    }
  }, []);

  const handleImportFile = useCallback(async () => {
    try {
      if (isTauri) {
        const selected = await openFilePicker({
          multiple: false,
          filters: [{ name: 'JSON', extensions: ['json'] }],
        });
        if (!selected) return;
        const filePath = typeof selected === 'string' ? selected : (selected as string[])[0];
        if (!filePath) return;
        const content = await readTextFile(filePath);
        await importFromJsonString(content);
        toast.success('Memories imported successfully');
      } else {
        // Web fallback: file input
        importInputRef.current?.click();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Import failed';
      toast.error(`Import failed: ${message}`);
    }
  }, []);

  const handleImportInputChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const content = await file.text();
      await importFromJsonString(content);
      toast.success('Memories imported successfully');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Import failed';
      toast.error(`Import failed: ${message}`);
    } finally {
      // Reset so the same file can be re-imported if needed
      e.target.value = '';
    }
  }, []);

  return (
    <div className={cn('flex flex-col gap-6', className)}>
      {/* Hidden file input for web-mode import */}
      <input
        ref={importInputRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={(e) => void handleImportInputChange(e)}
        aria-hidden="true"
      />

      {/* ------------------------------------------------------------------ */}
      {/* Header                                                              */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex items-start gap-4">
        <div className="rounded-md bg-blue-500/10 p-3 border border-blue-500/20">
          <Brain className="h-6 w-6 text-blue-400" />
        </div>
        <div className="flex-1">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold">Memory</h3>
              <p className="text-sm text-muted-foreground mt-0.5">
                AGI Workforce remembers things you&apos;ve told it so you don&apos;t have to repeat
                yourself.
              </p>
            </div>
            {/* Toolbar: pause, export, import, enable toggle */}
            <div className="flex items-center gap-2 shrink-0">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handlePauseToggle}
                    disabled={!settings.isEnabled}
                    className={cn(
                      'h-8 w-8 p-0',
                      settings.isPaused && 'text-amber-500 hover:text-amber-400',
                    )}
                    aria-label={
                      settings.isPaused ? 'Resume memory creation' : 'Pause memory creation'
                    }
                  >
                    {settings.isPaused ? (
                      <Play className="h-4 w-4" />
                    ) : (
                      <Pause className="h-4 w-4" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {settings.isPaused
                    ? 'Resume: allow new memories to be created'
                    : 'Pause: keep existing memories but stop creating new ones'}
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void handleExport()}
                    className="h-8 w-8 p-0"
                    aria-label="Export memories to JSON file"
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Export memories to JSON</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void handleImportFile()}
                    className="h-8 w-8 p-0"
                    aria-label="Import memories from JSON file"
                  >
                    <Upload className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Import memories from JSON</TooltipContent>
              </Tooltip>

              <Switch
                id="memory-enabled"
                checked={settings.isEnabled}
                onCheckedChange={(val) => updateSettings({ isEnabled: val })}
              />
            </div>
          </div>

          {/* Paused indicator */}
          {settings.isEnabled && settings.isPaused && (
            <p className="text-xs text-amber-500 mt-1.5 flex items-center gap-1">
              <Pause className="h-3 w-3" />
              Memory creation is paused — existing memories still available
            </p>
          )}
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
