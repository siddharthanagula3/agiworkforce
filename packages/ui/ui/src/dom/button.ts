export interface DomButtonOptions {
  label: string;
  onClick?: (event: MouseEvent) => void;
  className?: string;
  disabled?: boolean;
  type?: 'button' | 'submit';
  title?: string;
  destructive?: boolean;
}

export function createButton(options: DomButtonOptions): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = options.type ?? 'button';
  button.textContent = options.label;
  if (options.className) button.className = options.className;
  if (options.title) button.title = options.title;
  if (options.destructive) button.dataset['variant'] = 'destructive';
  button.disabled = options.disabled === true;
  if (options.onClick) button.addEventListener('click', options.onClick);
  return button;
}

export interface DomIconButtonOptions {
  label: string;
  icon: Node;
  onClick?: (event: MouseEvent) => void;
  className?: string;
  disabled?: boolean;
  pressed?: boolean;
  showTooltip?: boolean;
}

export function createIconButton(options: DomIconButtonOptions): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.setAttribute('aria-label', options.label);
  if (options.showTooltip !== false) button.title = options.label;
  if (options.className) button.className = options.className;
  if (options.pressed !== undefined) button.setAttribute('aria-pressed', String(options.pressed));
  button.disabled = options.disabled === true;
  if (options.icon instanceof Element) options.icon.setAttribute('aria-hidden', 'true');
  button.appendChild(options.icon);
  if (options.onClick) button.addEventListener('click', options.onClick);
  return button;
}

export function setPressed(button: HTMLButtonElement, pressed: boolean): void {
  button.setAttribute('aria-pressed', String(pressed));
}
