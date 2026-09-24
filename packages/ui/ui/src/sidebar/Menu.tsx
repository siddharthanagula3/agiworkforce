'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type CSSProperties,
} from 'react';
import { createPortal } from 'react-dom';
import { ChevronRight } from '@agiworkforce/icons';
import { cn } from '../cn';
import { useMenuKeyboard } from '../primitives/useMenuKeyboard';
import { MENU_PANEL_ATTRIBUTE } from './escape-guard';

export {
  isInlineEditActive,
  isMenuPanelOpen,
  isTransientSidebarLayerOpen,
  keepOpenForMenuEscape,
  INLINE_EDIT_ATTRIBUTE,
  MENU_PANEL_ATTRIBUTE,
} from './escape-guard';

export interface MenuProps {
  trigger: (args: { open: boolean; toggle: () => void }) => ReactNode;
  children: (args: { close: () => void }) => ReactNode;
  align?: 'start' | 'end';
  side?: 'top' | 'bottom';
  className?: string;
  menuClassName?: string;
  portalled?: boolean;
  onOpenChange?: (open: boolean) => void;
}

const VIEWPORT_MARGIN = 8;
/**
 * The shift is derived from where the panel actually rendered, so one pass
 * lands it. Re-running would have to re-measure a box the browser has already
 * moved, which is a loop when anything reports a stale rect.
 */
const MAX_SHIFT_PASSES = 1;
const TRIGGER_GAP = 4;
const TRIGGER_SELECTOR = 'button, [role="button"]';

const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

