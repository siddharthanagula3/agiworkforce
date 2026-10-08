import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';
import {
  getProviderOfferings,
  providerOfferingDisplayName,
  type ProviderOffering,
} from '@agiworkforce/types';
import { apiCall, signIn } from './qa-capability-harness';

/**
 * A free-quota media turn answers once, when the media is finished, so whatever
 * the transcript shows before that response is all the reader has for a minute
 * or more. jsdom cannot hold a request open against a real send path; this
 * holds the route and reads the page while nothing has come back.
 *
 * A managed video is a durable job instead: the page polls it, shows the
 * percentage the route reports, and can ask for it to stop.
 *
 * Every write the page attempts, and every request of any kind to a route that
 * could call a model, is either answered here or refused and recorded, so no
 * run of this spec can reach a model provider.
 */

const CHAT_ROUTE = '/chat';
const SPEC_TIMEOUT_MS = 3 * 60_000;
const LOAD_TIMEOUT_MS = 30_000;
const TURN_TIMEOUT_MS = 30_000;
const CONSENT_WAIT_MS = 6_000;
const HELD_RESPONSE_OBSERVATION_MS = 2_500;
const WAVE_SAMPLE_GAP_MS = 400;
const THEME_SETTLE_MS = 600;
const MID_CHANNEL = 128;
const GEOMETRY_TOLERANCE_PX = 1;
const MIN_TEXT_PX = 14;

const COMPOSER_LABEL = /message input/i;
const CONSENT_DISMISS_LABEL = 'Close and reject non-essential cookies';
const THINKING_PLACEHOLDER = 'Thinking...';
const STORED_VIDEO_STATUS_LINE = 'Video generated.';
const VIDEO_READY_LINE = 'Your video is ready.';

const MODEL_BACKED_PATH = /^\/api\/(?:llm|media|models\/[^/]+\/completions)(?:\/|$)/;
// Under the media prefix, but it reads schema readiness and configuration only.
const MEDIA_AVAILABILITY_PATH = '/api/media/availability';
const FREE_CATALOGUE_ROUTE = '**/api/models/free-quota';
const EXPERIENTIAL_CATALOGUE_ROUTE = '**/api/models/experiential-free';
const FREE_COMPLETIONS_ROUTE = '**/api/models/free-quota/completions';
const MESSAGES_ROUTE = '**/api/chat/conversations/*/messages';
const VIDEO_STATUS_ROUTE = '**/api/media/video/status?*';
const VIDEO_CANCEL_ROUTE = '**/api/media/video/cancel';
const API_ROUTE = '**/api/**';
const CONVERSATIONS_PATH = '/api/chat/conversations';
const CONVERSATION_PATH_PATTERN = /^\/api\/chat\/conversations\/[0-9a-f-]{36}$/;
const READ_METHODS: ReadonlySet<string> = new Set(['GET', 'HEAD', 'OPTIONS']);
// Rows on the QA account and nothing else: neither route calls a model.
const DATABASE_ONLY_WRITES: ReadonlyArray<{ method: string; path: RegExp }> = [
  { method: 'POST', path: /^\/api\/consent$/ },
  { method: 'PUT', path: CONVERSATION_PATH_PATTERN },
  { method: 'DELETE', path: CONVERSATION_PATH_PATTERN },
];

const ASSISTANT_BUBBLE = '[data-role="assistant"]';
const PLACEHOLDER = 'media-generation-placeholder';
const FRAME = 'media-generation-frame';
const DOT_FIELD = 'media-generation-dot-field';

const FILE_ID = '5f0c1d2e-3a4b-4c5d-8e6f-7a8b9c0d1e2f';
const FILE_URL = `/api/files/${FILE_ID}`;
const FILE_ROUTE = `**${FILE_URL}`;
const FIXTURE_ISSUER = 'Fixture Cloud';
const JOB = {
  taskId: '0b6f5c1a-7d2e-4f38-9a41-c5d6e7f8a9b0',
  userMessageId: '1c7a6d2b-8e3f-4049-ab52-d6e7f8a9b0c1',
  assistantMessageId: '2d8b7e3c-9f40-415a-bc63-e7f8a9b0c1d2',
  prompt: 'A paper boat crossing a puddle',
  aspect: '16:9',
  savedProgress: 12,
  reportedProgress: 33,
  startedMsAgo: 48_000,
  cancelAnswer:
    'Cancellation was recorded, but this provider exposes no verified cancellation operation.',
} as const;
const JOB_POLL_TIMEOUT_MS = 20_000;
const MIN_TARGET_PX = 24;
const CLIP_MS = 700;

