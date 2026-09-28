export interface PopupMenuHandle {
  open: () => void;
  close: (returnFocus?: boolean) => void;
}

const NAVIGATION_KEYS: ReadonlySet<string> = new Set(['ArrowDown', 'ArrowUp', 'Home', 'End']);

export function wirePopupMenu(trigger: HTMLElement, menu: HTMLElement): PopupMenuHandle {
  const items = (): HTMLElement[] =>
    Array.from(
      menu.querySelectorAll<HTMLElement>(
        '[role="menuitem"]:not([disabled]), [role="menuitemradio"]:not([disabled]), [role="menuitemcheckbox"]:not([disabled])',
      ),
    );

  const onOutsidePointer = (event: Event): void => {
    const target = event.target as Node | null;
    if (target && (trigger.contains(target) || menu.contains(target))) return;
    close();
  };

  function open(): void {
    if (!menu.hidden) return;
    menu.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    document.addEventListener('pointerdown', onOutsidePointer, true);
    items()[0]?.focus();
  }

  function close(returnFocus = false): void {
    if (menu.hidden) return;
    menu.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', onOutsidePointer, true);
    if (returnFocus) trigger.focus();
  }

  menu.hidden = true;
  trigger.setAttribute('aria-haspopup', 'menu');
  trigger.setAttribute('aria-expanded', 'false');
  trigger.addEventListener('click', (event) => {
    event.stopPropagation();
    if (menu.hidden) open();
    else close();
  });
  trigger.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    open();
    if (event.key === 'ArrowUp') {
      const list = items();
      list[list.length - 1]?.focus();
    }
  });
  menu.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close(true);
      return;
    }
    if (event.key === 'Tab') {
      close();
      return;
    }
    if (!NAVIGATION_KEYS.has(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    const list = items();
    if (list.length === 0) return;
    const current = list.indexOf(document.activeElement as HTMLElement);
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? list.length - 1
          : event.key === 'ArrowDown'
            ? (current + 1) % list.length
            : (current - 1 + list.length) % list.length;
    list[next]?.focus();
  });
  return { open, close };
}
