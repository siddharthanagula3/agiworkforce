import {
  MAX_CONTEXT_HTML_CHARS,
  MAX_VALUE_LENGTH,
  sanitizePageText,
} from '../../background/policy';
import { approvalRequirement } from '../computer-use/approvalPolicy';
import { isCrucialAction } from '../computer-use/crucialActions';
import { hasDisallowedControls } from './formFillPlan';
import {
  normalizeManagedCloudOwner,
  sameManagedCloudOwner,
  type ManagedCloudOwner,
} from '../cloud-bridge/managedCloudAuthority';
import {
  fillPageFields,
  isSensitiveField,
  isVisible,
  pageElementSignature,
  pageElementLabel,
  uniqueSelector,
  MAX_ELEMENT_NAME_CHARS,
} from './pageElements';

interface EditableSnapshot {
  id: string;
  owner: ManagedCloudOwner;
  url: string;
  element: HTMLElement;
  signature: string;
  original: string;
  originalHtml?: string;
  start: number;
  end: number;
  range?: Range;
  selectedText: string;
  phase: 'selected' | 'used' | 'inserted' | 'restored';
  after?: string;
  afterHtml?: string;
  undoRevision?: number;
  usedNativeCommand?: boolean;
}

let latest: EditableSnapshot | null = null;
let revision = 0;
let initialized = false;

export function initializeEditableSelection(): void {
  if (initialized) return;
  initialized = true;
  document.addEventListener(
    'input',
    () => {
      revision += 1;
    },
    true,
  );
}

function native(element: Element): element is HTMLInputElement | HTMLTextAreaElement {
  return element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement;
}

function textOf(element: HTMLElement): string {
  return native(element) ? element.value : (element.innerText ?? element.textContent ?? '');
}

function assertOrdinaryEditor(element: HTMLElement): void {
  if (
    !element.isConnected ||
    !isVisible(element) ||
    isSensitiveField(element) ||
    element.closest(
      '[aria-disabled="true"], [aria-readonly="true"], button, a[href], [role="button"]',
    )
  )
    throw new Error(
      'This field cannot be rewritten automatically. Copy the draft and edit it yourself.',
    );
  if (
    native(element) &&
    (element.disabled ||
      element.readOnly ||
      (element instanceof HTMLInputElement && !['text', 'search'].includes(element.type)))
  )
    throw new Error('Select text in an editable text field or editor.');
  if (
    !native(element) &&
    !['true', 'plaintext-only'].includes(element.getAttribute('contenteditable') ?? '')
  )
    throw new Error('The editor is no longer editable. Select the text again.');
  const requirement = approvalRequirement({
    toolName: 'type',
    args: {},
    pageUrl: location.href,
    targetSignature: pageElementSignature(element),
  });
  if (isCrucialAction(requirement)) throw new Error('This is a protected field. Edit it yourself.');
}

function selectionElement(): { element: HTMLElement; range?: Range } {
  const focused = document.activeElement;
  if (focused instanceof HTMLInputElement || focused instanceof HTMLTextAreaElement)
    return { element: focused };
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount !== 1)
    throw new Error('Select the text you want to rewrite, then try again.');
  const range = selection.getRangeAt(0);
  const anchor =
    range.startContainer instanceof Element
      ? range.startContainer
      : range.startContainer.parentElement;
  const element = anchor?.closest('[contenteditable="true"], [contenteditable="plaintext-only"]');
  const end =
    range.endContainer instanceof Element ? range.endContainer : range.endContainer.parentElement;
  if (
    !(element instanceof HTMLElement) ||
    !end ||
    !element.contains(end) ||
    anchor?.closest('[contenteditable="false"]') ||
    end.closest('[contenteditable="false"]')
  )
    throw new Error(
      'This editor does not expose a supported text selection. You can copy the draft instead.',
    );
  return { element, range: range.cloneRange() };
}

