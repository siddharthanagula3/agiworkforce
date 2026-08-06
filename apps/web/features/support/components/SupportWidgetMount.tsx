'use client';

/**
 * The single global mount for the support widget. Added once in
 * app/providers.tsx, next to OfflineIndicator and Toaster.
 *
 * ── SHIP GATE ────────────────────────────────────────────────────────────
 * `NEXT_PUBLIC_SUPPORT_WIDGET_ENABLED` must be exactly `'1'` for anything to
 * render. It DEFAULTS OFF and that is deliberate, not timidity: the widget
 * calls seven endpoints owned by three other builders, none of which exist in
 * the repo yet. A support bubble that opens and answers "I can't reach the
 * assistant" to every question is a worse product surface than no bubble at
 * all — it is the same lie as a live-chat button with nobody behind it, just
 * one layer up. Flip the flag once /api/support/ask, /api/support/handoff/*
 * and /api/support/actions/* are deployed.
 *
 * ── ONE WIDGET, TWO CONTEXTS ─────────────────────────────────────────────
 * Surface comes from the pathname (marketing vs product) and drives only the
 * palette. Signed-in behaviour — account facts, the action flow — is driven by
 * whether the SERVER returns an account context, never by the pathname and
 * never by a client-side auth guess. The marketing widget therefore degrades
 * to docs-answers-plus-handoff without any missing-account error path.
 */

import { useCallback, useId, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useConsentBannerClearance } from '../hooks/useConsentBannerClearance';
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
  const clearance = useConsentBannerClearance();
  const reducedMotion = usePrefersReducedMotion();

  const close = useCallback(() => {
    setOpen(false);
    // Focus must come back to the control that opened the dialog.
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
        // `agi-modal-scope` is NOT decoration and must never be dropped while
        // `data-design="agi"` is present. globals.css applies two PAGE-level
        // rules to `[data-design='agi']:not(.agi-chrome-band):not(.agi-modal-scope)`:
        // `min-height: 100vh` (:1872) and `overflow-x: clip` (:7579). They are
        // written for full-page marketing routes. Without the opt-out this
        // fixed launcher becomes a 100vh-tall invisible box anchored to the
        // bottom edge — it swallows clicks down the whole right-hand strip of
        // every marketing page and pushes the visible button to the top of the
        // viewport. WaitlistModal.tsx:100-101 carries the same pair for the
        // same reason; this is the repo's established escape hatch for
        // agi-themed chrome that is not a page.
        surface === 'marketing' ? `${styles['root'] ?? ''} agi-modal-scope` : styles['root']
      }
      data-surface={surface}
      // The marketing palette only resolves on an element carrying this
      // attribute — fixed chrome inherits no tokens from a themed subtree.
      {...(surface === 'marketing' ? { 'data-design': 'agi' } : {})}
      data-support-widget=""
      data-reduced-motion={reducedMotion ? 'true' : 'false'}
      style={{ ['--support-clearance' as string]: `${String(clearance)}px` }}
    >
      {open ? <SupportPanel surface={surface} panelId={panelId} onClose={close} /> : null}
      {/* The ref is load-bearing, not decoration: `close()` focuses it, which is
          the only thing that returns keyboard focus to the page after Escape.
          Without it a keyboard user is dropped on <body>. */}
      <SupportLauncher ref={launcherRef} open={open} panelId={panelId} onToggle={toggle} />
    </div>
  );
}
