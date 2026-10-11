'use client';

import {
  Fragment,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ComponentType,
} from 'react';
import { MoreHorizontal } from 'lucide-react';
import { useMenuKeyboard } from '@agiworkforce/ui';
import { cn } from '@shared/lib/utils';

export const MORE_ARTIFACT_ACTIONS_LABEL = 'More artifact actions';

export interface ArtifactMenuItem {
  id: string;
  label: string;
  onSelect: () => void;
  icon?: ComponentType<{ className?: string }>;
  group?: string;
  disabled?: boolean;
  testId?: string;
  ariaLabel?: string;
  className?: string;
}

/**
 * The panel header's overflow: every action that does not earn a slot in a
 * 400px header, in one keyboard-complete menu (arrows, Home/End, Escape back
 * to the trigger, Tab out), so nothing is clipped or hidden at any width.
 */
export function ArtifactMoreMenu({ items }: { items: readonly ArtifactMenuItem[] }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const close = useCallback(() => setOpen(false), []);

  useMenuKeyboard({ open, onClose: close, panelRef, triggerRef });

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (panelRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  if (items.length === 0) return null;

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        className={cn(
          'inline-flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-[var(--chat-surface-hover)] hover:text-foreground sm:h-7 sm:w-7',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none',
          open && 'bg-[var(--chat-surface-hover)] text-foreground',
        )}
        aria-label={MORE_ARTIFACT_ACTIONS_LABEL}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        title="More"
        data-testid="artifact-more-actions"
      >
        <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
      </button>
      {open && (
        <div
          ref={panelRef}
          id={menuId}
          role="menu"
          aria-label={MORE_ARTIFACT_ACTIONS_LABEL}
          className="absolute end-0 top-full z-[var(--z-dropdown)] mt-1 max-h-[min(70vh,28rem)] w-60 overflow-y-auto rounded-xl border border-[var(--chat-border-strong)] bg-[var(--chat-surface-overlay)] p-1 shadow-e2"
        >
          {items.map((item, index) => {
            const Icon = item.icon;
            const startsGroup = item.group && item.group !== items[index - 1]?.group;
            return (
              <Fragment key={item.id}>
                {startsGroup && (
                  <div
                    role="presentation"
                    className={cn(
                      'px-2.5 pb-1 pt-2 text-xs font-medium text-muted-foreground',
                      index > 0 && 'mt-1 border-t border-[var(--chat-border)]',
                    )}
                  >
                    {item.group}
                  </div>
                )}
                <button
                  type="button"
                  role="menuitem"
                  disabled={item.disabled}
                  onClick={() => {
                    setOpen(false);
                    triggerRef.current?.focus();
                    item.onSelect();
                  }}
                  className={cn(
                    'flex min-h-11 w-full items-center gap-2.5 rounded-lg px-2.5 text-start text-sm text-foreground transition-colors hover:bg-[var(--chat-surface-hover)] focus-visible:bg-[var(--chat-surface-hover)] focus-visible:outline-none disabled:opacity-50 sm:min-h-9',
                    item.className,
                  )}
                  aria-label={item.ariaLabel}
                  data-testid={item.testId}
                >
                  {Icon ? (
                    <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                  ) : (
                    <span className="h-4 w-4 shrink-0" aria-hidden="true" />
                  )}
                  <span className="min-w-0 truncate">{item.label}</span>
                </button>
              </Fragment>
            );
          })}
        </div>
      )}
    </div>
  );
}
