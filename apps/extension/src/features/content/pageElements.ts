export const MAX_FOUND_ELEMENTS = 150;
export const MAX_FILL_FIELDS = 50;
const MAX_ELEMENT_NAME_CHARS = 160;
const MAX_SELECTOR_DEPTH = 8;

const INTERACTIVE_SELECTOR = [
  'a[href]',
  'button',
  'input:not([type="hidden"])',
  'select',
  'textarea',
  '[role="button"]',
  '[role="link"]',
  '[role="searchbox"]',
  '[role="textbox"]',
  '[role="combobox"]',
  '[role="checkbox"]',
  '[role="tab"]',
  '[role="menuitem"]',
  '[contenteditable="true"]',
].join(',');

const SENSITIVE_AUTOCOMPLETE = /^(cc-|current-password$|new-password$|one-time-code$)/u;

export interface FoundPageElement {
  selector: string;
  role: string;
  name: string;
  type?: string;
  placeholder?: string;
  search?: true;
  required?: true;
  options?: string[];
}

export interface FillFieldRequest {
  selector: string;
  value: string;
}

export interface FillFieldsOutcome {
  filled: string[];
  failed: Array<{ selector: string; reason: string }>;
}

function clip(text: string): string {
  const collapsed = text.replace(/\s+/gu, ' ').trim();
  return collapsed.length > MAX_ELEMENT_NAME_CHARS
    ? `${collapsed.slice(0, MAX_ELEMENT_NAME_CHARS - 1)}…`
    : collapsed;
}

function isUnique(selector: string): boolean {
  try {
    return document.querySelectorAll(selector).length === 1;
  } catch {
    return false;
  }
}

function attributeSelector(el: Element, attribute: string): string | null {
  const value = el.getAttribute(attribute);
  if (!value) return null;
  const selector = `${el.tagName.toLowerCase()}[${attribute}="${CSS.escape(value)}"]`;
  return isUnique(selector) ? selector : null;
}

export function uniqueSelector(el: Element): string {
  if (el.id) {
    const byId = `#${CSS.escape(el.id)}`;
    if (isUnique(byId)) return byId;
  }
  for (const attribute of ['data-testid', 'name', 'aria-label', 'placeholder']) {
    const selector = attributeSelector(el, attribute);
    if (selector !== null) return selector;
  }
  const path: string[] = [];
  let current: Element | null = el;
  while (current && current !== document.documentElement && path.length < MAX_SELECTOR_DEPTH) {
    if (current.id && isUnique(`#${CSS.escape(current.id)}`)) {
      path.unshift(`#${CSS.escape(current.id)}`);
      break;
    }
    const tag = current.tagName.toLowerCase();
    const parent: Element | null = current.parentElement;
    const siblings = parent
      ? Array.from(parent.children).filter((child) => child.tagName === current?.tagName)
      : [];
    path.unshift(
      siblings.length > 1 ? `${tag}:nth-of-type(${siblings.indexOf(current) + 1})` : tag,
    );
    const candidate = path.join(' > ');
    if (isUnique(candidate)) return candidate;
    current = parent;
  }
  return path.join(' > ');
}

function labelFor(el: Element): string {
  const aria = el.getAttribute('aria-label');
  if (aria) return aria;
  const labelledBy = el.getAttribute('aria-labelledby');
  if (labelledBy) {
    const text = labelledBy
      .split(/\s+/u)
      .map((id) => document.getElementById(id)?.textContent ?? '')
      .join(' ');
    if (text.trim()) return text;
  }
  if (
    el instanceof HTMLInputElement ||
    el instanceof HTMLTextAreaElement ||
    el instanceof HTMLSelectElement
  ) {
    const label = el.labels?.[0]?.textContent;
    if (label && label.trim()) return label;
  }
  const title = el.getAttribute('title');
  if (title) return title;
  if (el instanceof HTMLInputElement && (el.type === 'submit' || el.type === 'button')) {
    return el.value;
  }
  return el.textContent ?? '';
}

function roleOf(el: Element): string {
  const explicit = el.getAttribute('role');
  if (explicit) return explicit;
  const tag = el.tagName.toLowerCase();
  if (tag === 'a') return 'link';
  if (tag === 'button') return 'button';
  if (tag === 'select') return 'combobox';
  if (tag === 'textarea') return 'textbox';
  if (el instanceof HTMLInputElement) {
    if (el.type === 'search') return 'searchbox';
    if (el.type === 'checkbox' || el.type === 'radio') return el.type;
    if (el.type === 'submit' || el.type === 'button' || el.type === 'reset') return 'button';
    return 'textbox';
  }
  if (el.getAttribute('contenteditable') === 'true') return 'textbox';
  return tag;
}