export function Menu({
  trigger,
  children,
  align = 'start',
  side = 'bottom',
  className,
  menuClassName,
  portalled = true,
  onOpenChange,
}: MenuProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({});
  const panelRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const shiftRef = useRef(0);
  const shiftPassRef = useRef(0);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const mountedRef = useRef(false);
  const onOpenChangeRef = useRef(onOpenChange);
  onOpenChangeRef.current = onOpenChange;
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    onOpenChangeRef.current?.(open);
  }, [open]);

  const triggerElement = useCallback(
    () => containerRef.current?.querySelector<HTMLElement>(TRIGGER_SELECTOR) ?? null,
    [],
  );

  // Synchronous, and before any consumer state change: a panel that unmounts
  // with focus still inside it drops focus to <body>, and anything the
  // selection opens next (a confirm dialog reads document.activeElement to
  // learn what to restore to) then records <body> or whatever grabbed it.
  const focusTrigger = useCallback(() => {
    triggerElement()?.focus();
  }, [triggerElement]);

  // The trigger is a render prop and cannot be cloned, so the menu stamps the
  // two attributes a screen reader needs onto it; no call site set them.
  useIsomorphicLayoutEffect(() => {
    const element = triggerElement();
    if (!element) return;
    triggerRef.current = element;
    element.setAttribute('aria-haspopup', 'menu');
    element.setAttribute('aria-expanded', String(open));
    return () => {
      if (triggerRef.current === element) triggerRef.current = null;
    };
  }, [open, triggerElement]);

  const close = useCallback(() => {
    focusTrigger();
    setOpen(false);
  }, [focusTrigger]);

  const closeFromKeyboard = useCallback(() => setOpen(false), []);
  useMenuKeyboard({ open, onClose: closeFromKeyboard, panelRef, triggerRef });

  // A sidebar row near the bottom of the window has no room below it, so a
  // menu anchored to `rect.bottom` runs off-screen and its items become
  // unreachable. Measure the panel, flip it above the trigger when that fits
  // better, and cap its height to the space actually available.
  const computePosition = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const panel = panelRef.current;
    const panelHeight = panel?.offsetHeight ?? 0;
    const panelWidth = panel?.offsetWidth ?? 0;

    const maxLeft = Math.max(VIEWPORT_MARGIN, window.innerWidth - panelWidth - VIEWPORT_MARGIN);
    const preferredLeft = align === 'end' ? rect.right - panelWidth : rect.left;
    const clampedLeft = Math.min(Math.max(preferredLeft, VIEWPORT_MARGIN), maxLeft);

    // An absolutely positioned panel is placed against its container, and a
    // container can sit outside the viewport - the connectors table is wider
    // than a phone screen, so its right-aligned Add menu rendered entirely off
    // the right edge with no way to scroll to it.
    //
    // Correct it from where the panel actually landed rather than from the
    // container's box. Which ancestor forms the containing block depends on
    // transforms and filters applied above this component, so a shift derived
    // from the trigger's coordinates can be measured against the wrong origin.
    if (!portalled) {
      if (!panel || shiftPassRef.current >= MAX_SHIFT_PASSES) return;
      shiftPassRef.current += 1;
      const unshifted = panel.getBoundingClientRect().left - shiftRef.current;
      const shift = clampedLeft - unshifted;
      if (Math.abs(shift - shiftRef.current) < 0.5) return;
      shiftRef.current = shift;
      setMenuStyle({ transform: `translateX(${shift}px)` });
      return;
    }

    const spaceBelow = window.innerHeight - rect.bottom - TRIGGER_GAP - VIEWPORT_MARGIN;
    const spaceAbove = rect.top - TRIGGER_GAP - VIEWPORT_MARGIN;
    const preferAbove = side === 'top';
    const fitsBelow = panelHeight <= spaceBelow;
    const fitsAbove = panelHeight <= spaceAbove;
    const placeAbove = preferAbove
      ? fitsAbove || !fitsBelow
      : !fitsBelow && (fitsAbove || spaceAbove > spaceBelow);

    const style: CSSProperties = placeAbove
      ? {
          bottom: window.innerHeight - rect.top + TRIGGER_GAP,
          maxHeight: Math.max(spaceAbove, 0),
        }
      : { top: rect.bottom + TRIGGER_GAP, maxHeight: Math.max(spaceBelow, 0) };

    style.left = clampedLeft;

    setMenuStyle((current) =>
      current.top === style.top &&
      current.bottom === style.bottom &&
      current.left === style.left &&
      current.maxHeight === style.maxHeight
        ? current
        : style,
    );
  }, [align, side, portalled]);

  const toggle = () => setOpen((v) => !v);

  // Runs after the panel is in the DOM but before paint, so the measured
  // placement is the first one the user ever sees.
  useIsomorphicLayoutEffect(() => {
    if (!open) {
      shiftRef.current = 0;
      shiftPassRef.current = 0;
      return;
    }
    computePosition();
  }, [open, menuStyle, computePosition]);

  // A plain useEffect is a passive effect: React defers it to run after paint,
  // on a separate task from the click that opened the menu. A key press fired
  // right after that click (a fast real user, or any programmatic focus+key
  // pair with no artificial gap between them) can be processed by the browser
  // before this listener is attached, so it falls through uncaught to the
  // sidebar's own bubble-phase arrow-key handler. useIsomorphicLayoutEffect
  // runs synchronously in the same commit as the `open` state change, before
  // the browser can process any subsequent input event, closing that window.
  useIsomorphicLayoutEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      const eventPath = e.composedPath();
      const insideTrigger = Boolean(
        containerRef.current &&
        (containerRef.current.contains(target) || eventPath.includes(containerRef.current)),
      );
      const insidePanel = Boolean(
        panelRef.current &&
        (panelRef.current.contains(target) || eventPath.includes(panelRef.current)),
      );
      if (!insideTrigger && !insidePanel) {
        setOpen(false);
      }
    };
    const onScrollOrResize = () => {
      shiftPassRef.current = 0;
      computePosition();
    };
    document.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('scroll', onScrollOrResize, { capture: true, passive: true });
    window.addEventListener('resize', onScrollOrResize, { passive: true });
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('scroll', onScrollOrResize, { capture: true });
      window.removeEventListener('resize', onScrollOrResize);
    };
  }, [open, computePosition]);

  const panel = open ? (
    <div
      ref={panelRef}
      role="menu"
      {...{ [MENU_PANEL_ATTRIBUTE]: '' }}
      style={menuStyle}
      className={cn(
        portalled
          ? // pointer-events-auto is load-bearing inside a modal Radix dialog.
            // The sidebar renders in a Sheet at narrow viewports, and Radix's
            // dismissable layer sets `pointer-events: none` on <body> while it
            // is open. This panel is portalled straight to <body>, outside that
            // layer, so without saying so it inherits `none` and every row
            // action, rename, delete, pin, move to project, renders and
            // ignores the tap.
            'pointer-events-auto fixed z-[var(--z-popover)]'
          : cn(
              'absolute z-[var(--z-dropdown)] mt-1 max-h-[min(24rem,60vh)]',
              side === 'top' ? 'bottom-full mb-1 mt-0' : 'top-full',
            ),
        'min-w-[12rem] overflow-y-auto overscroll-contain rounded-md border p-1 shadow-lg',
        'border-border bg-popover text-popover-foreground',
        menuClassName,
      )}
    >
      {children({ close })}
    </div>
  ) : null;

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      {trigger({ open, toggle })}
      {/* Portal only once mounted: document does not exist during SSR, and this
          package is consumed by the Next.js app. */}
      {mounted && panel ? (portalled ? createPortal(panel, document.body) : panel) : null}
    </div>
  );
}

export interface MenuItemProps {
  onSelect: () => void;
  close: () => void;
  icon?: ReactNode;
  children: ReactNode;
  trailing?: ReactNode;
  destructive?: boolean;
  active?: boolean;
  className?: string;
}

