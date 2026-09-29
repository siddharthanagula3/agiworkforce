let fieldSequence = 0;

export interface DomToggleOptions {
  label: string;
  checked: boolean;
  onChange?: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
  describedBy?: string;
}

export interface DomToggle {
  readonly element: HTMLButtonElement;
  checked(): boolean;
  set(checked: boolean): void;
  setDisabled(disabled: boolean): void;
}

export function createToggle(options: DomToggleOptions): DomToggle {
  const element = document.createElement('button');
  element.type = 'button';
  element.setAttribute('role', 'switch');
  element.setAttribute('aria-label', options.label);
  if (options.describedBy) element.setAttribute('aria-describedby', options.describedBy);
  if (options.className) element.className = options.className;
  element.disabled = options.disabled === true;

  let value = options.checked;
  const apply = (): void => {
    element.setAttribute('aria-checked', String(value));
    element.dataset['state'] = value ? 'checked' : 'unchecked';
  };
  apply();

  element.addEventListener('click', () => {
    if (element.disabled) return;
    value = !value;
    apply();
    options.onChange?.(value);
  });

  return {
    element,
    checked: () => value,
    set(next) {
      value = next;
      apply();
    },
    setDisabled(disabled) {
      element.disabled = disabled;
    },
  };
}

export interface DomTextFieldOptions {
  label: string;
  value?: string;
  placeholder?: string;
  multiline?: boolean;
  type?: 'text' | 'search' | 'url' | 'email' | 'password';
  hint?: string;
  hideLabel?: boolean;
  onInput?: (value: string) => void;
  className?: string;
  inputClassName?: string;
  labelClassName?: string;
  hintClassName?: string;
  maxLength?: number;
  required?: boolean;
}

export interface DomTextField {
  readonly element: HTMLElement;
  readonly input: HTMLInputElement | HTMLTextAreaElement;
  value(): string;
  setError(message: string | null): void;
}

export function createTextField(options: DomTextFieldOptions): DomTextField {
  const id = `agi-dom-field-${++fieldSequence}`;
  const element = document.createElement('div');
  if (options.className) element.className = options.className;

  const label = document.createElement('label');
  label.htmlFor = id;
  label.textContent = options.label;
  if (options.labelClassName) label.className = options.labelClassName;
  if (options.hideLabel) {
    Object.assign(label.style, {
      position: 'absolute',
      width: '1px',
      height: '1px',
      overflow: 'hidden',
      clip: 'rect(0 0 0 0)',
      whiteSpace: 'nowrap',
    });
  }

  const input = options.multiline
    ? document.createElement('textarea')
    : Object.assign(document.createElement('input'), { type: options.type ?? 'text' });
  input.id = id;
  input.value = options.value ?? '';
  if (options.placeholder) input.placeholder = options.placeholder;
  if (options.inputClassName) input.className = options.inputClassName;
  if (options.maxLength !== undefined) input.maxLength = options.maxLength;
  if (options.required) input.required = true;

  const hint = document.createElement('div');
  hint.id = `${id}-hint`;
  if (options.hintClassName) hint.className = options.hintClassName;
  hint.textContent = options.hint ?? '';
  hint.hidden = !options.hint;
  input.setAttribute('aria-describedby', hint.id);

  if (options.onInput) {
    const onInput = options.onInput;
    input.addEventListener('input', () => onInput(input.value));
  }

  element.append(label, input, hint);

  return {
    element,
    input,
    value: () => input.value,
    setError(message) {
      if (message) {
        input.setAttribute('aria-invalid', 'true');
        hint.textContent = message;
        hint.setAttribute('role', 'alert');
        hint.hidden = false;
      } else {
        input.removeAttribute('aria-invalid');
        hint.removeAttribute('role');
        hint.textContent = options.hint ?? '';
        hint.hidden = !options.hint;
      }
    },
  };
}
