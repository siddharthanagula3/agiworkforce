/**
 * LinkedIn-specific form field selectors and helpers.
 *
 * LinkedIn uses React-rendered forms with a combination of:
 * - Stable `id` attributes prefixed with "jobs-apply-" or containing "artdeco-"
 * - `aria-label` / `aria-labelledby` on inputs
 * - Wrapping `.jobs-easy-apply-form-section__grouping` divs
 *
 * Because LinkedIn's DOM changes frequently we use layered fallback strategies
 * (ID → aria-label → data attribute → placeholder → surrounding label text).
 */

import type { DetectedField } from './detector';

// ─── Selector constants ───────────────────────────────────────────────────────

/**
 * A prioritised list of selectors for each profile key on LinkedIn.
 * The filler tries each one in order and stops at the first match.
 */
export const LINKEDIN_SELECTORS: Record<string, string[]> = {
  firstName: [
    'input[name="firstName"]',
    'input[id*="first-name"]',
    'input[id*="firstName"]',
    'input[aria-label*="First name" i]',
    'input[aria-label*="First Name" i]',
    'input[placeholder*="First name" i]',
  ],
  lastName: [
    'input[name="lastName"]',
    'input[id*="last-name"]',
    'input[id*="lastName"]',
    'input[aria-label*="Last name" i]',
    'input[aria-label*="Last Name" i]',
    'input[placeholder*="Last name" i]',
  ],
  email: [
    'input[name="email"]',
    'input[type="email"]',
    'input[id*="email"]',
    'input[aria-label*="Email" i]',
    'input[placeholder*="Email" i]',
  ],
  phone: [
    'input[name="phoneNumber"]',
    'input[type="tel"]',
    'input[id*="phone"]',
    'input[aria-label*="Phone" i]',
    'input[aria-label*="Mobile" i]',
    'input[placeholder*="Phone" i]',
  ],
  linkedinUrl: [
    'input[name="linkedInUrl"]',
    'input[id*="linkedin-url"]',
    'input[aria-label*="LinkedIn" i]',
    'input[placeholder*="linkedin.com" i]',
  ],
  githubUrl: [
    'input[name="githubUrl"]',
    'input[aria-label*="GitHub" i]',
    'input[aria-label*="Github" i]',
    'input[placeholder*="github.com" i]',
  ],
  portfolioUrl: [
    'input[name="portfolioUrl"]',
    'input[name="websiteUrl"]',
    'input[aria-label*="Portfolio" i]',
    'input[aria-label*="Website" i]',
    'input[placeholder*="portfolio" i]',
    'input[placeholder*="website" i]',
  ],
  currentTitle: [
    'input[name="jobTitle"]',
    'input[name="currentTitle"]',
    'input[id*="job-title"]',
    'input[aria-label*="Current title" i]',
    'input[aria-label*="Job title" i]',
    'input[placeholder*="title" i]',
  ],
  currentCompany: [
    'input[name="company"]',
    'input[name="currentCompany"]',
    'input[id*="company"]',
    'input[aria-label*="Company" i]',
    'input[aria-label*="Employer" i]',
    'input[placeholder*="company" i]',
  ],
  locationCity: [
    'input[name="city"]',
    'input[id*="city"]',
    'input[aria-label*="City" i]',
    'input[placeholder*="city" i]',
  ],
  salaryExpectation: [
    'input[name="salary"]',
    'input[id*="salary"]',
    'input[aria-label*="Salary" i]',
    'input[aria-label*="Expected" i]',
    'input[placeholder*="salary" i]',
  ],
  yearsOfExperience: [
    'input[name="yearsOfExperience"]',
    'input[id*="years-of-experience"]',
    'input[aria-label*="Years of experience" i]',
    'input[aria-label*="Experience" i]',
  ],
  coverLetterText: [
    'textarea[name="coverLetter"]',
    'textarea[id*="cover-letter"]',
    'textarea[aria-label*="Cover letter" i]',
    'textarea[placeholder*="cover letter" i]',
    'textarea[placeholder*="Cover Letter" i]',
  ],
  resumeText: [
    'textarea[name="resume"]',
    'textarea[aria-label*="Resume" i]',
    'textarea[placeholder*="resume" i]',
    'textarea[aria-label*="CV" i]',
  ],
  workAuthorization: [
    'select[name="workAuthorization"]',
    'select[id*="work-authorization"]',
    'select[aria-label*="Work authorization" i]',
    'select[aria-label*="authorized to work" i]',
  ],
  requiresSponsorship: [
    'select[name="requiresSponsorship"]',
    'select[id*="sponsorship"]',
    'select[aria-label*="Sponsorship" i]',
    'select[aria-label*="visa sponsorship" i]',
  ],
  // File inputs
  'files.resume': [
    'input[type="file"][name*="resume"]',
    'input[type="file"][aria-label*="Resume" i]',
    'input[type="file"][aria-label*="CV" i]',
    'input[type="file"]',
  ],
  'files.coverLetter': [
    'input[type="file"][name*="coverLetter"]',
    'input[type="file"][name*="cover"]',
    'input[type="file"][aria-label*="Cover letter" i]',
  ],
};

