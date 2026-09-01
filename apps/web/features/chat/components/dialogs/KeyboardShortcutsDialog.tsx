import React from 'react';
import {
  Badge,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  Switch,
} from '@agiworkforce/ui';
import { Separator } from '@agiworkforce/ui';
import { Keyboard } from 'lucide-react';
import { safePlatform } from '@shared/utils/browser-utils';
import type { KeyboardShortcutDoc } from '../../hooks/use-keyboard-shortcuts';
import { useSettingsStore } from '@shared/stores/web-settings-store';

interface KeyboardShortcutsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shortcuts: readonly KeyboardShortcutDoc[];
}

export function KeyboardShortcutsDialog({
  open,
  onOpenChange,
  shortcuts,
}: KeyboardShortcutsDialogProps) {
  const isMac = safePlatform.isMac();

  // Same coalescing as the nav list: an older persisted store has no such key.
  const disabledIds = useSettingsStore((state) => state.disabledShortcutIds) ?? [];
  const setShortcutEnabled = useSettingsStore((state) => state.setShortcutEnabled);
  const restoreShortcutDefaults = useSettingsStore((state) => state.restoreShortcutDefaults);

  const formatShortcut = (shortcut: KeyboardShortcutDoc) => {
    const keys: string[] = [];

    if (shortcut.ctrl || shortcut.meta) {
      keys.push(isMac ? '⌘' : 'Ctrl');
    }
    if (shortcut.shift) {
      keys.push(isMac ? '⇧' : 'Shift');
    }
    if (shortcut.alt) {
      keys.push(isMac ? '⌥' : 'Alt');
    }
    keys.push(shortcut.key);

    return keys;
  };

  const groupedShortcuts = shortcuts.reduce(
    (acc, shortcut) => {
      if (!acc[shortcut.category]) {
        acc[shortcut.category] = [];
      }
      acc[shortcut.category]!.push(shortcut);
      return acc;
    },
    {} as Record<string, KeyboardShortcutDoc[]>,
  );

  const categoryLabels: Record<string, string> = {
    navigation: 'Navigation',
    conversation: 'Conversations',
    message: 'Messages',
    ui: 'User Interface',
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Keyboard className="h-5 w-5" />
            <DialogTitle>Keyboard Shortcuts</DialogTitle>
          </div>
          <DialogDescription>
            Speed up your workflow with these keyboard shortcuts
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {Object.entries(groupedShortcuts).map(([category, categoryShortcuts]) => (
            <div key={category}>
              <h3 className="mb-3 text-sm font-semibold text-foreground">
                {categoryLabels[category] || category}
              </h3>

              <div className="space-y-2">
                {categoryShortcuts.map((shortcut) => (
                  <div
                    key={`shortcut-${shortcut.key}-${shortcut.description}`}
                    className="flex items-center justify-between rounded-lg border border-border bg-muted/30 p-3"
                  >
                    <span className="text-sm text-foreground">{shortcut.description}</span>

                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1">
                        {formatShortcut(shortcut).map((key, keyIndex) => (
                          <React.Fragment key={keyIndex}>
                            <Badge
                              variant="outline"
                              className="min-w-[32px] justify-center font-mono text-xs"
                            >
                              {key}
                            </Badge>
                            {keyIndex < formatShortcut(shortcut).length - 1 && (
                              <span className="text-xs text-muted-foreground">+</span>
                            )}
                          </React.Fragment>
                        ))}
                      </div>
                      {/*
                        A shortcut the user switched off must stop firing, not
                        just look off. use-keyboard-shortcuts reads the same
                        disabledShortcutIds this writes, and the matcher is
                        driven by KEYBOARD_SHORTCUT_DOCS, so the two cannot
                        disagree.
                      */}
                      <Switch
                        aria-label={shortcut.description}
                        checked={!disabledIds.includes(shortcut.id)}
                        onCheckedChange={(next) => setShortcutEnabled(shortcut.id, next)}
                      />
                    </div>
                  </div>
                ))}
              </div>

              {Object.keys(groupedShortcuts).indexOf(category) <
                Object.keys(groupedShortcuts).length - 1 && <Separator className="my-4" />}
            </div>
          ))}
        </div>

        {disabledIds.length > 0 ? (
          <div className="mt-4 flex items-center justify-between rounded-lg border border-border p-3 text-xs">
            <span className="text-muted-foreground">
              {disabledIds.length} shortcut{disabledIds.length === 1 ? '' : 's'} turned off
            </span>
            <button
              type="button"
              onClick={restoreShortcutDefaults}
              className="rounded-md border border-border px-2.5 py-1 font-medium text-foreground transition-colors hover:bg-muted"
            >
              Restore defaults
            </button>
          </div>
        ) : null}

        <div className="mt-4 rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
          <p>
            <strong>Tip:</strong> Press{' '}
            <Badge variant="outline" className="font-mono">
              {isMac ? '⌘' : 'Ctrl'}
            </Badge>{' '}
            +{' '}
            <Badge variant="outline" className="font-mono">
              /
            </Badge>{' '}
            anytime to view these shortcuts
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
