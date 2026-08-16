
import type { DetectedField } from './detector';

const ASHBY_URL_PATTERNS = [
  /jobs\.ashbyhq\.com\//i,
  /ashbyhq\.com\/.*\/jobs\//i,
  /app\.ashbyhq\.com\//i,
];

export function isAshbyUrl(url: string): boolean {
  return ASHBY_URL_PATTERNS.some((re) => re.test(url));
}

export async function awaitAshbyFormReady(timeoutMs = 4000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const el =
      document.querySelector('[name^="_systemfield_"]') ??
      document.querySelector('[data-testid*="application"]') ??
      document.querySelector('form[data-ashby-form]');
    if (el) return true;
    await new Promise<void>((r) => setTimeout(r, 150));
  }
  return false;
}

export const ASHBY_SELECTORS: Record<string, string[]> = {
  firstName: [
    '[name="_systemfield_first_name"]',
    '[name="_systemfield_firstName"]',
    'input[autocomplete="given-name"]',
    'input[aria-label*="First name" i]',
    'input[placeholder*="First name" i]',
  ],
  lastName: [
    '[name="_systemfield_last_name"]',
    '[name="_systemfield_lastName"]',
    'input[autocomplete="family-name"]',
    'input[aria-label*="Last name" i]',
    'input[placeholder*="Last name" i]',
  ],
  fullName: [
    '[name="_systemfield_name"]',
    '[name="_systemfield_full_name"]',
    'input[autocomplete="name"]',
    'input[aria-label*="Full name" i]',
    'input[aria-label="Name" i]',
    'input[placeholder="Name"]',
    'input[placeholder*="Full name" i]',
  ],
  email: [
    '[name="_systemfield_email"]',
    'input[type="email"]',
    'input[autocomplete="email"]',
    'input[aria-label*="Email" i]',
  ],
  phone: [
    '[name="_systemfield_phone"]',
    'input[type="tel"]',
    'input[autocomplete="tel"]',
    'input[aria-label*="Phone" i]',
  ],
  linkedinUrl: [
    '[name="_systemfield_linkedin"]',
    '[name="_systemfield_linkedinUrl"]',
    'input[aria-label*="LinkedIn" i]',
    'input[placeholder*="linkedin.com" i]',
  ],
  githubUrl: [
    '[name="_systemfield_github"]',
    '[name="_systemfield_githubUrl"]',
    'input[aria-label*="GitHub" i]',
    'input[placeholder*="github.com" i]',
  ],
  portfolioUrl: [
    '[name="_systemfield_website"]',
    '[name="_systemfield_portfolioUrl"]',
    '[name="_systemfield_portfolio"]',
    'input[aria-label*="Portfolio" i]',
    'input[aria-label*="Website" i]',
    'input[placeholder*="portfolio" i]',
  ],
  coverLetterText: [
    '[name="_systemfield_cover_letter"]',
    '[name="_systemfield_coverLetter"]',
    'textarea[aria-label*="Cover letter" i]',
    'textarea[placeholder*="cover letter" i]',
  ],
  locationCity: [
    '[name="_systemfield_location"]',
    'input[aria-label*="Location" i]',
    'input[aria-label*="City" i]',
    'input[placeholder*="location" i]',
  ],
  'files.resume': ['input[type="file"][name*="resume"]', 'input[type="file"]'],
  'files.coverLetter': ['input[type="file"][name*="cover"]'],
};

export const ASHBY_ALWAYS_ESCALATE_KEYS = new Set<string>([
  'locationCity', // async typeahead
  'files.resume', // file picker
  'files.coverLetter', // file picker
]);

export function resolveAshbySelector(
  key: string,
): { element: HTMLElement; selector: string } | null {
  const selectors = ASHBY_SELECTORS[key] ?? [];
  for (const sel of selectors) {
    const el = document.querySelector<HTMLElement>(sel);
    if (el) return { element: el, selector: sel };
  }
  return null;
}

export function collectResolvableAshbyFields(): DetectedField[] {
  const result: DetectedField[] = [];
  for (const [key, selectors] of Object.entries(ASHBY_SELECTORS)) {
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

export interface AshbyCustomField {
  key: string;
  selector: string;
  label: string;
  fieldType: DetectedField['fieldType'];
}

export function detectAshbyCustomFields(container: Element): AshbyCustomField[] {
  const results: AshbyCustomField[] = [];
  const seen = new Set<string>();

  const fieldEls = Array.from(
    container.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
      'input[name^="_questionId_"], textarea[name^="_questionId_"], select[name^="_questionId_"]',
    ),
  );

  for (const el of fieldEls) {
    const name = el.getAttribute('name') ?? '';
    const sel = `[name="${CSS.escape(name)}"]`;
    if (!sel || seen.has(sel)) continue;
    seen.add(sel);

    let label = el.getAttribute('aria-label') ?? '';
    if (!label && el.id) {
      const labelEl = container.querySelector<HTMLLabelElement>(
        `label[for="${CSS.escape(el.id)}"]`,
      );
      if (labelEl) label = labelEl.textContent?.trim() ?? '';
    }
    if (!label) label = el.getAttribute('placeholder') ?? name;

    const sanitised = label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '');
    const key = sanitised ? `customAnswers.${sanitised}` : `customAnswers.${name}`;

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

export function findAshbyFormContainer(): Element | null {
  const selectors = [
    'form[data-ashby-form]',
    '[data-testid="application-form"]',
    '.ashby-application-form',
    'form',
  ];
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el) {
      if (sel === 'form') {
        const hasAshby =
          el.querySelector('[name^="_systemfield_"]') !== null ||
          el.querySelector('[name^="_questionId_"]') !== null;
        if (!hasAshby) continue;
      }
      return el;
    }
  }
  return null;
}