const LAYOUTS = [
  { name: 'desktop', viewport: { width: 1440, height: 900 } },
  { name: 'phone', viewport: { width: 390, height: 844 } },
] as const;

function offering(protocol: string, sized: (entry: ProviderOffering) => boolean) {
  const found = Object.entries(getProviderOfferings()).find(
    ([, entry]) =>
      entry.identityStatus === 'exact' && entry.quotaProbeProtocol === protocol && sized(entry),
  );
  const name = found && providerOfferingDisplayName(found[0]);
  if (!found || !name) throw new Error(`the catalog exposes no free ${protocol} offering`);
  return { key: found[0], entry: found[1], name };
}

const VIDEO = offering('video-async', (entry) => Boolean(entry.quotaVideoRatio));
const IMAGE = offering('image-sync', (entry) => Boolean(entry.quotaImageSize));

const TURNS = [
  {
    category: 'video',
    ...VIDEO,
    categoryOption: 'video',
    prompt: 'A paper boat crossing a puddle',
    label: 'Creating your video',
    answer: `[View generated video](<${FILE_URL}>)`,
    media: 'video[aria-label="Generated video"]',
    contentType: 'video/webm',
    size: { width: 1280, height: 720 },
  },
  {
    category: 'image',
    ...IMAGE,
    categoryOption: 'image',
    prompt: 'A paper boat on a puddle',
    label: 'Creating your image',
    answer: `![Generated image](<${FILE_URL}>)`,
    media: `img[src*="${FILE_ID}"]`,
    contentType: 'image/png',
    size: { width: 1024, height: 1024 },
  },
] as const;

type Turn = (typeof TURNS)[number];
const VIDEO_TURN = TURNS[0];

function catalogue() {
  return {
    issuer: FIXTURE_ISSUER,
    observedOn: '2026-10-01',
    evidenceUrl: 'https://provider.example/free',
    reportedEligible: TURNS.length,
    reportedUnavailable: 0,
    models: TURNS.map(({ key, entry }) => ({
      key,
      displayName: entry.displayName,
      providerModelId: entry.providerModelId,
      category: entry.category,
      limit: null,
      unit: null,
      consumedApproximate: null,
      expiresOn: null,
      status: 'ready',
    })),
  };
}

function completionStream(content: string): string {
  const frames = [
    { choices: [{ index: 0, delta: { content }, finish_reason: null }] },
    { choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] },
  ];
  return `${frames.map((frame) => `data: ${JSON.stringify(frame)}\n\n`).join('')}data: [DONE]\n\n`;
}

/** Drawn and encoded in the page, so the finished state has real bytes to show. */
async function renderFixtureMedia(page: Page, turn: Turn): Promise<Buffer> {
  const encoded = await page.evaluate(
    async ({ width, height, video, clipMs }) => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('no 2d context for the fixture media');
      const paint = (shift: number) => {
        const sky = context.createLinearGradient(0, 0, 0, height);
        sky.addColorStop(0, 'rgb(38, 52, 74)');
        sky.addColorStop(1, 'rgb(120, 146, 170)');
        context.fillStyle = sky;
        context.fillRect(0, 0, width, height);
        context.fillStyle = 'rgb(236, 232, 222)';
        context.beginPath();
        context.moveTo(width * (0.36 + shift), height * 0.62);
        context.lineTo(width * (0.64 + shift), height * 0.62);
        context.lineTo(width * (0.58 + shift), height * 0.72);
        context.lineTo(width * (0.42 + shift), height * 0.72);
        context.closePath();
        context.fill();
        context.beginPath();
        context.moveTo(width * (0.5 + shift), height * 0.36);
        context.lineTo(width * (0.5 + shift), height * 0.6);
        context.lineTo(width * (0.6 + shift), height * 0.6);
        context.closePath();
        context.fill();
      };
      const toBase64 = (blob: Blob) =>
        new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onerror = () => reject(new Error('fixture media could not be read'));
          reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
          reader.readAsDataURL(blob);
        });
      paint(0);
      if (!video) {
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve));
        if (!blob) throw new Error('fixture image could not be encoded');
        return toBase64(blob);
      }
      const recorder = new MediaRecorder(canvas.captureStream(), { mimeType: 'video/webm' });
      const chunks: Blob[] = [];
      recorder.ondataavailable = (event) => chunks.push(event.data);
      const stopped = new Promise<void>((resolve) => {
        recorder.onstop = () => resolve();
      });
      recorder.start();
      const started = performance.now();
      await new Promise<void>((resolve) => {
        const step = () => {
          const elapsed = performance.now() - started;
          paint((elapsed / clipMs) * 0.04);
          if (elapsed < clipMs) requestAnimationFrame(step);
          else resolve();
        };
        requestAnimationFrame(step);
      });
      recorder.stop();
      await stopped;
      return toBase64(new Blob(chunks, { type: 'video/webm' }));
    },
    { ...turn.size, video: turn.category === 'video', clipMs: CLIP_MS },
  );
  return Buffer.from(encoded, 'base64');
}

