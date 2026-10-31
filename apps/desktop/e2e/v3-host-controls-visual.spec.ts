import { expect, test, type Locator, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getModelMetadataById, requireProviderDefaultModel } from '@agiworkforce/types';

import { injectMockCloudAuth } from './utils/mock-cloud-auth';
import {
  cloudConversationFixture,
  cloudMessageFixture,
  expectCloudShellReady,
  mockCloudApi,
} from './utils/mock-cloud-api';

type SettingsModule = typeof import('../src/stores/settingsStore');
type ProjectsModule = typeof import('../src/stores/projectStore');
type SidebarModule = typeof import('../src/stores/ui');
type SharedChatModule = Pick<typeof import('@agiworkforce/unified-chat'), 'useChatStore'>;

const FOLDER = 'customer-research-and-implementation-notes-with-a-long-workspace-name';
const ACTIVE_ID = '00000000-0000-4000-8000-000000000101';
const INACTIVE_ID = '00000000-0000-4000-8000-000000000102';
const PROJECT_ID = '00000000-0000-4000-8000-000000000103';
const EVIDENCE = process.env['AGI_VISUAL_POLISH_ARTIFACT_DIR'];
const REPLY_PARAGRAPH =
  'This saved fixture exercises the actual composer and sidebar without running a provider.';
const REPLY_MARKDOWN = [
  '# Main response heading',
  '',
  REPLY_PARAGRAPH,
  '',
  '## Supporting response heading',
  '',
  'Ordinary prose remains selectable and uses the shared reading typography.',
  '',
  '### Detailed response heading',
  '',
  'This is a rendered Markdown fixture, not a model or provider call.',
].join('\n');
const MODEL_ID = requireProviderDefaultModel('openai');
const MODEL = getModelMetadataById(MODEL_ID);
if (!MODEL) throw new Error('The canonical provider-default model fixture is unavailable');
const SHARED_CHAT_URL = `/@fs${fileURLToPath(
  new URL('../../../packages/ui/unified-chat/src/stores/chatStore.ts', import.meta.url),
).replaceAll('\\', '/')}`;

async function seedView(page: Page, theme: 'light' | 'dark') {
  await page.evaluate(
    async ({ theme, folder, projectId }) => {
      const settingsUrl = '/src/stores/settingsStore.ts';
      const projectsUrl = '/src/stores/projectStore.ts';
      const sidebarUrl = '/src/stores/ui.ts';
      const settings = (await import(settingsUrl)) as SettingsModule;
      const projects = (await import(projectsUrl)) as ProjectsModule;
      const sidebar = (await import(sidebarUrl)) as SidebarModule;
      settings.useSettingsStore.getState().setSelectedTheme(undefined);
      settings.useSettingsStore.getState().setTheme(theme);
      settings.useSettingsStore.setState((state) => ({
        chatPreferences: { ...state.chatPreferences, autoApproveTools: true },
        executionPreferences: {
          ...state.executionPreferences,
          terminalSandbox: {
            ...state.executionPreferences.terminalSandbox,
            enabled: true,
            backend: 'srt',
            policy: 'workspace-write',
          },
        },
      }));
      projects.useProjectStore.getState().setCurrentFolder(`/workspace/${folder}`);
      projects.useProjectStore.setState({
        projects: [
          {
            id: projectId,
            name: 'Long workspace presentation project',
            description: '',
            customInstructions: '',
            files: [],
            conversationIds: [],
            isArchived: false,
            createdAt: '2026-10-01T10:00:00Z',
            updatedAt: '2026-10-01T10:00:00Z',
            defaultPrivacyMode: 'managed',
          },
        ],
      });
      sidebar.useUIStore.getState().setSidebarCollapsed(false);
    },
    { theme, folder: FOLDER, projectId: PROJECT_ID },
  );
}

