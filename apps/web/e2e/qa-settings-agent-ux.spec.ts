import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';
import { mkdtempSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  AgentCreateRequestSchema,
  ConnectConflictResponseSchema,
  ConnectRequestSchema,
  ListConnectorsResponseSchema,
  MANAGED_CLOUD_AGENTS_PATH,
  MANAGED_CLOUD_CONNECTORS_PATH,
  MANAGED_CLOUD_SETTINGS_PREFERENCES_PATH,
  ManagedCloudAgentListResponseSchema,
  ManagedCloudScheduleListResponseSchema,
  ManagedCloudScheduleRecentRunListResponseSchema,
  ManagedSkillsResponseSchema,
  SERVICE_NOTICES_PATH,
  ServiceNoticeListSchema,
  type AgentCreateRequest,
} from '@agiworkforce/cloud-contracts';

import { settleConsent } from './lib/settle-consent';
import { signIn } from './qa-capability-harness';
import { DEFAULT_THEME, THEME_STORAGE_KEY } from '../shared/components/ThemeConstants';
import { SELECTIVELY_RELEASED_CONNECTOR_IDS } from '@agiworkforce/types';
import { DEFAULT_LANGUAGE } from '@agiworkforce/i18n/languages';
import { CONNECTORS } from '../features/connectors/data/connectors';
import type { SkillDraft } from '@agiworkforce/skills/validation';
import { useSettingsStore } from '../shared/stores/web-settings-store';
import {
  APPEARANCE_NAMESPACE,
  LANGUAGE_NAMESPACE,
  toAppearanceNamespace,
} from '../features/settings/lib/appearance-namespace';

const EVIDENCE_DIR = mkdtempSync('/tmp/agi-qa-settings-agent-ux-');
const CAPTURED_AGENT_MESSAGE = 'QA intercepted this request. No agent was created.';
const SKILL_EDITOR_SAVE_ERROR = 'The local skill fixture is temporarily unavailable. Retry saving.';
const SKILL_EDITOR_CSRF_TOKEN = 'qa-skill-editor-csrf';
const CHANNEL_NAMES = ['Reply ready', 'Scheduled task finished', 'Security alerts', 'Usage'];
const INITIAL_NOTIFICATIONS = {
  browserReplyReady: true,
  emailScheduleDone: true,
  mobilePushScheduleDone: true,
  emailSecurityAlerts: true,
  pushUsageReset: true,
};
const SKILLS = ManagedSkillsResponseSchema.parse({
  skills: [
    {
      name: 'data-analysis',
      title: 'Quarterly evidence review',
      description: 'Compare quarterly figures and explain validated results.',
      source: 'bundled',
      lifecycle: 'included',
      downloadable: true,
    },
    {
      name: 'document-creation',
      title: 'Document creation',
      description: 'Turn findings into a formatted Word report.',
      source: 'bundled',
      lifecycle: 'included',
      downloadable: true,
    },
    ...Array.from({ length: 36 }, (_, index) => ({
      name: `qa-catalog-skill-${index + 1}`,
      title: `Local catalog skill ${index + 1}`,
      description: `Deterministic catalog description ${index + 1} for responsive selection.`,
      source: 'personal',
      lifecycle: 'included',
      downloadable: false,
    })),
  ],
});

type BrowserPermission = NotificationPermission | 'unsupported';
type NotificationActivity = 'permission' | 'subscribe' | 'unsubscribe' | 'register' | 'display';
interface QaTraffic {
  applicationMutations: string[];
  preferenceWrites: unknown[];
  backgroundPreferenceWrites: unknown[];
  agentSubmissions: AgentCreateRequest[];
  pushRefreshWrites: string[];
  blockedMutations: string[];
  notificationActivity: NotificationActivity[];
  preferenceReads: number;
  skillReads: number;
}

interface QaSkillEditorFixture {
  saved: SkillDraft;
  firstSaveResponse: Promise<void>;
  bodyReads: string[];
  submissions: Array<{ path: string; draft: SkillDraft; hasFixtureCsrf: boolean }>;
}

function skillEditorCatalog(fixture: QaSkillEditorFixture) {
  return {
    ...ManagedSkillsResponseSchema.parse({
      skills: [
        ...SKILLS.skills,
        {
          name: fixture.saved.name,
          description: fixture.saved.description,
          source: 'personal',
          lifecycle: 'included',
          downloadable: false,
          editable: true,
          origin: { kind: 'personal' },
        },
      ],
    }),
    canAuthorSkills: true,
  };
}

test.use({
  storageState: { cookies: [], origins: [] },
  serviceWorkers: 'block',
  actionTimeout: 15_000,
  navigationTimeout: 30_000,
});

function requireLocalTestEnvironment(baseURL: string | undefined): string {
  const application = new URL(baseURL ?? '');
  expect(['localhost', '127.0.0.1', '[::1]']).toContain(application.hostname);
  expect(['http:', 'https:']).toContain(application.protocol);
  expect(process.env['CLERK_SECRET_KEY']?.startsWith('sk_test_')).toBe(true);
  expect(process.env['NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY']?.startsWith('pk_test_')).toBe(true);
  const database = new URL(process.env['DATABASE_URL'] ?? '');
  expect(['postgres:', 'postgresql:']).toContain(database.protocol);
  expect(['localhost', '127.0.0.1', '[::1]']).toContain(database.hostname);
  return application.origin;
}

async function installNotificationFixture(
  page: Page,
  permission: BrowserPermission,
  registered: boolean,
  activity: NotificationActivity[],
) {
  await page.exposeFunction('recordQaNotificationActivity', (event: NotificationActivity) => {
    activity.push(event);
  });
  await page.addInitScript(
    ({ permission, registered }) => {
      if (window.top !== window) return;
      const record = (event: string) => {
        void (
          window as unknown as { recordQaNotificationActivity: (event: string) => Promise<void> }
        ).recordQaNotificationActivity(event);
      };
      class FixtureNotification {
        static permission = permission;
        static async requestPermission() {
          record('permission');
          return 'denied';
        }
        constructor() {
          record('display');
        }
      }
      const subscription = {
        endpoint: `${location.origin}/qa-existing-subscription`,
        toJSON: () => ({ endpoint: `${location.origin}/qa-existing-subscription`, keys: {} }),
        unsubscribe: async () => {
          record('unsubscribe');
          return true;
        },
      };
      const pushManager = {
        getSubscription: async () => (registered ? subscription : null),
        subscribe: async () => {
          record('subscribe');
          throw new Error('Native subscriptions are blocked by the local QA fixture.');
        },
      };
      const registration = { pushManager };
      Object.defineProperty(window, 'Notification', {
        configurable: true,
        value: permission === 'unsupported' ? undefined : FixtureNotification,
      });
      Object.defineProperty(window, 'PushManager', { configurable: true, value: class {} });
      Object.defineProperty(navigator, 'serviceWorker', {
        configurable: true,
        value: {
          getRegistration: async () => (registered ? registration : undefined),
          register: async () => {
            record('register');
            return registration;
          },
          ready: Promise.resolve(registration),
          controller: null,
          addEventListener() {},
          removeEventListener() {},
        },
      });
    },
    { permission, registered },
  );
}

