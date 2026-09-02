'use client';

import { useCallback, useId, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion';
import { isSupportWidgetVisible, resolveSupportSurface } from '../lib/route-visibility';
import { SupportLauncher } from './SupportLauncher';
import { SupportPanel } from './SupportPanel';
import styles from './SupportWidget.module.css';

export function isSupportWidgetEnabled(): boolean {
  return process.env['NEXT_PUBLIC_SUPPORT_WIDGET_ENABLED'] === '1';
}

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

  const surface = resolveSupportSurface(pathname);

  return (
    <div
      className={
        surface === 'marketing' ? `${styles['root'] ?? ''} agi-modal-scope` : styles['root']
      }
      data-surface={surface}
      {...(surface === 'marketing' ? { 'data-design': 'agi' } : {})}
      data-support-widget=""
      data-reduced-motion={reducedMotion ? 'true' : 'false'}
    >
      {open ? <SupportPanel surface={surface} panelId={panelId} onClose={close} /> : null}
      {/* The ref is load-bearing, not decoration: `close()` focuses it, which is
          the only thing that returns keyboard focus to the page after Escape.
          Without it a keyboard user is dropped on <body>. */}
      <SupportLauncher ref={launcherRef} open={open} panelId={panelId} onToggle={toggle} />
    </div>
  );
}
