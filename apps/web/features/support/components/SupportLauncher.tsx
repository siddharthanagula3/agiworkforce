'use client';

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
