import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  MANAGED_CLOUD_SETTINGS_PREFERENCES_PATH,
  managedCloudConversationPath,
  type ManagedCloudConversationResponse,
} from '@agiworkforce/cloud-contracts';

import { APPEARANCE_NAMESPACE } from '../features/settings/lib/appearance-namespace';
import { signIn } from './qa-capability-harness';

/**
 * The enlarged chat image has to sit above the whole conversation, which is
 * stacking and containing-block behaviour jsdom cannot see: react-window moves
 * each transcript row with a transform, and a transformed ancestor becomes the
 * containing block of any `position: fixed` descendant.
 *
 * The conversation is answered here, so no conversation is stored on the QA
 * account and no request can reach a model. The account's stored theme would
 * otherwise override the emulated colour scheme after sign-in, so the settings
 * read is answered with the scheme under test and settings writes are refused.
 */

const CHAT_ROUTE = '/chat';
const MODEL_BACKED_PATH = /^\/api\/(?:llm|media|models\/[^/]+\/completions)(?:\/|$)/;
// Under the media prefix, but it reads schema readiness and configuration only.
const MEDIA_AVAILABILITY_PATH = '/api/media/availability';
const API_ROUTE = '**/api/**';

const SPEC_TIMEOUT_MS = 3 * 60_000;
const LOAD_TIMEOUT_MS = 30_000;
const CONSENT_WAIT_MS = 6_000;
const SETTLE_MS = 300;
const WHEEL_DELTA_PX = 400;
const EDGE_INSET_PX = 2;
const GEOMETRY_TOLERANCE_PX = 1;

const CONSENT_DISMISS_LABEL = 'Close and reject non-essential cookies';
const TRANSCRIPT_SCROLLER = '[role="log"][aria-label="Chat messages"]';
const VIEWER_NAME = 'Image preview';
const CLOSE_LABEL = 'Close preview';

const CONVERSATION_ID = '7c1e4a52-3b9d-4f60-8a17-5d2e6f8091a3';
const IMAGE_ATTACHMENT_ID = '8d2f5b63-4cae-4071-9b28-6e3f7a9102b4';
const IMAGE_ASSET_ID = '9e306c74-5dbf-4182-ac39-7f408ba213c5';
const IMAGE_NAME = 'audit_counts_bar_chart.png';
const IMAGE_URL = `/api/files/${IMAGE_ASSET_ID}`;
const IMAGE_SIZE = { width: 1600, height: 1200 } as const;
const THUMBNAIL_LABEL = `View ${IMAGE_NAME} full size`;

const PADDING_TURNS_BEFORE = 6;
const PADDING_TURNS_AFTER = 6;
const PADDING_PARAGRAPHS = 4;
const STARTED_AT_MS = Date.UTC(2026, 9, 1, 12, 0, 0);
const MESSAGE_GAP_MS = 1_000;

const LAYOUTS = [
  { name: 'audit desktop', viewport: { width: 1182, height: 757 } },
  { name: 'narrow reflow', viewport: { width: 321, height: 378 } },
] as const;
const SCHEMES = ['light', 'dark'] as const;
type Scheme = (typeof SCHEMES)[number];

function messageId(index: number): string {
  return `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`;
}

function paddingAnswer(turn: number): string {
  return Array.from(
    { length: PADDING_PARAGRAPHS },
    (_, paragraph) =>
      `Padding answer ${turn + 1}, paragraph ${paragraph + 1}. This paragraph gives the transcript enough height that the row holding the image sits far from both ends.`,
  ).join('\n\n');
}

interface StoredTurn {
  prompt: string;
  answer: string;
  promptMetadata: Record<string, unknown> | null;
}