export function captureEditableSelection(
  expectedUrl: string,
  selectedText: string,
  owner: ManagedCloudOwner,
) {
  latest = null;
  const capturedOwner = normalizeManagedCloudOwner(owner);
  if (!capturedOwner) throw new Error('Sign in before rewriting selected text.');
  if (
    location.href !== expectedUrl ||
    typeof selectedText !== 'string' ||
    !selectedText ||
    selectedText.length > MAX_VALUE_LENGTH ||
    sanitizePageText(selectedText) !== selectedText ||
    hasDisallowedControls(selectedText, true)
  )
    throw new Error(
      'This selection cannot be shared for rewriting. Select ordinary text and try again.',
    );
  const { element, range } = selectionElement();
  assertOrdinaryEditor(element);
  const original = textOf(element);
  if (
    original.length > MAX_CONTEXT_HTML_CHARS ||
    (!native(element) && element.innerHTML.length > MAX_CONTEXT_HTML_CHARS)
  )
    throw new Error('This editor is too large for a bound insertion. Copy the draft instead.');
  let start: number;
  let end: number;
  if (native(element)) {
    if (element.selectionStart === null || element.selectionEnd === null)
      throw new Error('This field does not expose its selection. Copy the draft instead.');
    start = element.selectionStart;
    end = element.selectionEnd;
  } else {
    const selection = window.getSelection();
    if (!range || selection?.toString() !== selectedText)
      throw new Error('The selection changed. Select it again.');
    if (
      range
        .cloneContents()
        .querySelector(
          'input, textarea, select, button, img, video, audio, iframe, svg, script, style, [hidden], [aria-hidden="true"], [contenteditable="false"]',
        )
    )
      throw new Error(
        'This selection contains editor controls or non-text content. Copy the draft instead.',
      );
    start = original.indexOf(selectedText);
    if (start !== original.lastIndexOf(selectedText)) {
      if (original !== element.textContent)
        throw new Error('This editor has an ambiguous selection. Copy the draft instead.');
      const before = document.createRange();
      before.selectNodeContents(element);
      before.setEnd(range.startContainer, range.startOffset);
      start = before.toString().length;
    }
    end = start + selectedText.length;
  }
  if (start < 0 || end <= start || original.slice(start, end) !== selectedText)
    throw new Error('The selection changed. Select it again.');
  const id = crypto.randomUUID();
  latest = {
    id,
    owner: capturedOwner,
    url: expectedUrl,
    element,
    signature: pageElementSignature(element),
    original,
    ...(range ? { range, originalHtml: element.innerHTML } : {}),
    start,
    end,
    selectedText,
    phase: 'selected',
  };
  const label = pageElementLabel(element) || 'Selected text field';
  return {
    success: true,
    selection: {
      id,
      label: sanitizePageText(label).slice(0, MAX_ELEMENT_NAME_CHARS),
      selectedText,
    },
  };
}

function requireSnapshot(
  id: string,
  expectedUrl: string,
  owner: ManagedCloudOwner,
): EditableSnapshot {
  const snapshot = latest;
  if (
    !snapshot ||
    snapshot.id !== id ||
    snapshot.url !== expectedUrl ||
    location.href !== expectedUrl ||
    !sameManagedCloudOwner(snapshot.owner, owner)
  )
    throw new Error('The editable selection expired. Select the text again.');
  assertOrdinaryEditor(snapshot.element);
  if (pageElementSignature(snapshot.element) !== snapshot.signature)
    throw new Error('The field changed. Select its text again.');
  return snapshot;
}

function unchanged(snapshot: EditableSnapshot): boolean {
  return (
    textOf(snapshot.element) === snapshot.original &&
    (snapshot.originalHtml === undefined || snapshot.element.innerHTML === snapshot.originalHtml) &&
    (!snapshot.range ||
      (snapshot.range.startContainer.isConnected &&
        snapshot.range.endContainer.isConnected &&
        snapshot.element.contains(snapshot.range.startContainer) &&
        snapshot.element.contains(snapshot.range.endContainer)))
  );
}

