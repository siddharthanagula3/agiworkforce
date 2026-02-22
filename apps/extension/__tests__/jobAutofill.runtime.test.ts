import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { detectPlatformFromUrl, runPlatformJobAutofill } from '../src/jobAutofill.runtime.js';

const BASE_PROFILE = {
  firstName: 'Ada',
  email: 'ada@example.com',
};

function buildRect() {
  return {
    width: 200,
    height: 32,
    top: 0,
    right: 200,
    bottom: 32,
    left: 0,
    x: 0,
    y: 0,
    toJSON() {
      return this;
    },
  };
}

const originalGetBoundingClientRect = Element.prototype.getBoundingClientRect;

beforeAll(() => {
  Object.defineProperty(Element.prototype, 'getBoundingClientRect', {
    configurable: true,
    value: buildRect,
  });
});

afterAll(() => {
  Object.defineProperty(Element.prototype, 'getBoundingClientRect', {
    configurable: true,
    value: originalGetBoundingClientRect,
  });
});

beforeEach(() => {
  document.body.innerHTML = '';
  window.history.replaceState({}, '', '/');
});

async function runAutofill(html, path, profile = BASE_PROFILE, options = {}) {
  document.body.innerHTML = html;
  window.history.replaceState({}, '', path);
  return runPlatformJobAutofill(profile, { delayMs: 0, ...options });
}

