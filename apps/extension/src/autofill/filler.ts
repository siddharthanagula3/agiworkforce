/**
 * Field filler — programmatically fills detected job application form fields
 * with values from a user profile, dispatching the events that
 * React/Vue/Angular frameworks need to register the change.
 *
 * IMPORTANT: This module never auto-submits forms. It only fills values.
 */

import type { DetectedField } from './detector';
import type { JobApplicationProfile } from '../types';
import { resolveLinkedInSelector, LINKEDIN_SELECTORS } from './linkedin';
import { resolveLeverSelector, detectLeverCustomFields, LEVER_SELECTORS } from './lever';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FillResult {
  key: string;
  selector: string;
  success: boolean;
  skipped: boolean;
  reason?: string;
}

export interface AutofillResult {
  platform: 'linkedin' | 'lever' | 'unknown';
  filled: FillResult[];
  filledCount: number;
  skippedCount: number;
  errors: string[];
}

// ─── Profile value sanitization ──────────────────────────────────────────────

/** Maximum length for any single profile field value. */
const MAX_PROFILE_FIELD_LENGTH = 2000;

/**
 * Sanitize a profile field value before filling it into a form.
 * - Strips control characters (except newline/tab for textareas)
 * - Rejects HTML tags (prevents XSS if ATS renders submitted data unsafely)
 * - Enforces a length limit
 * - Trims whitespace
 */
function sanitizeProfileValue(value: string): string {
  // Strip control chars except \n (\u000A) and \t (\u0009) which are useful in textareas.
  // eslint-disable-next-line no-control-regex
  let sanitized = value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
  // Strip any HTML tags — profile values should be plain text.
  // Loop to handle nested/recursive patterns like "<<script>alert(1)</script>"
  // where a single pass leaves residual tags.
  let previous: string;
  do {
    previous = sanitized;
    sanitized = sanitized.replace(/<[^>]*>/g, '');
  } while (sanitized !== previous);
  // Trim and enforce length limit
  return sanitized.trim().substring(0, MAX_PROFILE_FIELD_LENGTH);
}

// ─── Native input value setter (React/Vue compatible) ────────────────────────

/**
 * Sets the value of a React-controlled input without React swallowing the change.
 *
 * React overrides the native value descriptor to track changes; we bypass that
 * by using Object.getOwnPropertyDescriptor to call the original setter.
 */
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

// ─── Event dispatch sequence ──────────────────────────────────────────────────

/**
 * Dispatches the sequence of events a user would normally produce when typing
 * a value into a field: focus → input → change → blur.
 *
 * This is required for React controlled components to re-render.
 */
function dispatchFillEvents(el: HTMLElement): void {
  el.dispatchEvent(new FocusEvent('focus', { bubbles: true }));
  // beforeinput is required by React 19+ and Vue 3.4+ for input validation hooks.
  el.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true }));
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  el.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
}

// ─── Individual field fillers ─────────────────────────────────────────────────

/**
 * Fills a plain text / email / tel / url input or a textarea.
 */
function fillTextField(el: HTMLInputElement | HTMLTextAreaElement, value: string): boolean {
  try {
    setNativeValue(el, value);
    dispatchFillEvents(el);
    return true;
  } catch {
    return false;
  }
}

/**
 * Selects an option in a <select> element by exact value, then by
 * case-insensitive partial text match as fallback.
 */
