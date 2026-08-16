
import React, { useEffect, useCallback } from 'react';
import { Keyboard, X } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import {
  DEFAULT_SHORTCUTS,
  SHORTCUT_CATEGORY_LABELS,
  formatComboDisplay,
  parseCombo,
  type ShortcutDefinition,
} from '../../constants/shortcuts';
import {
  useSettingsStore,
  useVoiceInputStore,
  type ChatPreferences,
  type VoiceInputHotkey,
} from '../../stores/settingsStore';
import { Button } from '@/ui/Button';

interface InlineShortcut {
  description: string;
  keys: string[];
}

interface InlineSection {
  category: string;
  label: string;
  shortcuts: InlineShortcut[];
}

const INLINE_SECTIONS: InlineSection[] = [
  {
    category: 'editing-inline',
    label: 'Editing',
    shortcuts: [{ description: 'Copy code block', keys: ['Click copy'] }],
  },
  {
    category: 'agent-inline',
    label: 'Agent',
    shortcuts: [
      { description: 'Approve action', keys: ['Enter'] },
      { description: 'Deny action', keys: ['Escape'] },
    ],
  },
];

export type ComposerSendShortcut = NonNullable<ChatPreferences['sendShortcut']>;

export function chatInlineSection(sendShortcut: ComposerSendShortcut): InlineSection {
  const shortcuts: InlineShortcut[] =
    sendShortcut === 'mod-enter'
      ? [
          { description: 'Send message', keys: ['Ctrl/Cmd', 'Enter'] },
          { description: 'New line', keys: ['Enter'] },
        ]
      : [
          { description: 'Send message', keys: ['Enter'] },
          { description: 'New line', keys: ['Shift', 'Enter'] },
        ];
  shortcuts.push({ description: 'Stop generation', keys: ['Click stop'] });
  return { category: 'chat-inline', label: 'Chat', shortcuts };
}

export function voiceInlineSection(hotkey: VoiceInputHotkey): InlineSection {
  const entry: InlineShortcut =
    hotkey === 'caps_lock'
      ? { description: 'Toggle dictation (in app)', keys: ['Caps Lock'] }
      : hotkey === 'ctrl+space'
        ? { description: 'Hold to dictate (in app)', keys: ['Ctrl/Cmd', 'Space'] }
        : hotkey === 'ctrl+shift+v'
          ? { description: 'Hold to dictate (in app)', keys: ['Ctrl/Cmd', 'Shift', 'V'] }
          : { description: 'Hold to dictate (in app)', keys: ['Alt/Option'] };
  return { category: 'voice-inline', label: 'Voice', shortcuts: [entry] };
}

function resolvedDisplay(
  shortcut: ShortcutDefinition,
  customKeybindings: Record<string, string>,
): string[] {
  const custom = customKeybindings[shortcut.id];
  if (custom) {
    const parsed = parseCombo(custom);
    if (parsed) return formatComboDisplay(parsed.key, parsed.modifiers).split('+');
  }
  return formatComboDisplay(shortcut.key, shortcut.modifiers).split('+');
}

interface KeyBadgeProps {
  label: string;
}

function KeyBadge({ label }: KeyBadgeProps) {
  return (
    <kbd className="bg-white/10 border border-white/20 rounded px-2 py-0.5 text-xs font-mono">
      {label}
    </kbd>
  );
}

interface ShortcutRowProps {
  description: string;
  keys: string[];
}

function ShortcutRow({ description, keys }: ShortcutRowProps) {
  return (
    <div className="flex items-center justify-between gap-4 py-2 px-3 rounded-md hover:bg-white/5 transition-colors">
      <span className="text-sm text-[hsl(var(--foreground))]/80">{description}</span>
      <div className="flex items-center gap-1 shrink-0">
        {keys.map((key, idx) => (
          <span key={idx} className="flex items-center gap-0.5">
            {idx > 0 && (
              <span className="text-[hsl(var(--muted-foreground))] text-xs mx-0.5">+</span>
            )}
            <KeyBadge label={key} />
          </span>
        ))}
      </div>
    </div>
  );
}

interface SectionCardProps {
  title: string;
  children: React.ReactNode;
}