interface NetworkGuard {
  unexpectedRequests: string[];
  createdConversations: string[];
}

async function guardNetwork(page: Page): Promise<NetworkGuard> {
  const unexpectedRequests: string[] = [];
  const createdConversations: string[] = [];
  await page.route(API_ROUTE, async (route) => {
    const request = route.request();
    const method = request.method();
    const { pathname } = new URL(request.url());
    const refuse = () => {
      unexpectedRequests.push(`${method} ${pathname}`);
      return route.abort('blockedbyclient');
    };
    const isRead = READ_METHODS.has(method);
    if (isRead && pathname === MEDIA_AVAILABILITY_PATH) return route.fallback();
    if (MODEL_BACKED_PATH.test(pathname)) return refuse();
    if (isRead) return route.fallback();
    if (method === 'POST' && pathname === CONVERSATIONS_PATH) {
      const response = await route.fetch();
      const body = (await response.json().catch(() => null)) as {
        conversation?: { id?: string };
      } | null;
      if (body?.conversation?.id) createdConversations.push(body.conversation.id);
      return route.fulfill({ response });
    }
    const databaseOnly = DATABASE_ONLY_WRITES.some(
      (write) => write.method === method && write.path.test(pathname),
    );
    return databaseOnly ? route.fallback() : refuse();
  });
  return { unexpectedRequests, createdConversations };
}

async function deleteConversations(page: Page, guard: NetworkGuard): Promise<void> {
  for (const id of guard.createdConversations) {
    await apiCall(page, `${CONVERSATIONS_PATH}/${id}`, { method: 'DELETE' });
  }
}

interface HeldTurn {
  completionRequests: () => number;
  completionAnswered: () => boolean;
  release: () => void;
}

async function holdFreeMediaTurn(page: Page, turn: Turn, media: Buffer): Promise<HeldTurn> {
  let completionRequests = 0;
  let completionAnswered = false;
  let release: () => void = () => undefined;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });

  await page.route(FREE_CATALOGUE_ROUTE, (route) => route.fulfill({ json: catalogue() }));
  await page.route(EXPERIENTIAL_CATALOGUE_ROUTE, (route) =>
    route.fulfill({ status: 403, json: { error: 'Available on the Free plan.' } }),
  );
  await page.route(FILE_ROUTE, (route) =>
    route.fulfill({ status: 200, contentType: turn.contentType, body: media }),
  );
  await page.route(MESSAGES_ROUTE, (route) => {
    const request = route.request();
    if (READ_METHODS.has(request.method())) return route.fallback();
    const saved = request.postDataJSON() as {
      id: string;
      role: string;
      content: string;
      model?: string;
      metadata?: Record<string, unknown>;
    };
    return route.fulfill({
      status: 201,
      json: {
        message: {
          id: saved.id,
          role: saved.role,
          content: saved.content,
          model: saved.model ?? null,
          provider: null,
          input_tokens: 0,
          output_tokens: 0,
          created_at: new Date().toISOString(),
          metadata: saved.metadata ?? null,
        },
      },
    });
  });
  await page.route(FREE_COMPLETIONS_ROUTE, async (route) => {
    completionRequests += 1;
    await held;
    completionAnswered = true;
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      headers: { 'X-AGI-Resolved-Model': turn.key },
      body: completionStream(turn.answer),
    });
  });

  return {
    completionRequests: () => completionRequests,
    completionAnswered: () => completionAnswered,
    release,
  };
}

async function chooseFreeModel(page: Page, turn: Turn): Promise<void> {
  await page.locator('#model-selector').click();
  const panel = page.getByRole('dialog', { name: 'Models' });
  const category = panel.getByRole('combobox', { name: 'Free model category' });
  await expect(category).toBeVisible({ timeout: LOAD_TIMEOUT_MS });
  await category.selectOption(turn.categoryOption);
  await panel
    .getByRole('group', { name: `${FIXTURE_ISSUER} free models` })
    .getByRole('button', { name: turn.name, exact: true })
    .click();
  await expect(page.getByRole('dialog', { name: 'Models' })).toHaveCount(0);
}

