import { expect, test, type Locator, type Page } from '@playwright/test';
import { PUBLIC_APPROVED_FADES } from './lib/public-mask-paint';

type Device = 'web' | 'desktop' | 'chrome' | 'panel' | 'editor' | 'terminal' | 'phone';
type Fade = 'every-width' | 'above-900' | 'never';
type Owner = { labelledBy: string } | { group: string } | { link: string };
type Caller = {
  owner: Owner;
  label: string;
  device: Device;
  fade: Fade;
  count?: number;
  shownHeightShare?: number;
};

const DESIGN_SIZE: Record<Device, readonly [number, number]> = {
  web: [1120, 700],
  desktop: [1120, 700],
  chrome: [1120, 700],
  editor: [1120, 700],
  terminal: [880, 550],
  panel: [400, 640],
  phone: [390, 844],
};
const DISCLOSURE = /^Authored example of /u;
const HERO_FADE_ABOVE_PX = 900;
const RATIO_TOLERANCE = 0.01;
const EDGE_TOLERANCE_PX = 0.5;
const SETTLE_TIMEOUT_MS = 5000;

const WEB = 'Authored example of the AGI Web chat interface';
const DESKTOP = 'Authored example of the AGI Desktop app window';
const CHROME = 'Authored example of the AGI side panel in Chrome';
const SIDE_PANEL = 'Authored example of the AGI Chrome side panel';
const EDITOR = 'Authored example of AGI in VS Code';
const TERMINAL = 'Authored example of the AGI CLI in a terminal';
const PHONE = 'Authored example of the AGI Mobile chat screen';
const APPROVAL = 'Authored example of a tool waiting for approval in a chat';
const FILE_EDIT = 'Authored example of a file edit waiting for approval in a chat';
const ARTIFACT = 'Authored example of an artifact open beside a chat';
const PROJECT = 'Authored example of a project page with its settings open';
const MEMORY = 'Authored example of the Memory settings in AGI Web';
const RESEARCH = 'Authored example of a research plan waiting to start';
const CONSOLE = 'Authored example of the AGI workspace console';
const COMPOSER = 'Authored example of the AGI Web composer';
const WORK_RUN = 'Authored example of an AGI Work run in AGI Web';

const hero = (labelledBy: string, label: string, device: Device = 'web'): Caller => ({
  owner: { labelledBy },
  label,
  device,
  fade: 'above-900',
});
const section = (labelledBy: string, label: string, device: Device = 'web'): Caller => ({
  owner: { labelledBy },
  label,
  device,
  fade: 'never',
});
const card = (link: string, label: string, device: Device = 'web'): Caller => ({
  owner: { link },
  label,
  device,
  fade: 'never',
});
const deck = (label: string, device: Device): Caller => ({
  owner: { group: 'The six surfaces' },
  label,
  device,
  fade: 'every-width',
});

