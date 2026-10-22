import React, { useId, useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  INLINE_EDIT_ATTRIBUTE,
  Switch,
  keepOpenForMenuEscape,
  useConfirmAction,
  useUiTranslation,
} from '@agiworkforce/ui';
import { Keyboard } from 'lucide-react';
import { findShortcut, shortcutChordKey, type ShortcutChord } from '@agiworkforce/unified-chat';
import { safePlatform } from '@shared/utils/browser-utils';
import {
  checkShortcutBinding,
  chordFromKeyboardEvent,
  formatShortcutKeys,
  isRebindableShortcut,
  withShortcutBindings,
  type KeyboardShortcutDoc,
} from '../../hooks/use-keyboard-shortcuts';
import { useSettingsStore } from '@shared/stores/web-settings-store';
import { memoWhenClosed } from '@shared/lib/memo-when-closed';
import { useHostShortcuts } from '@/features/desktop-host';

const EMPTY_SHORTCUT_IDS: string[] = [];
const EMPTY_SHORTCUT_BINDINGS: Readonly<Record<string, ShortcutChord>> = {};

const SHORTCUT_ROW_CLASS = 'flex flex-wrap items-center justify-between gap-x-3 gap-y-2 py-3';
const GROUP_LABEL_CLASS =
  'sticky top-0 z-[var(--z-control)] border-b border-border bg-background py-2 text-sm font-normal text-muted-foreground';
const KEY_GROUP_CLASS = 'flex flex-wrap items-center justify-end gap-1';
const KEY_BADGE_CLASS = 'min-w-[32px] justify-center font-mono text-sm';

const INSTRUCTION = 'To change a shortcut, select its keys, then press the new combination.';

interface ShortcutGroup {
  id: 'app' | 'composer';
  label: string;
  shortcuts: KeyboardShortcutDoc[];
}

function KeyBadges({ keys }: { keys: string[] }) {
  return (
    <>
      {keys.map((key, index) => (
        <Badge key={`${key}-${index}`} variant="outline" className={KEY_BADGE_CLASS}>
          {key}
        </Badge>
      ))}
    </>
  );
}

function bindingMessage(
  check: ReturnType<typeof checkShortcutBinding>,
  keys: string,
  isMac: boolean,
): string | null {
  if (check.ok) return null;
  if (check.reason === 'needs-modifier') {
    return isMac
      ? 'Hold Cmd, and Shift if you like, while you press one key.'
      : 'Hold Ctrl, and Shift if you like, while you press one key.';
  }
  return `${keys} is already used by ${check.by}.`;
}

interface ShortcutRowProps {
  shortcut: KeyboardShortcutDoc;
  effective: readonly KeyboardShortcutDoc[];
  isMac: boolean;
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
}

function ShortcutRow({ shortcut, effective, isMac, enabled, onEnabledChange }: ShortcutRowProps) {
  const setShortcutBinding = useSettingsStore((state) => state.setShortcutBinding);
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const errorId = useId();
  const keys = formatShortcutKeys(shortcut, isMac);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!recording) return;
    if (event.key === 'Tab') {
      setRecording(false);
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (event.key === 'Escape' && !event.metaKey && !event.ctrlKey) {
      setRecording(false);
      return;
    }
    const chord = chordFromKeyboardEvent(event.nativeEvent, isMac);
    if (!chord) return;
    const check = checkShortcutBinding(shortcut, chord, effective);
    const message = bindingMessage(check, formatShortcutKeys(chord, isMac).join(' '), isMac);
    if (message) {
      setError(message);
      return;
    }
    const original = findShortcut(shortcut.id);
    const backToDefault = original && shortcutChordKey(original) === shortcutChordKey(chord);
    setShortcutBinding(shortcut.id, backToDefault ? null : chord);
    setError(null);
    setRecording(false);
  };

  return (
    <li className={SHORTCUT_ROW_CLASS}>
      <span className="text-sm text-foreground">{shortcut.description}</span>
      <div className="ms-auto flex items-center gap-3">
        {isRebindableShortcut(shortcut) ? (
          <button
            type="button"
            aria-label={
              recording
                ? `Press the new keys for ${shortcut.description}`
                : `Change keys for ${shortcut.description}, now ${keys.join(' ')}`
            }
            aria-pressed={recording}
            aria-describedby={error ? errorId : undefined}
            {...(recording ? { [INLINE_EDIT_ATTRIBUTE]: '' } : {})}
            onClick={() => {
              setError(null);
              setRecording((value) => !value);
            }}
            onKeyDown={handleKeyDown}
            onBlur={() => setRecording(false)}
            className={`${KEY_GROUP_CLASS} min-h-8 rounded-md px-1 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-pressed:ring-2 aria-pressed:ring-ring pointer-coarse:min-h-11`}
          >
            {recording ? (
              <span className="px-1 text-sm text-muted-foreground">Press keys</span>
            ) : (
              <KeyBadges keys={keys} />
            )}
          </button>
        ) : (
          <div className={KEY_GROUP_CLASS}>
            <KeyBadges keys={keys} />
          </div>
        )}
        {/*
          A shortcut the user switched off must stop firing, not just look
          off. use-keyboard-shortcuts reads the same disabledShortcutIds this
          writes. Composer keys are the field's own editing contract and have
          no off switch.
        */}
        {shortcut.scope === 'app' ? (
          <Switch
            aria-label={shortcut.description}
            checked={enabled}
            onCheckedChange={onEnabledChange}
          />
        ) : null}
      </div>
      {error ? (
        <p id={errorId} role="alert" className="basis-full text-end text-sm text-destructive-text">
          {error}
        </p>
      ) : null}
    </li>
  );
}

