import { createDomElementReader } from './elementReader';
import { PROTECTED_FIELD_REFUSAL } from '../computer-use/approvalPolicy';
import { LEVER_DOM_CONTROL_RULES } from './autofill/lever';

const {
  labelFor,
  isEditableText,
  fieldValue,
  isAutocomplete,
  selectionCommitted,
  isSensitiveField: isSensitiveNativeField,
} = createDomElementReader(LEVER_DOM_CONTROL_RULES);

export const isAutocompleteField = isAutocomplete;
export const autocompleteSelectionCommitted = selectionCommitted;

export const MAX_FOUND_ELEMENTS = 150;
export const MAX_FILL_FIELDS = 50;
export const MAX_ELEMENT_NAME_CHARS = 160;
export const MAX_ELEMENT_OPTIONS = 50;
const MAX_SELECTOR_DEPTH = 8;

const NATIVE_FORM_SELECTOR = 'input:not([type="hidden"]), select, textarea';
const INTERACTIVE_SELECTOR = [
  'a[href]',
  'button',
  NATIVE_FORM_SELECTOR,
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

export interface FoundPageElement {
  selector: string;
  role: string;
  name: string;
  type?: string;
  placeholder?: string;
  search?: true;
  required?: true;
  options?: string[];
  selectionRequired?: true;
  selectionCommitted?: boolean;
}

export interface FillFieldRequest {
  selector: string;
  value: string;
  expectedSignature?: string;
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

export function pageElementSignature(el: Element): string {
  const legend = el.closest('fieldset')?.querySelector(':scope > legend')?.textContent ?? '';
  return [
    el.localName,
    el.getAttribute('role') ?? '',
    el.getAttribute('type') ?? '',
    el.getAttribute('name') ?? el.id,
    `${labelFor(el)} ${legend}`.trim(),
  ].join('|');
}

export function pageElementLabel(el: Element): string {
  return clip(labelFor(el));
}

export function nativeFieldValue(
  element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
): string | boolean {
  return fieldValue(element);
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

export function isVisible(el: Element): boolean {
  if (!(el instanceof HTMLElement)) return true;
  if (el.closest('[hidden], [aria-hidden="true"], [inert]')) return false;
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return false;
  for (let current: Element | null = el; current; current = current.parentElement) {
    const style = window.getComputedStyle(current);
    if (style.visibility === 'hidden' || style.display === 'none' || style.opacity === '0')
      return false;
  }
  return true;
}

function looksLikeSearch(el: Element, name: string, placeholder: string | undefined): boolean {
  if (el.getAttribute('role') === 'searchbox') return true;
  if (el instanceof HTMLInputElement && el.type === 'search') return true;
  if (el.closest('[role="search"], form[role="search"]')) return true;
  const haystack = `${name} ${placeholder ?? ''} ${el.getAttribute('name') ?? ''}`.toLowerCase();
  return /\bsearch\b|\bfind\b|\bquery\b/u.test(haystack);
}

export function findPageElements(query?: string, fieldsOnly = false): FoundPageElement[] {
  rememberPasswordFields();
  const needle = query?.trim().toLowerCase() ?? '';
  const found: FoundPageElement[] = [];
  for (const el of Array.from(
    document.querySelectorAll(fieldsOnly ? NATIVE_FORM_SELECTOR : INTERACTIVE_SELECTOR),
  )) {
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
    if (isAutocomplete(el)) entry.selectionRequired = true;
    const committed = selectionCommitted(el);
    if (committed !== undefined) entry.selectionCommitted = committed;
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
        .slice(0, MAX_ELEMENT_OPTIONS)
        .map((option) => clip(option.textContent ?? option.value));
    }
    found.push(entry);
  }
  return found;
}

const passwordFields = new WeakSet<Element>();

export function rememberPasswordFields(): void {
  document.querySelectorAll('input[type="password"]').forEach((field) => passwordFields.add(field));
}

export function watchPasswordFields(): void {
  rememberPasswordFields();
  new MutationObserver((records) => {
    for (const record of records) {
      if (record.oldValue?.toLowerCase() === 'password')
        passwordFields.add(record.target as Element);
    }
  }).observe(document.documentElement, {
    subtree: true,
    attributes: true,
    attributeFilter: ['type'],
    attributeOldValue: true,
  });
}

export function isSensitiveField(el: Element): boolean {
  return passwordFields.has(el) || isSensitiveNativeField(el);
}

function dispatchValueEvents(el: Element): void {
  el.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
  el.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
}

function fillOne(el: Element, value: string, expectedSignature?: string): string | null {
  if (expectedSignature !== undefined && pageElementSignature(el) !== expectedSignature)
    return 'The field changed before it could be filled.';
  if (isSensitiveField(el)) return PROTECTED_FIELD_REFUSAL;
  if (!isVisible(el)) return 'This field is hidden, so it is not filled.';
  if (
    (el instanceof HTMLInputElement ||
      el instanceof HTMLTextAreaElement ||
      el instanceof HTMLSelectElement) &&
    el.disabled
  ) {
    return 'This field cannot be edited.';
  }
  if ((el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) && el.readOnly) {
    return 'This field cannot be edited.';
  }
  if (el.getAttribute('aria-disabled') === 'true' || el.getAttribute('aria-readonly') === 'true') {
    return 'This field cannot be edited.';
  }
  if (el instanceof HTMLSelectElement) {
    const wanted = value.trim().toLowerCase();
    const option = Array.from(el.options).find(
      (candidate) =>
        candidate.value.toLowerCase() === wanted ||
        (candidate.textContent ?? '').trim().toLowerCase() === wanted,
    );
    if (!option) return 'No option in this list matches that value.';
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
    if (setter) setter.call(el, option.value);
    else el.value = option.value;
    dispatchValueEvents(el);
    return null;
  }
  if (el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')) {
    const checked = /^(true|yes|on|1|checked)$/iu.test(value.trim());
    if (el.type === 'radio' && !checked)
      return 'Select another radio option instead of clearing this one.';
    if (el.checked !== checked) HTMLInputElement.prototype.click.call(el);
    return null;
  }
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    el.focus();
    if (
      !el.isConnected ||
      isSensitiveField(el) ||
      !isVisible(el) ||
      el.disabled ||
      el.readOnly ||
      (expectedSignature !== undefined && pageElementSignature(el) !== expectedSignature)
    )
      return 'The field changed before it could be filled.';
    const prototype =
      el instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
    if (setter) setter.call(el, value);
    else el.value = value;
    dispatchValueEvents(el);
    return null;
  }
  if (el instanceof HTMLElement && isEditableText(el)) {
    el.focus();
    el.textContent = value;
    dispatchValueEvents(el);
    return null;
  }
  return 'This element does not take text.';
}

export function fillPageFields(fields: readonly FillFieldRequest[]): FillFieldsOutcome {
  rememberPasswordFields();
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
    const reason = fillOne(el, field.value, field.expectedSignature);
    if (reason === null) outcome.filled.push(field.selector);
    else outcome.failed.push({ selector: field.selector, reason });
  }
  return outcome;
}