async function preparePage(
  page: Page,
  baseURL: string | undefined,
  permission: BrowserPermission = 'default',
  registered = false,
  appearance?: 'light' | 'dark',
  skillEditor?: QaSkillEditorFixture,
): Promise<QaTraffic> {
  const origin = requireLocalTestEnvironment(baseURL);
  const traffic: QaTraffic = {
    applicationMutations: [],
    preferenceWrites: [],
    backgroundPreferenceWrites: [],
    agentSubmissions: [],
    pushRefreshWrites: [],
    blockedMutations: [],
    notificationActivity: [],
    preferenceReads: 0,
    skillReads: 0,
  };
  const settings: Record<string, unknown> = {
    notifications: { ...INITIAL_NOTIFICATIONS },
    ...(skillEditor
      ? {
          [APPEARANCE_NAMESPACE]: toAppearanceNamespace({
            ...useSettingsStore.getInitialState(),
            theme: appearance ?? DEFAULT_THEME,
          }),
          [LANGUAGE_NAMESPACE]: { locale: DEFAULT_LANGUAGE },
        }
      : appearance
        ? { [APPEARANCE_NAMESPACE]: { theme: appearance } }
        : {}),
  };
  if (appearance)
    await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), {
      key: THEME_STORAGE_KEY,
      value: appearance,
    });
  await installNotificationFixture(page, permission, registered, traffic.notificationActivity);
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== origin) return route.continue();
    const method = request.method();
    if (!['GET', 'HEAD', 'OPTIONS'].includes(method))
      traffic.applicationMutations.push(`${method} ${url.pathname}`);
    const json = (body: unknown, status = 200) => route.fulfill({ status, json: body });
    if (url.pathname === MANAGED_CLOUD_SETTINGS_PREFERENCES_PATH) {
      if (method === 'GET') {
        traffic.preferenceReads++;
        const namespace = url.searchParams.get('namespace');
        return json({
          settings: namespace ? (settings[namespace] ?? {}) : settings,
          version: 'qa-1',
        });
      }
      if (method === 'PUT') {
        const body = request.postDataJSON() as {
          namespace?: string;
          value?: unknown;
          patch?: Record<string, unknown>;
        };
        if (!body.namespace) {
          traffic.blockedMutations.push(`${method} ${url.pathname} without a namespace`);
          return json({ error: { message: 'A namespace is required by the QA fixture.' } }, 400);
        }
        if (body.namespace === 'notifications') traffic.preferenceWrites.push(body);
        else traffic.backgroundPreferenceWrites.push(body);
        settings[body.namespace] = body.patch
          ? { ...(settings[body.namespace] as Record<string, unknown>), ...body.patch }
          : body.value;
        return json({
          version: `qa-${traffic.preferenceWrites.length + traffic.backgroundPreferenceWrites.length + 1}`,
        });
      }
    }
    if (url.pathname === '/api/skills' && method === 'GET') {
      traffic.skillReads++;
      return json(skillEditor ? skillEditorCatalog(skillEditor) : SKILLS);
    }
    if (skillEditor) {
      if (url.pathname === '/api/csrf' && method === 'GET') {
        return json({ token: SKILL_EDITOR_CSRF_TOKEN, expiresIn: 3_600_000 });
      }
      if (url.pathname === '/api/settings/organization/plugins' && method === 'GET') {
        return json({ canManage: false, plugins: [] });
      }
      if (url.pathname === '/api/skills/installs' && method === 'GET') {
        return json({
          installed: skillEditorCatalog(skillEditor).skills.map((skill) => skill.name),
        });
      }
      if (url.pathname.startsWith('/api/skills/')) {
        const skillPath = `/api/skills/${encodeURIComponent(skillEditor.saved.name)}`;
        if (url.pathname === skillPath && method === 'GET') {
          skillEditor.bodyReads.push(skillEditor.saved.name);
          return json({ body: skillEditor.saved.body });
        }
        if (url.pathname === `${skillPath}/files` && method === 'GET') {
          return json({
            files: [{ path: 'SKILL.md', size: Buffer.byteLength(skillEditor.saved.body) }],
          });
        }
        if (url.pathname === skillPath && method === 'PUT') {
          const draft = request.postDataJSON() as SkillDraft;
          skillEditor.submissions.push({
            path: url.pathname,
            draft,
            hasFixtureCsrf: request.headers()['x-csrf-token'] === SKILL_EDITOR_CSRF_TOKEN,
          });
          if (skillEditor.submissions.length === 1) {
            await skillEditor.firstSaveResponse;
            return json({ error: { message: SKILL_EDITOR_SAVE_ERROR } }, 503);
          }
          skillEditor.saved = { ...draft };
          return json({ skill: skillEditorCatalog(skillEditor).skills.at(-1) });
        }
        if (method !== 'GET') traffic.blockedMutations.push(`${method} ${url.pathname}`);
        return json(
          { error: { message: 'No matching skill operation in the local fixture.' } },
          404,
        );
      }
    }
    if (url.pathname === SERVICE_NOTICES_PATH && method === 'GET') {
      return json(ServiceNoticeListSchema.parse({ notices: [] }));
    }
    if (url.pathname === MANAGED_CLOUD_CONNECTORS_PATH && method === 'GET') {
      return json(ListConnectorsResponseSchema.parse({ connectors: [], available: [], setup: {} }));
    }
    if (url.pathname === MANAGED_CLOUD_AGENTS_PATH) {
      if (method === 'GET') return json(ManagedCloudAgentListResponseSchema.parse({ agents: [] }));
      if (method === 'POST') {
        traffic.agentSubmissions.push(AgentCreateRequestSchema.parse(request.postDataJSON()));
        return json({ error: { code: 'QA_CAPTURED', message: CAPTURED_AGENT_MESSAGE } }, 422);
      }
    }
    if (url.pathname === '/api/web-push') {
      if (method === 'GET') return json({ publicKey: null });
      traffic.pushRefreshWrites.push(method);
      return json({ success: true });
    }
    if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
      if (url.pathname === '/api/consent' && method === 'POST') return json({ recorded: 1 });
      traffic.blockedMutations.push(`${method} ${url.pathname}`);
      return json(
        { error: { message: 'Unexpected mutation blocked by the local QA fixture.' } },
        409,
      );
    }
    return route.continue();
  });
  await signIn(page);
  return traffic;
}