export interface KeyboardShortcutsPaneProps {
  shortcuts: readonly KeyboardShortcutDoc[];
  showHeading?: boolean;
}

export function KeyboardShortcutsPane({
  shortcuts,
  showHeading = true,
}: KeyboardShortcutsPaneProps) {
  const { plural } = useUiTranslation('chat');
  const isMac = safePlatform.isMac();
  const hostShortcuts = useHostShortcuts();
  const { confirm, dialog } = useConfirmAction();

  // Same coalescing as the nav list: an older persisted store has no such key.
  const disabledIds = useSettingsStore((state) => state.disabledShortcutIds) ?? EMPTY_SHORTCUT_IDS;
  const bindings = useSettingsStore((state) => state.shortcutBindings) ?? EMPTY_SHORTCUT_BINDINGS;
  const setShortcutEnabled = useSettingsStore((state) => state.setShortcutEnabled);
  const restoreShortcutDefaults = useSettingsStore((state) => state.restoreShortcutDefaults);

  const effective = useMemo(() => withShortcutBindings(shortcuts, bindings), [shortcuts, bindings]);
  const changedCount = effective.filter((doc, index) => doc !== shortcuts[index]).length;
  const atDefaults = disabledIds.length === 0 && changedCount === 0;

  const groups: ShortcutGroup[] = [
    { id: 'app', label: 'App', shortcuts: effective.filter((doc) => doc.scope === 'app') },
    {
      id: 'composer',
      label: 'Composer',
      shortcuts: effective.filter((doc) => doc.scope === 'composer'),
    },
  ];

  const restore = () => {
    if (changedCount === 0) {
      restoreShortcutDefaults();
      return;
    }
    confirm({
      title: 'Restore default shortcuts?',
      description:
        'Every key combination you recorded goes back to its default and every shortcut turns back on. To use your own keys again you would record them again.',
      confirmLabel: 'Restore defaults',
      destructive: false,
      onConfirm: restoreShortcutDefaults,
    });
  };

  const summary = [
    disabledIds.length > 0
      ? plural('counts.shortcutsOff', disabledIds.length, {
          one: '{{count}} shortcut turned off',
          other: '{{count}} shortcuts turned off',
        })
      : null,
    changedCount > 0
      ? plural('counts.shortcutsChanged', changedCount, {
          one: '{{count}} shortcut uses your keys',
          other: '{{count}} shortcuts use your keys',
        })
      : null,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <div className="flex flex-col">
      {showHeading ? <h1 className="text-2xl font-medium text-foreground">Keyboard</h1> : null}
      <p className={`text-sm text-muted-foreground ${showHeading ? 'mt-2' : ''}`}>{INSTRUCTION}</p>

      {groups.map((group) => (
        <section key={group.id} aria-labelledby={`shortcut-group-${group.id}`} className="mt-6">
          <h2 id={`shortcut-group-${group.id}`} className={GROUP_LABEL_CLASS}>
            {group.label}
          </h2>
          <ul className="divide-y divide-border">
            {group.shortcuts.map((shortcut) => (
              <ShortcutRow
                key={shortcut.id}
                shortcut={shortcut}
                effective={effective}
                isMac={isMac}
                enabled={!disabledIds.includes(shortcut.id)}
                onEnabledChange={(next) => setShortcutEnabled(shortcut.id, next)}
              />
            ))}
          </ul>
        </section>
      ))}

      {hostShortcuts.length > 0 ? (
        <section aria-labelledby="shortcut-group-desktop" className="mt-6">
          <h2 id="shortcut-group-desktop" className={GROUP_LABEL_CLASS}>
            Desktop app
          </h2>
          {/*
            No switch or recorder on these rows: the shell's menu owns the
            chord and the page cannot stop it firing.
          */}
          <ul className="divide-y divide-border">
            {hostShortcuts.map((shortcut) => (
              <li key={shortcut.id} className={SHORTCUT_ROW_CLASS}>
                <span className="text-sm text-foreground">{shortcut.description}</span>
                <Badge variant="outline" className={`ms-auto ${KEY_BADGE_CLASS}`}>
                  {shortcut.chord}
                </Badge>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="sticky bottom-0 z-[var(--z-control)] mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-border bg-background py-3">
        <span className="text-sm text-muted-foreground" aria-live="polite">
          {summary}
        </span>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="ms-auto rounded-full"
          disabled={atDefaults}
          onClick={restore}
        >
          Restore defaults
        </Button>
      </div>
      {dialog}
    </div>
  );
}

interface KeyboardShortcutsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shortcuts: readonly KeyboardShortcutDoc[];
}

function KeyboardShortcutsDialogImpl({
  open,
  onOpenChange,
  shortcuts,
}: KeyboardShortcutsDialogProps) {
  const isMac = safePlatform.isMac();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl" onEscapeKeyDown={keepOpenForMenuEscape}>
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Keyboard className="h-5 w-5" />
            <DialogTitle>Keyboard Shortcuts</DialogTitle>
          </div>
          <DialogDescription>
            Speed up your workflow with these keyboard shortcuts
          </DialogDescription>
        </DialogHeader>

        <KeyboardShortcutsPane shortcuts={shortcuts} showHeading={false} />

        <div className="mt-4 rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
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

export const KeyboardShortcutsDialog = memoWhenClosed(KeyboardShortcutsDialogImpl);