async function setSidebar(page: Page, collapsed: boolean) {
  await page.evaluate(async (collapsed) => {
    const url = '/src/stores/ui.ts';
    const { useUIStore } = (await import(url)) as SidebarModule;
    useUIStore.getState().setSidebarCollapsed(collapsed);
  }, collapsed);
  const sidebar = page.locator('[data-v3-sidebar]');
  await expect(sidebar).toHaveAttribute('data-collapsed', String(collapsed));
  let previous = -1;
  let stable = 0;
  await expect
    .poll(
      async () => {
        const width = (await sidebar.boundingBox())?.width ?? 0;
        stable = Math.abs(width - previous) < 0.1 ? stable + 1 : 0;
        previous = width;
        return stable;
      },
      { intervals: [16, 32, 64] },
    )
    .toBeGreaterThanOrEqual(2);
}

async function streamingView(page: Page, active: boolean) {
  await page.evaluate(
    async ({ url, active }) => {
      const { useChatStore } = (await import(url)) as SharedChatModule;
      const conversationId = useChatStore.getState().activeConversationId;
      if (!conversationId) throw new Error('The actual composer has no active conversation');
      if (active) useChatStore.getState().startStreaming(conversationId);
      else useChatStore.getState().stopStreaming(conversationId);
    },
    { url: SHARED_CHAT_URL, active },
  );
}

async function box(locator: Locator) {
  const value = await locator.boundingBox();
  expect(value).not.toBeNull();
  return value!;
}

async function capture(page: Page, slug: string, phase: string) {
  if (!EVIDENCE) return;
  await mkdir(EVIDENCE, { recursive: true });
  await page.screenshot({ path: join(EVIDENCE, `${slug}-${phase}.png`), animations: 'disabled' });
}