async function openNotifications(page: Page) {
  await page.goto('/settings/notifications', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Notifications', exact: true })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByRole('combobox', { name: 'Reply ready', exact: true })).toBeEnabled();
  await settleConsent(page);
  await page.waitForFunction(() => document.fonts.status === 'loaded');
  await page.getByRole('dialog').evaluate(async (dialog) => {
    await Promise.all(dialog.getAnimations().map((animation) => animation.finished));
  });
}

async function recordEvidence(page: Page, testInfo: TestInfo, content: Locator) {
  const filename = `${testInfo.title.replace(/[^a-z0-9-]+/gi, '-').toLowerCase()}.png`;
  const destination = path.join(EVIDENCE_DIR, filename);
  const clip = await content.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    let left = Math.max(0, bounds.left);
    let top = Math.max(0, bounds.top);
    let right = Math.min(innerWidth, bounds.right);
    let bottom = Math.min(innerHeight, bounds.bottom);
    for (let ancestor = element.parentElement; ancestor; ancestor = ancestor.parentElement) {
      const style = getComputedStyle(ancestor);
      const ancestorBounds = ancestor.getBoundingClientRect();
      if (/auto|scroll|hidden|clip/.test(style.overflowX)) {
        left = Math.max(left, ancestorBounds.left);
        right = Math.min(right, ancestorBounds.right);
      }
      if (/auto|scroll|hidden|clip/.test(style.overflowY)) {
        top = Math.max(top, ancestorBounds.top);
        bottom = Math.min(bottom, ancestorBounds.bottom);
      }
    }
    return { x: left, y: top, width: right - left, height: bottom - top };
  });
  expect(clip.width).toBeGreaterThan(0);
  expect(clip.height).toBeGreaterThan(0);
  await page.screenshot({ path: destination, clip });
  await testInfo.attach('rendered-local-ux', { path: destination, contentType: 'image/png' });
}

function assertNoNewNotificationDelivery(traffic: QaTraffic) {
  expect(traffic.notificationActivity.filter((event) => event !== 'register')).toEqual([]);
  expect(traffic.blockedMutations).toEqual([]);
}

async function expectSkillEditorFieldsDoNotOverlap(editor: Locator) {
  const instructions = await editor
    .getByRole('textbox', { name: 'Instructions', exact: true })
    .boundingBox();
  const footer = await editor
    .getByRole('group', { name: 'Skill actions', exact: true })
    .boundingBox();
  expect(instructions).not.toBeNull();
  expect(footer).not.toBeNull();
  const error = editor.getByRole('alert');
  if (await error.count()) {
    const bounds = await error.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.y).toBeGreaterThanOrEqual(instructions!.y + instructions!.height - 1);
    expect(footer!.y).toBeGreaterThanOrEqual(bounds!.y + bounds!.height - 1);
  } else {
    expect(footer!.y).toBeGreaterThanOrEqual(instructions!.y + instructions!.height - 1);
  }
}

async function expectSkillEditorReady(editor: Locator) {
  await expect(editor).toBeVisible();
  await editor.evaluate(async (element) => {
    await document.fonts.ready;
    await Promise.all(element.getAnimations().map((animation) => animation.finished));
  });
}

async function expectSkillEditorControlReachable(
  control: Locator,
  testInfo: TestInfo,
  label: string,
) {
  await expect(control).toBeInViewport();
  const geometry = await control.evaluate((element) => {
    const form = element instanceof HTMLButtonElement ? element.form : null;
    const dialog = element.closest('[role="dialog"]');
    if (!(form instanceof HTMLFormElement) || !(dialog instanceof HTMLElement)) {
      throw new Error('The editor control must belong to its form and dialog.');
    }
    const bounds = element.getBoundingClientRect();
    const formBounds = form.getBoundingClientRect();
    const dialogBounds = dialog.getBoundingClientRect();
    const viewport = {
      left: Math.max(formBounds.left + form.clientLeft, dialogBounds.left + dialog.clientLeft, 0),
      top: Math.max(formBounds.top + form.clientTop, dialogBounds.top + dialog.clientTop, 0),
      right: Math.min(
        formBounds.left + form.clientLeft + form.clientWidth,
        dialogBounds.left + dialog.clientLeft + dialog.clientWidth,
        innerWidth,
      ),
      bottom: Math.min(
        formBounds.top + form.clientTop + form.clientHeight,
        dialogBounds.top + dialog.clientTop + dialog.clientHeight,
        innerHeight,
      ),
    };
    const target = document.elementFromPoint(
      bounds.x + bounds.width / 2,
      bounds.y + bounds.height / 2,
    );
    const focusStyle = getComputedStyle(element);
    const focused = document.activeElement === element;
    const shadowLengths = [...focusStyle.boxShadow.matchAll(/(-?[\d.]+)px/g)].map((match) =>
      Number(match[1]),
    );
    let shadowOutset = 0;
    for (let index = 0; index < shadowLengths.length; index += 4) {
      const [x = 0, y = 0, blur = 0, spread = 0] = shadowLengths.slice(index, index + 4);
      shadowOutset = Math.max(
        shadowOutset,
        Math.abs(x) + blur + spread,
        Math.abs(y) + blur + spread,
      );
    }
    const outlineOutset =
      focusStyle.outlineStyle === 'none'
        ? 0
        : parseFloat(focusStyle.outlineWidth) + parseFloat(focusStyle.outlineOffset);
    const focusOutset = focused ? Math.max(0, shadowOutset, outlineOutset) : 0;
    return {
      label: element.textContent?.trim(),
      bounds: { left: bounds.left, top: bounds.top, right: bounds.right, bottom: bounds.bottom },
      viewport,
      form: {
        top: formBounds.top,
        bottom: formBounds.bottom,
        scrollTop: form.scrollTop,
        clientHeight: form.clientHeight,
        scrollHeight: form.scrollHeight,
        overflowY: getComputedStyle(form).overflowY,
      },
      dialog: { top: dialogBounds.top, bottom: dialogBounds.bottom },
      focused,
      focusOutset,
      centerReceivesPointer: target !== null && element.contains(target),
      focusStyle: {
        outlineStyle: focusStyle.outlineStyle,
        outlineWidth: focusStyle.outlineWidth,
        boxShadow: focusStyle.boxShadow,
      },
    };
  });
  const geometryPath = testInfo.outputPath(`${label}.json`);
  writeFileSync(geometryPath, JSON.stringify(geometry, null, 2));
  await testInfo.attach(label, { path: geometryPath, contentType: 'application/json' });
  expect(geometry.bounds.left).toBeGreaterThanOrEqual(geometry.viewport.left - 1);
  expect(geometry.bounds.top).toBeGreaterThanOrEqual(geometry.viewport.top - 1);
  expect(geometry.bounds.right).toBeLessThanOrEqual(geometry.viewport.right + 1);
  expect(geometry.bounds.bottom).toBeLessThanOrEqual(geometry.viewport.bottom + 1);
  expect(geometry.bounds.left - geometry.focusOutset).toBeGreaterThanOrEqual(
    geometry.viewport.left - 1,
  );
  expect(geometry.bounds.top - geometry.focusOutset).toBeGreaterThanOrEqual(
    geometry.viewport.top - 1,
  );
  expect(geometry.bounds.right + geometry.focusOutset).toBeLessThanOrEqual(
    geometry.viewport.right + 1,
  );
  expect(geometry.bounds.bottom + geometry.focusOutset).toBeLessThanOrEqual(
    geometry.viewport.bottom + 1,
  );
  expect(geometry.centerReceivesPointer).toBe(true);
  return geometry;
}

