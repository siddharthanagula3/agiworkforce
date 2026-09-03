import type { FillResult } from '../content/autofill/filler';
import type { DetectedField } from '../content/autofill/detector';

export type EscalationReason =
  | 'readback_mismatch'
  | 'required_field_empty'
  | 'file_upload'
  | 'login_wall'
  | 'typeahead_dropdown'
  | 'captcha'
  | 'multi_page_flow'
  | 'platform_always_escalate'
  | 'low_confidence_label'
  | 'unknown_platform';

export interface EscalationTrigger {
  reason: EscalationReason;
  fieldKey?: string;
  description: string;
}

export interface EscalationDecision {
  shouldEscalate: boolean;
  triggers: EscalationTrigger[];
  agentGoal: string;
}

export function verifyReadback(selector: string, intendedValue: string): boolean {
  try {
    const el = document.querySelector(selector);
    if (!el) return false;

    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      const committed = el.value ?? '';
      return committed.trim() === intendedValue.trim();
    }
    if (el instanceof HTMLSelectElement) {
      const selectedText = el.options[el.selectedIndex]?.text ?? '';
      const selectedVal = el.value ?? '';
      return (
        selectedVal.toLowerCase() === intendedValue.toLowerCase() ||
        selectedText.toLowerCase().includes(intendedValue.toLowerCase())
      );
    }
    return false;
  } catch {
    return false;
  }
}

const LOGIN_WALL_SELECTORS = [
  '[data-testid="sign-in-button"]',
  'button[aria-label*="Sign in" i]',
  'a[href*="/login"]',
  'a[href*="/signin"]',
  '.login-form',
  '#login-form',
  'form[action*="login"]',
  'form[action*="signin"]',
];

const CAPTCHA_SELECTORS = [
  '.g-recaptcha',
  'iframe[src*="recaptcha"]',
  'iframe[src*="hcaptcha"]',
  '.h-captcha',
  '[data-sitekey]',
  'iframe[title*="reCAPTCHA" i]',
  'iframe[title*="CAPTCHA" i]',
];

const TYPEAHEAD_SELECTORS = [
  '[role="combobox"][aria-autocomplete]',
  '[data-testid*="typeahead"]',
  '[data-testid*="autocomplete"]',
  '.Select__control', // react-select
  '.select2-container',
  '[class*="autocomplete"]',
];

export function detectStructuralTriggers(): EscalationTrigger[] {
  const triggers: EscalationTrigger[] = [];

  const hasLoginWall = LOGIN_WALL_SELECTORS.some((s) => document.querySelector(s) !== null);
  const hasFormFields =
    document.querySelector('input[name*="job_application"]') !== null ||
    document.querySelector('input[name*="_systemfield_"]') !== null ||
    document.querySelector('#application_form') !== null ||
    document.querySelector('.application-form') !== null;

  if (hasLoginWall && !hasFormFields) {
    triggers.push({
      reason: 'login_wall',
      description: 'A login or sign-in wall is blocking the application form.',
    });
  }

  if (CAPTCHA_SELECTORS.some((s) => document.querySelector(s) !== null)) {
    triggers.push({
      reason: 'captcha',
      description: 'A CAPTCHA widget was detected on the page.',
    });
  }

  return triggers;
}