function storedTurns(imageBytes: number): StoredTurn[] {
  const padding = (turn: number): StoredTurn => ({
    prompt: `Padding question ${turn + 1}`,
    answer: paddingAnswer(turn),
    promptMetadata: null,
  });
  return [
    ...Array.from({ length: PADDING_TURNS_BEFORE }, (_, turn) => padding(turn)),
    {
      prompt: 'Describe the attached chart.',
      answer: paddingAnswer(PADDING_TURNS_BEFORE),
      promptMetadata: {
        attachments: [
          {
            id: IMAGE_ATTACHMENT_ID,
            assetId: IMAGE_ASSET_ID,
            type: 'image',
            name: IMAGE_NAME,
            size: imageBytes,
            mimeType: 'image/png',
            url: IMAGE_URL,
          },
        ],
      },
    },
    ...Array.from({ length: PADDING_TURNS_AFTER }, (_, turn) =>
      padding(PADDING_TURNS_BEFORE + 1 + turn),
    ),
  ];
}

function storedConversation(imageBytes: number): ManagedCloudConversationResponse {
  const stamp = (offset: number) => new Date(STARTED_AT_MS + offset * MESSAGE_GAP_MS).toISOString();
  const messages = storedTurns(imageBytes).flatMap((turn, index) => {
    const promptIndex = index * 2;
    const answerIndex = promptIndex + 1;
    const base = { model: null, provider: null, input_tokens: 0, output_tokens: 0 };
    return [
      {
        ...base,
        id: messageId(promptIndex),
        parent_id: promptIndex === 0 ? null : messageId(promptIndex - 1),
        role: 'user' as const,
        content: turn.prompt,
        created_at: stamp(promptIndex),
        metadata: turn.promptMetadata,
      },
      {
        ...base,
        id: messageId(answerIndex),
        parent_id: messageId(promptIndex),
        role: 'assistant' as const,
        content: turn.answer,
        created_at: stamp(answerIndex),
        metadata: null,
      },
    ];
  });
  return {
    conversation: {
      id: CONVERSATION_ID,
      title: 'Image viewer stacking',
      model: null,
      project_id: null,
      pinned: false,
      starred: false,
      archived: false,
      is_temporary: false,
      active_leaf_message_id: messages[messages.length - 1]?.id ?? null,
      created_at: stamp(0),
      updated_at: stamp(messages.length),
    },
    messages,
    total: messages.length,
    hasMore: false,
  };
}

/** Drawn and encoded in the page, so the viewer has a real, large bitmap to fit. */
async function renderChart(page: Page): Promise<Buffer> {
  const encoded = await page.evaluate(async ({ width, height }) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('no 2d context for the fixture chart');
    context.fillStyle = 'rgb(250, 250, 248)';
    context.fillRect(0, 0, width, height);
    context.fillStyle = 'rgb(47, 111, 222)';
    [4, 7, 2, 5].forEach((count, bar) => {
      const barHeight = (count / 8) * height * 0.8;
      context.fillRect(
        width * (0.12 + bar * 0.21),
        height * 0.9 - barHeight,
        width * 0.14,
        barHeight,
      );
    });
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve));
    if (!blob) throw new Error('fixture chart could not be encoded');
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('fixture chart could not be read'));
      reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
      reader.readAsDataURL(blob);
    });
  }, IMAGE_SIZE);
  return Buffer.from(encoded, 'base64');
}

async function serveStoredConversation(page: Page, chart: Buffer): Promise<string[]> {
  const modelRequests: string[] = [];
  await page.route(API_ROUTE, (route) => {
    const request = route.request();
    const { pathname } = new URL(request.url());
    const readsAvailability = request.method() === 'GET' && pathname === MEDIA_AVAILABILITY_PATH;
    if (readsAvailability || !MODEL_BACKED_PATH.test(pathname)) return route.fallback();
    modelRequests.push(`${request.method()} ${pathname}`);
    return route.abort('blockedbyclient');
  });
  await page.route(`**${managedCloudConversationPath(CONVERSATION_ID)}?*`, (route) =>
    route.request().method() === 'GET'
      ? route.fulfill({ json: storedConversation(chart.byteLength) })
      : route.abort('blockedbyclient'),
  );
  await page.route(`**${IMAGE_URL}`, (route) =>
    route.fulfill({ status: 200, contentType: 'image/png', body: chart }),
  );
  return modelRequests;
}