for (const appearance of ['light', 'dark'] as const) {
  for (const width of [1440, 320]) {
    test(`skill editor retains a failed save and reopens saved fields in ${appearance} at ${width}px`, async ({
      page,
      baseURL,
    }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      const runtimeErrors: string[] = [];
      page.on('pageerror', (error) => runtimeErrors.push(error.message));
      let finishFailedSave: (() => void) | undefined;
      const original = {
        name: 'qa-editor-original',
        description: 'Draft a local release note.',
        body: 'Summarize the supplied changes.',
      };
      const draft = {
        name: 'qa-editor-retained',
        description: 'Keep typed release details after a temporary save failure.',
        body: 'Write a concise release note. Preserve the supplied facts and mark unknowns.',
      };
      const fixture: QaSkillEditorFixture = {
        saved: { ...original },
        firstSaveResponse: new Promise<void>((resolve) => {
          finishFailedSave = resolve;
        }),
        bodyReads: [],
        submissions: [],
      };
      const traffic = await preparePage(page, baseURL, 'default', false, appearance, fixture);
      await page.goto(`/chat#settings/customize-skills/browse/${original.name}`, {
        waitUntil: 'domcontentloaded',
      });
      await settleConsent(page);
      await expect(page.locator('html')).toHaveAttribute('data-theme', appearance);
      const edit = page.getByRole('button', { name: `Settings ${original.name}`, exact: true });
      await expect(edit).toBeVisible();
      await edit.focus();
      await expect(edit).toBeFocused();
      await edit.press('Enter');
      const editor = page.getByRole('dialog', { name: 'Edit skill', exact: true });
      await expectSkillEditorReady(editor);
      const name = editor.getByRole('textbox', { name: 'Name', exact: true });
      const description = editor.getByRole('textbox', { name: 'Description', exact: true });
      const instructions = editor.getByRole('textbox', { name: 'Instructions', exact: true });
      const actions = editor.getByRole('group', { name: 'Skill actions', exact: true });
      const save = actions.getByRole('button', { name: /^(Save changes|Saving…)$/ });
      await expect(name).toHaveValue(original.name);
      await expect(description).toHaveValue(original.description);
      await expect(instructions).toHaveValue(original.body);
      await name.fill('Invalid Name');
      await description.fill('');
      await instructions.fill('');
      await save.focus();
      await save.press('Enter');
      await expect(editor.getByRole('alert')).toContainText('Name must be lowercase');
      await expect(editor.getByRole('alert')).toContainText('Description is required.');
      await expect(editor.getByRole('alert')).toContainText('Skill instructions are required.');
      expect(fixture.submissions).toEqual([]);
      await name.focus();
      await name.fill(draft.name);
      await name.press('Tab');
      await expect(description).toBeFocused();
      await description.fill(draft.description);
      await description.press('Tab');
      await expect(instructions).toBeFocused();
      await instructions.fill(draft.body);
      await instructions.press('Tab');
      const cancel = actions.getByRole('button', { name: 'Cancel', exact: true });
      await expect(cancel).toBeFocused();
      const initialCancelFocus = await expectSkillEditorControlReachable(
        cancel,
        testInfo,
        'initial-cancel-focus',
      );
      await cancel.press('Tab');
      await expect(save).toBeFocused();
      const initialSaveFocus = await expectSkillEditorControlReachable(
        save,
        testInfo,
        'initial-save-focus',
      );
      await save.press('Enter');
      try {
        await expect.poll(() => fixture.submissions.length).toBe(1);
        await expect(save).toHaveText('Saving…');
        await expect(save).toBeDisabled();
        await expect(name).toHaveValue(draft.name);
        await expect(description).toHaveValue(draft.description);
        await expect(instructions).toHaveValue(draft.body);
      } finally {
        finishFailedSave?.();
      }
      await expect(editor.getByRole('alert')).toHaveText(SKILL_EDITOR_SAVE_ERROR);
      await expect(name).toHaveValue(draft.name);
      await expect(description).toHaveValue(draft.description);
      await expect(instructions).toHaveValue(draft.body);
      await expect(save).toBeEnabled();
      expect(fixture.saved).toEqual(original);
      expect(fixture.submissions).toEqual([
        { path: `/api/skills/${original.name}`, draft, hasFixtureCsrf: true },
      ]);
      const geometry = await editor.evaluate((element) => ({
        width: element.getBoundingClientRect().width,
        scrollWidth: element.scrollWidth,
        pageWidth: document.documentElement.scrollWidth,
        viewport: innerWidth,
      }));
      expect(geometry.scrollWidth).toBeLessThanOrEqual(Math.ceil(geometry.width));
      expect(geometry.pageWidth).toBeLessThanOrEqual(geometry.viewport);
      const failedSaveImage = testInfo.outputPath('skill-editor-failed-save.png');
      await editor.screenshot({ path: failedSaveImage });
      await testInfo.attach('skill-editor-failed-save', {
        path: failedSaveImage,
        contentType: 'image/png',
      });
      await expectSkillEditorFieldsDoNotOverlap(editor);
      const form = editor.getByRole('form', { name: 'Edit skill', exact: true });
      await form.evaluate((element) => {
        element.scrollTop = element.scrollHeight;
      });
      const failedFooterAtBottom = {
        save: await expectSkillEditorControlReachable(save, testInfo, 'failed-footer-save'),
        cancel: await expectSkillEditorControlReachable(cancel, testInfo, 'failed-footer-cancel'),
      };
      await save.focus();
      await save.press('Shift+Tab');
      await expect(cancel).toBeFocused();
      const failedCancelFocus = await expectSkillEditorControlReachable(
        cancel,
        testInfo,
        'failed-cancel-focus',
      );
      const footerImage = testInfo.outputPath('skill-editor-footer-keyboard.png');
      await editor.screenshot({ path: footerImage });
      await testInfo.attach('skill-editor-footer-keyboard', {
        path: footerImage,
        contentType: 'image/png',
      });
      await cancel.press('Tab');
      await expect(save).toBeFocused();
      const failedSaveFocus = await expectSkillEditorControlReachable(
        save,
        testInfo,
        'failed-save-focus',
      );
      await save.press('Enter');
      await expect(editor).toBeHidden();
      expect(fixture.saved).toEqual(draft);
      expect(fixture.submissions).toEqual([
        { path: `/api/skills/${original.name}`, draft, hasFixtureCsrf: true },
        { path: `/api/skills/${original.name}`, draft, hasFixtureCsrf: true },
      ]);
      await page.goto(`/chat#settings/customize-skills/browse/${draft.name}`, {
        waitUntil: 'domcontentloaded',
      });
      await page.reload({ waitUntil: 'domcontentloaded' });
      const reopen = page.getByRole('button', { name: `Settings ${draft.name}`, exact: true });
      await expect(reopen).toBeVisible();
      await reopen.focus();
      await reopen.press('Enter');
      await expectSkillEditorReady(editor);
      await expect(name).toHaveValue(draft.name);
      await expect(description).toHaveValue(draft.description);
      await expect(instructions).toHaveValue(draft.body);
      expect(fixture.bodyReads).toContain(draft.name);
      const savedImage = testInfo.outputPath('skill-editor-reopened.png');
      await editor.screenshot({ path: savedImage });
      await testInfo.attach('skill-editor-reopened', {
        path: savedImage,
        contentType: 'image/png',
      });
      await expectSkillEditorFieldsDoNotOverlap(editor);
      await form.evaluate((element) => {
        element.scrollTop = element.scrollHeight;
      });
      const reopenedFooterAtBottom = {
        save: await expectSkillEditorControlReachable(save, testInfo, 'reopened-footer-save'),
        cancel: await expectSkillEditorControlReachable(cancel, testInfo, 'reopened-footer-cancel'),
      };
      await cancel.click();
      await expect(editor).toBeHidden();
      expect(fixture.submissions).toHaveLength(2);
      expect(fixture.saved).toEqual(draft);
      await reopen.focus();
      await reopen.press('Enter');
      await expectSkillEditorReady(editor);
      await page.keyboard.press('Escape');
      await expect(editor).toBeHidden();
      expect(fixture.submissions).toHaveLength(2);
      expect(fixture.saved).toEqual(draft);
      expect(traffic.skillReads).toBeGreaterThan(0);
      expect(traffic.agentSubmissions).toEqual([]);
      expect(traffic.preferenceWrites).toEqual([]);
      expect(traffic.backgroundPreferenceWrites).toEqual([]);
      expect(traffic.pushRefreshWrites).toEqual([]);
      expect(traffic.applicationMutations.filter((entry) => entry !== 'POST /api/consent')).toEqual(
        [`PUT /api/skills/${original.name}`, `PUT /api/skills/${original.name}`],
      );
      expect(runtimeErrors).toEqual([]);
      assertNoNewNotificationDelivery(traffic);
      const proofPath = testInfo.outputPath('skill-editor-scroll-and-focus.json');
      writeFileSync(
        proofPath,
        JSON.stringify(
          {
            appearance,
            width,
            initialCancelFocus,
            initialSaveFocus,
            failedFooterAtBottom,
            failedCancelFocus,
            failedSaveFocus,
            reopenedFooterAtBottom,
            applicationMutations: traffic.applicationMutations,
            skillMutationCount: fixture.submissions.length,
            savedFixtureFields: Object.keys(fixture.saved),
          },
          null,
          2,
        ),
      );
      await testInfo.attach('skill-editor-scroll-and-focus', {
        path: proofPath,
        contentType: 'application/json',
      });
    });
  }
}

