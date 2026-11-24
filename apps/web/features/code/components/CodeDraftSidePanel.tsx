'use client';

import { useEffect, useId, useState } from 'react';
import { Globe, Smartphone, TerminalSquare } from '@agiworkforce/icons';
import { browserPaneSupported, simulatorPaneSupported } from '@/features/desktop-host';
import { LOCAL_CODE_COPY, LOCAL_PANEL_COPY } from '../local-code';
import { SIMULATOR_PANE_COPY } from '../simulator-pane';
import { LocalBrowserPanel } from './LocalBrowserPanel';
import { LocalSimulatorPane } from './LocalSimulatorPane';
import { CodeToolSwitcher } from './CodeToolSwitcher';
import styles from '../CloudCodePage.module.css';

const UNAVAILABLE = { browser: false, simulator: false };
const TOOL_GLYPH_SIZE = 16;

export function useCodeSideTools(enabled: boolean) {
  const [available, setAvailable] = useState(UNAVAILABLE);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    void Promise.all([browserPaneSupported(), simulatorPaneSupported()]).then(
      ([browser, simulator]) => {
        if (active) setAvailable({ browser, simulator });
      },
    );
    return () => {
      active = false;
    };
  }, [enabled]);
  return enabled ? available : UNAVAILABLE;
}

export type DraftSideTool = 'launcher' | 'browser' | 'simulator';

export function CodeDraftSidePanel({
  tool,
  available,
  expanded,
  terminalUnavailableReason,
  onOpenTerminal,
  onExpandedChange,
  onToolChange,
}: {
  tool: DraftSideTool;
  available: ReturnType<typeof useCodeSideTools>;
  expanded: boolean;
  terminalUnavailableReason?: string | undefined;
  onOpenTerminal: () => void;
  onExpandedChange: (expanded: boolean) => void;
  onToolChange: (tool: DraftSideTool | null) => void;
}) {
  const [floating, setFloating] = useState(false);
  const terminalHint = useId();
  const toolSwitcher =
    tool === 'launcher' ? null : (
      <CodeToolSwitcher
        active={tool}
        onBrowser={available.browser ? () => onToolChange('browser') : undefined}
        onSimulator={
          available.simulator
            ? () => {
                setFloating(false);
                onToolChange('simulator');
              }
            : undefined
        }
        onTerminal={onOpenTerminal}
        terminalUnavailableReason={terminalUnavailableReason}
      />
    );
  if (tool === 'browser' && available.browser) {
    return (
      <LocalBrowserPanel
        address={null}
        addressKey={0}
        onClose={() => onToolChange('launcher')}
        toolSwitcher={toolSwitcher}
      />
    );
  }
  if (tool === 'simulator' && available.simulator) {
    return (
      <LocalSimulatorPane
        expanded={expanded}
        onToggleExpanded={() => onExpandedChange(!expanded)}
        floating={floating}
        onToggleFloating={() => {
          onExpandedChange(false);
          setFloating((value) => !value);
        }}
        onClose={() => onToolChange('launcher')}
        toolSwitcher={toolSwitcher}
      />
    );
  }

  return (
    <aside className={styles['panelShortcuts']} aria-label={LOCAL_PANEL_COPY.shortcuts}>
      <ul className={styles['panelShortcutList']}>
        {available.browser && (
          <li>
            <button
              type="button"
              className={styles['panelShortcutRow']}
              onClick={() => onToolChange('browser')}
            >
              <Globe size={TOOL_GLYPH_SIZE} aria-hidden="true" />
              <span>{LOCAL_CODE_COPY.browser}</span>
            </button>
          </li>
        )}
        {available.simulator && (
          <li>
            <button
              type="button"
              className={styles['panelShortcutRow']}
              onClick={() => onToolChange('simulator')}
            >
              <Smartphone size={TOOL_GLYPH_SIZE} aria-hidden="true" />
              <span>{SIMULATOR_PANE_COPY.pane}</span>
            </button>
          </li>
        )}
        <li>
          <button
            type="button"
            className={styles['panelShortcutRow']}
            disabled={terminalUnavailableReason !== undefined}
            title={terminalUnavailableReason}
            aria-describedby={terminalUnavailableReason ? terminalHint : undefined}
            onClick={onOpenTerminal}
          >
            <TerminalSquare size={TOOL_GLYPH_SIZE} aria-hidden="true" />
            <span className={styles['panelShortcutLabel']}>{LOCAL_PANEL_COPY.terminal}</span>
          </button>
          {terminalUnavailableReason && (
            <p id={terminalHint} className={styles['railEmpty']}>
              {terminalUnavailableReason}
            </p>
          )}
        </li>
      </ul>
    </aside>
  );
}
