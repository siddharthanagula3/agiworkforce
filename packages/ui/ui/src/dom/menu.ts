const NAV_KEYS = ['ArrowDown', 'ArrowUp', 'Home', 'End'];
const DEFAULT_ITEM_SELECTOR = '[role="menuitem"]';

export interface MenuKeyboardOptions {
  panel: HTMLElement;
  onClose: () => void;
  trigger?: HTMLElement | null;
  itemSelector?: string;
  autoFocusFirstItem?: boolean;
}

export function attachMenuKeyboard(options: MenuKeyboardOptions): () => void {
  const selector = options.itemSelector ?? DEFAULT_ITEM_SELECTOR;

  const items = (): HTMLElement[] =>
    Array.from(options.panel.querySelectorAll<HTMLElement>(selector)).filter(
      (item) => !item.hasAttribute('disabled') && item.getAttribute('aria-disabled') !== 'true',
    );

  const focusItem = (index: number): void => {
    const list = items();
    if (list.length === 0) return;
    list[((index % list.length) + list.length) % list.length]?.focus();
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      options.onClose();
      options.trigger?.focus();
      return;
    }
    if (event.key === 'Tab') {
      options.onClose();
      return;
    }
    if (!NAV_KEYS.includes(event.key)) return;
    const list = items();
    if (list.length === 0) return;
    event.preventDefault();
    event.stopPropagation();
    const current = list.indexOf(document.activeElement as HTMLElement);
    if (event.key === 'ArrowDown') focusItem(current + 1);
    else if (event.key === 'ArrowUp') focusItem(current - 1);
    else if (event.key === 'Home') focusItem(0);
    else focusItem(list.length - 1);
  };

  document.addEventListener('keydown', onKeyDown, true);
  if (options.autoFocusFirstItem !== false) focusItem(0);
  return () => document.removeEventListener('keydown', onKeyDown, true);
}

export interface DomMenuItem {
  label: string;
  onSelect: () => void;
  disabled?: boolean;
  destructive?: boolean;
  icon?: Node;
}

export interface DomMenuOptions {
  trigger: HTMLElement;
  items: () => readonly DomMenuItem[];
  label?: string;
  className?: string;
  itemClassName?: string;
  container?: HTMLElement;
  onOpenChange?: (open: boolean) => void;
}

export interface DomMenu {
  readonly panel: HTMLElement;
  open(): void;
  close(options?: { restoreFocus?: boolean }): void;
  toggle(): void;
  isOpen(): boolean;
  destroy(): void;
}

let menuSequence = 0;

export function createMenu(options: DomMenuOptions): DomMenu {
  const panel = document.createElement('div');
  panel.setAttribute('role', 'menu');
  panel.id = `agi-dom-menu-${++menuSequence}`;
  panel.hidden = true;
  if (options.className) panel.className = options.className;
  if (options.label) panel.setAttribute('aria-label', options.label);
  options.trigger.setAttribute('aria-haspopup', 'menu');
  options.trigger.setAttribute('aria-expanded', 'false');
  options.trigger.setAttribute('aria-controls', panel.id);
  (options.container ?? options.trigger.parentElement ?? document.body).appendChild(panel);

  let detachKeyboard: (() => void) | null = null;

  const onPointerDown = (event: PointerEvent | MouseEvent): void => {
    const target = event.target as Node | null;
    if (target && (panel.contains(target) || options.trigger.contains(target))) return;
    close({ restoreFocus: false });
  };

  function render(): void {
    panel.replaceChildren(
      ...options.items().map((item) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.setAttribute('role', 'menuitem');
        button.tabIndex = -1;
        if (options.itemClassName) button.className = options.itemClassName;
        if (item.destructive) button.dataset['variant'] = 'destructive';
        if (item.disabled) {
          button.disabled = true;
          button.setAttribute('aria-disabled', 'true');
        }
        if (item.icon) {
          if (item.icon instanceof Element) item.icon.setAttribute('aria-hidden', 'true');
          button.appendChild(item.icon);
        }
        button.appendChild(document.createTextNode(item.label));
        button.addEventListener('click', () => {
          close({ restoreFocus: true });
          item.onSelect();
        });
        return button;
      }),
    );
  }

  function open(): void {
    if (!panel.hidden) return;
    render();
    panel.hidden = false;
    options.trigger.setAttribute('aria-expanded', 'true');
    detachKeyboard = attachMenuKeyboard({
      panel,
      trigger: options.trigger,
      onClose: () => close({ restoreFocus: false }),
    });
    document.addEventListener('mousedown', onPointerDown, true);
    options.onOpenChange?.(true);
  }

  function close(closeOptions: { restoreFocus?: boolean } = {}): void {
    if (panel.hidden) return;
    panel.hidden = true;
    options.trigger.setAttribute('aria-expanded', 'false');
    detachKeyboard?.();
    detachKeyboard = null;
    document.removeEventListener('mousedown', onPointerDown, true);
    if (closeOptions.restoreFocus) options.trigger.focus();
    options.onOpenChange?.(false);
  }

  const onTriggerClick = (): void => (panel.hidden ? open() : close({ restoreFocus: true }));
  options.trigger.addEventListener('click', onTriggerClick);

  return {
    panel,
    open,
    close,
    toggle: onTriggerClick,
    isOpen: () => !panel.hidden,
    destroy() {
      close();
      options.trigger.removeEventListener('click', onTriggerClick);
      panel.remove();
    },
  };
}