for (const fixture of [
  { permission: 'denied', label: 'Blocked', registered: true, disabled: true },
  { permission: 'default', label: 'Not allowed yet', registered: false, disabled: false },
  { permission: 'unsupported', label: 'Unavailable', registered: false, disabled: true },
  { permission: 'granted', label: 'Allowed', registered: false, disabled: false },
] as const) {
  test(`NEW-UX-01: saved channels and ${fixture.permission} browser delivery stay distinct`, async ({
    page,
    baseURL,
  }, testInfo) => {
    const traffic = await preparePage(page, baseURL, fixture.permission, fixture.registered);
    await openNotifications(page);
    const note = page.getByRole('note', { name: 'Browser delivery status', exact: true });
    await expect(note).toContainText(`Browser delivery: ${fixture.label}`);
    await expect(note).toContainText('Saved channels are kept');
    await expect(page.getByRole('combobox', { name: 'Reply ready', exact: true })).toHaveValue(
      'browserReplyReady',
    );
    await expect(page.getByRole('combobox', { name: 'Security alerts', exact: true })).toHaveValue(
      'emailSecurityAlerts',
    );
    const agentUpdates = page.getByRole('switch', { name: 'Agent run updates', exact: true });
    await expect(agentUpdates).toHaveAttribute('aria-checked', String(fixture.registered));
    if (fixture.disabled) await expect(agentUpdates).toBeDisabled();
    else await expect(agentUpdates).toBeEnabled();
    const noteId = await note.getAttribute('id');
    expect(noteId).toBeTruthy();
    for (const name of ['Reply ready', 'Usage']) {
      await expect(page.getByRole('combobox', { name, exact: true })).toHaveAttribute(
        'aria-describedby',
        new RegExp(`(?:^| )${noteId}(?: |$)`),
      );
    }
    await expect(agentUpdates).toHaveAttribute('aria-describedby', noteId!);
    await expect(
      page.getByRole('combobox', { name: 'Security alerts', exact: true }),
    ).not.toHaveAttribute('aria-describedby', new RegExp(`(?:^| )${noteId}(?: |$)`));
    expect(traffic.preferenceReads).toBeGreaterThan(0);
    expect(traffic.preferenceWrites).toEqual([]);
    expect(traffic.pushRefreshWrites).toEqual([]);
    assertNoNewNotificationDelivery(traffic);
    await recordEvidence(page, testInfo, page.getByTestId('notification-preferences'));
  });
}

