
import type { DetectedField } from './detector';
import type { JobApplicationProfile } from '../../../types';
import { resolveLinkedInSelector, LINKEDIN_SELECTORS } from './linkedin';
import { resolveLeverSelector, detectLeverCustomFields, LEVER_SELECTORS } from './lever';
import {
  resolveGreenhouseSelector,
  GREENHOUSE_SELECTORS,
  detectGreenhouseCustomFields,
} from './greenhouse';
import {
  resolveAshbySelector,
  ASHBY_SELECTORS,
  detectAshbyCustomFields,
  ASHBY_ALWAYS_ESCALATE_KEYS,
} from './ashby';

export const FILE_INPUT_SKIP_REASON = 'File inputs cannot be filled programmatically';

export interface FillResult {
  key: string;
  selector: string;
  success: boolean;
  skipped: boolean;
  reason?: string;
}

export interface AutofillResult {
  platform: 'linkedin' | 'lever' | 'greenhouse' | 'ashby' | 'unknown';
  filled: FillResult[];
  filledCount: number;
  skippedCount: number;
  errors: string[];
}

const MAX_PROFILE_FIELD_LENGTH = 2000;

function sanitizeProfileValue(value: string): string {
  // eslint-disable-next-line no-control-regex
  let sanitized = value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
  let previous: string;
  do {
    previous = sanitized;
    sanitized = sanitized.replace(/<[^>]*>/g, '');
  } while (sanitized !== previous);
  return sanitized.trim().substring(0, MAX_PROFILE_FIELD_LENGTH);
}

function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    el instanceof HTMLInputElement
      ? window.HTMLInputElement.prototype
      : window.HTMLTextAreaElement.prototype,
    'value',
  )?.set;

  if (nativeInputValueSetter) {
    nativeInputValueSetter.call(el, value);
  } else {
    el.value = value;
  }
}

function dispatchFillEvents(el: HTMLElement): void {
  el.dispatchEvent(new FocusEvent('focus', { bubbles: true }));
  el.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true }));
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  el.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
}

function fillTextField(el: HTMLInputElement | HTMLTextAreaElement, value: string): boolean {
  try {
    setNativeValue(el, value);
    dispatchFillEvents(el);
    return true;
  } catch {
    return false;
  }
}

