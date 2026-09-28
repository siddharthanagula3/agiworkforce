'use client';

import type { ReactNode } from 'react';
import { Columns2, Rows2, X } from '@agiworkforce/icons';
import type { CloudCodeSession } from '@agiworkforce/types';
import { WebAppShell } from '@shared/components/layout/WebAppShell';
import type { CodePaneLayout } from '../hooks/use-code-panes';
import styles from '../CloudCodePage.module.css';

const PANE_GLYPH_SIZE = 16;
const PANE_LABEL = 'Session pane';
const CLOSE_PANE_LABEL = 'Close pane';
const STACK_PANES_LABEL = 'Stack panes';
const TILE_PANES_LABEL = 'Place panes side by side';

export interface CodePaneControls {
  focused: boolean;
  initialSession: CloudCodeSession | null;
  onFocus: () => void;
  onClose: () => void;
  onSessionOpened: (sessionId: string) => void;
  onSessionChange: (session: CloudCodeSession) => void;
}

export function CodePageFrame({
  pane,
  narrowHeaderSlot,
  children,
}: {
  pane: CodePaneControls | undefined;
  narrowHeaderSlot: ReactNode;
  children: ReactNode;
}) {
  if (!pane) {
    return (
      <WebAppShell narrowHeaderSlot={narrowHeaderSlot} rail={false}>
        {children}
      </WebAppShell>
    );
  }
  return (
    <section
      className={styles['paneFrame']}
      data-pane-focused={pane.focused ? 'true' : 'false'}
      aria-label={PANE_LABEL}
      onMouseDownCapture={pane.onFocus}
      onFocusCapture={pane.onFocus}
    >
      {children}
    </section>
  );
}

export function CodePaneTools({
  layout,
  onToggleLayout,
  onClose,
}: {
  layout?: CodePaneLayout;
  onToggleLayout?: () => void;
  onClose: () => void;
}) {
  const layoutLabel = layout === 'stacked' ? TILE_PANES_LABEL : STACK_PANES_LABEL;
  const LayoutGlyph = layout === 'stacked' ? Columns2 : Rows2;
  return (
    <>
      {layout && onToggleLayout ? (
        <button
          type="button"
          className={styles['headerButton']}
          aria-label={layoutLabel}
          title={layoutLabel}
          onClick={onToggleLayout}
        >
          <LayoutGlyph size={PANE_GLYPH_SIZE} aria-hidden="true" />
        </button>
      ) : null}
      <button
        type="button"
        className={styles['headerButton']}
        aria-label={CLOSE_PANE_LABEL}
        title={CLOSE_PANE_LABEL}
        onClick={onClose}
      >
        <X size={PANE_GLYPH_SIZE} aria-hidden="true" />
      </button>
    </>
  );
}