for (const appearance of ['light', 'dark'] as const) {
  test(`selective connector controls and consent cancellation work in ${appearance}`, async ({
    page,
    baseURL,
  }) => {
    const traffic = await preparePage(page, baseURL, 'default', false, appearance);
    let authorizationStarts = 0;
    const connectRequests: string[] = [];
    await page.route(`**${MANAGED_CLOUD_CONNECTORS_PATH}`, (route) => {
      if (route.request().method() === 'GET')
        return route.fulfill({
          json: ListConnectorsResponseSchema.parse({
            connectors: [],
            available: [...SELECTIVELY_RELEASED_CONNECTOR_IDS],
            setup: {},
          }),
        });
      if (route.request().method() === 'POST') {
        const { connectorId } = ConnectRequestSchema.parse(route.request().postDataJSON());
        expect(SELECTIVELY_RELEASED_CONNECTOR_IDS).toContain(connectorId);
        connectRequests.push(connectorId);
        return route.fulfill({
          status: 409,
          json: ConnectConflictResponseSchema.parse({
            connectorId,
            error: 'oauth_required',
            oauthStartPath: `/api/connectors/oauth/start?connectorId=${encodeURIComponent(connectorId)}`,
          }),
        });
      }
      return route.fallback();
    });
    await page.route('**/api/connectors/oauth/start**', (route) => {
      authorizationStarts++;
      return route.fulfill({ status: 409, json: { error: 'Authorization blocked in local QA.' } });
    });
    await page.goto('/connectors', { waitUntil: 'domcontentloaded' });
    await settleConsent(page);
    const search = page.getByPlaceholder('Search connectors', { exact: true });
    await expect(search).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-theme', appearance);

    for (const width of [1440, 320]) {
      await page.setViewportSize({ width, height: 900 });
      for (const id of SELECTIVELY_RELEASED_CONNECTOR_IDS) {
        const connector = CONNECTORS.find((entry) => entry.id === id);
        expect(connector).toBeDefined();
        const name = connector!.name;
        await search.fill(name);
        const connect = page.getByRole('button', { name: `Connect ${name}`, exact: true });
        await expect(connect).toBeEnabled();
        await connect.focus();
        await connect.press('Enter');
        const consent = page.getByRole('alertdialog', { name: `Connect ${name}?`, exact: true });
        await expect(consent).toBeVisible();
        await expect(consent.getByRole('button', { name: 'Allow', exact: true })).toBeEnabled();
        await consent.getByRole('button', { name: 'Deny', exact: true }).click();
        await expect(consent).toBeHidden();
        await expect(connect).toBeEnabled();
      }
      for (const id of ['gmail', 'slack', 'stripe', 'huggingface']) {
        const name = CONNECTORS.find((entry) => entry.id === id)!.name;
        await search.fill(name);
        await expect(
          page.getByRole('button', { name: `${name}, Coming soon`, exact: true }),
        ).toBeDisabled();
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
    }
    expect(authorizationStarts).toBe(0);
    expect(connectRequests).toHaveLength(SELECTIVELY_RELEASED_CONNECTOR_IDS.length * 2);
    expect(traffic.blockedMutations).toEqual([]);
    expect(traffic.agentSubmissions).toEqual([]);
    assertNoNewNotificationDelivery(traffic);
  });
}

for (const appearance of ['light', 'dark'] as const) {
  test(`schedule access guidance matches available controls in ${appearance}`, async ({
    page,
    baseURL,
  }, testInfo) => {
    const traffic = await preparePage(page, baseURL, 'default', false, appearance);
    await page.route('**/api/schedules**', (route) => {
      const request = route.request();
      if (request.method() !== 'GET') {
        traffic.blockedMutations.push(`${request.method()} ${new URL(request.url()).pathname}`);
        return route.fulfill({
          status: 409,
          json: { error: 'Schedule writes are blocked in QA.' },
        });
      }
      const pathname = new URL(request.url()).pathname;
      if (pathname === '/api/schedules')
        return route.fulfill({
          json: ManagedCloudScheduleListResponseSchema.parse({
            schedules: [],
            pagination: { limit: 20, offset: 0 },
          }),
        });
      if (pathname === '/api/schedules/runs')
        return route.fulfill({
          json: ManagedCloudScheduleRecentRunListResponseSchema.parse({
            runs: [],
            nextCursor: null,
          }),
        });
      return route.continue();
    });
    await page.goto('/chat/schedules', { waitUntil: 'domcontentloaded' });
    const create = page.getByRole('button', { name: 'New task', exact: true });
    await expect(create).toBeVisible();
    await settleConsent(page);
    await expect(page.locator('html')).toHaveAttribute('data-theme', appearance);

    for (const width of [1440, 1024, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await create.click();
      const dialog = page.getByRole('dialog', { name: 'Create Schedule', exact: true });
      await expect(dialog).toBeVisible();
      await expect(dialog.getByText(/which connectors it can use/)).toHaveCount(0);
      await expect(dialog.getByText(/Scheduled runs do not see your chats/)).toHaveCount(0);
      const instructions = dialog.getByLabel('Task Instructions', { exact: true });
      await expect(instructions).toHaveAccessibleDescription(
        /Recent chats.*only when selected below.*Search past chats.*Settings/,
      );
      await instructions.focus();
      await expect(instructions).toBeFocused();
      await dialog.screenshot({
        path: path.join(EVIDENCE_DIR, `schedule-guidance-${appearance}-${width}-instructions.png`),
      });
      const recent = dialog.getByRole('checkbox', { name: 'Recent chats', exact: true });
      await recent.scrollIntoViewIfNeeded();
      await expect(recent).toHaveAttribute('aria-checked', 'false');
      await recent.focus();
      await recent.press('Space');
      await expect(recent).toHaveAttribute('aria-checked', 'true');
      await recent.press('Space');
      await expect(recent).toHaveAttribute('aria-checked', 'false');
      await expect(
        dialog.getByText('Connectors for scheduled runs are coming soon.', { exact: true }),
      ).toBeVisible();
      await dialog.screenshot({
        path: path.join(EVIDENCE_DIR, `schedule-guidance-${appearance}-${width}-sources.png`),
      });
      const geometry = await dialog.evaluate((element) => ({
        width: element.getBoundingClientRect().width,
        scrollWidth: element.scrollWidth,
        pageWidth: document.documentElement.scrollWidth,
        viewport: innerWidth,
      }));
      expect(geometry.scrollWidth).toBeLessThanOrEqual(Math.ceil(geometry.width));
      expect(geometry.pageWidth).toBeLessThanOrEqual(geometry.viewport);
      await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
      await expect(dialog).toBeHidden();
    }
    expect(traffic.blockedMutations).toEqual([]);
    expect(traffic.agentSubmissions).toEqual([]);
    assertNoNewNotificationDelivery(traffic);
    await testInfo.attach('schedule-guidance-evidence', {
      body: EVIDENCE_DIR,
      contentType: 'text/plain',
    });
  });
}

for (const width of [1440, 320]) {
  test(`NEW-UX-02: notification selectors align and save only to the fixture at ${width}px`, async ({
    page,
    baseURL,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    const traffic = await preparePage(page, baseURL);
    await openNotifications(page);
    for (const name of CHANNEL_NAMES) {
      const row = page.getByRole('region', { name, exact: true });
      await expect(row.getByRole('combobox', { name, exact: true })).toBeVisible();
    }
    const boxes = await page
      .getByTestId('notification-preferences')
      .getByRole('region')
      .filter({ has: page.getByRole('combobox') })
      .evaluateAll((rows) =>
        rows.map((row) => {
          const element = row.querySelector('select[data-notification-control]')!;
          const bounds = element.getBoundingClientRect();
          const description = row
            .querySelector('[data-testid="notification-description"]')!
            .getBoundingClientRect();
          return {
            name: element.getAttribute('aria-label'),
            x: bounds.x,
            right: bounds.right,
            width: bounds.width,
            top: bounds.top,
            descriptionBottom: description.bottom,
          };
        }),
      );
    expect(boxes.map((box) => box.name)).toEqual(CHANNEL_NAMES);
    for (const box of boxes) {
      expect(Math.abs(box.x - boxes[0]!.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(box.width - boxes[0]!.width)).toBeLessThanOrEqual(1);
      expect(box.right).toBeLessThanOrEqual(width);
      if (width === 320) expect(box.top).toBeGreaterThanOrEqual(box.descriptionBottom);
      else expect(box.top).toBeLessThan(box.descriptionBottom);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    );
    const security = page.getByRole('combobox', { name: 'Security alerts', exact: true });
    await security.selectOption('off');
    await expect(page.getByText('Saved', { exact: true })).toBeVisible();
    expect(traffic.preferenceWrites).toEqual([
      {
        namespace: 'notifications',
        value: { ...INITIAL_NOTIFICATIONS, emailSecurityAlerts: false },
      },
    ]);
    await security.focus();
    await expect(security).toBeFocused();
    await security.press('e');
    await page.keyboard.press('Tab');
    await expect(security).toHaveValue('emailSecurityAlerts');
    await expect.poll(() => traffic.preferenceWrites.length).toBe(2);
    for (const name of ['Scheduled task finished', 'Security alerts']) {
      await page
        .getByRole('region', { name, exact: true })
        .getByText('Delivery details', { exact: true })
        .click();
    }
    await expect(
      page.getByText('Runs continue on the server while you are away.', { exact: false }),
    ).toBeVisible();
    await expect(
      page.getByText('Advanced Account Security needs email.', {
        exact: false,
      }),
    ).toBeVisible();
    assertNoNewNotificationDelivery(traffic);
    await recordEvidence(page, testInfo, page.getByTestId('notification-preferences'));
  });
}

async function expectReachableFooter(page: Page): Promise<Locator> {
  const footer = page.locator('footer[aria-label="Agent actions"]');
  const create = footer.getByRole('button', { name: 'Create agent', exact: true });
  await create.focus();
  await expect(create).toBeFocused();
  await expect(create).toBeInViewport();
  const bounds = await create.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  const headerCreate = page
    .locator('header')
    .getByRole('button', { name: 'Create agent', exact: true });
  const formId = await page
    .getByRole('form', { name: 'Agent configuration', exact: true })
    .getAttribute('id');
  expect(formId).toBeTruthy();
  await expect(headerCreate).toHaveAttribute('form', formId!);
  expect(await headerCreate.evaluate((button) => (button as HTMLButtonElement).form?.id)).toBe(
    formId,
  );
  return footer;
}

for (const selection of ['inherited', 'none', 'explicit'] as const) {
  test(`NEW-UX-03/04: ${selection} skills, reachable actions and confirmed cancel retain the draft`, async ({
    page,
    baseURL,
  }, testInfo) => {
    const width = selection === 'inherited' ? 1440 : 320;
    await page.setViewportSize({ width, height: 900 });
    const traffic = await preparePage(page, baseURL);
    await page.goto('/chat/agents/new', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'New agent', exact: true })).toBeVisible({
      timeout: 30_000,
    });
    await settleConsent(page);
    const form = page.getByRole('form', { name: 'Agent configuration', exact: true });
    const name = form.getByRole('textbox', { name: 'Name', exact: true });
    const draftName = `Local QA ${selection}`;
    await expect(form.getByRole('status').filter({ hasText: 'Inherited' })).toContainText(
      `${SKILLS.skills.length} available to you`,
    );
    const modeControls = form.locator('[data-agent-skill-mode-radio]');
    await expect(modeControls).toHaveCount(2);
    const modeGeometry = () =>
      modeControls.evaluateAll((elements) =>
        elements.map((element) => {
          const bounds = element.getBoundingClientRect();
          const circle = getComputedStyle(element, '::before');
          return {
            width: bounds.width,
            height: bounds.height,
            circleWidth: parseFloat(circle.width),
            circleHeight: parseFloat(circle.height),
            radius: parseFloat(circle.borderTopLeftRadius),
            border: parseFloat(circle.borderTopWidth),
            content: circle.content,
          };
        }),
      );
    await expect
      .poll(async () =>
        (await modeGeometry()).every(
          (item) =>
            item.width >= 43.99 &&
            item.height >= 43.99 &&
            item.circleWidth === 16 &&
            item.circleHeight === 16 &&
            item.radius >= 8 &&
            item.border > 0 &&
            item.content !== 'none' &&
            item.content !== 'normal',
        ),
      )
      .toBe(true);
    await testInfo.attach('agent-skill-mode-geometry', {
      body: JSON.stringify(await modeGeometry(), null, 2),
      contentType: 'application/json',
    });
    await name.fill(draftName);
    await expect(name).toHaveValue(draftName);
    await expect(form.locator('footer')).toContainText('Unsaved changes');
    await form
      .getByRole('textbox', { name: 'What should this agent do, and how?', exact: true })
      .fill('Keep this local draft until I explicitly discard it.');
    await expect(
      form.getByRole('radio', { name: /Use each person's enabled skills/ }),
    ).toBeChecked();
    await expect(form.getByRole('listbox', { name: 'Skills', exact: true })).toHaveCount(0);
    if (selection !== 'inherited') {
      await form.getByRole('radio', { name: /Choose individual skills/ }).check();
      await expect(form.getByRole('status').filter({ hasText: '0 selected' })).toBeVisible();
      const search = form.getByRole('combobox', { name: 'Search skills', exact: true });
      if (selection === 'explicit') {
        await search.fill('quarterly evidence');
        const dataSkill = form.getByRole('option', {
          name: 'Quarterly evidence review',
          exact: true,
        });
        await expect(dataSkill).toHaveCount(1);
        await expect(dataSkill).toContainText(
          'Compare quarterly figures and explain validated results.',
        );
        await search.press('ArrowDown');
        await search.press('Enter');
        await expect(search).toBeFocused();
        await expect(dataSkill).toHaveAttribute('aria-selected', 'true');
        await expect(form.getByRole('status').filter({ hasText: '1 selected' })).toBeVisible();
        await search.fill('formatted Word report');
        const documentSkill = form.getByRole('option', { name: 'Document creation', exact: true });
        await expect(documentSkill).toHaveCount(1);
        await search.press('ArrowDown');
        await search.press('Enter');
        await expect(documentSkill).toHaveAttribute('aria-selected', 'true');
        await search.fill('data-analysis');
        await expect(dataSkill).toHaveCount(1);
        await expect(dataSkill).toHaveAttribute('aria-selected', 'true');
        await search.fill('no-such-local-qa-skill');
        await expect(form.getByText('No skills match your search.', { exact: true })).toBeVisible();
        await expect(form.getByRole('status').filter({ hasText: '2 selected' })).toBeVisible();
        await search.fill('');
        await expect(form.getByRole('listbox', { name: 'Skills', exact: true })).toHaveAttribute(
          'aria-multiselectable',
          'true',
        );
        await search.press('Tab');
        await expect(form.getByRole('button', { name: 'Select all', exact: true })).toBeFocused();
        await page.keyboard.press('Tab');
        await expect(
          form.getByRole('button', { name: 'Clear selection', exact: true }),
        ).toBeFocused();
        await page.keyboard.press('Tab');
        await testInfo.attach('skill-list-tab-target', {
          body: JSON.stringify(
            await page.evaluate(() => ({
              element: document.activeElement?.outerHTML.slice(0, 800),
            })),
          ),
          contentType: 'application/json',
        });
        await expect(form.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused();
      } else {
        await expect(
          form.getByText('No skills selected. This agent will not load any skills.', {
            exact: true,
          }),
        ).toBeVisible();
      }
    }
    const footer = await expectReachableFooter(page);
    await testInfo.attach('skill-mode-radio-geometry', {
      body: JSON.stringify(
        await form
          .getByRole('radiogroup', { name: 'Skill selection' })
          .getByRole('radio')
          .evaluateAll((radios) =>
            radios.map((radio) => {
              const bounds = radio.getBoundingClientRect();
              const style = getComputedStyle(radio);
              return {
                tagName: radio.tagName,
                width: bounds.width,
                height: bounds.height,
                computedWidth: style.width,
                computedHeight: style.height,
                minWidth: style.minWidth,
                minHeight: style.minHeight,
                borderRadius: style.borderRadius,
                appearance: style.appearance,
                classes: radio.className,
              };
            }),
          ),
      ),
      contentType: 'application/json',
    });
    await footer.getByRole('button', { name: 'Create agent', exact: true }).click();
    await expect(form.getByRole('alert')).toHaveText(CAPTURED_AGENT_MESSAGE);
    expect(traffic.agentSubmissions).toHaveLength(1);
    expect(traffic.agentSubmissions[0]!.name).toBe(draftName);
    expect(traffic.agentSubmissions[0]!.skillNames).toEqual(
      selection === 'inherited'
        ? null
        : selection === 'none'
          ? []
          : ['data-analysis', 'document-creation'],
    );
    await expect(name).toHaveValue(draftName);
    await footer.getByRole('button', { name: 'Cancel', exact: true }).click();
    const confirm = page.getByRole('alertdialog', {
      name: 'Discard unsaved changes?',
      exact: true,
    });
    await expect(confirm).toContainText('If you leave now, they will be lost.');
    await confirm.getByRole('button', { name: 'Keep editing', exact: true }).click();
    await expect(confirm).toBeHidden();
    await expect(page).toHaveURL(/\/chat\/agents\/new(?:[?#]|$)/);
    await expect(name).toHaveValue(draftName);
    await expect(
      form.getByRole('textbox', { name: 'What should this agent do, and how?', exact: true }),
    ).toHaveValue('Keep this local draft until I explicitly discard it.');
    if (selection !== 'inherited')
      await expect(
        form
          .getByRole('status')
          .filter({ hasText: `${selection === 'explicit' ? 2 : 0} selected` }),
      ).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    );
    await recordEvidence(page, testInfo, form);
    await footer.getByRole('button', { name: 'Cancel', exact: true }).click();
    await confirm.getByRole('button', { name: 'Discard', exact: true }).click();
    await expect(page).toHaveURL(/\/chat\/agents(?:[?#]|$)/);
    await expect(page.getByRole('heading', { name: 'Agents', exact: true })).toBeVisible();
    expect(traffic.agentSubmissions).toHaveLength(1);
    expect(traffic.skillReads).toBeGreaterThan(0);
    expect(traffic.preferenceWrites).toEqual([]);
    assertNoNewNotificationDelivery(traffic);
  });
}
