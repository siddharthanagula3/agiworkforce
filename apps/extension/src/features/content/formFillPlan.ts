import {
  MAX_CONTEXT_HTML_CHARS,
  MAX_SELECTOR_LENGTH,
  MAX_VALUE_LENGTH,
} from '../../background/policy';
import { MAX_FILL_FIELDS } from './pageElements';

export interface FormFillPlan {
  fields: Record<string, string | boolean>;
  replaceExisting?: boolean;
}

export const FORM_FIELDS_PARAMETERS = {
  type: 'object',
  description: 'CSS selectors to text or checked boolean.',
  additionalProperties: { type: ['string', 'boolean'] },
  minProperties: 1,
  maxProperties: MAX_FILL_FIELDS,
};

export function hasDisallowedControls(text: string, multiline = false): boolean {
  return Array.from(text).some((character) => {
    const code = character.charCodeAt(0);
    return code === 127 || (code < 32 && !(multiline && ['\n', '\r', '\t'].includes(character)));
  });
}

export function parseFormFillPlan(value: unknown): FormFillPlan | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (
    Object.keys(record).some((key) => key !== 'fields' && key !== 'replaceExisting') ||
    (record['replaceExisting'] !== undefined && typeof record['replaceExisting'] !== 'boolean')
  )
    return null;
  const fields = record['fields'];
  if (!fields || typeof fields !== 'object' || Array.isArray(fields)) return null;
  const entries = Object.entries(fields);
  if (!entries.length || entries.length > MAX_FILL_FIELDS) return null;
  let size = 0;
  for (const [selector, answer] of entries) {
    if (
      !selector.trim() ||
      selector.length > MAX_SELECTOR_LENGTH ||
      hasDisallowedControls(selector)
    )
      return null;
    if (
      typeof answer !== 'boolean' &&
      (typeof answer !== 'string' ||
        answer.length > MAX_VALUE_LENGTH ||
        hasDisallowedControls(answer, true))
    )
      return null;
    size += selector.length + String(answer).length;
    if (size > MAX_CONTEXT_HTML_CHARS) return null;
  }
  return {
    fields: Object.fromEntries(entries),
    ...(record['replaceExisting'] === true ? { replaceExisting: true } : {}),
  };
}
