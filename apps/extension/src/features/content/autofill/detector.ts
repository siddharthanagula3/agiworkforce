/**
 * Job application form detector
 * Identifies whether the current page is a job application form on LinkedIn or Lever
 * and enumerates the fields that can be autofilled.
 */

/** The platforms that can be detected by this module. */
export type DetectedPlatform = 'linkedin' | 'lever' | null;

/**
 * A single detected form field ready for autofill.
 * - `key`      — normalised semantic name used to look up the value in a profile (e.g. "firstName")
 * - `selector` — CSS selector for the DOM element
 * - `label`    — human-readable label extracted from the page
 * - `fieldType`— the type of the underlying element
 * - `required` — whether the field is marked required on the page
 */
export interface DetectedField {
  key: string;
  selector: string;
  label: string;
  fieldType: 'text' | 'email' | 'tel' | 'textarea' | 'select' | 'file' | 'other';
  required: boolean;
}

/** The result returned by `detectJobApplication()`. */
export interface DetectionResult {
  platform: DetectedPlatform;
  /** `true` when a job application form is visible (platform has been detected and fields found). */
  isJobApplication: boolean;
  fields: DetectedField[];
}

// ─── LinkedIn URL patterns ────────────────────────────────────────────────────

const LINKEDIN_URL_PATTERNS = [/linkedin\.com\/jobs\//i, /linkedin\.com\/job\//i];

/**
 * Returns true when the current URL looks like a LinkedIn job listing or Easy Apply page.
 */
function isLinkedInUrl(url: string): boolean {
  return LINKEDIN_URL_PATTERNS.some((re) => re.test(url));
}

// ─── Lever URL patterns ───────────────────────────────────────────────────────

const LEVER_URL_PATTERNS = [/jobs\.lever\.co\//i, /app\.lever\.co\/.*\/apply/i];

/**
 * Returns true when the current URL looks like a Lever job application page.
 */
function isLeverUrl(url: string): boolean {
  return LEVER_URL_PATTERNS.some((re) => re.test(url));
}

// ─── LinkedIn form detection ──────────────────────────────────────────────────

/**
 * Attempts to find a LinkedIn Easy Apply modal or inline application form.
 * Returns the container element if found, null otherwise.
 */
function findLinkedInFormContainer(): Element | null {
  // Easy Apply modal — several class name patterns across LinkedIn releases
  const modalSelectors = [
    '.jobs-easy-apply-modal',
    '.jobs-apply-modal',
    '[data-test-modal-id="easy-apply-modal"]',
    '.artdeco-modal--layer-default',
    '.jobs-easy-apply-content',
    // Newer LinkedIn DOM structure
    'div[aria-label*="Apply"]',
    'div[aria-label*="apply"]',
  ];

  for (const sel of modalSelectors) {
    const el = document.querySelector(sel);
    if (el) return el;
  }

  // Fallback: look for a form with LinkedIn-style field labels inside a modal-ish wrapper
  const forms = Array.from(document.querySelectorAll('form'));
  for (const form of forms) {
    const hasLinkedInFields =
      form.querySelector('[id*="jobs-apply"]') !== null ||
      form.querySelector('[data-test-text-entity-list-form-component]') !== null ||
      form.querySelector('.jobs-easy-apply-form-section') !== null;
    if (hasLinkedInFields) return form;
  }

  return null;
}

/**
 * Collects detectable fields from within a LinkedIn application container.
 */
function detectLinkedInFields(container: Element): DetectedField[] {
  const fields: DetectedField[] = [];
  const seen = new Set<string>();

  // Helper: generate a unique CSS selector for a single element
  function selectorFor(el: Element): string {
    if (el.id) return `#${CSS.escape(el.id)}`;
    // Fall back to a data-test attribute or a name attribute
    const name = el.getAttribute('name');
    if (name) return `[name="${CSS.escape(name)}"]`;
    const testId = el.getAttribute('data-test-text-entity-list-form-input');
    if (testId) return `[data-test-text-entity-list-form-input="${CSS.escape(testId)}"]`;
    // Use position relative to the container
    const allInputs = Array.from(container.querySelectorAll('input, textarea, select'));
    const idx = allInputs.indexOf(el);
    if (idx >= 0) return `input:nth-of-type(${idx + 1})`;
    return '';
  }

  // ── Standard input/textarea/select elements ──────────────────────────────
  const inputEls = Array.from(
    container.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
      'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="checkbox"]):not([type="radio"]), textarea, select',
    ),
  );

  for (const el of inputEls) {
    const sel = selectorFor(el);
    if (!sel || seen.has(sel)) continue;
    seen.add(sel);

    const labelText = getLabelForElement(el, container);
    const key = inferProfileKey(labelText, el);
    if (!key) continue;

    const fieldType = inferFieldType(el);
    const required = el.required || el.getAttribute('aria-required') === 'true';

    fields.push({ key, selector: sel, label: labelText, fieldType, required });
  }

  // ── File inputs (resume, cover letter) ───────────────────────────────────
  const fileInputs = Array.from(container.querySelectorAll<HTMLInputElement>('input[type="file"]'));
  for (const el of fileInputs) {
    const sel = selectorFor(el);
    if (!sel || seen.has(sel)) continue;
    seen.add(sel);

    const labelText = getLabelForElement(el, container);
    const key = inferProfileKey(labelText, el);
    if (!key) continue;

    fields.push({ key, selector: sel, label: labelText, fieldType: 'file', required: el.required });
  }

  return fields;
}

// ─── Lever form detection ─────────────────────────────────────────────────────

/**
 * Finds the main Lever application form element.
 */
function findLeverFormContainer(): Element | null {
  // Standard Lever application form
  const leverSelectors = [
    '.application-form',
    '#application-form',
    'form[action*="apply"]',
    '.lever-application',
    '[data-qa="application-form"]',
    '.posting-apply',
  ];

  for (const sel of leverSelectors) {
    const el = document.querySelector(sel);
    if (el) return el;
  }

  // Fallback: any form with typical Lever field IDs
  const forms = Array.from(document.querySelectorAll('form'));
  for (const form of forms) {
    const hasLeverFields =
      form.querySelector('#name') !== null ||
      form.querySelector('#email') !== null ||
      form.querySelector('[name="name"]') !== null;
    if (hasLeverFields) return form;
  }

  return null;
}

/**
 * Collects detectable fields from within a Lever application form container.
 */
function detectLeverFields(container: Element): DetectedField[] {
  const fields: DetectedField[] = [];
  const seen = new Set<string>();

  function selectorFor(el: Element): string {
    if (el.id) return `#${CSS.escape(el.id)}`;
    const name = el.getAttribute('name');
    if (name) return `[name="${CSS.escape(name)}"]`;
    return '';
  }

  const inputEls = Array.from(
    container.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
      'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="checkbox"]):not([type="radio"]), textarea, select',
    ),
  );

  for (const el of inputEls) {
    const sel = selectorFor(el);
    if (!sel || seen.has(sel)) continue;
    seen.add(sel);

    const labelText = getLabelForElement(el, container);
    const key = inferProfileKey(labelText, el);
    if (!key) continue;

    const fieldType = inferFieldType(el);
    const required = el.required || el.getAttribute('aria-required') === 'true';
    fields.push({ key, selector: sel, label: labelText, fieldType, required });
  }

  const fileInputs = Array.from(container.querySelectorAll<HTMLInputElement>('input[type="file"]'));
  for (const el of fileInputs) {
    const sel = selectorFor(el);
    if (!sel || seen.has(sel)) continue;
    seen.add(sel);

    const labelText = getLabelForElement(el, container);
    const key = inferProfileKey(labelText, el);
    if (!key) continue;

    fields.push({ key, selector: sel, label: labelText, fieldType: 'file', required: el.required });
  }

  return fields;
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

/**
 * Returns the human-readable label for a form element by looking up
 * <label for="...">, aria-label, aria-labelledby, placeholder, or
 * surrounding text content.
 */
function getLabelForElement(
  el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
  container: Element,
): string {
  // 1. Explicit <label for="...">
  if (el.id) {
    const label = container.querySelector<HTMLLabelElement>(`label[for="${CSS.escape(el.id)}"]`);
    if (label) return label.textContent?.trim() ?? '';
  }

  // 2. aria-label attribute
  const ariaLabel = el.getAttribute('aria-label');
  if (ariaLabel) return ariaLabel.trim();

  // 3. aria-labelledby
  const labelledBy = el.getAttribute('aria-labelledby');
  if (labelledBy) {
    const refEl = document.getElementById(labelledBy);
    if (refEl) return refEl.textContent?.trim() ?? '';
  }

  // 4. Wrapping <label>
  const wrapLabel = el.closest('label');
  if (wrapLabel) {
    return (
      Array.from(wrapLabel.childNodes)
        .filter(
          (n) => n.nodeType === Node.TEXT_NODE || (n.nodeType === Node.ELEMENT_NODE && n !== el),
        )
        .map((n) => (n as Node).textContent ?? '')
        .join(' ')
        .trim() || ''
    );
  }

  // 5. placeholder
  if ('placeholder' in el && el.placeholder) return el.placeholder.trim();

  // 6. Preceding sibling or parent label text
  const parent = el.parentElement;
  if (parent) {
    const prevLabel = parent.querySelector('label, .label, .field-label, .form-label, legend');
    if (prevLabel) return prevLabel.textContent?.trim() ?? '';
  }

  return el.name ?? '';
}

/**
 * Maps a field label (and element metadata) to a profile key.
 * Returns null when the field cannot be mapped to any known profile attribute.
 */
function inferProfileKey(
  label: string,
  el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
): string | null {
  const placeholder =
    el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement
      ? (el.placeholder ?? '')
      : '';
  const text = (label + ' ' + (el.name ?? '') + ' ' + (el.id ?? '') + ' ' + placeholder)
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ');

  // File inputs
  if (el instanceof HTMLInputElement && el.type === 'file') {
    if (/cover.?letter/i.test(text)) return 'files.coverLetter';
    if (/resume|cv|curriculum/i.test(text)) return 'files.resume';
    return null; // skip unknown file fields
  }

  // Name fields
  if (/first.?name|given.?name/i.test(text)) return 'firstName';
  if (/last.?name|surname|family.?name/i.test(text)) return 'lastName';
  if (/^name$|full.?name|your name/i.test(text)) return 'fullName';

  // Contact
  if (/e.?mail/i.test(text)) return 'email';
  if (/phone|mobile|cell/i.test(text)) return 'phone';

  // Location
  if (/city/i.test(text)) return 'locationCity';
  if (/state|province/i.test(text)) return 'locationState';
  if (/country/i.test(text)) return 'locationCountry';

  // URLs
  if (/linkedin/i.test(text)) return 'linkedinUrl';
  if (/github/i.test(text)) return 'githubUrl';
  if (/portfolio|personal.?site|website/i.test(text)) return 'portfolioUrl';

  // Work
  if (/company|employer|organization/i.test(text)) return 'currentCompany';
  if (/title|position|role/i.test(text)) return 'currentTitle';
  if (/years?.* exp|experience.* years?/i.test(text)) return 'yearsOfExperience';
  if (/authoriz|eligib|work.* permit/i.test(text)) return 'workAuthorization';
  if (/sponsor/i.test(text)) return 'requiresSponsorship';
  if (/salary|compensation|pay/i.test(text)) return 'salaryExpectation';

  // Long-text fields
  if (/cover.?letter|motivation|introduction/i.test(text)) return 'coverLetterText';
  if (/resume|cv/i.test(text) && el instanceof HTMLTextAreaElement) return 'resumeText';

  return null;
}

/**
 * Returns a normalised field type for a given input/textarea/select element.
 */
function inferFieldType(
  el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
): DetectedField['fieldType'] {
  if (el instanceof HTMLTextAreaElement) return 'textarea';
  if (el instanceof HTMLSelectElement) return 'select';
  if (el instanceof HTMLInputElement) {
    switch (el.type) {
      case 'email':
        return 'email';
      case 'tel':
        return 'tel';
      case 'file':
        return 'file';
      case 'text':
      case 'url':
      case 'search':
      case 'number':
        return 'text';
      default:
        return 'other';
    }
  }
  return 'other';
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Detects whether the current page contains a job application form on LinkedIn or Lever.
 *
 * This is the primary entry point called from content.ts when the FAB Autofill
 * button is clicked or when the page first loads on a matching domain.
 */
export function detectJobApplication(): DetectionResult {
  const url = window.location.href;

  if (isLinkedInUrl(url)) {
    const container = findLinkedInFormContainer();
    if (!container) {
      return { platform: 'linkedin', isJobApplication: false, fields: [] };
    }
    const fields = detectLinkedInFields(container);
    return { platform: 'linkedin', isJobApplication: fields.length > 0, fields };
  }

  if (isLeverUrl(url)) {
    const container = findLeverFormContainer();
    if (!container) {
      return { platform: 'lever', isJobApplication: false, fields: [] };
    }
    const fields = detectLeverFields(container);
    return { platform: 'lever', isJobApplication: fields.length > 0, fields };
  }

  return { platform: null, isJobApplication: false, fields: [] };
}