// ─── Easy Apply modal helpers ─────────────────────────────────────────────────

/**
 * The Easy Apply flow is paginated.  This returns the selector for the
 * "Next" / "Review" / "Submit" button so callers can advance the modal.
 *
 * NOTE: We never auto-advance — this is provided only so the UI can prompt
 * the user to review before clicking themselves.
 */
export const LINKEDIN_EASY_APPLY_NEXT_BUTTON_SELECTOR =
  'button[aria-label*="Continue to next step" i],' +
  'button[aria-label*="Next" i][data-easy-apply-next-btn],' +
  '.jobs-easy-apply-modal button[type="submit"],' +
  '.artdeco-button--primary[data-easy-apply-next-btn]';

/**
 * Detects whether the Easy Apply modal is currently open and on a form step
 * (as opposed to the upload-resume step or the review step).
 */
export function isLinkedInEasyApplyModalOpen(): boolean {
  const modal =
    document.querySelector('.jobs-easy-apply-modal') ??
    document.querySelector('[aria-label*="Apply" i][role="dialog"]') ??
    document.querySelector('.artdeco-modal--layer-default');
  return modal !== null;
}

/**
 * Returns the current step index (1-based) of the LinkedIn Easy Apply modal,
 * or null when the modal is not open or the step counter is not found.
 */
export function getLinkedInEasyApplyStep(): number | null {
  const progress =
    document.querySelector('.jobs-easy-apply-header__progress-count') ??
    document.querySelector('[aria-label*="Step" i]');
  if (!progress) return null;
  const text = progress.textContent ?? '';
  const match = /(\d+)\s*\//.exec(text);
  return match?.[1] !== undefined ? parseInt(match[1], 10) : null;
}

// ─── Selector resolution ──────────────────────────────────────────────────────

/**
 * Given a profile key, finds the first DOM element in the page that matches
 * any selector in the priority list for that key.
 *
 * Returns the matched element and the selector that found it, or null.
 */
export function resolveLinkedInSelector(
  key: string,
): { element: HTMLElement; selector: string } | null {
  const selectors = LINKEDIN_SELECTORS[key] ?? [];
  for (const sel of selectors) {
    const el = document.querySelector<HTMLElement>(sel);
    if (el) return { element: el, selector: sel };
  }
  return null;
}

/**
 * Collects all currently resolvable LinkedIn fields from the active page.
 * Used to surface a preview of what will be filled before the user confirms.
 */
export function collectResolvableLinkedInFields(): DetectedField[] {
  const result: DetectedField[] = [];
  for (const [key, selectors] of Object.entries(LINKEDIN_SELECTORS)) {
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) {
        const fieldType =
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
        break; // only one entry per key
      }
    }
  }
  return result;
}
