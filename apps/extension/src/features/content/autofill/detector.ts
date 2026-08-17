export type DetectedPlatform = 'linkedin' | 'lever' | 'greenhouse' | 'ashby' | null;

export interface DetectedField {
  key: string;
  selector: string;
  label: string;
  fieldType: 'text' | 'email' | 'tel' | 'textarea' | 'select' | 'file' | 'other';
  required: boolean;
}

export interface DetectionResult {
  platform: DetectedPlatform;
  isJobApplication: boolean;
  fields: DetectedField[];
}

import {
  isGreenhouseUrl,
  findGreenhouseFormContainer,
  collectResolvableGreenhouseFields,
} from './greenhouse';
import { isAshbyUrl, findAshbyFormContainer, collectResolvableAshbyFields } from './ashby';
import { matchesAtsHostRules, type AtsHostRule } from './hosts';

function cssEscapeIdent(value: string): string {
  const g = globalThis as { CSS?: { escape?: (v: string) => string } };
  if (g.CSS && typeof g.CSS.escape === 'function') return g.CSS.escape(value);
  return value.replace(/[^a-zA-Z0-9_-]/g, (ch) => `\\${ch}`);
}

export function uniqueCssSelector(el: Element): string {
  const segments: string[] = [];
  let node: Element | null = el;
  while (node && node.nodeType === Node.ELEMENT_NODE && node !== document.documentElement) {
    if (node.id) {
      segments.unshift(`#${cssEscapeIdent(node.id)}`);
      return segments.join(' > ');
    }
    const parent: Element | null = node.parentElement;
    if (!parent) {
      segments.unshift(node.tagName.toLowerCase());
      break;
    }
    const index = Array.prototype.indexOf.call(parent.children, node) + 1;
    segments.unshift(`${node.tagName.toLowerCase()}:nth-child(${index})`);
    node = parent;
  }
  return segments.join(' > ');
}

const LINKEDIN_HOST_RULES: AtsHostRule[] = [{ host: 'linkedin.com', path: /^\/jobs?\// }];

export function isLinkedInUrl(url: string): boolean {
  return matchesAtsHostRules(url, LINKEDIN_HOST_RULES);
}

const LEVER_HOST_RULES: AtsHostRule[] = [
  { host: 'jobs.lever.co' },
  { host: 'app.lever.co', path: /\/apply/ },
];

export function isLeverUrl(url: string): boolean {
  return matchesAtsHostRules(url, LEVER_HOST_RULES);
}

function findLinkedInFormContainer(): Element | null {
  const modalSelectors = [
    '.jobs-easy-apply-modal',
    '.jobs-apply-modal',
    '[data-test-modal-id="easy-apply-modal"]',
    '.artdeco-modal--layer-default',
    '.jobs-easy-apply-content',
    'div[aria-label*="Apply"]',
    'div[aria-label*="apply"]',
  ];

  for (const sel of modalSelectors) {
    const el = document.querySelector(sel);
    if (el) return el;
  }

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

function detectLinkedInFields(container: Element): DetectedField[] {
  const fields: DetectedField[] = [];
  const seen = new Set<string>();

  function selectorFor(el: Element): string {
    if (el.id) return `#${CSS.escape(el.id)}`;
    const name = el.getAttribute('name');
    if (name) return `[name="${CSS.escape(name)}"]`;
    const testId = el.getAttribute('data-test-text-entity-list-form-input');
    if (testId) return `[data-test-text-entity-list-form-input="${CSS.escape(testId)}"]`;
    return uniqueCssSelector(el);
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

function findLeverFormContainer(): Element | null {
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

function getLabelForElement(
  el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
  container: Element,
): string {
  if (el.id) {
    const label = container.querySelector<HTMLLabelElement>(`label[for="${CSS.escape(el.id)}"]`);
    if (label) return label.textContent?.trim() ?? '';
  }

  const ariaLabel = el.getAttribute('aria-label');
  if (ariaLabel) return ariaLabel.trim();

  const labelledBy = el.getAttribute('aria-labelledby');
  if (labelledBy) {
    const refEl = document.getElementById(labelledBy);
    if (refEl) return refEl.textContent?.trim() ?? '';
  }

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

  if ('placeholder' in el && el.placeholder) return el.placeholder.trim();

  const parent = el.parentElement;
  if (parent) {
    const prevLabel = parent.querySelector('label, .label, .field-label, .form-label, legend');
    if (prevLabel) return prevLabel.textContent?.trim() ?? '';
  }

  return el.name ?? '';
}

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

  if (el instanceof HTMLInputElement && el.type === 'file') {
    if (/cover.?letter/i.test(text)) return 'files.coverLetter';
    if (/resume|cv|curriculum/i.test(text)) return 'files.resume';
    return null;
  }

  if (/first.?name|given.?name/i.test(text)) return 'firstName';
  if (/last.?name|surname|family.?name/i.test(text)) return 'lastName';
  if (/^name$|full.?name|your name/i.test(text)) return 'fullName';

  if (/e.?mail/i.test(text)) return 'email';
  if (/phone|mobile|cell/i.test(text)) return 'phone';

  if (/city/i.test(text)) return 'locationCity';
  if (/state|province/i.test(text)) return 'locationState';
  if (/country/i.test(text)) return 'locationCountry';

  if (/linkedin/i.test(text)) return 'linkedinUrl';
  if (/github/i.test(text)) return 'githubUrl';
  if (/portfolio|personal.?site|website/i.test(text)) return 'portfolioUrl';

  if (/company|employer|organization/i.test(text)) return 'currentCompany';
  if (/title|position|role/i.test(text)) return 'currentTitle';
  if (/years?.* exp|experience.* years?/i.test(text)) return 'yearsOfExperience';
  if (/authoriz|eligib|work.* permit/i.test(text)) return 'workAuthorization';
  if (/sponsor/i.test(text)) return 'requiresSponsorship';
  if (/salary|compensation|pay/i.test(text)) return 'salaryExpectation';

  if (/cover.?letter|motivation|introduction/i.test(text)) return 'coverLetterText';
  if (/resume|cv/i.test(text) && el instanceof HTMLTextAreaElement) return 'resumeText';

  return null;
}

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

  if (isGreenhouseUrl(url)) {
    const container = findGreenhouseFormContainer();
    if (!container) {
      return { platform: 'greenhouse', isJobApplication: false, fields: [] };
    }
    const fields = collectResolvableGreenhouseFields();
    return { platform: 'greenhouse', isJobApplication: fields.length > 0, fields };
  }

  if (isAshbyUrl(url)) {
    const container = findAshbyFormContainer();
    if (!container) {
      return { platform: 'ashby', isJobApplication: false, fields: [] };
    }
    const fields = collectResolvableAshbyFields();
    return { platform: 'ashby', isJobApplication: fields.length > 0, fields };
  }

  return { platform: null, isJobApplication: false, fields: [] };
}