/** Relative to the turn, so a transcript that scrolls between samples reads the same. */
async function boxWithin(bubble: Locator, locator: Locator) {
  const [outer, inner] = await Promise.all([bubble.boundingBox(), locator.boundingBox()]);
  if (!outer || !inner) throw new Error('the measured element has no box');
  return { x: inner.x - outer.x, y: inner.y - outer.y, width: inner.width, height: inner.height };
}

async function dotFieldInk(page: Page): Promise<{ lit: number; sum: number; red: number }> {
  return page.getByTestId(DOT_FIELD).evaluate((node) => {
    const canvas = node as HTMLCanvasElement;
    const pixels = canvas.getContext('2d')?.getImageData(0, 0, canvas.width, canvas.height).data;
    let lit = 0;
    let sum = 0;
    let red = 0;
    for (let index = 3; pixels && index < pixels.length; index += 4) {
      const alpha = pixels[index] ?? 0;
      if (alpha === 0) continue;
      lit += 1;
      sum += alpha;
      red = pixels[index - 3] ?? 0;
    }
    return { lit, sum, red };
  });
}

type Scheme = 'dark' | 'light';

async function showTheme(page: Page, scheme: Scheme): Promise<void> {
  await page.emulateMedia({ colorScheme: scheme });
  await expect(page.locator('html')).toHaveClass(new RegExp(scheme));
  await page.waitForTimeout(THEME_SETTLE_MS);
}

async function dotsAreLight(page: Page): Promise<boolean> {
  return (await dotFieldInk(page)).red > MID_CHANNEL;
}

async function smallestTextPx(scope: Locator): Promise<number> {
  return scope.evaluate((root) => {
    let smallest = Number.POSITIVE_INFINITY;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const parent = node.parentElement;
      if (!parent || !node.textContent?.trim()) continue;
      smallest = Math.min(smallest, Number.parseFloat(getComputedStyle(parent).fontSize));
    }
    return smallest;
  });
}

async function capture(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  const path = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path });
  await testInfo.attach(name, { path, contentType: 'image/png' });
}

