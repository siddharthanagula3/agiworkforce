'use client';

import { useEffect, useState, type RefObject } from 'react';
import type { BrowserPaneBounds } from '@agiworkforce/local-runtime-contract';
import { captureBrowserPane, layoutBrowserPane } from '@/features/desktop-host';

const SAMPLE_INSET = 6;
const SAMPLE_SPACING = 120;
const SAMPLE_COLUMNS = 8;
const SAMPLE_ROWS = 6;
const FREEZE_WAIT_MS = 160;
const SETTLE_CHECK_MS = 500;
const OVERLAYS =
  '[data-radix-popper-content-wrapper],[role="dialog"],[role="alertdialog"],[role="menu"],[role="listbox"]';
const OVERLAY_ATTRIBUTES = ['data-state', 'hidden', 'open', 'aria-expanded', 'aria-hidden'];
const LAYOUT_EVENTS = [
  'resize',
  'scroll',
  'pointerdown',
  'pointerup',
  'keydown',
  'keyup',
  'focusin',
  'transitionrun',
  'transitionend',
  'animationend',
] as const;

function measure(element: HTMLElement): BrowserPaneBounds {
  const rect = element.getBoundingClientRect();
  return {
    x: Math.max(0, Math.round(rect.left)),
    y: Math.max(0, Math.round(rect.top)),
    width: Math.max(0, Math.round(rect.width)),
    height: Math.max(0, Math.round(rect.height)),
  };
}

function steps(start: number, length: number, limit: number): number[] {
  const usable = length - SAMPLE_INSET * 2;
  if (usable <= 0) return [];
  const count = Math.min(limit, Math.max(2, Math.ceil(usable / SAMPLE_SPACING) + 1));
  return Array.from(
    { length: count },
    (_unused, index) => start + SAMPLE_INSET + (usable * index) / (count - 1),
  );
}

function overlayCrosses(element: HTMLElement, bounds: BrowserPaneBounds): boolean {
  for (const overlay of document.querySelectorAll<HTMLElement>(OVERLAYS)) {
    if (element.contains(overlay)) continue;
    const rect = overlay.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;
    if (
      rect.left < bounds.x + bounds.width &&
      rect.right > bounds.x &&
      rect.top < bounds.y + bounds.height &&
      rect.bottom > bounds.y
    ) {
      return true;
    }
  }
  return false;
}

function somethingOnTop(element: HTMLElement, bounds: BrowserPaneBounds): boolean {
  if (typeof document.elementFromPoint !== 'function') return false;
  const columns = steps(bounds.x, bounds.width, SAMPLE_COLUMNS);
  const rows = steps(bounds.y, bounds.height, SAMPLE_ROWS);
  return rows.some((y) =>
    columns.some((x) => {
      const hit = document.elementFromPoint(x, y);
      return hit !== null && hit !== element && !element.contains(hit);
    }),
  );
}

interface Cover {
  deadline: number;
  frame: string | null;
  capturing: boolean;
}

export interface BrowserPaneStage {
  /** The page is hidden because part of the app is drawn over where it sits. */
  paused: boolean;
  /** What the page showed when it was hidden, when that could be captured. */
  frozen: string | null;
}

/**
 * Keeps the page, which the desktop draws above the whole window, exactly over
 * its place in the pane. Nothing in the app can be drawn on top of it, so it is
 * hidden for as long as a menu, a dialog or anything else needs that space.
 */
export function useBrowserPaneStage(
  paneId: string,
  viewport: RefObject<HTMLElement | null>,
  wantsPage: boolean,
): BrowserPaneStage {
  const [paused, setPaused] = useState(false);
  const [frozen, setFrozen] = useState<string | null>(null);

  useEffect(() => {
    const mounted = viewport.current;
    if (!mounted) return undefined;
    const element: HTMLElement = mounted;
    let frame: number | null = null;
    let sent = '';
    let last: BrowserPaneBounds = { x: 0, y: 0, width: 0, height: 0 };
    let cover: Cover | null = null;
    let stopped = false;
    const timers = new Set<number>();

    const send = (bounds: BrowserPaneBounds, visible: boolean): boolean => {
      const key = `${bounds.x},${bounds.y},${bounds.width},${bounds.height},${visible}`;
      if (key === sent) return false;
      sent = key;
      last = bounds;
      layoutBrowserPane(paneId, bounds, visible).catch(() => undefined);
      return true;
    };

    const schedule = () => {
      if (frame === null && !stopped) frame = requestAnimationFrame(sync);
    };

    const show = (bounds: BrowserPaneBounds) => {
      cover = null;
      setPaused(false);
      setFrozen(null);
      if (send(bounds, true)) schedule();
    };

    const hide = (bounds: BrowserPaneBounds, still: string | null, pausedNow: boolean) => {
      setPaused(pausedNow);
      setFrozen(still);
      send(bounds, false);
    };

    const startCover = (): Cover => {
      const started: Cover = {
        deadline: performance.now() + FREEZE_WAIT_MS,
        frame: null,
        capturing: true,
      };
      captureBrowserPane(paneId)
        .then((capture) => {
          started.frame = capture.dataUrl;
        })
        .catch(() => undefined)
        .finally(() => {
          started.capturing = false;
          if (cover === started) schedule();
        });
      const timer = window.setTimeout(() => {
        timers.delete(timer);
        schedule();
      }, FREEZE_WAIT_MS);
      timers.add(timer);
      return started;
    };

    function sync() {
      frame = null;
      if (stopped) return;
      const bounds = measure(element);
      if (!wantsPage || bounds.width === 0 || bounds.height === 0) {
        cover = null;
        hide(bounds, null, false);
        return;
      }
      if (!overlayCrosses(element, bounds) && !somethingOnTop(element, bounds)) {
        show(bounds);
        return;
      }
      cover ??= startCover();
      if (cover.capturing && performance.now() < cover.deadline) {
        send(bounds, true);
        return;
      }
      hide(bounds, cover.frame, true);
    }

    const mutations = new MutationObserver(schedule);
    mutations.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: OVERLAY_ATTRIBUTES,
    });
    const resizes = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule);
    resizes?.observe(element);
    for (const name of LAYOUT_EVENTS) window.addEventListener(name, schedule, true);
    const settle = window.setInterval(schedule, SETTLE_CHECK_MS);
    sync();

    return () => {
      stopped = true;
      mutations.disconnect();
      resizes?.disconnect();
      for (const name of LAYOUT_EVENTS) window.removeEventListener(name, schedule, true);
      window.clearInterval(settle);
      for (const timer of timers) window.clearTimeout(timer);
      if (frame !== null) cancelAnimationFrame(frame);
      layoutBrowserPane(paneId, last, false).catch(() => undefined);
    };
  }, [paneId, viewport, wantsPage]);

  return { paused, frozen };
}
