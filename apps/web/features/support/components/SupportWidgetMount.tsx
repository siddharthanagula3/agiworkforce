'use client';

import { useCallback, useId, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion';
import { isSupportWidgetVisible } from '../lib/route-visibility';
import { isSupportWidgetEnabled } from '../lib/widget-flag';
import { SupportLauncher } from './SupportLauncher';
import { SupportPanel } from './SupportPanel';
import styles from './SupportWidget.module.css';

const SUPPORT_WIDGET_SURFACE = 'marketing';

export function SupportWidgetMount() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const launcherRef = useRef<HTMLButtonElement | null>(null);
  const panelId = useId();
  const reducedMotion = usePrefersReducedMotion();

  const close = useCallback(() => {
    setOpen(false);
    launcherRef.current?.focus();
  }, []);

  const toggle = useCallback(() => {
    setOpen((prev) => {
      if (prev) launcherRef.current?.focus();
      return !prev;
    });
  }, []);

  if (!isSupportWidgetEnabled()) return null;
  if (!isSupportWidgetVisible(pathname)) return null;

  return (
    <div
      className={`${styles['root'] ?? ''} agi-modal-scope`}
      data-surface={SUPPORT_WIDGET_SURFACE}
      data-design="agi"
      data-support-widget=""
      data-reduced-motion={reducedMotion ? 'true' : 'false'}
    >
      {open ? (
        <SupportPanel surface={SUPPORT_WIDGET_SURFACE} panelId={panelId} onClose={close} />
      ) : null}
      {/* The ref is load-bearing, not decoration: `close()` focuses it, which is
          the only thing that returns keyboard focus to the page after Escape.
          Without it a keyboard user is dropped on <body>. */}
      <SupportLauncher ref={launcherRef} open={open} panelId={panelId} onToggle={toggle} />
    </div>
  );
}