function fillSelectField(el: HTMLSelectElement, value: string): boolean {
  try {
    const options = Array.from(el.options);
    const exactMatch = options.find(
      (o) => o.value === value || o.value.toLowerCase() === value.toLowerCase(),
    );
    if (exactMatch) {
      el.value = exactMatch.value;
      dispatchFillEvents(el);
      return true;
    }

    const textMatch = options.find((o) => o.text.toLowerCase().includes(value.toLowerCase()));
    if (textMatch) {
      el.value = textMatch.value;
      dispatchFillEvents(el);
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

function normaliseBooleanValue(value: boolean | string | undefined): string {
  if (value === true || value === 'true' || value === 'yes' || value === '1') return 'yes';
  if (value === false || value === 'false' || value === 'no' || value === '0') return 'no';
  return String(value ?? '');
}

/**
 * Extracts the string value from a JobApplicationProfile for a given normalised key.
 * Supports dot-notation for nested keys (e.g. "files.resume").
 * Returns null when the profile has no value for the key.
 *
 * EXPORTED so the content-script AGI_RUN_AUTOFILL handler can build the
 * profileValues map needed by makeEscalationDecision() without duplicating
 * the resolution logic.
 */
export function resolveProfileValue(
  profile: JobApplicationProfile,
  key: string,
): string | boolean | null {
  switch (key) {
    case 'firstName':
      return profile.firstName ?? null;
    case 'lastName':
      return profile.lastName ?? null;
    case 'fullName':
      return (
        profile.fullName ??
        (profile.firstName && profile.lastName ? `${profile.firstName} ${profile.lastName}` : null)
      );
    case 'email':
      return profile.email ?? null;
    case 'phone':
      return profile.phone ?? null;
    case 'locationCity':
      return profile.locationCity ?? null;
    case 'locationState':
      return profile.locationState ?? null;
    case 'locationCountry':
      return profile.locationCountry ?? null;
    case 'linkedinUrl':
      return profile.linkedinUrl ?? null;
    case 'githubUrl':
      return profile.githubUrl ?? null;
    case 'portfolioUrl':
      return profile.portfolioUrl ?? profile.websiteUrl ?? null;
    case 'currentCompany':
      return profile.currentCompany ?? null;
    case 'currentTitle':
      return profile.currentTitle ?? null;
    case 'yearsOfExperience':
      return profile.yearsOfExperience ?? null;
    case 'workAuthorization':
      return profile.workAuthorization ?? null;
    case 'requiresSponsorship':
      return profile.requiresSponsorship !== undefined
        ? normaliseBooleanValue(profile.requiresSponsorship)
        : null;
    case 'salaryExpectation':
      return profile.salaryExpectation ?? null;
    case 'coverLetterText':
      return profile.coverLetterText ?? null;
    case 'resumeText':
      return profile.resumeText ?? null;
    default:
      if (key.startsWith('customAnswers.')) {
        const subKey = key.slice('customAnswers.'.length);
        return profile.customAnswers?.[subKey] ?? null;
      }
      return null;
  }
}

export async function fillFields(
  fields: DetectedField[],
  profile: JobApplicationProfile,
  delayMs: number = 80,
): Promise<FillResult[]> {
  const results: FillResult[] = [];

  for (const field of fields) {
    if (field.fieldType === 'file') {
      results.push({
        key: field.key,
        selector: field.selector,
        success: false,
        skipped: true,
        reason: FILE_INPUT_SKIP_REASON,
      });
      continue;
    }

    const profileValue = resolveProfileValue(profile, field.key);
    if (profileValue === null || profileValue === undefined || profileValue === '') {
      results.push({
        key: field.key,
        selector: field.selector,
        success: false,
        skipped: true,
        reason: 'No value in profile for this field',
      });
      continue;
    }

    const stringValue = sanitizeProfileValue(String(profileValue));
    const el = document.querySelector(field.selector);

    if (!el) {
      results.push({
        key: field.key,
        selector: field.selector,
        success: false,
        skipped: false,
        reason: 'Element not found in DOM',
      });
      continue;
    }

    const isReadonly =
      (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) && el.readOnly;
    const isDisabled =
      el instanceof HTMLInputElement ||
      el instanceof HTMLTextAreaElement ||
      el instanceof HTMLSelectElement
        ? el.disabled
        : false;
    if (isReadonly || isDisabled) {
      results.push({
        key: field.key,
        selector: field.selector,
        success: false,
        skipped: true,
        reason: isReadonly ? 'Field is readonly' : 'Field is disabled',
      });
      continue;
    }

    let success = false;

    if (el instanceof HTMLSelectElement) {
      success = fillSelectField(el, stringValue);
    } else if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      success = fillTextField(el, stringValue);
    } else {
      results.push({
        key: field.key,
        selector: field.selector,
        success: false,
        skipped: true,
        reason: 'Unsupported element type',
      });
      continue;
    }

    results.push({
      key: field.key,
      selector: field.selector,
      success,
      skipped: false,
      reason: success ? undefined : 'Fill function returned false',
    });

    if (delayMs > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
    }
  }

  return results;
}

export async function autofillLinkedIn(
  profile: JobApplicationProfile,
  delayMs: number = 80,
): Promise<AutofillResult> {
  const filled: FillResult[] = [];
  const errors: string[] = [];

  for (const key of Object.keys(LINKEDIN_SELECTORS)) {
    if (key.startsWith('files.')) {
      filled.push({
        key,
        selector: '',
        success: false,
        skipped: true,
        reason: FILE_INPUT_SKIP_REASON,
      });
      continue;
    }

    const profileValue = resolveProfileValue(profile, key);
    if (profileValue === null || profileValue === '') {
      filled.push({
        key,
        selector: '',
        success: false,
        skipped: true,
        reason: 'No value in profile',
      });
      continue;
    }

    const match = resolveLinkedInSelector(key);
    if (!match) {
      filled.push({
        key,
        selector: '',
        success: false,
        skipped: true,
        reason: 'Field not found on page',
      });
      continue;
    }

    const { element, selector } = match;
    const stringValue = String(profileValue);
    let success = false;

    try {
      if (element instanceof HTMLSelectElement) {
        success = fillSelectField(element, stringValue);
      } else if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
        success = fillTextField(element, stringValue);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`${key}: ${msg}`);
    }

    filled.push({ key, selector, success, skipped: false });

    if (delayMs > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
    }
  }

  return {
    platform: 'linkedin',
    filled,
    filledCount: filled.filter((f) => f.success).length,
    skippedCount: filled.filter((f) => f.skipped).length,
    errors,
  };
}

export async function autofillLever(
  profile: JobApplicationProfile,
  delayMs: number = 80,
): Promise<AutofillResult> {
  const filled: FillResult[] = [];
  const errors: string[] = [];

  for (const key of Object.keys(LEVER_SELECTORS)) {
    if (key.startsWith('files.')) {
      filled.push({
        key,
        selector: '',
        success: false,
        skipped: true,
        reason: FILE_INPUT_SKIP_REASON,
      });
      continue;
    }

    const profileValue = resolveProfileValue(profile, key);
    if (profileValue === null || profileValue === '') {
      filled.push({
        key,
        selector: '',
        success: false,
        skipped: true,
        reason: 'No value in profile',
      });
      continue;
    }

    const match = resolveLeverSelector(key);
    if (!match) {
      filled.push({
        key,
        selector: '',
        success: false,
        skipped: true,
        reason: 'Field not found on page',
      });
      continue;
    }

    const { element, selector } = match;
    const stringValue = String(profileValue);
    let success = false;

    try {
      if (element instanceof HTMLSelectElement) {
        success = fillSelectField(element, stringValue);
      } else if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
        success = fillTextField(element, stringValue);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`${key}: ${msg}`);
    }

    filled.push({ key, selector, success, skipped: false });

    if (delayMs > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
    }
  }

  const container =
    document.querySelector('.application-form') ??
    document.querySelector('#application-form') ??
    document.querySelector('form');

  if (container && profile.customAnswers && Object.keys(profile.customAnswers).length > 0) {
    const customFields = detectLeverCustomFields(container);
    for (const cf of customFields) {
      const profileValue = resolveProfileValue(profile, cf.key);
      if (profileValue === null || profileValue === '') {
        filled.push({
          key: cf.key,
          selector: cf.selector,
          success: false,
          skipped: true,
          reason: 'No custom answer in profile',
        });
        continue;
      }

      const el = document.querySelector(cf.selector);
      if (!el) {
        filled.push({
          key: cf.key,
          selector: cf.selector,
          success: false,
          skipped: false,
          reason: 'Custom question element not found',
        });
        continue;
      }

      const stringValue = String(profileValue);
      let success = false;
      try {
        if (el instanceof HTMLSelectElement) {
          success = fillSelectField(el, stringValue);
        } else if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
          success = fillTextField(el, stringValue);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        errors.push(`${cf.key}: ${msg}`);
      }

      filled.push({ key: cf.key, selector: cf.selector, success, skipped: false });

      if (delayMs > 0) {
        await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }

  return {
    platform: 'lever',
    filled,
    filledCount: filled.filter((f) => f.success).length,
    skippedCount: filled.filter((f) => f.skipped).length,
    errors,
  };
}

export async function autofillGreenhouse(
  profile: JobApplicationProfile,
  delayMs: number = 80,
): Promise<AutofillResult> {
  const filled: FillResult[] = [];
  const errors: string[] = [];

  for (const key of Object.keys(GREENHOUSE_SELECTORS)) {
    if (key.startsWith('files.')) {
      filled.push({
        key,
        selector: '',
        success: false,
        skipped: true,
        reason: FILE_INPUT_SKIP_REASON,
      });
      continue;
    }

    const profileValue = resolveProfileValue(profile, key);
    if (profileValue === null || profileValue === '') {
      filled.push({
        key,
        selector: '',
        success: false,
        skipped: true,
        reason: 'No value in profile',
      });
      continue;
    }

    const match = resolveGreenhouseSelector(key);
    if (!match) {
      filled.push({
        key,
        selector: '',
        success: false,
        skipped: true,
        reason: 'Field not found on page',
      });
      continue;
    }

    const { element, selector } = match;
    const stringValue = sanitizeProfileValue(String(profileValue));
    let success = false;

    try {
      if (element instanceof HTMLSelectElement) {
        success = fillSelectField(element, stringValue);
      } else if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
        success = fillTextField(element, stringValue);
      }
    } catch (e) {
      errors.push(`${key}: ${e instanceof Error ? e.message : String(e)}`);
    }

    filled.push({ key, selector, success, skipped: false });

    if (delayMs > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
    }
  }

  const container = document.querySelector('#application_form') ?? document.querySelector('form');
  if (container && profile.customAnswers && Object.keys(profile.customAnswers).length > 0) {
    const customFields = detectGreenhouseCustomFields(container);
    for (const cf of customFields) {
      const profileValue = resolveProfileValue(profile, cf.key);
      if (profileValue === null || profileValue === '') {
        filled.push({
          key: cf.key,
          selector: cf.selector,
          success: false,
          skipped: true,
          reason: 'No custom answer in profile',
        });
        continue;
      }
      const el = document.querySelector(cf.selector);
      if (!el) {
        filled.push({
          key: cf.key,
          selector: cf.selector,
          success: false,
          skipped: false,
          reason: 'Element not found',
        });
        continue;
      }
      let success = false;
      try {
        if (el instanceof HTMLSelectElement) success = fillSelectField(el, String(profileValue));
        else if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)
          success = fillTextField(el, sanitizeProfileValue(String(profileValue)));
      } catch (e) {
        errors.push(`${cf.key}: ${e instanceof Error ? e.message : String(e)}`);
      }
      filled.push({ key: cf.key, selector: cf.selector, success, skipped: false });
      if (delayMs > 0) await new Promise<void>((r) => setTimeout(r, delayMs));
    }
  }

  return {
    platform: 'greenhouse',
    filled,
    filledCount: filled.filter((f) => f.success).length,
    skippedCount: filled.filter((f) => f.skipped).length,
    errors,
  };
}