function SectionCard({ title, children }: SectionCardProps) {
  return (
    <div className="rounded-lg border border-[hsl(var(--border))] overflow-hidden">
      <div className="px-3 py-2 bg-[hsl(var(--muted))]/40 border-b border-[hsl(var(--border))]">
        <span className="text-xs font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
          {title}
        </span>
      </div>
      <div className="divide-y divide-[hsl(var(--border))]/50">{children}</div>
    </div>
  );
}

interface KeyboardShortcutsOverlayProps {
  open: boolean;
  onClose: () => void;
  onOpenSettings?: () => void;
}

export function KeyboardShortcutsOverlay({
  open,
  onClose,
  onOpenSettings,
}: KeyboardShortcutsOverlayProps) {
  const customKeybindings = useSettingsStore((state) => state.customKeybindings);
  const sendShortcut = useSettingsStore((state) => state.chatPreferences.sendShortcut ?? 'enter');
  const voiceHotkey = useVoiceInputStore((state) => state.hotkey);

  // Escape key closes the overlay — copies the ref to local var for cleanup safety
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    },
    [onClose],
  );

  useEffect(() => {
    if (!open) return;
    window.addEventListener('keydown', handleKeyDown);
    const listener = handleKeyDown;
    return () => {
      window.removeEventListener('keydown', listener);
    };
  }, [open, handleKeyDown]);

  const dynamicCategories = Array.from(
    new Set(DEFAULT_SHORTCUTS.map((s) => s.category)),
  ) as ShortcutDefinition['category'][];

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
            aria-hidden="true"
          />

          {/* Panel */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            role="dialog"
            aria-modal="true"
            aria-label="Keyboard shortcuts"
            className={cn(
              'fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50',
              'w-full max-w-2xl max-h-[85vh]',
              'bg-[hsl(var(--card))] border border-[hsl(var(--border))]',
              'rounded-2xl shadow-2xl flex flex-col overflow-hidden',
            )}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-[hsl(var(--border))] shrink-0">
              <div className="flex items-center gap-2">
                <Keyboard className="h-5 w-5 text-[hsl(var(--muted-foreground))]" />
                <h2 className="text-base font-semibold text-[hsl(var(--foreground))]">
                  Keyboard Shortcuts
                </h2>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={onClose}
                aria-label="Close shortcuts overlay"
                className="h-8 w-8 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Scrollable body — two-column grid */}
            <div className="overflow-y-auto flex-1 p-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Inline sections */}
                {[
                  chatInlineSection(sendShortcut),
                  ...INLINE_SECTIONS,
                  voiceInlineSection(voiceHotkey),
                ].map((section) => (
                  <SectionCard key={section.category} title={section.label}>
                    {section.shortcuts.map((s) => (
                      <ShortcutRow key={s.description} description={s.description} keys={s.keys} />
                    ))}
                  </SectionCard>
                ))}

                {/* Dynamic sections from DEFAULT_SHORTCUTS */}
                {dynamicCategories.map((category) => {
                  const shortcuts = DEFAULT_SHORTCUTS.filter((s) => s.category === category);
                  return (
                    <SectionCard key={category} title={SHORTCUT_CATEGORY_LABELS[category]}>
                      {shortcuts.map((shortcut) => (
                        <ShortcutRow
                          key={shortcut.id}
                          description={shortcut.description}
                          keys={resolvedDisplay(shortcut, customKeybindings)}
                        />
                      ))}
                    </SectionCard>
                  );
                })}
              </div>
            </div>

            {/* Footer */}
            <div className="px-5 py-3 border-t border-[hsl(var(--border))] bg-[hsl(var(--muted))]/30 flex items-center justify-between shrink-0">
              <p className="text-xs text-[hsl(var(--muted-foreground))]">
                Press{' '}
                <kbd className="bg-[hsl(var(--muted))] border border-[hsl(var(--border))] rounded px-1.5 py-0.5 text-[10px] font-mono">
                  Esc
                </kbd>{' '}
                to close
              </p>
              {onOpenSettings && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenSettings();
                  }}
                  className="text-xs text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] underline underline-offset-2 transition-colors"
                >
                  Customize shortcuts in Settings
                </button>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
