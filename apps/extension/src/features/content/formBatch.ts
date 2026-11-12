import { approvalRequirement } from '../computer-use/approvalPolicy';
import { asksInAutoMode } from '../computer-use/crucialActions';
import { sanitizePageText } from '../../background/policy';
import {
  fillPageFields,
  findPageElements,
  isSensitiveField,
  pageElementSignature,
  MAX_FILL_FIELDS,
  MAX_ELEMENT_NAME_CHARS,
  nativeFieldValue,
  isAutocompleteField,
} from './pageElements';

export interface BoundFormField {
  key: string;
  selector: string;
  value: string | boolean;
  element: Element | null;
  signature: string;
  observedValue?: string | boolean;
  selectionRequired?: boolean;
}

function retained(
  element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
  value: string | boolean,
): boolean {
  if (typeof value === 'boolean')
    return element instanceof HTMLInputElement && element.checked === value;
  if (element instanceof HTMLSelectElement)
    return (
      element.value.toLowerCase() === value.trim().toLowerCase() ||
      element.selectedOptions[0]?.textContent?.trim().toLowerCase() === value.trim().toLowerCase()
    );
  return element.value === value;
}

function refusal(
  field: BoundFormField,
  expectedUrl: string,
  replaceExisting: boolean,
): string | null {
  const element = field.element;
  if (!(
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement
  ))
    return 'No ordinary form field matched.';
  const matches = document.querySelectorAll(field.selector);
  if (
    matches.length !== 1 ||
    matches[0] !== element ||
    !element.isConnected ||
    pageElementSignature(element) !== field.signature
  )
    return 'The field changed since it was read. Read the page again.';
  if (isSensitiveField(element)) return 'This is a protected field; separate approval is required.';
  if (typeof field.value === 'string' && sanitizePageText(field.value) !== field.value)
    return 'This answer contains protected data; separate approval is required.';
  if (
    field.observedValue !== undefined &&
    nativeFieldValue(element) !== field.observedValue &&
    !retained(element, field.value)
  )
    return 'The answer changed since the page was read. Read it again.';
  if (
    element instanceof HTMLInputElement &&
    ['hidden', 'file', 'password', 'submit', 'reset', 'button', 'image'].includes(element.type)
  )
    return 'This control is not filled by a form batch.';
  const toggle =
    element instanceof HTMLInputElement && ['checkbox', 'radio'].includes(element.type);
  if (
    toggle !== (typeof field.value === 'boolean') ||
    (element instanceof HTMLSelectElement && element.multiple)
  )
    return 'Use a boolean for a checkbox or radio, and text for ordinary fields.';
  const requirement = approvalRequirement({
    toolName: toggle ? 'click' : 'type',
    args: { text: String(field.value) },
    pageUrl: expectedUrl,
    targetSignature: field.signature,
  });
  if (asksInAutoMode(requirement)) return 'This field requires separate approval.';
  if (!replaceExisting && !retained(element, field.value)) {
    const answered = toggle
      ? element.checked ||
        (element.type === 'radio' &&
          !!element.name &&
          Array.from(document.querySelectorAll('input[type="radio"]')).some(
            (other) =>
              other instanceof HTMLInputElement &&
              other.name === element.name &&
              other.form === element.form &&
              other.checked,
          ))
      : element.value.trim() !== '';
    if (answered) return 'The field already contains a different answer.';
  }
  if (field.selectionRequired || isAutocompleteField(element))
    return 'This autocomplete needs a browser search and an option selection; pasted text alone is not a verified selection.';
  return null;
}

export async function fillNativeFormBatch(
  fields: readonly BoundFormField[],
  expectedUrl: string,
  replaceExisting = false,
) {
  if (fields.length > MAX_FILL_FIELDS) throw new Error('The form plan exceeds the batch limit.');
  if (location.href !== expectedUrl) throw new Error('The form page changed before filling.');
  const startedAt = performance.now();
  const results: Array<{
    key: string;
    selector: string;
    status: string;
    reason?: string;
    verifiedValue?: string | boolean;
  }> = [];
  for (const field of fields) {
    if (location.href !== expectedUrl) throw new Error('The form page changed during filling.');
    let reason: string | null;
    try {
      reason = refusal(field, expectedUrl, replaceExisting);
    } catch {
      reason = 'The field selector is invalid.';
    }
    if (reason) {
      results.push({ key: field.key, selector: field.selector, status: 'skipped', reason });
      continue;
    }
    const outcome = fillPageFields([
      { selector: field.selector, value: String(field.value), expectedSignature: field.signature },
    ]);
    results.push({
      key: field.key,
      selector: field.selector,
      status: outcome.filled.length ? 'filled' : 'failed',
      ...(outcome.failed[0] ? { reason: outcome.failed[0].reason } : {}),
    });
  }
  const focused = document.activeElement;
  if (
    focused instanceof HTMLElement &&
    fields.some((field, index) => field.element === focused && results[index]?.status === 'filled')
  )
    HTMLElement.prototype.blur.call(focused);
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  if (location.href !== expectedUrl) throw new Error('The form page changed during verification.');
  for (let index = 0; index < results.length; index += 1) {
    const result = results[index]!;
    if (result.status !== 'filled') continue;
    const field = fields[index]!;
    const element = field.element as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
    if (
      !element.isConnected ||
      document.querySelector(field.selector) !== element ||
      pageElementSignature(element) !== field.signature ||
      !retained(element, field.value) ||
      !element.validity.valid
    ) {
      result.status = 'failed';
      result.reason = 'The field did not retain the requested answer.';
    } else {
      const value =
        element instanceof HTMLSelectElement
          ? (element.selectedOptions[0]?.textContent ?? '').trim().slice(0, MAX_ELEMENT_NAME_CHARS)
          : nativeFieldValue(element);
      result.verifiedValue = typeof value === 'string' ? sanitizePageText(value) : value;
    }
  }
  return {
    success: true,
    verified: results.length > 0 && results.every((field) => field.status === 'filled'),
    filledCount: results.filter((field) => field.status === 'filled').length,
    fields: results,
    fieldContext: findPageElements(),
    submitted: false,
    elapsedMs: Math.round(performance.now() - startedAt),
  };
}