export async function autofillAshby(
  profile: JobApplicationProfile,
  delayMs: number = 80,
): Promise<AutofillResult> {
  const filled: FillResult[] = [];
  const errors: string[] = [];

  for (const key of Object.keys(ASHBY_SELECTORS)) {
    if (key.startsWith('files.') || ASHBY_ALWAYS_ESCALATE_KEYS.has(key)) {
      filled.push({
        key,
        selector: '',
        success: false,
        skipped: true,
        reason: 'Requires computer-use escalation',
      });
      continue;
    }

    const profileValue = resolveProfileValue(profile, key);
    if (profileValue === null || profileValue === '') {
      filled.push({
        key,
        selector: '',
        success: false,
        skipped: true,
        reason: 'No value in profile',
      });
      continue;
    }

    const match = resolveAshbySelector(key);
    if (!match) {
      filled.push({
        key,
        selector: '',
        success: false,
        skipped: true,
        reason: 'Field not found on page',
      });
      continue;
    }

    const { element, selector } = match;
    const stringValue = sanitizeProfileValue(String(profileValue));
    let success = false;

    try {
      if (element instanceof HTMLSelectElement) {
        success = fillSelectField(element, stringValue);
      } else if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
        success = fillTextField(element, stringValue);
      }
    } catch (e) {
      errors.push(`${key}: ${e instanceof Error ? e.message : String(e)}`);
    }

    filled.push({ key, selector, success, skipped: false });

    if (delayMs > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
    }
  }

  const container = document.querySelector('form');
  if (container && profile.customAnswers && Object.keys(profile.customAnswers).length > 0) {
    const customFields = detectAshbyCustomFields(container);
    for (const cf of customFields) {
      const profileValue = resolveProfileValue(profile, cf.key);
      if (profileValue === null || profileValue === '') {
        filled.push({
          key: cf.key,
          selector: cf.selector,
          success: false,
          skipped: true,
          reason: 'No custom answer in profile',
        });
        continue;
      }
      const el = document.querySelector(cf.selector);
      if (!el) {
        filled.push({
          key: cf.key,
          selector: cf.selector,
          success: false,
          skipped: false,
          reason: 'Element not found',
        });
        continue;
      }
      let success = false;
      try {
        if (el instanceof HTMLSelectElement) success = fillSelectField(el, String(profileValue));
        else if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)
          success = fillTextField(el, sanitizeProfileValue(String(profileValue)));
      } catch (e) {
        errors.push(`${cf.key}: ${e instanceof Error ? e.message : String(e)}`);
      }
      filled.push({ key: cf.key, selector: cf.selector, success, skipped: false });
      if (delayMs > 0) await new Promise<void>((r) => setTimeout(r, delayMs));
    }
  }

  return {
    platform: 'ashby',
    filled,
    filledCount: filled.filter((f) => f.success).length,
    skippedCount: filled.filter((f) => f.skipped).length,
    errors,
  };
}

