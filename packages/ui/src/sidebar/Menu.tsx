'use client';

/**
 * Tiny headless dropdown menu — dependency-free replacement for the Radix
 * DropdownMenu the desktop/web sidebars used. packages/ui must not pull Radix
 * (it would bloat the pure-UI package and break its dependency budget), and a
 * sidebar's 3-dots / project-filter menus are simple enough to own here.
 *
 * Behavior: click trigger to toggle; click outside or Escape to close; clicking
 * an item runs its handler then closes. Positioned absolutely under (or above)
 * the trigger. Styling uses the same hsl(var(--*)) tokens the surfaces resolve.
 */
import { useEffect, useRef, useState, type ReactNode, type CSSProperties } from 'react';
import { cn } from '../cn';

export interface MenuProps {
  /** The clickable element that toggles the menu. */
  trigger: (args: { open: boolean; toggle: () => void }) => ReactNode;
  children: (args: { close: () => void }) => ReactNode;
  align?: 'start' | 'end';
  /** Open above the trigger instead of below. */
  side?: 'top' | 'bottom';
  className?: string;
  menuClassName?: string;
}

export function Menu({
  trigger,
  children,
  align = 'start',
  side = 'bottom',
  className,
  menuClassName,
}: MenuProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const close = () => setOpen(false);
  const toggle = () => setOpen((v) => !v);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const menuStyle: CSSProperties = {
    [side === 'bottom' ? 'top' : 'bottom']: 'calc(100% + 4px)',
    [align === 'start' ? 'left' : 'right']: 0,
  };

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      {trigger({ open, toggle })}
      {open && (
        <div
          role="menu"
          style={menuStyle}
          className={cn(
            'absolute z-50 min-w-[12rem] overflow-hidden rounded-md border p-1 shadow-lg',
            'border-[hsl(var(--border))] bg-[hsl(var(--popover))] text-[hsl(var(--popover-foreground))]',
            menuClassName,
          )}
        >
          {children({ close })}
        </div>
      )}
    </div>
  );
}

export interface MenuItemProps {
  onSelect: () => void;
  close: () => void;
  icon?: ReactNode;
  children: ReactNode;
  /** Trailing content (count, shortcut). */
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
