import { sanitizePageText } from '../../background/policy';
import { MAX_PAGE_TEXT_CHARACTERS } from './in-page-panel/pageActions';
import {
  findPageElements,
  isSensitiveField,
  MAX_ELEMENT_NAME_CHARS,
  MAX_ELEMENT_OPTIONS,
  pageElementSignature,
  nativeFieldValue,
} from './pageElements';
import { parseFormFillPlan } from './formFillPlan';
import { fillNativeFormBatch } from './formBatch';

let latestFormSnapshot: {
  id: string;
  url: string;
  fields: Map<string, { element: Element; signature: string; value: string | boolean }>;
} | null = null;

export async function fillObservedForm(value: unknown, expectedUrl: string, snapshotId: string) {
  const plan = parseFormFillPlan(value);
  const snapshot = latestFormSnapshot;
  if (
    !plan ||
    !snapshot ||
    snapshot.id !== snapshotId ||
    snapshot.url !== expectedUrl ||
    location.href !== expectedUrl
  )
    throw new Error('Read the current page again before filling its form.');
  const fields = Object.entries(plan.fields).map(([selector, answer]) => ({
    key: selector,
    selector,
    value: answer,
    element: snapshot.fields.get(selector)?.element ?? null,
    signature: snapshot.fields.get(selector)?.signature ?? '',
    observedValue: snapshot.fields.get(selector)?.value,
  }));
  latestFormSnapshot = null;
  return fillNativeFormBatch(fields, expectedUrl, plan.replaceExisting);
}

export function capturePageObservation(expectedUrl: string): {
  success: boolean;
  text?: string;
  truncated?: boolean;
  error?: string;
  formSnapshotId?: string;
} {
  if (location.href !== expectedUrl)
    return { success: false, error: 'The page changed while it was being read.' };

  const controls: Array<Record<string, unknown>> = [];
  const snapshot = {
    id: crypto.randomUUID(),
    url: expectedUrl,
    fields: new Map<string, { element: Element; signature: string; value: string | boolean }>(),
  };
  let remaining = MAX_PAGE_TEXT_CHARACTERS;
  let omittedControls = false;
  for (const field of findPageElements(undefined, true)) {
    const element = document.querySelector(field.selector);
    if (
      !(
        element instanceof HTMLInputElement ||
        element instanceof HTMLTextAreaElement ||
        element instanceof HTMLSelectElement
      ) ||
      isSensitiveField(element) ||
      (element instanceof HTMLInputElement &&
        ['hidden', 'file', 'password', 'submit', 'reset', 'button', 'image'].includes(element.type))
    )
      continue;
    const control = {
      ...field,
      value: element.value.slice(0, MAX_PAGE_TEXT_CHARACTERS),
      ...(element instanceof HTMLInputElement && ['checkbox', 'radio'].includes(element.type)
        ? { checked: element.checked }
        : {}),
      ...(element instanceof HTMLSelectElement
        ? {
            selected: Array.from(element.selectedOptions)
              .slice(0, MAX_ELEMENT_OPTIONS)
              .map((option) => option.text.slice(0, MAX_ELEMENT_NAME_CHARS)),
          }
        : {}),
      disabled: element.disabled,
      ...('readOnly' in element ? { readOnly: element.readOnly } : {}),
    };
    const size = JSON.stringify(control).length;
    if (size > remaining) {
      omittedControls = true;
      break;
    }
    controls.push(control);
    snapshot.fields.set(field.selector, {
      element,
      signature: pageElementSignature(element),
      value: nativeFieldValue(element),
    });
    remaining -= size;
  }
  const main = document.querySelector('main, article, [role="main"]');
  const mainText = main instanceof HTMLElement ? main.innerText.trim() : '';
  let pageText = mainText.length >= 200 ? mainText : (document.body?.innerText ?? '');
  for (const element of document.querySelectorAll('input, textarea, select')) {
    if (!isSensitiveField(element)) continue;
    const value = (element as HTMLInputElement).value;
    if (value) pageText = pageText.split(value).join('[Protected field]');
    const text = element.textContent;
    if (text?.trim()) pageText = pageText.split(text).join('[Protected field]');
  }
  const raw = sanitizePageText(
    (controls.length ? `Current form state:\n${JSON.stringify(controls)}\n\nPage text:\n` : '') +
      pageText,
  );
  if (location.href !== expectedUrl)
    return { success: false, error: 'The page changed while it was being read.' };
  latestFormSnapshot = snapshot;
  return {
    success: true,
    text: raw.slice(0, MAX_PAGE_TEXT_CHARACTERS + 1),
    truncated: omittedControls || raw.length > MAX_PAGE_TEXT_CHARACTERS,
    formSnapshotId: snapshot.id,
  };
}
