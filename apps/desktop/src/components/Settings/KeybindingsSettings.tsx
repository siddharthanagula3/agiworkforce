/**
 * KeybindingsSettings — keyboard shortcut management UI.
 *
 * Features:
 * - Grouped by category
 * - Click "Edit" to capture a new key combo via keydown
 * - Conflict detection warns if the combo is already used
 * - Per-shortcut and global reset to defaults
 * - Search/filter by description
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Keyboard, RotateCcw, Search, AlertTriangle, X, Eye } from 'lucide-react';
import { toast } from 'sonner';

import {
  DEFAULT_SHORTCUTS,
  SHORTCUT_CATEGORY_LABELS,
  serializeCombo,
  parseCombo,
  formatComboDisplay,
  type ShortcutDefinition,
  type ShortcutModifiers,
} from '../../constants/shortcuts';
import { useSettingsStore } from '../../stores/settingsStore';
import { useShortcutStore } from '../../stores/shortcutStore';
import { Button } from '../ui/Button';
import { KeyboardShortcutsOverlay } from '../UnifiedAgenticChat/KeyboardShortcutsOverlay';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveShortcut(
  shortcut: ShortcutDefinition,
  customKeybindings: Record<string, string>,
): { key: string; modifiers: ShortcutModifiers } {
  const custom = customKeybindings[shortcut.id];
  if (custom) {
    const parsed = parseCombo(custom);
    if (parsed) return parsed;
  }
  return { key: shortcut.key, modifiers: shortcut.modifiers };
}

function isModifierKey(key: string): boolean {
  return ['Control', 'Meta', 'Alt', 'Shift'].includes(key);
}

function captureCombo(event: KeyboardEvent): { key: string; modifiers: ShortcutModifiers } | null {
  if (isModifierKey(event.key)) return null;
  return {
    key: event.key.toLowerCase(),
    modifiers: {
      ctrl: event.ctrlKey || undefined,
      alt: event.altKey || undefined,
      shift: event.shiftKey || undefined,
      meta: event.metaKey || undefined,
    },
  };
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface ShortcutRowProps {
  shortcut: ShortcutDefinition;
  customKeybindings: Record<string, string>;
  isEditing: boolean;
  conflict: string | null;
  onEditStart: (id: string) => void;
  onEditCancel: () => void;
  onEditCapture: (id: string, key: string, modifiers: ShortcutModifiers) => void;
  onReset: (id: string) => void;
}

function ShortcutRow({
  shortcut,
  customKeybindings,
  isEditing,
  conflict,
  onEditStart,
  onEditCancel,
  onEditCapture,
  onReset,
}: ShortcutRowProps) {
  const captureRef = useRef<HTMLDivElement>(null);
  const resolved = resolveShortcut(shortcut, customKeybindings);
  const isCustomized = Boolean(customKeybindings[shortcut.id]);

  useEffect(() => {
    if (!isEditing) return;
    captureRef.current?.focus();
  }, [isEditing]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();

      if (event.key === 'Escape') {
        onEditCancel();
        return;
      }

      const captured = captureCombo(event.nativeEvent);
      if (captured) {
        onEditCapture(shortcut.id, captured.key, captured.modifiers);
      }
    },
    [shortcut.id, onEditCapture, onEditCancel],
  );

  return (
    <div className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors">
      <span className="flex-1 text-sm">{shortcut.description}</span>

      <div className="flex items-center gap-2 shrink-0">
        {isEditing ? (
          <div
            ref={captureRef}
            tabIndex={0}
            onKeyDown={handleKeyDown}
            onBlur={onEditCancel}
            className="flex items-center gap-2 h-8 rounded-md border border-primary bg-primary/5 px-3 text-sm font-mono outline-none cursor-text min-w-[120px] justify-center animate-pulse"
            aria-label="Press new key combination"
          >
            <span className="text-primary text-xs">Press new shortcut…</span>
          </div>
        ) : (
          <kbd className="inline-flex h-8 items-center gap-0.5 rounded-md border border-border bg-muted px-2 text-xs font-mono font-medium">
            {formatComboDisplay(resolved.key, resolved.modifiers)}
          </kbd>
        )}

        {conflict && (
          <span
            className="flex items-center gap-1 text-xs text-yellow-600"
            title={`Conflicts with: ${conflict}`}
          >
            <AlertTriangle className="h-3 w-3" />
          </span>
        )}

        {!isEditing && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => onEditStart(shortcut.id)}
          >
            Edit
          </Button>
        )}

        {isCustomized && !isEditing && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs text-muted-foreground"
            onClick={() => onReset(shortcut.id)}
            title="Reset to default"
            aria-label={`Reset shortcut for ${shortcut.description} to default`}
          >
            <RotateCcw className="h-3 w-3" aria-hidden="true" />
          </Button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function KeybindingsSettings() {
  const customKeybindings = useSettingsStore((state) => state.customKeybindings);
  const setCustomKeybinding = useSettingsStore((state) => state.setCustomKeybinding);
  const resetCustomKeybinding = useSettingsStore((state) => state.resetCustomKeybinding);
  const resetAllCustomKeybindings = useSettingsStore((state) => state.resetAllCustomKeybindings);

  // Initialize the Rust-side shortcut store on mount to sync backend state
  const shortcutStoreInit = useShortcutStore((s) => s.init);
  const shortcutStoreCleanup = useShortcutStore((s) => s.cleanup);
  const shortcutStoreUpdate = useShortcutStore((s) => s.update);
  const shortcutStoreReset = useShortcutStore((s) => s.reset);

  useEffect(() => {
    void shortcutStoreInit();
    return () => {
      shortcutStoreCleanup();
    };
  }, [shortcutStoreInit, shortcutStoreCleanup]);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [overlayOpen, setOverlayOpen] = useState(false);

  // Build a set of all currently active combos for conflict detection
  const activeCombos = React.useMemo(() => {
    const map = new Map<string, string>(); // serialized combo → shortcut ID
    for (const shortcut of DEFAULT_SHORTCUTS) {
      const resolved = resolveShortcut(shortcut, customKeybindings);
      const combo = serializeCombo(resolved.key, resolved.modifiers);
      map.set(combo, shortcut.id);
    }
    return map;
  }, [customKeybindings]);

  const handleEditStart = useCallback((id: string) => {
    setEditingId(id);
  }, []);

  const handleEditCancel = useCallback(() => {
    setEditingId(null);
  }, []);

  const handleEditCapture = useCallback(
    (id: string, key: string, modifiers: ShortcutModifiers) => {
      const combo = serializeCombo(key, modifiers);

      // Check conflict (ignore the shortcut being edited)
      const existingId = activeCombos.get(combo);
      if (existingId && existingId !== id) {
        const conflicting = DEFAULT_SHORTCUTS.find((s) => s.id === existingId);
        toast.warning(`Combo already used by "${conflicting?.description ?? existingId}"`);
        setEditingId(null);
        return;
      }

      setCustomKeybinding(id, combo);
      // Sync to Rust backend
      void shortcutStoreUpdate(id, combo).catch((err: unknown) => {
        console.warn('[KeybindingsSettings] Failed to sync shortcut to backend:', err);
      });
      toast.success('Shortcut updated');
      setEditingId(null);
    },
    [activeCombos, setCustomKeybinding, shortcutStoreUpdate],
  );

  const handleReset = useCallback(
    (id: string) => {
      resetCustomKeybinding(id);
      toast.success('Shortcut reset to default');
    },
    [resetCustomKeybinding],
  );

  const handleResetAll = useCallback(() => {
    resetAllCustomKeybindings();
    // Sync reset to Rust backend
    void shortcutStoreReset().catch((err: unknown) => {
      console.warn('[KeybindingsSettings] Failed to sync shortcut reset to backend:', err);
    });
    toast.success('All shortcuts reset to defaults');
  }, [resetAllCustomKeybindings, shortcutStoreReset]);

  // Filter and group shortcuts
  const query = searchQuery.toLowerCase();
  const filteredShortcuts = DEFAULT_SHORTCUTS.filter(
    (s) =>
      !query ||
      s.description.toLowerCase().includes(query) ||
      s.category.includes(query) ||
      s.action.toLowerCase().includes(query),
  );

  const categories = Array.from(
    new Set(filteredShortcuts.map((s) => s.category)),
  ) as ShortcutDefinition['category'][];

  const customizedCount = Object.keys(customKeybindings).length;

  // Conflict map: shortcut ID → conflicting shortcut description
  const conflicts = React.useMemo(() => {
    const result = new Map<string, string>();
    const seen = new Map<string, string>(); // combo → first shortcut ID

    for (const shortcut of DEFAULT_SHORTCUTS) {
      const resolved = resolveShortcut(shortcut, customKeybindings);
      const combo = serializeCombo(resolved.key, resolved.modifiers);

      if (seen.has(combo)) {
        const firstId = seen.get(combo)!;
        const firstShortcut = DEFAULT_SHORTCUTS.find((s) => s.id === firstId);
        result.set(shortcut.id, firstShortcut?.description ?? firstId);
        result.set(firstId, shortcut.description);
      } else {
        seen.set(combo, shortcut.id);
      }
    }
    return result;
  }, [customKeybindings]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <Keyboard className="h-5 w-5 text-muted-foreground" />
            <h3 className="text-lg font-semibold">Keyboard Shortcuts</h3>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setOverlayOpen(true)}
              className="text-xs"
              title="View all shortcuts as a cheatsheet (Cmd+/)"
            >
              <Eye className="h-3 w-3 mr-1.5" />
              View all shortcuts
            </Button>
            {customizedCount > 0 && (
              <Button variant="outline" size="sm" onClick={handleResetAll} className="text-xs">
                <RotateCcw className="h-3 w-3 mr-1.5" />
                Reset all to defaults
              </Button>
            )}
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          Click Edit next to any shortcut and press a new key combination to rebind it.
          {customizedCount > 0 && (
            <span className="ml-1 text-primary font-medium">{customizedCount} customized.</span>
          )}
        </p>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Filter shortcuts…"
          className="w-full h-9 rounded-md border border-input bg-background pl-9 pr-9 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            aria-label="Clear search"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Shortcut groups */}
      {filteredShortcuts.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">
          No shortcuts match your search.
        </p>
      ) : (
        <div className="space-y-4">
          {categories.map((category) => {
            const shortcuts = filteredShortcuts.filter((s) => s.category === category);
            return (
              <div
                key={category}
                className="rounded-lg border border-border bg-card overflow-hidden"
              >
                {/* Category header */}
                <div className="px-4 py-2 bg-muted/40 border-b border-border">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {SHORTCUT_CATEGORY_LABELS[category]}
                  </span>
                </div>

                {/* Column headers */}
                <div className="flex items-center gap-3 px-4 py-2 border-b border-border/50">
                  <span className="flex-1 text-xs font-medium text-muted-foreground">Action</span>
                  <span className="text-xs font-medium text-muted-foreground mr-[68px]">
                    Shortcut
                  </span>
                </div>

                {/* Rows */}
                <div className="divide-y divide-border/50">
                  {shortcuts.map((shortcut) => (
                    <ShortcutRow
                      key={shortcut.id}
                      shortcut={shortcut}
                      customKeybindings={customKeybindings}
                      isEditing={editingId === shortcut.id}
                      conflict={conflicts.get(shortcut.id) ?? null}
                      onEditStart={handleEditStart}
                      onEditCancel={handleEditCancel}
                      onEditCapture={handleEditCapture}
                      onReset={handleReset}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Legend */}
      <div className="rounded-lg border border-border bg-muted/20 p-4 text-xs text-muted-foreground space-y-1">
        <p className="font-medium text-foreground mb-2">Tips</p>
        <p>
          Press{' '}
          <kbd className="rounded border border-border bg-muted px-1 py-0.5 font-mono text-xs">
            Esc
          </kbd>{' '}
          while editing to cancel.
        </p>
        <p>
          Conflicting shortcuts are marked with a warning icon. The most recently bound shortcut
          takes precedence.
        </p>
        <p>Leader-key sequences (Ctrl+Space, then a key) are independent of these shortcuts.</p>
        <p>
          Press{' '}
          <kbd className="rounded border border-border bg-muted px-1 py-0.5 font-mono text-xs">
            Cmd+/
          </kbd>{' '}
          anywhere in the app to open the shortcuts cheatsheet.
        </p>
      </div>

      {/* Shortcuts cheatsheet overlay */}
      <KeyboardShortcutsOverlay open={overlayOpen} onClose={() => setOverlayOpen(false)} />
    </div>
  );
}
