import { waitForDesktopShell } from '../support/desktop-shell';
import { closeAnySettingsDialog, waitForSettingsReady } from '../support/close-settings';

const LOCALES: Array<{ code: string; nativeName: string }> = [
  { code: 'es', nativeName: 'Español' },
  { code: 'hi', nativeName: 'हिन्दी' },
  { code: 'ar', nativeName: 'العربية' },
  { code: 'de', nativeName: 'Deutsch' },
  { code: 'fr', nativeName: 'Français' },
  { code: 'it', nativeName: 'Italiano' },
  { code: 'ja', nativeName: '日本語' },
  { code: 'ko', nativeName: '한국어' },
  { code: 'pt', nativeName: 'Português' },
  { code: 'ru', nativeName: 'Русский' },
  { code: 'zh', nativeName: '中文' },
  { code: 'en', nativeName: 'English' },
];

const RAW_KEY_SHAPE = /^[a-z][a-zA-Z]*(\.[a-z][a-zA-Z0-9_]*)+$/;
const DOMAIN_LIKE = /\.(com|org|net|io|dev|app|ai|md|json|ts|tsx|js|rs|html|css|toml)$/i;

async function collectRawKeyText(): Promise<string[]> {
  return browser.execute(
    (shapeSource: string, domainSource: string) => {
      const shape = new RegExp(shapeSource);
      const domain = new RegExp(domainSource, 'i');
      const offenders = new Set<string>();
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const node = walker.currentNode;
        const parent = node.parentElement;
        if (!parent) continue;
        if (parent.closest('code, pre, script, style, textarea')) continue;
        const text = (node.textContent ?? '').trim();
        if (!text || text.length > 80) continue;
        if (shape.test(text) && !domain.test(text)) offenders.add(text);
      }
      for (const el of Array.from(document.querySelectorAll('[aria-label], [placeholder]'))) {
        for (const attr of ['aria-label', 'placeholder']) {
          const value = (el.getAttribute(attr) ?? '').trim();
          if (value && value.length <= 80 && shape.test(value) && !domain.test(value)) {
            offenders.add(`${attr}: ${value}`);
          }
        }
      }
      return Array.from(offenders).sort();
    },
    RAW_KEY_SHAPE.source,
    DOMAIN_LIKE.source,
  );
}

async function selectLanguage(nativeName: string, code: string): Promise<void> {
  const trigger = await $('#language');
  await trigger.waitForDisplayed({ timeout: 15_000 });
  await trigger.scrollIntoView();
  await trigger.click();

  const option = await $(`[role="option"]*=${nativeName}`);
  await option.waitForDisplayed({ timeout: 10_000 });
  await option.click();

  await browser.waitUntil(
    async () => (await browser.execute(() => document.documentElement.lang)) === code,
    {
      timeout: 15_000,
      interval: 200,
      timeoutMsg: `document language never became "${code}" after selecting ${nativeName}`,
    },
  );
}

describe('i18n · no raw translation keys reach the shell (product language switcher)', () => {
  before(async function () {
    this.timeout(120_000);
    await waitForDesktopShell();
    const useLocal = await $('button=Use Local Mode');
    if ((await useLocal.isExisting()) && (await useLocal.isDisplayed())) {
      await useLocal.click();
      await waitForDesktopShell();
    }
    await closeAnySettingsDialog();

    const gear = await $('button[aria-label="Settings"]');
    await gear.waitForDisplayed({ timeout: 15_000 });
    await gear.click();
    await waitForSettingsReady();
    // General is the default tab and hosts the Language select (#language).
  });

  after(async function () {
    this.timeout(60_000);
    await closeAnySettingsDialog();
  });

  for (const { code, nativeName } of LOCALES) {
    it(`renders in "${code}" without raw keys`, async function () {
      this.timeout(60_000);
      await selectLanguage(nativeName, code);

      const dir = await browser.execute(() => document.documentElement.dir);
      expect(dir).toBe(code === 'ar' ? 'rtl' : 'ltr');

      const offenders = await collectRawKeyText();
      expect(offenders).toEqual([]);
    });
  }
});