for (const coarse of [false, true]) {
  test.describe(`v3 host presentation ${coarse ? 'coarse' : 'fine'}`, () => {
    test.use({ hasTouch: coarse });

    for (const theme of ['light', 'dark'] as const) {
      for (const width of [320, 390, 1024, 1440]) {
        test(`${width}px ${theme}: context, primary actions and inactive row menus`, async ({
          page,
        }) => {
          test.setTimeout(60_000);
          await page.setViewportSize({ width, height: 900 });
          await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
          await page.route('**/*', (route) => {
            const url = new URL(route.request().url());
            if (url.hostname === '127.0.0.1' || url.hostname === 'localhost')
              return route.continue();
            return route.abort();
          });
          const llmRequests: Array<{ method: string; path: string }> = [];
          page.on('request', (request) => {
            const path = new URL(request.url()).pathname;
            if (/\/api\/llm\//u.test(path)) llmRequests.push({ method: request.method(), path });
          });
          await injectMockCloudAuth(page);
          await mockCloudApi(page, {
            models: [{ id: MODEL_ID, name: MODEL.name, provider: MODEL.provider }],
            conversations: [
              cloudConversationFixture({
                id: ACTIVE_ID,
                title: 'Active presentation chat',
                model: MODEL_ID,
              }),
              cloudConversationFixture({ id: INACTIVE_ID, title: 'Inactive presentation chat' }),
            ],
            messagesByConversation: {
              [ACTIVE_ID]: [
                cloudMessageFixture({
                  id: '00000000-0000-4000-8000-000000000104',
                  role: 'user',
                  content: 'Review this local presentation fixture.',
                }),
                cloudMessageFixture({
                  id: '00000000-0000-4000-8000-000000000105',
                  role: 'assistant',
                  content: REPLY_MARKDOWN,
                }),
              ],
            },
          });
          await page.goto('/', { waitUntil: 'domcontentloaded' });
          await page.waitForLoadState('networkidle');
          await expectCloudShellReady(page);
          await seedView(page, theme);
          await page.getByRole('button', { name: 'Active presentation chat', exact: true }).click();
          await expect(page.locator(`[data-conversation-id="${ACTIVE_ID}"]`)).toHaveAttribute(
            'data-conversation-active',
            'true',
          );
          await expect(page.getByText(REPLY_PARAGRAPH, { exact: true })).toBeVisible();
          await setSidebar(page, width < 960);
          await expect
            .poll(() => page.evaluate(() => document.documentElement.classList.contains('dark')))
            .toBe(theme === 'dark');
          expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(coarse);

          const slug = `${width}-${theme}-${coarse ? 'coarse' : 'fine'}`;
          const host = page.locator('[data-composer-host-controls]');
          const primary = page.locator('[data-composer-primary-controls]');
          const folder = host.getByRole('button', {
            name: `Workspace /workspace/${FOLDER}. Change folder`,
            exact: true,
          });
          await expect(folder).toBeVisible();
          await expect(
            host.getByRole('button', { name: /Terminal: Workspace write/ }),
          ).toBeVisible();
          await expect(host.getByRole('button', { name: /Approvals: Automatic/ })).toBeVisible();
          const layout = await host.evaluate((element) => {
            const primary = document.querySelector('[data-composer-primary-controls]');
            if (!primary) throw new Error('The actual primary action row is missing');
            const rect = (node: Element) => {
              const { x, y, width, height } = node.getBoundingClientRect();
              return { x, y, width, height };
            };
            return {
              host: rect(element),
              primary: rect(primary),
              buttons: [...element.querySelectorAll('button')].map(rect),
            };
          });
          const hostBox = layout.host;
          const primaryBox = layout.primary;
          expect(Math.abs(hostBox.width - primaryBox.width)).toBeLessThanOrEqual(1);
          expect(hostBox.x).toBeGreaterThanOrEqual(0);
          expect(hostBox.x + hostBox.width).toBeLessThanOrEqual(width + 1);
          for (const bounds of layout.buttons) {
            expect(bounds.x).toBeGreaterThanOrEqual(hostBox.x - 1);
            expect(bounds.x + bounds.width).toBeLessThanOrEqual(hostBox.x + hostBox.width + 1);
            if (coarse) expect(bounds.height).toBeGreaterThanOrEqual(44);
          }
          const input = page.getByRole('textbox', { name: /chat message input/i });
          const reply = page.locator('.chat-response-body').filter({ hasText: REPLY_PARAGRAPH });
          await expect(reply).toHaveCount(1);
          const typography = await page.evaluate(
            ({ body, editor, paragraph }) => {
              if (!body || !editor) throw new Error('The actual reply or composer is missing');
              const prose = [...body.querySelectorAll('p')].find(
                (node) => node.textContent === paragraph,
              );
              if (!prose) throw new Error('The actual reply prose is missing');
              const metrics = (node: Element) => {
                const style = getComputedStyle(node);
                return {
                  fontSize: Number.parseFloat(style.fontSize),
                  lineHeight: Number.parseFloat(style.lineHeight),
                  fontWeight: style.fontWeight,
                };
              };
              return {
                body: metrics(body),
                prose: metrics(prose),
                headings: ['h1', 'h2', 'h3'].map((level) => {
                  const heading = body.querySelector(`${level}[data-markdown-heading]`);
                  if (!heading) throw new Error(`The actual ${level} is missing`);
                  return { level, ...metrics(heading) };
                }),
                composer: { tag: editor.tagName, ...metrics(editor) },
              };
            },
            {
              body: await reply.elementHandle(),
              editor: await input.elementHandle(),
              paragraph: REPLY_PARAGRAPH,
            },
          );
          expect(typography.body).toMatchObject({ fontSize: 16, lineHeight: 26 });
          expect(typography.prose).toMatchObject({ fontSize: 16, lineHeight: 26 });
          for (const [index, fontSize, lineHeight] of [
            [0, 20, 28],
            [1, 18, 28],
            [2, 16, 26],
          ] as const) {
            expect(typography.headings[index]!.fontSize).toBeCloseTo(fontSize, 2);
            expect(typography.headings[index]!.lineHeight).toBeCloseTo(lineHeight, 2);
          }
          expect(typography.composer.fontSize).toBe(16);
          await input.fill('Check presentation without sending a provider request.');
          const send = primary.getByRole('button', { name: /send message/i });
          const sendBox = await box(send);
          for (const action of [
            primary.getByRole('button', { name: 'Add attachment', exact: true }),
            primary.getByRole('button', { name: 'Select model', exact: true }),
            send,
          ]) {
            const bounds = await box(action);
            expect(bounds.x).toBeGreaterThanOrEqual(0);
            expect(bounds.x + bounds.width).toBeLessThanOrEqual(width + 1);
          }
          await capture(page, slug, 'context');
          await input.fill('');
          await folder.focus();
          await streamingView(page, true);
          const stop = primary.getByRole('button', { name: 'Stop the current response' });
          await expect(stop).toBeVisible();
          await expect(folder).toBeFocused();
          const stopBox = await box(stop);
          expect(
            Math.abs(stopBox.x + stopBox.width - sendBox.x - sendBox.width),
          ).toBeLessThanOrEqual(1);
          await capture(page, slug, 'stop');
          await streamingView(page, false);

          await setSidebar(page, false);
          const inactive = page.locator(`[data-conversation-id="${INACTIVE_ID}"]`);
          await inactive
            .getByRole('button', { name: 'Inactive presentation chat', exact: true })
            .focus();
          await page.keyboard.press('Tab');
          const more = inactive.getByRole('button', { name: 'More options', exact: true });
          await expect(more).toBeFocused();
          await expect(more).toHaveCSS('opacity', '1');
          if (coarse) {
            const target = await box(more);
            expect(target.width).toBeGreaterThanOrEqual(44);
            expect(target.height).toBeGreaterThanOrEqual(44);
          }
          await page.keyboard.press('Enter');
          const menu = page.getByRole('menu');
          await expect(menu).toBeVisible();
          const menuBox = await box(menu);
          expect(menuBox.x).toBeGreaterThanOrEqual(0);
          expect(menuBox.y).toBeGreaterThanOrEqual(0);
          expect(menuBox.x + menuBox.width).toBeLessThanOrEqual(width + 1);
          expect(menuBox.y + menuBox.height).toBeLessThanOrEqual(901);
          await capture(page, slug, 'chat-menu');
          await page.keyboard.press('Escape');
          await expect(more).toBeFocused();
          await expect(page.locator(`[data-conversation-id="${ACTIVE_ID}"]`)).toHaveAttribute(
            'data-conversation-active',
            'true',
          );

          const project = page.locator(`[data-project-id="${PROJECT_ID}"]`);
          await project
            .getByRole('button', { name: 'Long workspace presentation project', exact: true })
            .focus();
          await page.keyboard.press('Tab');
          await expect(project.getByRole('button', { name: /new chat/i })).toBeFocused();
          await page.keyboard.press('Tab');
          const projectMore = project.getByRole('button', { name: 'More options', exact: true });
          await expect(projectMore).toBeFocused();
          if (coarse) {
            const target = await box(projectMore);
            expect(target.width).toBeGreaterThanOrEqual(44);
            expect(target.height).toBeGreaterThanOrEqual(44);
          }
          await page.keyboard.press('Enter');
          const projectMenuBox = await box(page.getByRole('menu'));
          expect(projectMenuBox.x).toBeGreaterThanOrEqual(0);
          expect(projectMenuBox.y).toBeGreaterThanOrEqual(0);
          expect(projectMenuBox.x + projectMenuBox.width).toBeLessThanOrEqual(width + 1);
          expect(projectMenuBox.y + projectMenuBox.height).toBeLessThanOrEqual(901);
          await capture(page, slug, 'project-menu');
          await page.keyboard.press('Escape');
          await expect(projectMore).toBeFocused();
          const inferenceRequests = llmRequests.filter(
            (request) =>
              request.method !== 'GET' || request.path !== '/api/llm/v1/chat/completions/runs',
          );
          expect(inferenceRequests).toEqual([]);

          if (EVIDENCE) {
            await writeFile(
              join(EVIDENCE, `${slug}.json`),
              JSON.stringify(
                {
                  scope:
                    'Retained Tauri UI in Chromium with mocked Cloud API and disposable view state; not native-host parity',
                  width,
                  theme,
                  coarse,
                  hostBox,
                  primaryBox,
                  sendBox,
                  stopBox,
                  menuBox,
                  projectMenuBox,
                  typography,
                  inferenceRequests,
                  readOnlyRunDiscoveryRequests: llmRequests,
                  media: await page.evaluate(() => ({
                    coarse: matchMedia('(pointer: coarse)').matches,
                    hoverNone: matchMedia('(hover: none)').matches,
                    darkClass: document.documentElement.classList.contains('dark'),
                  })),
                },
                null,
                2,
              ),
            );
          }
        });
      }
    }
  });
}
