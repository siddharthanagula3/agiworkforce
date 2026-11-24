'use client';

import { useId } from 'react';
import { Globe, Smartphone, TerminalSquare } from '@agiworkforce/icons';
import { LOCAL_CODE_COPY, LOCAL_PANEL_COPY } from '../local-code';
import { SIMULATOR_PANE_COPY } from '../simulator-pane';
import styles from '../CloudCodePage.module.css';

const TOOL_GLYPH_SIZE = 14;

export function CodeToolSwitcher({
  active,
  onBrowser,
  onSimulator,
  onTerminal,
  terminalUnavailableReason,
}: {
  active: 'browser' | 'simulator';
  onBrowser?: () => void;
  onSimulator?: () => void;
  onTerminal?: () => void;
  terminalUnavailableReason?: string;
}) {
  const terminalHint = useId();
  return (
    <div
      className={styles['sideToolSwitcher']}
      role="group"
      aria-label={LOCAL_PANEL_COPY.shortcuts}
    >
      {onBrowser && (
        <button
          type="button"
          className={styles['sideToolButton']}
          aria-pressed={active === 'browser'}
          onClick={active === 'browser' ? undefined : onBrowser}
        >
          <Globe size={TOOL_GLYPH_SIZE} aria-hidden="true" />
          {LOCAL_CODE_COPY.browser}
        </button>
      )}
      {onSimulator && (
        <button
          type="button"
          className={styles['sideToolButton']}
          aria-pressed={active === 'simulator'}
          onClick={active === 'simulator' ? undefined : onSimulator}
        >
          <Smartphone size={TOOL_GLYPH_SIZE} aria-hidden="true" />
          {SIMULATOR_PANE_COPY.pane}
        </button>
      )}
      {onTerminal && (
        <button
          type="button"
          className={styles['sideToolButton']}
          disabled={terminalUnavailableReason !== undefined}
          aria-describedby={terminalUnavailableReason ? terminalHint : undefined}
          title={terminalUnavailableReason}
          onClick={onTerminal}
        >
          <TerminalSquare size={TOOL_GLYPH_SIZE} aria-hidden="true" />
          {LOCAL_PANEL_COPY.terminal}
        </button>
      )}
      {terminalUnavailableReason && (
        <span id={terminalHint} className="sr-only">
          {terminalUnavailableReason}
        </span>
      )}
    </div>
  );
}