function isVisible(el: Element): boolean {
  if (!(el instanceof HTMLElement)) return true;
  if (el.hidden || el.getAttribute('aria-hidden') === 'true') return false;
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return false;
  const style = window.getComputedStyle(el);
  return style.visibility !== 'hidden' && style.display !== 'none';
}

function looksLikeSearch(el: Element, name: string, placeholder: string | undefined): boolean {
  if (el.getAttribute('role') === 'searchbox') return true;
  if (el instanceof HTMLInputElement && el.type === 'search') return true;
  if (el.closest('[role="search"], form[role="search"]')) return true;
  const haystack = `${name} ${placeholder ?? ''} ${el.getAttribute('name') ?? ''}`.toLowerCase();
  return /\bsearch\b|\bfind\b|\bquery\b/u.test(haystack);
}

export function findPageElements(query?: string): FoundPageElement[] {
  const needle = query?.trim().toLowerCase() ?? '';
  const found: FoundPageElement[] = [];
  for (const el of Array.from(document.querySelectorAll(INTERACTIVE_SELECTOR))) {
    if (found.length >= MAX_FOUND_ELEMENTS) break;
    if (!isVisible(el)) continue;
    const name = clip(labelFor(el));
    const placeholder = el.getAttribute('placeholder') ?? undefined;
    const role = roleOf(el);
    if (
      needle &&
      !`${name} ${placeholder ?? ''} ${role} ${el.getAttribute('name') ?? ''}`
        .toLowerCase()
        .includes(needle)
    ) {
      continue;
    }
    const entry: FoundPageElement = { selector: uniqueSelector(el), role, name };
    if (el instanceof HTMLInputElement) entry.type = el.type;
    if (placeholder) entry.placeholder = clip(placeholder);
    if (role === 'textbox' || role === 'searchbox' || role === 'combobox') {
      if (looksLikeSearch(el, name, placeholder)) entry.search = true;
    }
    if (
      (el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        el instanceof HTMLSelectElement) &&
      el.required
    ) {
      entry.required = true;
    }
    if (el instanceof HTMLSelectElement) {
      entry.options = Array.from(el.options)
        .slice(0, 50)
        .map((option) => clip(option.textContent ?? option.value));
    }
    found.push(entry);
  }
  return found;
}

function isSensitiveField(el: Element): boolean {
  if (el instanceof HTMLInputElement && el.type === 'password') return true;
  const autocomplete = (el.getAttribute('autocomplete') ?? '').toLowerCase();
  return SENSITIVE_AUTOCOMPLETE.test(autocomplete);
}

function dispatchValueEvents(el: Element): void {
  el.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
  el.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
}

function fillOne(el: Element, value: string): string | null {
  if (isSensitiveField(el)) {
    return 'This is a password or payment field; the user has to fill it in themselves.';
  }
  if (el instanceof HTMLSelectElement) {
    const wanted = value.trim().toLowerCase();
    const option = Array.from(el.options).find(
      (candidate) =>
        candidate.value.toLowerCase() === wanted ||
        (candidate.textContent ?? '').trim().toLowerCase() === wanted,
    );
    if (!option) return 'No option in this list matches that value.';
    el.value = option.value;
    dispatchValueEvents(el);
    return null;
  }
  if (el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')) {
    el.checked = /^(true|yes|on|1|checked)$/iu.test(value.trim());
    dispatchValueEvents(el);
    return null;
  }
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    if (el.disabled || el.readOnly) return 'This field cannot be edited.';
    el.focus();
    el.value = value;
    dispatchValueEvents(el);
    return null;
  }
  if (el instanceof HTMLElement && el.isContentEditable) {
    el.focus();
    el.textContent = value;
    dispatchValueEvents(el);
    return null;
  }
  return 'This element does not take text.';
}

export function fillPageFields(fields: readonly FillFieldRequest[]): FillFieldsOutcome {
  const outcome: FillFieldsOutcome = { filled: [], failed: [] };
  for (const field of fields.slice(MAX_FILL_FIELDS)) {
    outcome.failed.push({
      selector: field.selector,
      reason: `Only ${MAX_FILL_FIELDS} fields are filled in one call.`,
    });
  }
  for (const field of fields.slice(0, MAX_FILL_FIELDS)) {
    let el: Element | null = null;
    try {
      el = document.querySelector(field.selector);
    } catch {
      outcome.failed.push({
        selector: field.selector,
        reason: 'That is not a valid CSS selector.',
      });
      continue;
    }
    if (!el) {
      outcome.failed.push({ selector: field.selector, reason: 'No element on the page matches.' });
      continue;
    }
    const reason = fillOne(el, field.value);
    if (reason === null) outcome.filled.push(field.selector);
    else outcome.failed.push({ selector: field.selector, reason });
  }
  return outcome;
}
