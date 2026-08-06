'use client';

/**
 * The floating launcher button.
 *
 * A real `<button>` (not a div with a click handler), 48×48 minimum — double
 * the 24px floor — with `aria-haspopup="dialog"`, `aria-expanded` and
 * `aria-controls` wired to the panel, and an always-present accessible name
 * even when the visible label collapses below 400px.
 */

import { forwardRef } from 'react';
import styles from './SupportWidget.module.css';

export const SupportLauncher = forwardRef<
  HTMLButtonElement,
  { open: boolean; panelId: string; onToggle: () => void }
>(function SupportLauncher({ open, panelId, onToggle }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      className={styles['launcher']}
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-controls={panelId}
      aria-label={open ? 'Close product support' : 'Open product support'}
      onClick={onToggle}
    >
      <span className={styles['launcherMark']} aria-hidden="true" />
      <span className={styles['launcherLabel']}>{open ? 'Close' : 'Support'}</span>
    </button>
  );
});