for (const layout of LAYOUTS) {
  for (const turn of TURNS) {
    test.describe(`free ${turn.category} turn (${layout.name})`, () => {
      test.use({ viewport: layout.viewport, colorScheme: 'dark' });
      test.setTimeout(SPEC_TIMEOUT_MS);

      test(`shows the ${turn.category} placeholder until the held response lands`, async ({
        page,
      }, testInfo) => {
        await signIn(page);
        const media = await renderFixtureMedia(page, turn);
        const guard = await guardNetwork(page);
        const held = await holdFreeMediaTurn(page, turn, media);
        await page.goto(CHAT_ROUTE, { waitUntil: 'domcontentloaded' });
        const composer = page.getByRole('textbox', { name: COMPOSER_LABEL }).first();
        await expect(composer).toBeEditable({ timeout: LOAD_TIMEOUT_MS });
        await page
          .getByRole('button', { name: CONSENT_DISMISS_LABEL })
          .click({ timeout: CONSENT_WAIT_MS })
          .catch(() => undefined);

        try {
          await chooseFreeModel(page, turn);
          await composer.fill(turn.prompt);
          await composer.press('Enter');

          const bubble = page.locator(ASSISTANT_BUBBLE).last();
          const placeholder = bubble.getByTestId(PLACEHOLDER);
          await expect(placeholder).toBeVisible({ timeout: TURN_TIMEOUT_MS });
          await expect(placeholder).toHaveAttribute('data-category', turn.category);
          await expect.poll(held.completionRequests, { timeout: TURN_TIMEOUT_MS }).toBe(1);

          await page.waitForTimeout(HELD_RESPONSE_OBSERVATION_MS);
          expect(held.completionAnswered()).toBe(false);
          await expect(placeholder).toBeVisible();
          await expect(bubble.getByText(THINKING_PLACEHOLDER)).toHaveCount(0);
          await expect(placeholder.getByRole('status')).toHaveText(turn.label);
          await expect(placeholder.getByRole('progressbar')).toHaveCount(0);
          await expect(placeholder.getByRole('button')).toHaveCount(0);
          expect(await placeholder.textContent()).not.toContain('%');
          expect(await smallestTextPx(placeholder)).toBeGreaterThanOrEqual(MIN_TEXT_PX);

          const before = await dotFieldInk(page);
          await page.waitForTimeout(WAVE_SAMPLE_GAP_MS);
          const after = await dotFieldInk(page);
          expect(before.lit).toBeGreaterThan(0);
          expect(after.sum).not.toBe(before.sum);

          const reserved = await boxWithin(bubble, placeholder.getByTestId(FRAME));
          expect(await dotsAreLight(page)).toBe(true);
          await capture(page, testInfo, `${turn.category}-${layout.name}-dark-generating`);
          await showTheme(page, 'light');
          await expect.poll(() => dotsAreLight(page)).toBe(false);
          await capture(page, testInfo, `${turn.category}-${layout.name}-light-generating`);
          await showTheme(page, 'dark');

          held.release();
          const result = bubble.locator(turn.media);
          await expect(result).toBeVisible({ timeout: TURN_TIMEOUT_MS });
          await expect(placeholder).toHaveCount(0);
          await expect(bubble.getByText(THINKING_PLACEHOLDER)).toHaveCount(0);
          await expect
            .poll(() =>
              result.evaluate((node) =>
                node instanceof HTMLVideoElement
                  ? node.readyState
                  : Number((node as HTMLImageElement).complete),
              ),
            )
            .toBeGreaterThan(0);
          const shown = await boxWithin(bubble, result);
          expect(Math.abs(shown.width - reserved.width)).toBeLessThanOrEqual(GEOMETRY_TOLERANCE_PX);
          expect(Math.abs(shown.height - reserved.height)).toBeLessThanOrEqual(
            GEOMETRY_TOLERANCE_PX,
          );
          expect(Math.abs(shown.x - reserved.x)).toBeLessThanOrEqual(GEOMETRY_TOLERANCE_PX);
          if (turn.category === 'video') {
            expect(Math.abs(shown.y - reserved.y)).toBeLessThanOrEqual(GEOMETRY_TOLERANCE_PX);
            await expect(bubble.getByText(VIDEO_READY_LINE)).toHaveCount(1);
            await expect(bubble.getByText(STORED_VIDEO_STATUS_LINE)).toHaveCount(0);
          }

          await capture(page, testInfo, `${turn.category}-${layout.name}-dark-finished`);
          await showTheme(page, 'light');
          await capture(page, testInfo, `${turn.category}-${layout.name}-light-finished`);

          expect(held.completionRequests()).toBe(1);
          expect(guard.unexpectedRequests).toEqual([]);
        } finally {
          held.release();
          await deleteConversations(page, guard);
        }
      });
    });
  }
}

interface ManagedJob {
  statusRequests: () => number;
  cancelBodies: unknown[];
  complete: () => void;
}

async function serveManagedVideoJob(
  page: Page,
  conversationId: string,
  media: Buffer,
): Promise<ManagedJob> {
  let statusRequests = 0;
  let completed = false;
  const cancelBodies: unknown[] = [];
  const startedAt = Date.now() - JOB.startedMsAgo;
  const stored = (id: string, parentId: string | null, role: string, offsetMs: number) => ({
    id,
    parent_id: parentId,
    role,
    model: null,
    provider: null,
    input_tokens: 0,
    output_tokens: 0,
    created_at: new Date(startedAt + offsetMs).toISOString(),
  });

  await page.route(`**${CONVERSATIONS_PATH}/${conversationId}?*`, async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    const response = await route.fetch();
    const body = (await response.json()) as Record<string, unknown>;
    return route.fulfill({
      response,
      json: {
        ...body,
        messages: [
          { ...stored(JOB.userMessageId, null, 'user', 0), content: JOB.prompt, metadata: null },
          {
            ...stored(JOB.assistantMessageId, JOB.userMessageId, 'assistant', 1),
            content: '',
            metadata: {
              toolType: 'video-generation',
              videoStatus: 'processing',
              videoTaskId: JOB.taskId,
              videoAspect: JOB.aspect,
              videoProgress: JOB.savedProgress,
            },
          },
        ],
        total: 2,
        hasMore: false,
      },
    });
  });
  await page.route(VIDEO_STATUS_ROUTE, (route) => {
    statusRequests += 1;
    return route.fulfill({
      json: completed
        ? { success: true, task_id: JOB.taskId, status: 'completed', video_url: FILE_URL }
        : {
            success: true,
            task_id: JOB.taskId,
            status: 'processing',
            progress: JOB.reportedProgress,
          },
    });
  });
  await page.route(VIDEO_CANCEL_ROUTE, (route) => {
    cancelBodies.push(route.request().postDataJSON());
    return route.fulfill({ json: { success: true, message: JOB.cancelAnswer } });
  });
  await page.route(FILE_ROUTE, (route) =>
    route.fulfill({ status: 200, contentType: VIDEO_TURN.contentType, body: media }),
  );

  return {
    statusRequests: () => statusRequests,
    cancelBodies,
    complete: () => {
      completed = true;
    },
  };
}