function fillSelectField(el: HTMLSelectElement, value: string): boolean {
  try {
    // Try exact value match first
    const options = Array.from(el.options);
    const exactMatch = options.find(
      (o) => o.value === value || o.value.toLowerCase() === value.toLowerCase(),
    );
    if (exactMatch) {
      el.value = exactMatch.value;
      dispatchFillEvents(el);
      return true;
    }

    // Partial text match
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

/**
 * Handles boolean-like profile values for select fields (yes/no, true/false,
 * require/not-required, etc.).
 */
function normaliseBooleanValue(value: boolean | string | undefined): string {
  if (value === true || value === 'true' || value === 'yes' || value === '1') return 'yes';
  if (value === false || value === 'false' || value === 'no' || value === '0') return 'no';
  return String(value ?? '');
}

// ─── Profile key → value resolver ────────────────────────────────────────────

/**
 * Extracts the string value from a JobApplicationProfile for a given normalised key.
 * Supports dot-notation for nested keys (e.g. "files.resume").
 * Returns null when the profile has no value for the key.
 */
function resolveProfileValue(profile: JobApplicationProfile, key: string): string | boolean | null {
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
      // Handle customAnswers.* keys
      if (key.startsWith('customAnswers.')) {
        const subKey = key.slice('customAnswers.'.length);
        return profile.customAnswers?.[subKey] ?? null;
      }
      // files.* keys are handled separately in fillFields()
      return null;
  }
}

// ─── Main fill function ───────────────────────────────────────────────────────

/**
 * Fills a list of detected fields with values from a profile.
 *
 * File inputs (resume, cover letter) are skipped here because the browser
 * security model prevents programmatic file input filling — those are handled
 * separately via the `files` property on the profile if data-URLs are provided.
 */
export async function fillFields(
  fields: DetectedField[],
  profile: JobApplicationProfile,
  delayMs: number = 80,
): Promise<FillResult[]> {
  const results: FillResult[] = [];

  for (const field of fields) {
    // File inputs cannot be filled programmatically via the value property
    if (field.fieldType === 'file') {
      results.push({
        key: field.key,
        selector: field.selector,
        success: false,
        skipped: true,
        reason: 'File inputs cannot be filled programmatically',
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

    // Skip readonly or disabled fields — filling them has no effect and can
    // confuse form validation logic.
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

    // Small delay between fields to avoid race conditions in JS frameworks
    if (delayMs > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
    }
  }

  return results;
}

// ─── Platform-aware autofill orchestrator ────────────────────────────────────

/**
 * Runs the complete LinkedIn autofill for the currently open Easy Apply modal.
 *
 * Uses the prioritised LinkedIn selector map rather than the generic detector,
 * because LinkedIn's modal may only expose a subset of fields per page step.
 */
export async function autofillLinkedIn(
  profile: JobApplicationProfile,
  delayMs: number = 80,
): Promise<AutofillResult> {
  const filled: FillResult[] = [];
  const errors: string[] = [];

  for (const key of Object.keys(LINKEDIN_SELECTORS)) {
    if (key.startsWith('files.')) {
      filled.push({ key, selector: '', success: false, skipped: true, reason: 'File input' });
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

/**
 * Runs the complete Lever autofill for the currently open job application form.
 *
 * Also detects and fills custom Lever questions when the profile carries
 * matching `customAnswers` entries.
 */
export async function autofillLever(
  profile: JobApplicationProfile,
  delayMs: number = 80,
): Promise<AutofillResult> {
  const filled: FillResult[] = [];
  const errors: string[] = [];

  // Standard fields
  for (const key of Object.keys(LEVER_SELECTORS)) {
    if (key.startsWith('files.')) {
      filled.push({ key, selector: '', success: false, skipped: true, reason: 'File input' });
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

  // Custom questions
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

// ─── Profile storage helpers ──────────────────────────────────────────────────

/**
 * Storage key for the autofill profile.
 *
 * SECURITY (H-04 promoted Critical, audit 2026-05-19): the profile previously
 * lived in `chrome.storage.sync`, which replicates to Google's servers via the
 * user's signed-in Chrome account. Profile fields include resume text,
 * cover-letter text, salary expectation, current employer/title — sensitive
 * PII that should never leave the device. We migrated to `chrome.storage.local`
 * (device-only). The one-shot `migrateAutofillProfile()` below copies any
 * pre-existing sync value into local on first run after upgrade, then clears
 * the sync key. Historical Google-server retention is outside the extension's
 * control; the migration just prevents future replication.
 */
export const AUTOFILL_PROFILE_STORAGE_KEY = 'agi_autofill_profile';

/**
 * Marker key set after a successful sync → local migration so the migrator
 * runs at most once. Stored alongside the profile in local.
 */
const AUTOFILL_MIGRATION_DONE_KEY = 'agi_autofill_profile_migrated';

/** Loads the autofill profile from chrome.storage.local. */
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

/** Persists the autofill profile to chrome.storage.local. */
export async function saveAutofillProfile(profile: JobApplicationProfile): Promise<void> {
  await chrome.storage.local.set({ [AUTOFILL_PROFILE_STORAGE_KEY]: profile });
}

/**
 * One-shot migrator: copy autofill profile from `chrome.storage.sync` into
 * `chrome.storage.local`, then clear sync. Idempotent — guarded by the
 * AUTOFILL_MIGRATION_DONE_KEY marker. Silent on any storage error so the
 * extension boot path stays resilient.
 *
 * Returns true when a migration write actually occurred, false otherwise.
 */
export async function migrateAutofillProfile(): Promise<boolean> {
  try {
    const localResult = await chrome.storage.local.get([
      AUTOFILL_MIGRATION_DONE_KEY,
      AUTOFILL_PROFILE_STORAGE_KEY,
    ]);
    if (localResult[AUTOFILL_MIGRATION_DONE_KEY] === true) {
      return false; // already migrated
    }

    const syncResult = await chrome.storage.sync.get(AUTOFILL_PROFILE_STORAGE_KEY);
    const syncProfile = syncResult[AUTOFILL_PROFILE_STORAGE_KEY];
    const localProfile = localResult[AUTOFILL_PROFILE_STORAGE_KEY];

    // Only copy from sync into local when local is empty — never clobber a
    // post-migration write the user has made.
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

    // Always clear sync and stamp the marker so subsequent boots skip this path.
    await chrome.storage.sync.remove(AUTOFILL_PROFILE_STORAGE_KEY).catch(() => {});
    await chrome.storage.local.set({ [AUTOFILL_MIGRATION_DONE_KEY]: true });
    return copied;
  } catch {
    // Storage unavailable (test / SSR / locked profile) — leave state as-is.
    return false;
  }
}
