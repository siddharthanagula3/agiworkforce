import type { DetectedField } from './detector';
import { matchesAtsHostRules, type AtsHostRule } from './hosts';

const GREENHOUSE_HOST_RULES: AtsHostRule[] = [
  { host: 'boards.greenhouse.io' },
  { host: 'job-boards.greenhouse.io' },
  { host: 'greenhouse.io', path: /\/jobs\// },
  { host: 'grnh.se' },
];

export function isGreenhouseUrl(url: string): boolean {
  return matchesAtsHostRules(url, GREENHOUSE_HOST_RULES);
}

export const GREENHOUSE_SELECTORS: Record<string, string[]> = {
  firstName: [
    'input[name="job_application[first_name]"]',
    '#first_name',
    'input[id="first_name"]',
    'input[autocomplete="given-name"]',
    'input[aria-label*="First name" i]',
    'input[placeholder*="First name" i]',
  ],
  lastName: [
    'input[name="job_application[last_name]"]',
    '#last_name',
    'input[id="last_name"]',
    'input[autocomplete="family-name"]',
    'input[aria-label*="Last name" i]',
    'input[placeholder*="Last name" i]',
  ],
  email: [
    'input[name="job_application[email]"]',
    '#email',
    'input[type="email"]',
    'input[autocomplete="email"]',
    'input[aria-label*="Email" i]',
  ],
  phone: [
    'input[name="job_application[phone]"]',
    '#phone',
    'input[type="tel"]',
    'input[autocomplete="tel"]',
    'input[aria-label*="Phone" i]',
  ],
  linkedinUrl: [
    'input[name="job_application[urls][LinkedIn]"]',
    'input[id*="linkedin"]',
    'input[aria-label*="LinkedIn" i]',
    'input[placeholder*="linkedin.com" i]',
  ],
  githubUrl: [
    'input[name="job_application[urls][GitHub]"]',
    'input[id*="github"]',
    'input[aria-label*="GitHub" i]',
    'input[placeholder*="github.com" i]',
  ],
  portfolioUrl: [
    'input[name="job_application[urls][Portfolio]"]',
    'input[name="job_application[urls][Other]"]',
    'input[id*="portfolio"]',
    'input[id*="website"]',
    'input[aria-label*="Portfolio" i]',
    'input[aria-label*="Website" i]',
  ],
  coverLetterText: [
    'textarea[name="job_application[cover_letter]"]',
    '#cover_letter',
    'textarea[id*="cover"]',
    'textarea[aria-label*="Cover letter" i]',
    'textarea[placeholder*="cover letter" i]',
  ],
  locationCity: [
    'input[name="job_application[location]"]',
    '#location',
    'input[id*="location"]',
    'input[aria-label*="Location" i]',
    'input[aria-label*="City" i]',
    'input[placeholder*="city" i]',
  ],
  currentCompany: [
    'input[name="job_application[company]"]',
    'input[id*="company"]',
    'input[aria-label*="Company" i]',
    'input[aria-label*="Employer" i]',
    'input[placeholder*="company" i]',
  ],
  currentTitle: [
    'input[name="job_application[title]"]',
    'input[id*="title"]',
    'input[aria-label*="Title" i]',
    'input[aria-label*="Position" i]',
    'input[placeholder*="title" i]',
  ],
  'files.resume': [
    'input[type="file"][name="resume"]',
    'input[type="file"][name="job_application[resume]"]',
    'input[type="file"][id*="resume"]',
    'input[type="file"]',
  ],
  'files.coverLetter': [
    'input[type="file"][name="cover_letter"]',
    'input[type="file"][name*="cover"]',
  ],
};

export function resolveGreenhouseSelector(
  key: string,
): { element: HTMLElement; selector: string } | null {
  const selectors = GREENHOUSE_SELECTORS[key] ?? [];
  for (const sel of selectors) {
    const el = document.querySelector<HTMLElement>(sel);
    if (el) return { element: el, selector: sel };
  }
  return null;
}

export function collectResolvableGreenhouseFields(): DetectedField[] {
  const result: DetectedField[] = [];
  for (const [key, selectors] of Object.entries(GREENHOUSE_SELECTORS)) {
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

export function findGreenhouseFormContainer(): Element | null {
  const selectors = [
    '#application_form',
    '.application_form',
    'form[action*="greenhouse"]',
    'form[id*="application"]',
    'form[class*="application"]',
    '[data-qa="application-form"]',
    'form',
  ];
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el) return el;
  }
  return null;
}

export interface GreenhouseCustomField {
  key: string;
  selector: string;
  label: string;
  fieldType: DetectedField['fieldType'];
}

export function detectGreenhouseCustomFields(container: Element): GreenhouseCustomField[] {
  const results: GreenhouseCustomField[] = [];
  const seen = new Set<string>();

  const fieldEls = Array.from(
    container.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
      'input[name*="answers_attributes"], textarea[name*="answers_attributes"], select[name*="answers_attributes"]',
    ),
  );

  for (const el of fieldEls) {
    const sel = el.id
      ? `#${CSS.escape(el.id)}`
      : `[name="${CSS.escape(el.getAttribute('name') ?? '')}"]`;
    if (!sel || seen.has(sel)) continue;
    seen.add(sel);

    let label = el.getAttribute('aria-label') ?? '';
    if (!label && el.id) {
      const labelEl = container.querySelector<HTMLLabelElement>(
        `label[for="${CSS.escape(el.id)}"]`,
      );
      if (labelEl) label = labelEl.textContent?.trim() ?? '';
    }
    if (!label) label = el.getAttribute('placeholder') ?? el.name;

    const sanitised = label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '');
    const key = sanitised ? `customAnswers.${sanitised}` : `customAnswers.${el.name}`;

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
