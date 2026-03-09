/**
 * Lever-specific form field selectors and helpers.
 *
 * Lever uses a standardised form structure across all job postings at
 * jobs.lever.co/<company>/<job-id>/apply (or /apply?lever-source=…).
 *
 * Field IDs are mostly stable:
 *   #name, #email, #phone, #org (current company)
 * Custom questions use generic IDs like #field0, #field1, etc.
 * Resume upload uses <input type="file"> inside a `.upload-btn-wrap` div.
 */

import type { DetectedField } from './detector';

// ─── Selector constants ───────────────────────────────────────────────────────

/**
 * Prioritised selector list per profile key.
 * Order: stable ID > name attribute > aria-label > placeholder.
 */
export const LEVER_SELECTORS: Record<string, string[]> = {
  fullName: [
    '#name',
    'input[name="name"]',
    'input[autocomplete="name"]',
    'input[aria-label*="Name" i]',
    'input[placeholder*="name" i]',
  ],
  firstName: [
    '#first-name',
    'input[name="first_name"]',
    'input[name="firstName"]',
    'input[aria-label*="First name" i]',
    'input[placeholder*="First name" i]',
  ],
  lastName: [
    '#last-name',
    'input[name="last_name"]',
    'input[name="lastName"]',
    'input[aria-label*="Last name" i]',
    'input[placeholder*="Last name" i]',
  ],
  email: [
    '#email',
    'input[name="email"]',
    'input[type="email"]',
    'input[autocomplete="email"]',
    'input[aria-label*="Email" i]',
    'input[placeholder*="email" i]',
  ],
  phone: [
    '#phone',
    'input[name="phone"]',
    'input[type="tel"]',
    'input[autocomplete="tel"]',
    'input[aria-label*="Phone" i]',
    'input[placeholder*="phone" i]',
  ],
  currentCompany: [
    '#org',
    'input[name="org"]',
    'input[name="company"]',
    'input[aria-label*="Current company" i]',
    'input[aria-label*="Organization" i]',
    'input[placeholder*="company" i]',
  ],
  linkedinUrl: [
    '#urls_LinkedIn',
    'input[name="urls[LinkedIn]"]',
    'input[id*="linkedin"]',
    'input[aria-label*="LinkedIn" i]',
    'input[placeholder*="linkedin.com" i]',
  ],
  githubUrl: [
    '#urls_GitHub',
    'input[name="urls[GitHub]"]',
    'input[id*="github"]',
    'input[aria-label*="GitHub" i]',
    'input[placeholder*="github.com" i]',
  ],
  portfolioUrl: [
    '#urls_Portfolio',
    'input[name="urls[Portfolio]"]',
    '#urls_Other',
    'input[name="urls[Other]"]',
    'input[id*="portfolio"]',
    'input[aria-label*="Portfolio" i]',
    'input[aria-label*="Website" i]',
    'input[placeholder*="portfolio" i]',
  ],
  locationCity: [
    '#location',
    'input[name="location"]',
    'input[aria-label*="Location" i]',
    'input[aria-label*="City" i]',
    'input[placeholder*="location" i]',
    'input[placeholder*="city" i]',
  ],
  coverLetterText: [
    '#coverLetter',
    'textarea[name="coverLetter"]',
    'textarea[id*="cover"]',
    'textarea[aria-label*="Cover letter" i]',
    'textarea[placeholder*="cover letter" i]',
  ],
  // File uploads
  'files.resume': [
    // Lever wraps the file input inside a styled button; we target the actual <input>
    '.upload-btn-wrap input[type="file"]',
    '#resume-upload-input',
    'input[type="file"][name*="resume"]',
    'input[type="file"][name*="file"]',
    'input[type="file"]',
  ],
  'files.coverLetter': [
    '.upload-btn-wrap input[type="file"][name*="cover"]',
    'input[type="file"][name*="cover"]',
  ],
};

// ─── Custom question detection ────────────────────────────────────────────────