async function pinStoredTheme(page: Page, scheme: Scheme): Promise<void> {
  await page.route(`**${MANAGED_CLOUD_SETTINGS_PREFERENCES_PATH}`, async (route) => {
    if (route.request().method() !== 'GET') return route.abort('blockedbyclient');
    const response = await route.fetch();
    const body = (await response.json()) as { settings?: Record<string, unknown> };
    const stored = body.settings?.[APPEARANCE_NAMESPACE];
    const appearance = stored && typeof stored === 'object' ? stored : {};
    return route.fulfill({
      response,
      json: {
        ...body,
        settings: { ...body.settings, [APPEARANCE_NAMESPACE]: { ...appearance, theme: scheme } },
      },
    });
  });
}

/**
 * The transcript is virtualized, so the row holding the image exists only near
 * the scroll position. Each step waits for the list to re-render before it
 * looks, because a row from the previous position is still attached until then.
 */
async function scrollToThumbnail(page: Page, thumbnail: Locator): Promise<void> {
  const scroller = page.locator(TRANSCRIPT_SCROLLER);
  await scroller.evaluate((node) => {
    node.scrollTop = 0;
  });
  await page.waitForTimeout(SETTLE_MS);
  let atEnd = false;
  while (!atEnd && !(await thumbnail.isVisible())) {
    atEnd = await scroller.evaluate((node) => {
      node.scrollTop += node.clientHeight;
      return node.scrollTop + node.clientHeight >= node.scrollHeight - 1;
    });
    await page.waitForTimeout(SETTLE_MS);
  }
  await expect(thumbnail, 'no row of the transcript holds the image').toBeVisible();
  await thumbnail.scrollIntoViewIfNeeded();
  await page.waitForTimeout(SETTLE_MS);
}

interface ViewerGeometry {
  viewport: { width: number; height: number };
  viewer: { left: number; top: number; right: number; bottom: number };
  image: { left: number; top: number; right: number; bottom: number };
  imageLoaded: boolean;
  coveredProbes: string[];
  closeReachable: boolean;
}

async function measureViewer(page: Page): Promise<ViewerGeometry> {
  return page.evaluate(
    ({ viewerName, closeLabel, inset }) => {
      const viewer = document.querySelector(`[role="dialog"][aria-label="${viewerName}"]`);
      const image = viewer?.querySelector('img');
      const close = viewer?.querySelector(`[aria-label="${closeLabel}"]`);
      if (!viewer || !image || !close) throw new Error('the image viewer is not open');
      const box = (element: Element) => {
        const rect = element.getBoundingClientRect();
        return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
      };
      const imageBox = box(image);
      const probes: Record<string, [number, number]> = {
        'top left': [imageBox.left + inset, imageBox.top + inset],
        'top right': [imageBox.right - inset, imageBox.top + inset],
        'bottom left': [imageBox.left + inset, imageBox.bottom - inset],
        'bottom right': [imageBox.right - inset, imageBox.bottom - inset],
        centre: [(imageBox.left + imageBox.right) / 2, (imageBox.top + imageBox.bottom) / 2],
      };
      const coveredProbes = Object.entries(probes)
        .filter(([, [x, y]]) => !viewer.contains(document.elementFromPoint(x, y)))
        .map(([name]) => name);
      const closeBox = box(close);
      const closeHit = document.elementFromPoint(
        (closeBox.left + closeBox.right) / 2,
        (closeBox.top + closeBox.bottom) / 2,
      );
      return {
        viewport: {
          width: document.documentElement.clientWidth,
          height: document.documentElement.clientHeight,
        },
        viewer: box(viewer),
        image: imageBox,
        imageLoaded: image.complete && image.naturalWidth > 0,
        coveredProbes,
        closeReachable: close.contains(closeHit),
      };
    },
    { viewerName: VIEWER_NAME, closeLabel: CLOSE_LABEL, inset: EDGE_INSET_PX },
  );
}

