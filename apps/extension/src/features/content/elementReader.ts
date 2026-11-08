export interface DomAutocompleteRule {
  selector: string;
  questionSelector: string;
  optionSelector: string;
  emptySelector?: string;
  popupSelector?: string;
  selectionSelector?: string;
  selectionLabelKey?: string;
}

export function createDomElementReader(rules: readonly DomAutocompleteRule[] = []) {
  const sensitiveNameTokens = new Set([
    'card',
    'cc',
    'ccnum',
    'cardnumber',
    'cvv',
    'cvc',
    'csc',
    'otp',
    'ssn',
    'password',
    'passwd',
    'pwd',
    'pin',
    'passcode',
  ]);

  function isInput(element: Element): element is HTMLInputElement {
    const view = element.ownerDocument.defaultView;
    return Boolean(view && element instanceof view.HTMLInputElement);
  }

  function isTextArea(element: Element): element is HTMLTextAreaElement {
    const view = element.ownerDocument.defaultView;
    return Boolean(view && element instanceof view.HTMLTextAreaElement);
  }

  function isSelect(element: Element): element is HTMLSelectElement {
    const view = element.ownerDocument.defaultView;
    return Boolean(view && element instanceof view.HTMLSelectElement);
  }

  function isEditableText(element: Element): boolean {
    const view = element.ownerDocument.defaultView;
    if (view && element instanceof view.HTMLElement && element.isContentEditable) return true;
    const editable = element.getAttribute('contenteditable');
    return editable === '' || editable === 'true' || editable === 'plaintext-only';
  }

  function isTextEntry(element: Element): boolean {
    if (isTextArea(element) || isSelect(element)) return true;
    if (isInput(element)) return !['submit', 'button', 'reset', 'image'].includes(element.type);
    if (isEditableText(element)) return true;
    return ['textbox', 'searchbox', 'combobox'].includes(element.getAttribute('role') ?? '');
  }

  function isSensitiveField(element: Element): boolean {
    if (isInput(element) && element.type === 'password') return true;
    if (
      (element.getAttribute('autocomplete') ?? '')
        .toLowerCase()
        .split(/\s+/u)
        .some((token) => /^(cc-.+|current-password|new-password|one-time-code)$/u.test(token))
    )
      return true;
    return ['name', 'id', 'aria-label', 'placeholder', 'data-testid']
      .map((attribute) => element.getAttribute(attribute) ?? '')
      .join(' ')
      .replace(/([a-z])([A-Z])/gu, '$1 $2')
      .toLowerCase()
      .split(/[^a-z0-9]+/u)
      .some((token) => token !== '' && sensitiveNameTokens.has(token));
  }

  function ruleFor(element: Element) {
    return rules.find((rule) => element.matches(rule.selector));
  }

  function isAutocomplete(element: Element): boolean {
    return (
      isInput(element) &&
      ['text', 'search'].includes(element.type) &&
      Boolean(
        ruleFor(element) ||
        element.getAttribute('role') === 'combobox' ||
        ['list', 'both'].includes(element.getAttribute('aria-autocomplete') ?? ''),
      )
    );
  }

  function visible(element: Element): boolean {
    const bounds = element.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return false;
    for (let current: Element | null = element; current;) {
      const style = current.ownerDocument.defaultView?.getComputedStyle(current);
      if (
        !style ||
        style.display === 'none' ||
        style.visibility === 'hidden' ||
        style.opacity === '0' ||
        current.matches('[hidden], [aria-hidden="true"], [inert]')
      )
        return false;
      const root = current.getRootNode() as Document | ShadowRoot;
      current =
        current.parentElement ??
        ('host' in root ? root.host : (current.ownerDocument.defaultView?.frameElement ?? null));
    }
    return true;
  }

  function autocompleteScopes(element: Element): Element[] {
    if (!isAutocomplete(element)) return [];
    const rule = ruleFor(element);
    if (rule) return element.closest('label') ? [element.closest('label')!] : [];
    const root = element.getRootNode() as Document | ShadowRoot;
    const references = `${element.getAttribute('aria-controls') ?? ''} ${element.getAttribute('aria-owns') ?? ''}`;
    const scopes: Element[] = [];
    const maxControlReferences = 16;
    let inspectedReferences = 0;
    for (const match of references.matchAll(/\S+/gu)) {
      if (inspectedReferences++ >= maxControlReferences) break;
      const scope = root.getElementById(match[0]);
      if (scope && !scopes.includes(scope)) scopes.push(scope);
    }
    return scopes;
  }

  function autocompleteOptions(
    element: Element,
    candidates: readonly Element[],
    limit: number,
  ): Element[] {
    const scopes = autocompleteScopes(element);
    const selector = ruleFor(element)?.optionSelector ?? '[role="option"]';
    const options: Element[] = [];
    if (limit <= 0 || !scopes.length) return options;
    for (const candidate of candidates) {
      if (
        scopes.some((scope) => scope.contains(candidate)) &&
        candidate.matches(selector) &&
        visible(candidate)
      ) {
        options.push(candidate);
        if (options.length >= limit) break;
      }
    }
    return options;
  }

  function isAutocompleteOption(element: Element): boolean {
    return rules.some(
      (rule) =>
        element.matches(rule.optionSelector) &&
        Boolean(element.closest('label')?.querySelector(rule.selector)) &&
        visible(element),
    );
  }

  function autocompleteEmpty(element: Element): boolean {
    const rule = ruleFor(element);
    const empty = rule?.emptySelector
      ? element.closest('label')?.querySelector(rule.emptySelector)
      : null;
    return Boolean(empty && visible(empty));
  }

  function selectionCommitted(element: Element): boolean | undefined {
    const rule = ruleFor(element);
    if (!isAutocomplete(element) || !rule?.selectionSelector || !rule.selectionLabelKey)
      return undefined;
    if (isSensitiveField(element)) return false;
    const matches = element.closest('label')?.querySelectorAll(rule.selectionSelector);
    const selected = matches?.length === 1 ? matches[0] : null;
    if (!selected || !isInput(selected) || selected.type !== 'hidden') return false;
    const view = element.ownerDocument.defaultView!;
    if (rule.popupSelector) {
      const popups = element.closest('label')?.querySelectorAll(rule.popupSelector);
      if (popups?.length !== 1 || view.getComputedStyle(popups[0]!).display !== 'none')
        return false;
    }
    const getter = Object.getOwnPropertyDescriptor(view.HTMLInputElement.prototype, 'value')?.get;
    if (!getter) return false;
    try {
      const data: unknown = JSON.parse(getter.call(selected));
      if (
        !data ||
        typeof data !== 'object' ||
        !Object.prototype.hasOwnProperty.call(data, rule.selectionLabelKey)
      )
        return false;
      const name = (data as Record<string, unknown>)[rule.selectionLabelKey];
      const value: unknown = getter.call(element);
      return (
        typeof name === 'string' &&
        typeof value === 'string' &&
        value.trim().length > 0 &&
        name.trim() === value.trim()
      );
    } catch {
      return false;
    }
  }

  function selectedLabel(element: Element, maxCharacters: number): string | undefined {
    if (maxCharacters < 1) return undefined;
    if (selectionCommitted(element) !== true) return undefined;
    const view = element.ownerDocument.defaultView!;
    const getter = Object.getOwnPropertyDescriptor(view.HTMLInputElement.prototype, 'value')?.get;
    const value: unknown = getter?.call(element);
    if (typeof value !== 'string') return undefined;
    return value.length > maxCharacters ? `${value.slice(0, maxCharacters - 1)}…` : value;
  }

  function labelFor(element: Element): string {
    const aria = element.getAttribute('aria-label');
    if (aria) return aria;
    const labelledBy = element.getAttribute('aria-labelledby');
    if (labelledBy) {
      const root = element.getRootNode() as Document | ShadowRoot;
      const text = labelledBy
        .split(/\s+/u)
        .map(
          (id) =>
            (typeof root.getElementById === 'function' ? root.getElementById(id) : null) ??
            element.ownerDocument.getElementById(id),
        )
        .filter((label) => label !== null && label !== element && !label.contains(element))
        .map((label) => label!.textContent ?? '')
        .join(' ');
      if (text.trim()) return text;
    }
    if (isInput(element) || isTextArea(element) || isSelect(element)) {
      const label = element.labels?.[0];
      if (label) {
        const questionSelector = ruleFor(element)?.questionSelector;
        const question = questionSelector ? label.querySelector(questionSelector) : null;
        if (question && !question.contains(element) && question.textContent?.trim())
          return question.textContent.trim();
        const clone = label.cloneNode(true) as HTMLElement;
        clone
          .querySelectorAll('input, textarea, select, [contenteditable]')
          .forEach((field) => field.remove());
        if (clone.textContent?.trim()) return clone.textContent;
      }
    }
    const title = element.getAttribute('title');
    if (title) return title;
    if (isTextEntry(element))
      return element.getAttribute('placeholder') ?? element.getAttribute('name') ?? '';
    if (isInput(element)) return element.value || element.getAttribute('alt') || '';
    return element.textContent ?? '';
  }

  function fieldValue(
    element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
  ): string | boolean {
    return isInput(element) && ['checkbox', 'radio'].includes(element.type)
      ? element.checked
      : element.value;
  }

  function controlState(element: Element) {
    const stateNames = [
      'checked',
      'selected',
      'expanded',
      'pressed',
      'disabled',
      'required',
      'readonly',
    ] as const;
    const state: Partial<Record<(typeof stateNames)[number], boolean | 'mixed'>> & {
      selectionCommitted?: boolean;
    } = {};
    if (isInput(element) && ['checkbox', 'radio'].includes(element.type)) {
      state.checked = element.indeterminate ? 'mixed' : element.checked;
    }
    if (element.matches(':disabled')) state.disabled = true;
    if (isInput(element) || isTextArea(element) || isSelect(element)) {
      if (element.required) state.required = true;
      if ('readOnly' in element && element.readOnly) state.readonly = true;
    }
    for (const name of stateNames) {
      const value = element.getAttribute(`aria-${name}`);
      if (
        state[name] === undefined &&
        (value === 'true' || value === 'false' || (name === 'checked' && value === 'mixed'))
      ) {
        state[name] = value === 'mixed' ? 'mixed' : value === 'true';
      }
    }
    const committed = selectionCommitted(element);
    if (committed !== undefined) state.selectionCommitted = committed;
    return state;
  }

  function signatureFor(element: Element, maxLabelCharacters: number): string {
    const originalLabel =
      element.getAttribute('aria-label') ||
      element.getAttribute('title') ||
      element.textContent ||
      (element.localName === 'input' &&
      /^(submit|button|image)$/i.test(element.getAttribute('type') || '')
        ? element.getAttribute('value') || element.getAttribute('alt') || ''
        : '');
    return [
      element.localName,
      element.getAttribute('role') || '',
      element.getAttribute('type') || '',
      element.getAttribute('name') || '',
      originalLabel.replace(/\s+/g, ' ').trim().slice(0, maxLabelCharacters),
      labelFor(element).replace(/\s+/g, ' ').trim().slice(0, maxLabelCharacters),
    ].join('|');
  }

  return {
    labelFor,
    isEditableText,
    fieldValue,
    controlState,
    signatureFor,
    isAutocomplete,
    autocompleteScopes,
    autocompleteOptions,
    isAutocompleteOption,
    autocompleteEmpty,
    selectionCommitted,
    selectedLabel,
    isSensitiveField,
  };
}