export function detectFieldTriggers(
  fillResults: FillResult[],
  detectedFields: DetectedField[],
  profileValues: Record<string, string>,
  alwaysEscalateKeys: ReadonlySet<string> = new Set(),
): EscalationTrigger[] {
  const triggers: EscalationTrigger[] = [];

  for (const result of fillResults) {
    if (alwaysEscalateKeys.has(result.key)) {
      triggers.push({
        reason: 'platform_always_escalate',
        fieldKey: result.key,
        description: `Field "${result.key}" requires computer-use (typeahead / file picker).`,
      });
      continue;
    }

    if (result.skipped && result.reason === 'File inputs cannot be filled programmatically') {
      triggers.push({
        reason: 'file_upload',
        fieldKey: result.key,
        description: `File upload field "${result.key}" cannot be filled programmatically.`,
      });
      continue;
    }

    if (result.success) {
      const intended = profileValues[result.key];
      if (intended && !verifyReadback(result.selector, intended)) {
        triggers.push({
          reason: 'readback_mismatch',
          fieldKey: result.key,
          description: `Field "${result.key}" appeared to fill but the committed DOM value does not match. React may have swallowed the event.`,
        });
      }
      continue;
    }

    if (!result.success && !result.skipped) {
      const detected = detectedFields.find((f) => f.key === result.key);
      if (detected?.required) {
        triggers.push({
          reason: 'required_field_empty',
          fieldKey: result.key,
          description: `Required field "${result.key}" could not be filled (${result.reason ?? 'unknown'}).`,
        });
      }
    }
  }

  if (TYPEAHEAD_SELECTORS.some((s) => document.querySelector(s) !== null)) {
    triggers.push({
      reason: 'typeahead_dropdown',
      description: 'An async typeahead/autocomplete dropdown was detected in the form.',
    });
  }

  return triggers;
}

/**
 * Combines structural and field-level trigger detection into a single
 * EscalationDecision. Returns shouldEscalate=true when any triggers are found.
 *
 * @param fillResults     Results from fillFields() / autofillGreenhouse() / etc.
 * @param detectedFields  Fields from detectJobApplication().
 * @param profileValues   Map of fieldKey → intended string value (for read-back).
 * @param platform        Detected platform string (for goal construction).
 * @param alwaysEscalate  Platform-specific keys that always require escalation.
 */
export function makeEscalationDecision(
  fillResults: FillResult[],
  detectedFields: DetectedField[],
  profileValues: Record<string, string>,
  platform: string,
  alwaysEscalate: ReadonlySet<string> = new Set(),
): EscalationDecision {
  const structuralTriggers = detectStructuralTriggers();
  const fieldTriggers = detectFieldTriggers(
    fillResults,
    detectedFields,
    profileValues,
    alwaysEscalate,
  );
  const triggers = [...structuralTriggers, ...fieldTriggers];

  if (triggers.length === 0) {
    return { shouldEscalate: false, triggers: [], agentGoal: '' };
  }

  const filledKeys = fillResults
    .filter((r) => r.success)
    .map((r) => r.key)
    .join(', ');

  const blockedKeys = triggers
    .filter((t) => t.fieldKey)
    .map((t) => `${t.fieldKey} (${t.reason})`)
    .join('; ');

  const triggerSummary = triggers.map((t) => `- ${t.description}`).join('\n');

  const agentGoal =
    `Complete this ${platform} job application form.\n\n` +
    `The deterministic fast-path autofill already filled: ${filledKeys || 'nothing'}.\n\n` +
    `The following fields require computer-use:\n${blockedKeys || '(see triggers)'}\n\n` +
    `Escalation triggers:\n${triggerSummary}\n\n` +
    `Instructions:\n` +
    `1. Do NOT re-fill fields that were already successfully filled.\n` +
    `2. Handle each blocked field: for file uploads, look for a visible upload button and interact with it. For typeaheads, click the input and type slowly then select from the dropdown. For login walls, stop and report, do not attempt to log in.\n` +
    `3. NEVER click Submit or any form submission button.\n` +
    `4. When all accessible fields are filled, report what you completed and what still needs human review.`;

  return { shouldEscalate: true, triggers, agentGoal };
}

export interface EscalationEvent {
  decision: EscalationDecision;
  platform: string;
  tabId?: number;
}

export function emitEscalationEvent(event: EscalationEvent): void {
  try {
    window.dispatchEvent(new CustomEvent('agi:escalate', { detail: event }));
  } catch {
    /* noop */
  }
}