/**
 * Lever custom questions (from the job posting) use IDs like
 * `#field0`, `#field1`, etc. or sometimes `textarea[name^="cards["]`.
 *
 * This function returns those fields with the best label we can derive,
 * mapping them to customAnswers.<label> in the profile.
 */
export interface LeverCustomField {
  key: string; // "customAnswers.<sanitisedLabel>"
  selector: string;
  label: string;
  fieldType: DetectedField['fieldType'];
}

export function detectLeverCustomFields(container: Element): LeverCustomField[] {
  const results: LeverCustomField[] = [];
  const seen = new Set<string>();

  // Generic numbered field inputs
  const fieldEls = Array.from(
    container.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
      'input[id^="field"], textarea[id^="field"], select[id^="field"],' +
        'input[name^="cards["], textarea[name^="cards["], select[name^="cards["]',
    ),
  );

  for (const el of fieldEls) {
    const sel = el.id
      ? `#${CSS.escape(el.id)}`
      : `[name="${CSS.escape(el.getAttribute('name') ?? '')}"]`;
    if (!sel || seen.has(sel)) continue;
    seen.add(sel);

    // Find label
    let label = '';
    if (el.id) {
      const labelEl = container.querySelector<HTMLLabelElement>(
        `label[for="${CSS.escape(el.id)}"]`,
      );
      if (labelEl) label = labelEl.textContent?.trim() ?? '';
    }
    if (!label)
      label = el.getAttribute('aria-label') ?? el.getAttribute('placeholder') ?? el.id ?? el.name;

    const sanitised = label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '');
    const key = sanitised ? `customAnswers.${sanitised}` : `customAnswers.${el.id || el.name}`;

    const fieldType: DetectedField['fieldType'] =
      el instanceof HTMLTextAreaElement
        ? 'textarea'
        : el instanceof HTMLSelectElement
          ? 'select'
          : 'text';

    results.push({ key, selector: sel, label, fieldType });
  }

  return results;
}

// ─── EEO / diversity section ──────────────────────────────────────────────────

/**
 * Lever's EEO (Equal Employment Opportunity) section uses <select> dropdowns
 * with IDs like `#eeo_gender`, `#eeo_race`, etc.
 * We surface these so the filler can skip them by default (opt-in only).
 */
export const LEVER_EEO_SELECTORS: Record<string, string> = {
  eeoGender: '#eeo_gender',
  eeoRace: '#eeo_race',
  eeoVeteran: '#eeo_veteran',
  eeoDisability: '#eeo_disability',
};

// ─── Selector resolution ──────────────────────────────────────────────────────

/**
 * Resolves the first matching element for a given profile key in the Lever form.
 */
export function resolveLeverSelector(
  key: string,
): { element: HTMLElement; selector: string } | null {
  const selectors = LEVER_SELECTORS[key] ?? [];
  for (const sel of selectors) {
    const el = document.querySelector<HTMLElement>(sel);
    if (el) return { element: el, selector: sel };
  }
  return null;
}

/**
 * Returns all currently resolvable Lever fields for the active page.
 * Used for preview before the user confirms autofill.
 */
export function collectResolvableLeverFields(): DetectedField[] {
  const result: DetectedField[] = [];
  for (const [key, selectors] of Object.entries(LEVER_SELECTORS)) {
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) {
        const fieldType: DetectedField['fieldType'] =
          el instanceof HTMLTextAreaElement
            ? 'textarea'
            : el instanceof HTMLSelectElement
              ? 'select'
              : el instanceof HTMLInputElement && el.type === 'file'
                ? 'file'
                : el instanceof HTMLInputElement && el.type === 'email'
                  ? 'email'
                  : el instanceof HTMLInputElement && el.type === 'tel'
                    ? 'tel'
                    : 'text';

        result.push({
          key,
          selector: sel,
          label: key,
          fieldType,
          required: (el as HTMLInputElement).required ?? false,
        });
        break;
      }
    }
  }
  return result;
}