for (const layout of LAYOUTS) {
  test.describe(`managed video job (${layout.name})`, () => {
    test.use({ viewport: layout.viewport, colorScheme: 'dark' });
    test.setTimeout(SPEC_TIMEOUT_MS);

    test('shows the reported percentage and a working stop control', async ({ page }, testInfo) => {
      await signIn(page);
      const media = await renderFixtureMedia(page, VIDEO_TURN);
      const guard = await guardNetwork(page);
      try {
        const created = await apiCall(page, CONVERSATIONS_PATH, {
          method: 'POST',
          body: { title: 'Media placeholder spec' },
        });
        expect(created.status).toBe(201);
        const conversationId = guard.createdConversations[0];
        if (!conversationId) throw new Error('the conversation was not created');
        const job = await serveManagedVideoJob(page, conversationId, media);

        await page.goto(`${CHAT_ROUTE}/${conversationId}`, { waitUntil: 'domcontentloaded' });
        const bubble = page.locator(ASSISTANT_BUBBLE).last();
        const placeholder = bubble.getByTestId(PLACEHOLDER);
        await expect(placeholder).toBeVisible({ timeout: LOAD_TIMEOUT_MS });
        await page
          .getByRole('button', { name: CONSENT_DISMISS_LABEL })
          .click({ timeout: CONSENT_WAIT_MS })
          .catch(() => undefined);

        const pill = placeholder.getByRole('progressbar', { name: 'Video progress' });
        await expect(pill).toHaveText(`${JOB.reportedProgress}%`, { timeout: JOB_POLL_TIMEOUT_MS });
        await expect(pill).toHaveAttribute('aria-valuenow', String(JOB.reportedProgress));
        await expect(placeholder.getByRole('status')).toHaveText(VIDEO_TURN.label);
        await expect(bubble.getByText(THINKING_PLACEHOLDER)).toHaveCount(0);
        expect(await smallestTextPx(placeholder)).toBeGreaterThanOrEqual(MIN_TEXT_PX);
        const stop = placeholder.getByRole('button', { name: 'Stop generating' });
        const stopBox = await boxWithin(bubble, stop);
        expect(stopBox.height).toBeGreaterThanOrEqual(MIN_TARGET_PX);

        const reserved = await boxWithin(bubble, placeholder.getByTestId(FRAME));
        await capture(page, testInfo, `managed-video-${layout.name}-dark-generating`);
        await showTheme(page, 'light');
        await capture(page, testInfo, `managed-video-${layout.name}-light-generating`);
        await showTheme(page, 'dark');

        await stop.click();
        await expect(placeholder.getByText(JOB.cancelAnswer)).toBeVisible();
        await expect(stop).toHaveCount(0);
        expect(job.cancelBodies).toEqual([{ task_id: JOB.taskId }]);

        job.complete();
        const result = bubble.locator(VIDEO_TURN.media);
        await expect(result).toBeVisible({ timeout: JOB_POLL_TIMEOUT_MS });
        await expect(placeholder).toHaveCount(0);
        await expect
          .poll(() => result.evaluate((node) => (node as HTMLVideoElement).readyState))
          .toBeGreaterThan(0);
        const shown = await boxWithin(bubble, result);
        for (const side of ['x', 'y', 'width', 'height'] as const) {
          expect(Math.abs(shown[side] - reserved[side])).toBeLessThanOrEqual(GEOMETRY_TOLERANCE_PX);
        }
        await expect(bubble.getByText(VIDEO_READY_LINE)).toHaveCount(1);

        await capture(page, testInfo, `managed-video-${layout.name}-dark-finished`);
        await showTheme(page, 'light');
        await capture(page, testInfo, `managed-video-${layout.name}-light-finished`);

        expect(job.statusRequests()).toBeGreaterThan(0);
        expect(guard.unexpectedRequests).toEqual([]);
      } finally {
        await deleteConversations(page, guard);
      }
    });
  });
}
