'use client';

import {
  Fragment,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { useMenuKeyboard } from '@agiworkforce/ui';
import { cn } from '@shared/lib/utils';

export interface DeckMenuItem {
  id: string;
  label: string;
  onSelect: () => void;
  icon?: ComponentType<{ className?: string }>;
  leading?: ReactNode;
  group?: string;
  checked?: boolean;
  disabled?: boolean;
}

export function DeckMenu({
  label,
  icon: Icon,
  items,
  testId,
  align = 'start',
  compact = false,
  onOpenChange,
}: {
  label: string;
  icon: ComponentType<{ className?: string }>;
  items: readonly DeckMenuItem[];
  testId?: string;
  align?: 'start' | 'end';
  compact?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const close = useCallback(() => setOpen(false), []);
  useMenuKeyboard({
    open,
    onClose: close,
    panelRef,
    triggerRef,
    itemSelector: '[role^="menuitem"]',
  });

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

  return (
    <div className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          onOpenChange?.(!open);
          setOpen(!open);
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={compact ? label : undefined}
        title={label}
        className={cn(
          'inline-flex min-h-11 items-center gap-1.5 rounded-md px-2 text-sm text-foreground transition-colors hover:bg-[var(--chat-surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-8',
          open && 'bg-[var(--chat-surface-hover)]',
        )}
        data-testid={testId}
      >
        <Icon className="h-4 w-4 text-muted-foreground" />
        {compact ? null : <span>{label}</span>}
        <ChevronDown className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
      </button>
      {open ? (
        <div
          ref={panelRef}
          id={menuId}
          role="menu"
          aria-label={label}
          className={cn(
            'absolute top-full z-[var(--z-dropdown)] mt-1 max-h-80 w-56 overflow-y-auto rounded-xl border border-[var(--chat-border-strong)] bg-[var(--chat-surface-overlay)] p-1 shadow-e2',
            align === 'end' ? 'end-0' : 'start-0',
          )}
        >
          {items.map((item, index) => {
            const ItemIcon = item.icon;
            const startsGroup = item.group && item.group !== items[index - 1]?.group;
            return (
              <Fragment key={item.id}>
                {startsGroup ? (
                  <div
                    role="presentation"
                    className={cn(
                      'px-2.5 pb-1 pt-2 text-xs font-medium text-muted-foreground',
                      index > 0 && 'mt-1 border-t border-[var(--chat-border)]',
                    )}
                  >
                    {item.group}
                  </div>
                ) : null}
                <button
                  type="button"
                  role={item.checked === undefined ? 'menuitem' : 'menuitemradio'}
                  aria-checked={item.checked}
                  disabled={item.disabled}
                  onClick={() => {
                    setOpen(false);
                    triggerRef.current?.focus();
                    item.onSelect();
                  }}
                  className="flex min-h-11 w-full items-center gap-2.5 rounded-lg px-2.5 text-start text-sm text-foreground transition-colors hover:bg-[var(--chat-surface-hover)] focus-visible:bg-[var(--chat-surface-hover)] focus-visible:outline-none disabled:opacity-50 sm:min-h-9"
                  data-testid={`deck-menu-${item.id}`}
                >
                  {item.leading ??
                    (ItemIcon ? (
                      <ItemIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                    ) : (
                      <span className="h-4 w-4 shrink-0" aria-hidden="true" />
                    ))}
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  {item.checked ? <Check className="h-4 w-4 shrink-0" aria-hidden="true" /> : null}
                </button>
              </Fragment>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