export async function applyEditableSelection(
  id: string,
  expectedUrl: string,
  value: string,
  owner: ManagedCloudOwner,
) {
  const snapshot = requireSnapshot(id, expectedUrl, owner);
  if (snapshot.phase !== 'selected' || !unchanged(snapshot))
    throw new Error('The field changed while the draft was being prepared. Select its text again.');
  if (
    typeof value !== 'string' ||
    value.length > MAX_VALUE_LENGTH ||
    sanitizePageText(value) !== value ||
    hasDisallowedControls(value, true)
  )
    throw new Error(
      'This draft cannot be inserted automatically. Copy it and edit the field yourself.',
    );
  const element = snapshot.element;
  const expected =
    snapshot.original.slice(0, snapshot.start) + value + snapshot.original.slice(snapshot.end);
  if (native(element)) {
    const clone = element.cloneNode(false) as HTMLInputElement | HTMLTextAreaElement;
    clone.value = expected;
    if (!clone.validity.valid || (element.maxLength >= 0 && expected.length > element.maxLength))
      throw new Error(
        'The draft does not meet this field’s limits. Edit the preview before inserting.',
      );
  }
  element.focus();
  assertOrdinaryEditor(element);
  if (
    document.activeElement !== element ||
    !unchanged(snapshot) ||
    pageElementSignature(element) !== snapshot.signature
  )
    throw new Error('The field changed when it was focused. Select its text again.');
  snapshot.phase = 'used';
  if (native(element)) element.setSelectionRange(snapshot.start, snapshot.end);
  else {
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(snapshot.range!);
  }
  const beforeRevision = revision;
  let inserted = false;
  try {
    inserted = document.execCommand(value ? 'insertText' : 'delete', false, value);
  } catch {
    inserted = false;
  }
  if (!inserted && native(element) && textOf(element) === snapshot.original) {
    fillPageFields([
      { selector: uniqueSelector(element), value: expected, expectedSignature: snapshot.signature },
    ]);
  }
  await Promise.resolve();
  if (latest !== snapshot || location.href !== expectedUrl || !element.isConnected)
    throw new Error('The editor changed during insertion. Check the page before continuing.');
  const after = textOf(element);
  const verified =
    pageElementSignature(element) === snapshot.signature &&
    (after === expected ||
      (expected === '' && after.trim() === '' && !element.textContent?.trim()));
  const applied =
    after !== snapshot.original ||
    (!native(element) && element.innerHTML !== snapshot.originalHtml);
  if (!verified && !applied)
    throw new Error('This editor did not accept the draft. Copy it and insert it yourself.');
  snapshot.phase = 'inserted';
  snapshot.usedNativeCommand = inserted;
  snapshot.after = after;
  if (!native(element)) snapshot.afterHtml = element.innerHTML;
  const undoAvailable =
    native(element) ||
    (inserted &&
      revision === beforeRevision + 1 &&
      typeof document.queryCommandEnabled === 'function' &&
      document.queryCommandEnabled('undo'));
  if (undoAvailable) snapshot.undoRevision = revision;
  return {
    success: verified,
    applied,
    verified,
    undoAvailable,
    ...(!verified
      ? { error: 'The editor changed the inserted draft. Check the field before continuing.' }
      : {}),
  };
}

export async function undoEditableSelection(
  id: string,
  expectedUrl: string,
  owner: ManagedCloudOwner,
) {
  const snapshot = requireSnapshot(id, expectedUrl, owner);
  const element = snapshot.element;
  if (
    snapshot.phase !== 'inserted' ||
    snapshot.undoRevision === undefined ||
    textOf(element) !== snapshot.after ||
    (snapshot.afterHtml !== undefined && snapshot.afterHtml !== element.innerHTML)
  )
    throw new Error(
      'The field changed after insertion. Use the editor’s Undo or select the text again.',
    );
  element.focus();
  requireSnapshot(id, expectedUrl, owner);
  if (
    document.activeElement !== element ||
    textOf(element) !== snapshot.after ||
    (snapshot.afterHtml !== undefined && snapshot.afterHtml !== element.innerHTML)
  )
    throw new Error('The editor changed when it was focused. Use its Undo control.');
  if (native(element)) {
    if (snapshot.usedNativeCommand) {
      element.setSelectionRange(0, element.value.length);
      if (!document.execCommand('insertText', false, snapshot.original))
        throw new Error('The editor did not accept the restore. Use its Undo control.');
    } else {
      const result = fillPageFields([
        {
          selector: uniqueSelector(element),
          value: snapshot.original,
          expectedSignature: snapshot.signature,
        },
      ]);
      if (!result.filled.length)
        throw new Error(result.failed[0]?.reason ?? 'Unable to restore this field.');
    }
    element.setSelectionRange(snapshot.start, snapshot.end);
  } else {
    if (revision !== snapshot.undoRevision || !document.execCommand('undo'))
      throw new Error('The editor’s undo history changed. Use its Undo control.');
  }
  await Promise.resolve();
  if (
    textOf(element) !== snapshot.original ||
    (snapshot.originalHtml !== undefined && element.innerHTML !== snapshot.originalHtml)
  )
    throw new Error('The editor could not restore the exact original. Check the field.');
  snapshot.phase = 'restored';
  return { success: true, verified: true };
}