const PLACEMENTS: Record<string, readonly Caller[]> = {
  '/': [
    deck(DESKTOP, 'desktop'),
    deck(WEB, 'web'),
    deck(TERMINAL, 'terminal'),
    deck(CHROME, 'chrome'),
    deck(EDITOR, 'editor'),
    deck(PHONE, 'phone'),
    {
      owner: { labelledBy: 'agi-fl-dev-title-for-developers' },
      label: TERMINAL,
      device: 'terminal',
      fade: 'every-width',
    },
    {
      owner: { labelledBy: 'agi-fl-dev-title-for-developers' },
      label: EDITOR,
      device: 'editor',
      fade: 'every-width',
      shownHeightShare: 0.64,
    },
    section('agi-fl-dev-title-approvals', FILE_EDIT),
  ],
  '/web': [
    hero('agi-web-title', WEB),
    card('/features/artifacts', ARTIFACT),
    card('/features/projects', PROJECT),
    card('/features/deep-research', RESEARCH),
    card('/features/agents', APPROVAL),
    card('/features/memory', MEMORY),
  ],
  '/desktop': [hero('agi-fl-desktop-hero-title', DESKTOP, 'desktop')],
  '/cli': [
    hero('agi-fl-cli-hero-title', TERMINAL, 'terminal'),
    section('agi-fl-dev-title-sandbox', TERMINAL, 'terminal'),
  ],
  '/chrome-extension': [hero('agi-fl-chrome-hero-title', SIDE_PANEL, 'panel')],
  '/vscode-extension': [
    hero('agi-vscode-hero-title', EDITOR, 'editor'),
    section('agi-fl-dev-title-agi-code', TERMINAL, 'terminal'),
  ],
  '/mobile': [
    hero('agi-mobile-hero-title', PHONE, 'phone'),
    {
      owner: { labelledBy: 'agi-mobile-local-title' },
      label: PHONE,
      device: 'phone',
      fade: 'every-width',
      count: 3,
    },
  ],
  '/features': [
    hero('agi-features-hero-title', WEB),
    section('feature-ai-chat-title', WEB),
    section('feature-artifacts-title', ARTIFACT),
    section('feature-projects-title', PROJECT),
    section('feature-memory-title', MEMORY),
    section('feature-deep-research-title', RESEARCH),
    section('feature-agents-title', APPROVAL),
  ],
  '/features/agents': [hero('agi-features-agents-title', APPROVAL)],
  '/features/artifacts': [hero('agi-features-artifacts-title', ARTIFACT)],
  '/features/deep-research': [
    hero('agi-features-research-title', RESEARCH),
    section('agi-features-research-plan-title', WEB),
  ],
  '/features/memory': [hero('agi-features-memory-title', MEMORY)],
  '/features/projects': [
    hero('agi-features-projects-title', PROJECT),
    section('agi-features-projects-templates-title', PROJECT),
  ],
  '/features/ai-chat': [
    hero('agi-features-ai-chat-title', WEB),
    section('agi-features-ai-chat-moment-title', COMPOSER),
  ],
  '/features/tools': [hero('agi-features-tools-title', APPROVAL)],
  '/enterprise': [
    hero('agi-enterprise-title', CONSOLE),
    section('agi-enterprise-identity-title', CONSOLE),
    section('agi-enterprise-policy-title', CONSOLE),
    section('agi-enterprise-audit-title', CONSOLE),
  ],
  '/teams': [hero('agi-teams-title', CONSOLE)],
  '/solutions': [
    hero('agi-solutions-title', WEB),
    card('/agi-code', EDITOR, 'editor'),
    card('/agi-work', APPROVAL),
    card('/business', CONSOLE),
    card('/use-cases', PROJECT),
  ],
  '/agi-work': [hero('agi-work-hero-title', WORK_RUN)],
  '/agi-code': [
    {
      owner: { labelledBy: 'agi-fl-surfaces-title' },
      label: TERMINAL,
      device: 'terminal',
      fade: 'every-width',
    },
    {
      owner: { labelledBy: 'agi-fl-surfaces-title' },
      label: EDITOR,
      device: 'editor',
      fade: 'every-width',
    },
    section('agi-fl-dev-title-local-first', TERMINAL, 'terminal'),
  ],
  '/use-cases': [
    hero('agi-usecases-title', WEB),
    card('/use-cases/startups', TERMINAL, 'terminal'),
    card('/use-cases/consulting', PROJECT),
    card('/use-cases/it-providers', APPROVAL),
    card('/use-cases/sales-teams', RESEARCH),
  ],
};

const PROFILES = [
  { width: 390, theme: 'light' },
  { width: HERO_FADE_ABOVE_PX, theme: 'dark' },
  { width: 1440, theme: 'dark' },
] as const;

function ownerOf(page: Page, owner: Owner): Locator {
  const main = page.getByRole('main');
  if ('group' in owner) return main.getByRole('group', { name: owner.group, exact: true });
  if ('link' in owner) return main.locator(`a[href="${owner.link}"]`);
  return main.locator(`[aria-labelledby="${owner.labelledBy}"]`);
}

