'use client';

import { useEffect, useState } from 'react';
import {
  TERMINAL_CURSOR_STYLES,
  TERMINAL_SCROLLBACK_LINES,
  normalizeTerminalPreferences,
  type HostTerminalPreferences,
  type TerminalCursorStyle,
} from '@agiworkforce/local-runtime-contract';
import { Switch } from '@agiworkforce/ui';
import { toUserMessage } from '@/lib/user-error-message';
import { useElectronHost } from '../lib/host';
import { DesktopSettingsGroup, DesktopSettingsRow } from './DesktopSettingsRow';

const HEADING = 'Terminal';
const HEADING_HINT =
  "The terminal in coding sessions. It has the same limits as the agent's commands in its folder, including no network while they are on. Changes apply to terminals you open next.";
const CURSOR_LABEL = 'Cursor';
const CURSOR_HINT = 'How the cursor is drawn.';
const CURSOR_NAMES: Record<TerminalCursorStyle, string> = {
  block: 'Block',
  bar: 'Bar',
  underline: 'Underline',
};
const BLINK_LABEL = 'Blinking cursor';
const BLINK_HINT = 'The cursor blinks while the terminal has focus.';
const COPY_LABEL = 'Copy on select';
const COPY_HINT = 'Selected text is copied to the clipboard.';
const SCROLLBACK_LABEL = 'Scrollback';
const SCROLLBACK_HINT = 'Lines kept above the screen.';
const SAVE_FAILED = 'That change could not be saved.';
const SELECT_CLASS =
  'h-8 rounded-md border border-border bg-transparent px-2 text-sm text-[var(--text-1)]';

function linesLabel(lines: number): string {
  return `${lines.toLocaleString('en-US')} lines`;
}

export function TerminalSettings() {
  const host = useElectronHost();
  const [terminal, setTerminal] = useState<HostTerminalPreferences | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    if (!host) return undefined;
    let cancelled = false;
    host
      .readPreferences()
      .then((state) => {
        if (!cancelled && state.preferences.terminal !== undefined) {
          setTerminal(normalizeTerminalPreferences(state.preferences.terminal));
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [host]);

  if (!host || terminal === null) return null;

  const write = async (patch: Partial<HostTerminalPreferences>) => {
    setFailure(null);
    try {
      const next = await host.writePreferences({ terminal: { ...terminal, ...patch } });
      setTerminal(normalizeTerminalPreferences(next.preferences.terminal, terminal));
    } catch (cause: unknown) {
      setFailure(toUserMessage(cause, SAVE_FAILED));
    }
  };

  return (
    <DesktopSettingsGroup title={HEADING} hint={HEADING_HINT}>
      <DesktopSettingsRow label={CURSOR_LABEL} hint={CURSOR_HINT}>
        <select
          className={SELECT_CLASS}
          aria-label={CURSOR_LABEL}
          value={terminal.cursorStyle}
          onChange={(event) => {
            const style = TERMINAL_CURSOR_STYLES.find((value) => value === event.target.value);
            if (style) void write({ cursorStyle: style });
          }}
        >
          {TERMINAL_CURSOR_STYLES.map((style) => (
            <option key={style} value={style}>
              {CURSOR_NAMES[style]}
            </option>
          ))}
        </select>
      </DesktopSettingsRow>
      <DesktopSettingsRow label={BLINK_LABEL} hint={BLINK_HINT}>
        <Switch
          checked={terminal.cursorBlink}
          onCheckedChange={(checked) => void write({ cursorBlink: checked })}
          aria-label={BLINK_LABEL}
        />
      </DesktopSettingsRow>
      <DesktopSettingsRow label={COPY_LABEL} hint={COPY_HINT}>
        <Switch
          checked={terminal.copyOnSelect}
          onCheckedChange={(checked) => void write({ copyOnSelect: checked })}
          aria-label={COPY_LABEL}
        />
      </DesktopSettingsRow>
      <DesktopSettingsRow
        label={SCROLLBACK_LABEL}
        hint={SCROLLBACK_HINT}
        {...(failure === null ? {} : { note: failure })}
      >
        <select
          className={SELECT_CLASS}
          aria-label={SCROLLBACK_LABEL}
          value={terminal.scrollback}
          onChange={(event) => {
            const lines = TERMINAL_SCROLLBACK_LINES.find(
              (value) => value === Number(event.target.value),
            );
            if (lines) void write({ scrollback: lines });
          }}
        >
          {TERMINAL_SCROLLBACK_LINES.map((lines) => (
            <option key={lines} value={lines}>
              {linesLabel(lines)}
            </option>
          ))}
        </select>
      </DesktopSettingsRow>
    </DesktopSettingsGroup>
  );
}
