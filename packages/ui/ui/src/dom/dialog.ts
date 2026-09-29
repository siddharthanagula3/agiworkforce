import { pushOverlayLayer } from './overlay-stack';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export interface DialogKeyboardOptions {
  panel: HTMLElement;
  onClose: () => void;
  closeOnEscape?: boolean;
  autoFocus?: boolean;
}

export function attachDialogKeyboard(options: DialogKeyboardOptions): () => void {
  const opener = document.activeElement as HTMLElement | null;

  const focusable = (): HTMLElement[] =>
    Array.from(options.panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
      (element) =>
        element.getAttribute('aria-hidden') !== 'true' &&
        element.tabIndex >= 0 &&
        element.closest('[hidden]') === null,
    );

  const onKeyDown = (event: KeyboardEvent): boolean => {
    if (event.key === 'Escape') {
      if (options.closeOnEscape === false) return true;
      event.stopPropagation();
      event.preventDefault();
      options.onClose();
      return true;
    }
    if (event.key !== 'Tab') return true;
    const list = focusable();
    if (list.length === 0) {
      event.preventDefault();
      options.panel.focus();
      return true;
    }
    const first = list[0]!;
    const last = list[list.length - 1]!;
    const active = document.activeElement;
    if (event.shiftKey && (active === first || !options.panel.contains(active))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || !options.panel.contains(active))) {
      event.preventDefault();
      first.focus();
    }
    return true;
  };

  const popLayer = pushOverlayLayer(onKeyDown);
  if (options.autoFocus !== false && !options.panel.contains(document.activeElement)) {
    const first = focusable()[0];
    if (first) first.focus();
    else {
      if (!options.panel.hasAttribute('tabindex')) options.panel.setAttribute('tabindex', '-1');
      options.panel.focus();
    }
  }

  return () => {
    popLayer();
    if (opener && document.contains(opener)) opener.focus();
  };
}

export interface DomDialogOptions {
  title: string;
  body?: Node | string;
  description?: string;
  actions?: readonly Node[];
  onClose?: () => void;
  className?: string;
  overlayClassName?: string;
  titleClassName?: string;
  container?: HTMLElement;
  role?: 'dialog' | 'alertdialog';
}

export interface DomDialog {
  readonly element: HTMLElement;
  close(): void;
}

let dialogSequence = 0;

export function openDialog(options: DomDialogOptions): DomDialog {
  const id = ++dialogSequence;
  const overlay = document.createElement('div');
  if (options.overlayClassName) overlay.className = options.overlayClassName;

  const panel = document.createElement('div');
  panel.setAttribute('role', options.role ?? 'dialog');
  panel.setAttribute('aria-modal', 'true');
  if (options.className) panel.className = options.className;

  const title = document.createElement('h2');
  title.id = `agi-dom-dialog-${id}-title`;
  title.textContent = options.title;
  if (options.titleClassName) title.className = options.titleClassName;
  panel.setAttribute('aria-labelledby', title.id);
  panel.appendChild(title);

  if (options.description) {
    const description = document.createElement('p');
    description.id = `agi-dom-dialog-${id}-description`;
    description.textContent = options.description;
    panel.setAttribute('aria-describedby', description.id);
    panel.appendChild(description);
  }
  if (options.body !== undefined) {
    panel.appendChild(
      typeof options.body === 'string' ? document.createTextNode(options.body) : options.body,
    );
  }
  if (options.actions && options.actions.length > 0) {
    const footer = document.createElement('div');
    footer.dataset['slot'] = 'actions';
    footer.append(...options.actions);
    panel.appendChild(footer);
  }

  overlay.appendChild(panel);
  (options.container ?? document.body).appendChild(overlay);

  let closed = false;
  const detach = attachDialogKeyboard({ panel, onClose: () => close() });

  overlay.addEventListener('mousedown', (event) => {
    if (event.target === overlay) close();
  });

  function close(): void {
    if (closed) return;
    closed = true;
    detach();
    overlay.remove();
    options.onClose?.();
  }

  return { element: panel, close };
}