export const AUTOFILL_PROFILE_STORAGE_KEY = 'agi_autofill_profile';

export async function loadAutofillProfile(): Promise<JobApplicationProfile> {
  try {
    const result = await chrome.storage.local.get(AUTOFILL_PROFILE_STORAGE_KEY);
    const stored = result[AUTOFILL_PROFILE_STORAGE_KEY];
    if (stored && typeof stored === 'object') {
      return stored as JobApplicationProfile;
    }
  } catch {
    // storage.local may not be available in all contexts
  }
  return {};
}

export async function saveAutofillProfile(profile: JobApplicationProfile): Promise<void> {
  await chrome.storage.local.set({ [AUTOFILL_PROFILE_STORAGE_KEY]: profile });
}

const AUTOFILL_MIGRATION_DONE_KEY = 'agi_autofill_profile_migrated';

export async function migrateAutofillProfile(): Promise<boolean> {
  try {
    const localResult = await chrome.storage.local.get([
      AUTOFILL_MIGRATION_DONE_KEY,
      AUTOFILL_PROFILE_STORAGE_KEY,
    ]);
    if (localResult[AUTOFILL_MIGRATION_DONE_KEY] === true) {
      return false;
    }

    const syncResult = await chrome.storage.sync.get(AUTOFILL_PROFILE_STORAGE_KEY);
    const syncProfile = syncResult[AUTOFILL_PROFILE_STORAGE_KEY];
    const localProfile = localResult[AUTOFILL_PROFILE_STORAGE_KEY];

    let copied = false;
    if (
      (!localProfile ||
        typeof localProfile !== 'object' ||
        Object.keys(localProfile).length === 0) &&
      syncProfile &&
      typeof syncProfile === 'object'
    ) {
      await chrome.storage.local.set({ [AUTOFILL_PROFILE_STORAGE_KEY]: syncProfile });
      copied = true;
    }

    await chrome.storage.sync.remove(AUTOFILL_PROFILE_STORAGE_KEY).catch(() => {});
    await chrome.storage.local.set({ [AUTOFILL_MIGRATION_DONE_KEY]: true });
    return copied;
  } catch {
    return false;
  }
}
