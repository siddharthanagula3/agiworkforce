'use client';

import { useEffect, useRef, useState, type ReactNode, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../cn';

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

  const close = () => setOpen(false);

  const computePosition = () => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const style: CSSProperties = {};
    if (side === 'bottom') {
      style.top = rect.bottom + 4;
    } else {
      style.bottom = window.innerHeight - rect.top + 4;
    }
    if (align === 'start') {
      style.left = rect.left;
    } else {
      style.right = window.innerWidth - rect.right;
    }
    setMenuStyle(style);
  };

  const toggle = () => {
    setOpen((v) => {
      if (!v) computePosition();
      return !v;
    });
  };

  useEffect(() => {
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
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onScrollOrResize = () => computePosition();
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('scroll', onScrollOrResize, { capture: true, passive: true });
    window.addEventListener('resize', onScrollOrResize, { passive: true });
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('scroll', onScrollOrResize, { capture: true });
      window.removeEventListener('resize', onScrollOrResize);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const panel = open ? (
    <div
      ref={panelRef}
      role="menu"
      style={portalled ? menuStyle : undefined}
      className={cn(
        portalled
          ? 'fixed z-[9999]'
          : cn(
              'absolute z-50 mt-1',
              side === 'top' ? 'bottom-full mb-1 mt-0' : 'top-full',
              align === 'end' ? 'right-0' : 'left-0',
            ),
        'min-w-[12rem] overflow-hidden rounded-md border p-1 shadow-lg',
        'border-[hsl(var(--border))] bg-[hsl(var(--popover))] text-[hsl(var(--popover-foreground))]',
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
        onSelect();
        close();
      }}
      className={cn(
        'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm transition-colors',
        'hover:bg-[hsl(var(--accent))] focus-visible:bg-[hsl(var(--accent))] focus-visible:outline-none',
        destructive ? 'text-red-500 hover:text-red-500' : 'text-[hsl(var(--popover-foreground))]',
        active && 'bg-[hsl(var(--accent))]',
        className,
      )}
    >
      {icon && <span className="flex h-4 w-4 shrink-0 items-center justify-center">{icon}</span>}
      <span className="flex-1 truncate">{children}</span>
      {trailing && (
        <span className="ml-auto shrink-0 text-xs text-[hsl(var(--muted-foreground))]">
          {trailing}
        </span>
      )}
    </button>
  );
}

export function MenuSeparator() {
  return <div role="separator" className="my-1 h-px bg-[hsl(var(--border))]" />;
}