describe('runPlatformJobAutofill runtime', () => {
  it('detects greenhouse and workday URLs with broader domain coverage', () => {
    expect(detectPlatformFromUrl('https://boards.greenhouse.io/acme/jobs/123')).toBe('greenhouse');
    expect(
      detectPlatformFromUrl('https://job-boards.greenhouse.io/acme/jobs/123/application'),
    ).toBe('greenhouse');
    expect(
      detectPlatformFromUrl('https://company.example.com/careers?gh_jid=123456&gh_src=abc'),
    ).toBe('greenhouse');

    expect(
      detectPlatformFromUrl(
        'https://acme.wd5.myworkdayjobs.com/en-US/recruiting/acme/careers/job/123',
      ),
    ).toBe('workday');
    expect(
      detectPlatformFromUrl('https://acme.workdayjobs.com/en-US/careers/Software-Engineer_R-12345'),
    ).toBe('workday');
    expect(detectPlatformFromUrl('https://wd3.myworkday.com/acme/login.htmld')).toBe('workday');
  });

  it('detects greenhouse from URL and fills known fields', async () => {
    const result = await runAutofill(
      `
        <form id="application_form">
          <label for="first_name">First Name</label>
          <input id="first_name" name="first_name" />
          <label for="email">Email</label>
          <input id="email" name="email" type="email" required />
        </form>
      `,
      '/job_app',
    );

    const firstNameInput = document.getElementById('first_name');
    const emailInput = document.getElementById('email');

    expect(result.success).toBe(true);
    expect(result.platform).toBe('greenhouse');
    expect(result.filledCount).toBeGreaterThanOrEqual(2);
    expect(result.missingRequiredFields).toEqual([]);
    expect(firstNameInput.value).toBe('Ada');
    expect(emailInput.value).toBe('ada@example.com');
  });

  it('detects workday from URL host and fills fields in synthetic DOM', async () => {
    const result = await runAutofill(
      `
        <form>
          <div data-automation-id="candidate-first-name">
            <label for="wd-first-name">First Name</label>
            <input id="wd-first-name" name="firstName" />
          </div>
          <div data-automation-id="candidate-email">
            <label for="wd-email">Email</label>
            <input id="wd-email" name="email" type="email" required />
          </div>
        </form>
      `,
      '/en-US/careers/job/software-engineer',
    );

    const firstNameInput = document.getElementById('wd-first-name');
    const emailInput = document.getElementById('wd-email');

    expect(result.success).toBe(true);
    expect(result.platform).toBe('workday');
    expect(result.filledCount).toBeGreaterThanOrEqual(2);
    expect(result.missingRequiredFields).toEqual([]);
    expect(firstNameInput.value).toBe('Ada');
    expect(emailInput.value).toBe('ada@example.com');
  });

  it('keeps success true while reporting unresolved required fields', async () => {
    const result = await runAutofill(
      `
        <form id="application_form">
          <label for="first_name">First Name</label>
          <input id="first_name" name="first_name" />
          <label for="portfolio_url">Portfolio URL</label>
          <input id="portfolio_url" name="portfolio_url" required />
        </form>
      `,
      '/job_app',
      { firstName: 'Ada' },
    );

    expect(result.success).toBe(true);
    expect(result.platform).toBe('greenhouse');
    expect(result.filledCount).toBe(1);
    expect(result.missingRequiredFields).toContain('Portfolio URL');
  });

  it('fills required yes/no radio groups using boolean profile values', async () => {
    const result = await runAutofill(
      `
        <form>
          <fieldset>
            <legend>Will you require visa sponsorship?</legend>
            <label for="sponsor-yes">Yes</label>
            <input id="sponsor-yes" type="radio" name="requires_sponsorship" value="Yes" required />
            <label for="sponsor-no">No</label>
            <input id="sponsor-no" type="radio" name="requires_sponsorship" value="No" required />
          </fieldset>
        </form>
      `,
      '/en-US/careers/job/software-engineer',
      { ...BASE_PROFILE, requiresSponsorship: false },
    );

    const yesRadio = document.getElementById('sponsor-yes') as HTMLInputElement;
    const noRadio = document.getElementById('sponsor-no') as HTMLInputElement;

    expect(result.success).toBe(true);
    expect(result.platform).toBe('workday');
    expect(result.missingRequiredFields).toEqual([]);
    expect(yesRadio.checked).toBe(false);
    expect(noRadio.checked).toBe(true);
  });

  it('fills hidden styled radio groups when labels are present', async () => {
    const result = await runAutofill(
      `
        <form>
          <fieldset>
            <legend>Will you require visa sponsorship?</legend>
            <label for="hidden-sponsor-yes">Yes</label>
            <input id="hidden-sponsor-yes" style="opacity:0" type="radio" name="requires_sponsorship_hidden" value="Yes" required />
            <label for="hidden-sponsor-no">No</label>
            <input id="hidden-sponsor-no" style="opacity:0" type="radio" name="requires_sponsorship_hidden" value="No" required />
          </fieldset>
        </form>
      `,
      '/en-US/careers/job/software-engineer',
      { ...BASE_PROFILE, requiresSponsorship: false },
    );

    const yesRadio = document.getElementById('hidden-sponsor-yes') as HTMLInputElement;
    const noRadio = document.getElementById('hidden-sponsor-no') as HTMLInputElement;

    expect(result.success).toBe(true);
    expect(result.platform).toBe('workday');
    expect(result.missingRequiredFields).toEqual([]);
    expect(yesRadio.checked).toBe(false);
    expect(noRadio.checked).toBe(true);
  });

  it('advances multi-step workday flow and submits when autoSubmit is enabled', async () => {
    document.body.innerHTML = `
      <form id="wd-form-step-1">
        <div data-automation-id="candidate-first-name">
          <label for="wd-next-first-name">First Name</label>
          <input id="wd-next-first-name" name="firstName" />
        </div>
        <button type="button" data-automation-id="bottom-navigation-next-button">Next</button>
      </form>
    `;
    window.history.replaceState({}, '', '/en-US/careers/job/software-engineer');

    const nextButton = document.querySelector(
      'button[data-automation-id="bottom-navigation-next-button"]',
    ) as HTMLButtonElement;

    nextButton.addEventListener('click', () => {
      document.body.innerHTML = `
        <form id="wd-form-step-2">
          <div data-automation-id="candidate-email">
            <label for="wd-submit-email">Email</label>
            <input id="wd-submit-email" name="email" type="email" required />
          </div>
          <button type="button" data-automation-id="bottom-navigation-submit-button">Submit</button>
        </form>
      `;

      const submitButton = document.querySelector(
        'button[data-automation-id="bottom-navigation-submit-button"]',
      ) as HTMLButtonElement;
      submitButton.addEventListener('click', () => {
        document.body.innerHTML = '<main>Thank you for applying</main>';
      });
    });

    const result = await runPlatformJobAutofill(
      BASE_PROFILE,
      { autoSubmit: true, delayMs: 0, maxSubmitSteps: 3 },
      20_000,
    );

    expect(result.success).toBe(true);
    expect(result.platform).toBe('workday');
    expect(result.submitted).toBe(true);
    expect(result.stepsAdvanced).toBeGreaterThanOrEqual(2);
    expect(result.missingRequiredFields).toEqual([]);
  });

  it('does not treat Workday start-application buttons as final submit', async () => {
    document.body.innerHTML = `
      <main>
        <button type="button">Apply</button>
      </main>
    `;
    window.history.replaceState({}, '', '/en-US/careers/details/records-manager_REQ205805');

    const detailsApplyButton = document.querySelector('button') as HTMLButtonElement;
    detailsApplyButton.addEventListener('click', () => {
      document.body.innerHTML = `
        <div role="dialog" aria-label="Start Your Application">
          <button type="button">Apply Manually</button>
        </div>
      `;

      const applyManuallyButton = document.querySelector('button') as HTMLButtonElement;
      applyManuallyButton.addEventListener('click', () => {
        document.body.innerHTML = `
          <form>
            <div data-automation-id="candidate-first-name">
              <label for="wd-manual-first-name">First Name</label>
              <input id="wd-manual-first-name" name="firstName" required />
            </div>
            <button type="button" data-automation-id="bottom-navigation-submit-button">Submit</button>
          </form>
        `;

        const submitButton = document.querySelector(
          'button[data-automation-id="bottom-navigation-submit-button"]',
        ) as HTMLButtonElement;
        submitButton.addEventListener('click', () => {
          document.body.innerHTML = '<main>Application submitted</main>';
        });
      });
    });

    const result = await runPlatformJobAutofill(
      BASE_PROFILE,
      { autoSubmit: true, delayMs: 0, maxSubmitSteps: 5 },
      20_000,
    );

    expect(result.success).toBe(true);
    expect(result.platform).toBe('workday');
    expect(result.submitted).toBe(true);
    expect(result.stepsAdvanced).toBeGreaterThanOrEqual(3);
    expect(result.missingRequiredFields).toEqual([]);
  });
});