export function MenuItem({
  onSelect,
  close,
  icon,
  children,
  trailing,
  destructive,
  active,
  className,
}: MenuItemProps) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={(e) => {
        e.stopPropagation();
        close();
        onSelect();
      }}
      className={cn(
        'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm transition-colors',
        'hover:bg-accent focus-visible:bg-accent focus-visible:outline-none',
        destructive ? 'text-red-500 hover:text-red-500' : 'text-popover-foreground',
        active && 'bg-accent',
        className,
      )}
    >
      {icon && <span className="flex h-4 w-4 shrink-0 items-center justify-center">{icon}</span>}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {trailing && (
        <span className="ml-auto shrink-0 text-xs text-muted-foreground">
          {trailing}
        </span>
      )}
    </button>
  );
}

export function MenuSeparator() {
  return <div role="separator" className="my-1 h-px bg-border" />;
}

export interface MenuSubmenuProps {
  label: ReactNode;
  icon?: ReactNode;
  children: ReactNode;
}

const SUBMENU_CLOSE_DELAY_MS = 150;

const SUBMENU_WIDTH_PX = 208;
const SUBMENU_GAP_PX = 4;

/**
 * A flyout, not the drill-down the model sub-menu elsewhere in this package
 * uses: the trigger stays visible and the panel opens beside it, the shape
 * both leaders use for "Move to project" so the row menu's height stays
 * fixed instead of growing by one line per project (which was also, it
 * turned out, why that menu mispositioned itself: `computePosition` sized
 * against a panel taller than the viewport).
 *
 * Portalled to `document.body` with a computed fixed position, the same
 * escape hatch the top-level `Menu` panel already uses: nesting an
 * `absolute` flyout inside a *scrolling* (`overflow-y-auto`) ancestor put it
 * in that ancestor's own containing-block chain, so the flyout's rightward
 * overflow grew the ancestor's scrollable region and shifted the trigger's
 * own wrapper sideways to compensate. Escaping the scroll container instead
 * of positioning within it sidesteps that interaction entirely.
 */
export function MenuSubmenu({ label, icon, children }: MenuSubmenuProps) {
  const [open, setOpen] = useState(false);
  const [style, setStyle] = useState<CSSProperties>({});
  const [mounted, setMounted] = useState(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  const cancelClose = () => {
    if (closeTimerRef.current !== null) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  };
  const openNow = () => {
    cancelClose();
    setOpen(true);
  };
  const closeSoon = () => {
    cancelClose();
    closeTimerRef.current = setTimeout(() => setOpen(false), SUBMENU_CLOSE_DELAY_MS);
  };
  const closeNow = () => {
    cancelClose();
    setOpen(false);
  };

  useIsomorphicLayoutEffect(() => {
    if (!open) return;
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const fitsRight = rect.right + SUBMENU_GAP_PX + SUBMENU_WIDTH_PX <= window.innerWidth;
    const left = fitsRight
      ? rect.right + SUBMENU_GAP_PX
      : Math.max(VIEWPORT_MARGIN, rect.left - SUBMENU_GAP_PX - SUBMENU_WIDTH_PX);
    const top = Math.min(rect.top, window.innerHeight - VIEWPORT_MARGIN);
    setStyle({ top, left, maxHeight: window.innerHeight - top - VIEWPORT_MARGIN });
  }, [open]);

  useIsomorphicLayoutEffect(() => {
    if (!open) return;
    const id = window.setTimeout(
      () => panelRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus(),
      0,
    );
    return () => window.clearTimeout(id);
  }, [open]);

  useEffect(() => () => cancelClose(), []);

  const panel = open ? (
    <div
      ref={panelRef}
      role="menu"
      aria-label={typeof label === 'string' ? label : undefined}
      style={style}
      onMouseEnter={openNow}
      onMouseLeave={closeSoon}
      onKeyDown={(e) => {
        if (e.key === 'ArrowLeft' || e.key === 'Escape') {
          e.stopPropagation();
          closeNow();
          triggerRef.current?.focus();
        }
      }}
      className="fixed z-[var(--z-popover)] w-52 overflow-y-auto overscroll-contain rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-lg"
    >
      {children}
    </div>
  ) : null;

  return (
    <div className="relative" onMouseEnter={openNow} onMouseLeave={closeSoon}>
      <button
        ref={triggerRef}
        type="button"
        role="menuitem"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') {
            e.preventDefault();
            openNow();
          }
        }}
        className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm text-popover-foreground transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
      >
        {icon && <span className="flex h-4 w-4 shrink-0 items-center justify-center">{icon}</span>}
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      </button>
      {mounted && panel ? createPortal(panel, document.body) : null}
    </div>
  );
}