function readPreview(figure: Locator) {
  return figure.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    const windows = Array.from(element.children).filter((child) =>
      child.classList.contains('agi-app-window'),
    );
    return {
      device: element.getAttribute('data-device'),
      geometry: element.getAttribute('data-geometry'),
      left: box.left,
      right: box.right,
      width: box.width,
      height: box.height,
      viewport: document.documentElement.clientWidth,
      mask: style.maskImage,
      webkitMask: style.getPropertyValue('-webkit-mask-image'),
      children: element.children.length,
      windowHidden: windows.map((child) => child.getAttribute('aria-hidden')),
      focusable: element.querySelectorAll(
        'a[href], button, input, select, textarea, summary, [tabindex], [contenteditable]',
      ).length,
    };
  });
}

for (const profile of PROFILES) {
  test.describe(`authored previews at ${profile.width}px in ${profile.theme}`, () => {
    test.use({
      viewport: { width: profile.width, height: 900 },
      colorScheme: profile.theme,
      reducedMotion: 'reduce',
    });

    for (const [route, callers] of Object.entries(PLACEMENTS)) {
      test(`${route} draws each preview where the page promises it`, async ({ page }) => {
        await page.addInitScript((theme) => localStorage.setItem('theme', theme), profile.theme);
        expect((await page.goto(route))?.status()).toBe(200);
        await page.evaluate(() => document.fonts.ready);

        const drawn = page.getByRole('main').locator('figure.agi-app').filter({ visible: true });
        await expect(drawn).toHaveCount(
          callers.reduce((total, caller) => total + (caller.count ?? 1), 0),
        );
        for (const label of await page
          .getByRole('main')
          .locator('figure.agi-app')
          .evaluateAll((figures) => figures.map((figure) => figure.getAttribute('aria-label')))) {
          expect(label, `${route} labels every drawn preview as authored`).toMatch(DISCLOSURE);
        }

        for (const caller of callers) {
          const where = `${route} ${JSON.stringify(caller.owner)} ${caller.label}`;
          const figures = ownerOf(page, caller.owner)
            .locator(`figure.agi-app[aria-label="${caller.label}"]`)
            .filter({ visible: true });
          await expect(figures, where).toHaveCount(caller.count ?? 1);
          const [designWidth, designHeight] = DESIGN_SIZE[caller.device];
          const fades =
            caller.fade === 'every-width' ||
            (caller.fade === 'above-900' && profile.width > HERO_FADE_ABOVE_PX);
          for (const figure of await figures.all()) {
            await expect(async () => {
              const preview = await readPreview(figure);
              expect(preview.device, where).toBe(caller.device);
              expect(preview.geometry, where).toBe(`${designWidth}x${designHeight}`);
              expect(preview.children, where).toBe(1);
              expect(preview.windowHidden, where).toEqual(['true']);
              expect(preview.focusable, where).toBe(0);
              expect(preview.width, where).toBeGreaterThan(0);
              expect(preview.left, where).toBeGreaterThanOrEqual(-EDGE_TOLERANCE_PX);
              expect(preview.right, where).toBeLessThanOrEqual(
                preview.viewport + EDGE_TOLERANCE_PX,
              );
              expect(
                Math.abs(
                  preview.width / preview.height -
                    designWidth / (designHeight * (caller.shownHeightShare ?? 1)),
                ),
                where,
              ).toBeLessThan(RATIO_TOLERANCE);
              if (fades) {
                expect(preview.mask, where).toMatch(PUBLIC_APPROVED_FADES.figure.image);
                expect(preview.webkitMask, where).toMatch(PUBLIC_APPROVED_FADES.figure.image);
              } else {
                expect(preview.mask, where).toBe('none');
                expect(preview.webkitMask, where).toBe('none');
              }
            }).toPass({ timeout: SETTLE_TIMEOUT_MS });
          }
        }

        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
          ),
        ).toBeLessThanOrEqual(0);
      });
    }
  });
}