for (const layout of LAYOUTS) {
  for (const scheme of SCHEMES) {
    test.describe(`enlarged chat image (${layout.name}, ${scheme})`, () => {
      test.use({ viewport: layout.viewport, colorScheme: scheme });
      test.setTimeout(SPEC_TIMEOUT_MS);

      test('sits above the scrolled conversation, inside the viewport', async ({ page }) => {
        await signIn(page);
        const chart = await renderChart(page);
        const modelRequests = await serveStoredConversation(page, chart);
        await pinStoredTheme(page, scheme);

        await page.goto(`${CHAT_ROUTE}/${CONVERSATION_ID}`, { waitUntil: 'domcontentloaded' });
        const scroller = page.locator(TRANSCRIPT_SCROLLER);
        await expect(scroller).toBeVisible({ timeout: LOAD_TIMEOUT_MS });
        await page
          .getByRole('button', { name: CONSENT_DISMISS_LABEL })
          .click({ timeout: CONSENT_WAIT_MS })
          .catch(() => undefined);
        await expect(page.locator('html')).toHaveClass(new RegExp(scheme));

        const thumbnail = page.getByRole('button', { name: THUMBNAIL_LABEL });
        await scrollToThumbnail(page, thumbnail);
        const scrolled = await scroller.evaluate((node) => ({
          top: node.scrollTop,
          remaining: node.scrollHeight - node.scrollTop - node.clientHeight,
        }));
        expect(scrolled.top, 'the transcript is not scrolled away from its start').toBeGreaterThan(
          0,
        );
        expect(scrolled.remaining, 'the transcript is not long enough').toBeGreaterThan(0);

        await thumbnail.click();
        const viewer = page.getByRole('dialog', { name: VIEWER_NAME });
        await expect(viewer).toBeVisible();
        await expect
          .poll(async () => (await measureViewer(page)).imageLoaded, { timeout: LOAD_TIMEOUT_MS })
          .toBe(true);
        await page.waitForTimeout(SETTLE_MS);

        const measured = await measureViewer(page);
        const { viewport } = measured;
        expect(measured.viewer.left).toBeLessThanOrEqual(GEOMETRY_TOLERANCE_PX);
        expect(measured.viewer.top).toBeLessThanOrEqual(GEOMETRY_TOLERANCE_PX);
        expect(measured.viewer.right).toBeGreaterThanOrEqual(
          viewport.width - GEOMETRY_TOLERANCE_PX,
        );
        expect(measured.viewer.bottom).toBeGreaterThanOrEqual(
          viewport.height - GEOMETRY_TOLERANCE_PX,
        );
        expect(measured.image.left, 'image starts left of the viewport').toBeGreaterThanOrEqual(0);
        expect(measured.image.top, 'image starts above the viewport').toBeGreaterThanOrEqual(0);
        expect(measured.image.right, 'image runs past the right edge').toBeLessThanOrEqual(
          viewport.width,
        );
        expect(measured.image.bottom, 'image runs past the bottom edge').toBeLessThanOrEqual(
          viewport.height,
        );
        expect(measured.coveredProbes, 'the conversation paints over the image').toEqual([]);
        expect(measured.closeReachable, 'the close control is covered').toBe(true);

        const before = await scroller.evaluate((node) => node.scrollTop);
        await page.mouse.move(viewport.width / 2, viewport.height / 2);
        await page.mouse.wheel(0, WHEEL_DELTA_PX);
        await page.waitForTimeout(SETTLE_MS);
        expect(
          await scroller.evaluate((node) => node.scrollTop),
          'the conversation scrolled behind the viewer',
        ).toBe(before);
        expect(
          await page.evaluate(() => window.scrollY),
          'the page scrolled behind the viewer',
        ).toBe(0);

        await page.keyboard.press('Escape');
        await expect(viewer).toHaveCount(0);
        await expect(thumbnail).toBeFocused();

        await thumbnail.click();
        await expect(viewer).toBeVisible();
        await viewer.getByRole('button', { name: CLOSE_LABEL }).click();
        await expect(viewer).toHaveCount(0);
        await expect(thumbnail).toBeFocused();

        expect(modelRequests).toEqual([]);
      });
    });
  }
}
