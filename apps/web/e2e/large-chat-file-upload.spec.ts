import { expect, test, type Page, type Request, type Route } from '@playwright/test';
import {
  CHAT_LARGE_FILE_POLICY,
  CLIENT_CAPABILITIES_REQUEST_HEADER,
  LARGE_CHAT_FILES_CAPABILITY,
  MANAGED_CLOUD_CHAT_FILE_INTAKES_PATH,
  MANAGED_CLOUD_RESUMABLE_UPLOADS_PATH,
  MAX_CHAT_ATTACHMENT_BYTES,
  MAX_CHAT_ATTACHMENT_MESSAGE_BYTES,
  MAX_CHAT_IMAGE_ATTACHMENT_BYTES,
  hasClientCapability,
} from '@agiworkforce/cloud-contracts';

import { signInAsDevAccount } from './qa-capability-harness';

/**
 * The browser half of chat files over the inline limit, against a local server
 * whose upload answers are all stubbed here: the handshake, create, the parts
 * route, the part PUTs, complete and the intake status. A local server has no
 * protocol 2 scanner and no storage that presigns, so it would never offer
 * large files on its own; the server pipeline is proved by its own tests.
 */
const CHAT_ROUTE = '/chat';
const ME_PATH = '/api/me';
const UPLOADS_PATH = MANAGED_CLOUD_RESUMABLE_UPLOADS_PATH;
const INTAKES_PATH = MANAGED_CLOUD_CHAT_FILE_INTAKES_PATH;
const COMPLETIONS_PATH = '/api/llm/v1/chat/completions';
const STORAGE_PATH = '/__large-file-storage';

const COMPOSER_LABEL = /message input/i;
const FILE_INPUT_LABEL = 'File upload';
const LOAD_TIMEOUT_MS = 30_000;
const UPLOAD_TIMEOUT_MS = 60_000;

const MIB = 1024 * 1024;
const FILE_BYTES = MAX_CHAT_ATTACHMENT_BYTES + MIB;
const PART_BYTES = 16 * MIB;
const PART_COUNT = Math.ceil(FILE_BYTES / PART_BYTES);
const FILE_NAME = 'large-report.pdf';
const UPLOAD_ID = 'large-upload-1';
const SESSION = 'signed-large-session-1';
const INTAKE_ID = '0b1c2d3e-4f50-4a6b-8c7d-000000000001';
const ASSET_ID = '7a5d0c1e-2b3f-4c4d-8e5f-6a7b8c9d0e1f';

const OFFER = {
  max_file_bytes: CHAT_LARGE_FILE_POLICY.largeFiles.maxBytes,
  max_image_bytes: MAX_CHAT_IMAGE_ATTACHMENT_BYTES,
  max_message_bytes: CHAT_LARGE_FILE_POLICY.largeFiles.maxMessageBytes,
  max_files_per_message: CHAT_LARGE_FILE_POLICY.largeFiles.maxCount,
  large_files_available: true,
  storage_remaining_bytes: null,
  inline_message_bytes: MAX_CHAT_ATTACHMENT_MESSAGE_BYTES,
};

type IntakeState = 'checking' | 'ready' | 'rejected' | 'cancelled';

interface LargeFileServer {
  requests: string[];
  creates: () => number;
  sentTurns: string[];
  meCarriedToken: () => boolean;
  setIntake: (state: IntakeState) => void;
  failPartOnce: (partNumber: number) => void;
  storeParts: (partNumbers: number[]) => void;
}

function largePdf(): { name: string; mimeType: string; buffer: Buffer } {
  const buffer = Buffer.alloc(FILE_BYTES);
  buffer.write('%PDF-1.7\n', 0, 'utf8');
  return { name: FILE_NAME, mimeType: 'application/pdf', buffer };
}

function intakeBody(state: IntakeState): Record<string, unknown> {
  switch (state) {
    case 'ready':
      return {
        id: INTAKE_ID,
        state,
        attachment: {
          id: ASSET_ID,
          name: FILE_NAME,
          mimeType: 'application/pdf',
          byteCount: FILE_BYTES,
          type: 'file',
          url: `/api/files/${ASSET_ID}`,
        },
      };
    case 'rejected':
      return {
        id: INTAKE_ID,
        state,
        refusalCode: 'malware',
        message: `${FILE_NAME} was not attached because it contains malware.`,
      };
    case 'cancelled':
      return { id: INTAKE_ID, state, cancelReason: 'client' };
    default:
      return { id: INTAKE_ID, state };
  }
}

async function installLargeFileServer(page: Page): Promise<LargeFileServer> {
  const requests: string[] = [];
  const sentTurns: string[] = [];
  let creates = 0;
  let tokenSeen = false;
  let intake: IntakeState = 'checking';
  let failingPart: number | null = null;
  let storedParts: number[] = [];

  const record = (request: Request) => {
    const url = new URL(request.url());
    requests.push(`${request.method()} ${url.pathname}${url.search}`);
  };

  await page.route(
    (url) => url.pathname === ME_PATH,
    async (route) => {
      if (
        hasClientCapability(
          route.request().headers()[CLIENT_CAPABILITIES_REQUEST_HEADER],
          LARGE_CHAT_FILES_CAPABILITY,
        )
      ) {
        tokenSeen = true;
      }
      const response = await route.fetch();
      const body = (await response.json()) as Record<string, unknown>;
      await route.fulfill({ response, json: { ...body, attachment_limits: OFFER } });
    },
  );

  await page.route(
    (url) => url.pathname.startsWith(STORAGE_PATH),
    async (route) => {
      record(route.request());
      const partNumber = Number(new URL(route.request().url()).pathname.split('/').pop());
      if (failingPart === partNumber) {
        failingPart = null;
        await route.fulfill({ status: 400 });
        return;
      }
      await route.fulfill({ status: 200, headers: { ETag: `"part-${partNumber}"` } });
    },
  );

  await page.route(
    (url) => url.pathname.startsWith(UPLOADS_PATH) || url.pathname.startsWith(INTAKES_PATH),
    async (route: Route) => {
      const request = route.request();
      record(request);
      const url = new URL(request.url());
      const method = request.method();
      if (url.pathname === UPLOADS_PATH && method === 'POST') {
        creates += 1;
        await route.fulfill({
          json: {
            uploadId: UPLOAD_ID,
            session: SESSION,
            partBytes: PART_BYTES,
            partCount: PART_COUNT,
            expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
          },
        });
        return;
      }
      if (url.pathname === `${UPLOADS_PATH}/${UPLOAD_ID}/parts`) {
        const { partNumbers } = request.postDataJSON() as { partNumbers: number[] };
        await route.fulfill({
          json: {
            parts: partNumbers.map((partNumber) => ({
              partNumber,
              url: `${url.origin}${STORAGE_PATH}/${UPLOAD_ID}/${partNumber}`,
              method: 'PUT',
              headers: {},
            })),
          },
        });
        return;
      }
      if (url.pathname === `${UPLOADS_PATH}/${UPLOAD_ID}`) {
        if (method === 'GET') {
          await route.fulfill({
            json: {
              uploadId: UPLOAD_ID,
              partBytes: PART_BYTES,
              parts: storedParts.map((partNumber) => ({ partNumber, size: PART_BYTES })),
              bytesStored: storedParts.length * PART_BYTES,
            },
          });
          return;
        }
        if (method === 'DELETE') {
          await route.fulfill({ json: { aborted: true } });
          return;
        }
        await route.fulfill({
          status: 202,
          json: { kind: 'chat-attachment-intake', intake: intakeBody('checking') },
        });
        return;
      }
      if (url.pathname === `${INTAKES_PATH}/${INTAKE_ID}`) {
        if (method === 'DELETE' && intake === 'checking') intake = 'cancelled';
        await route.fulfill({ json: { intake: intakeBody(intake) } });
        return;
      }
      await route.fulfill({ status: 404, json: { error: 'Not found' } });
    },
  );

  await page.route(`**${COMPLETIONS_PATH}`, async (route) => {
    sentTurns.push(route.request().postData() ?? '');
    await route.abort();
  });

  return {
    requests,
    sentTurns,
    creates: () => creates,
    meCarriedToken: () => tokenSeen,
    setIntake: (state) => {
      intake = state;
    },
    failPartOnce: (partNumber) => {
      failingPart = partNumber;
    },
    storeParts: (partNumbers) => {
      storedParts = partNumbers;
    },
  };
}

async function openChat(page: Page): Promise<LargeFileServer> {
  await signInAsDevAccount(page, 'pro');
  const server = await installLargeFileServer(page);
  await page.goto(CHAT_ROUTE, { waitUntil: 'domcontentloaded' });
  await expect(page.getByLabel(COMPOSER_LABEL)).toBeVisible({ timeout: LOAD_TIMEOUT_MS });
  return server;
}

async function attachAndSend(page: Page): Promise<void> {
  await page.getByLabel(FILE_INPUT_LABEL).setInputFiles(largePdf());
  await expect(page.getByText(FILE_NAME).first()).toBeVisible({ timeout: LOAD_TIMEOUT_MS });
  const composer = page.getByLabel(COMPOSER_LABEL);
  await composer.click();
  await composer.fill('Summarise the attached report.');
  await composer.press('Enter');
}

function verifying(page: Page) {
  return page.getByRole('progressbar', { name: `Verifying ${FILE_NAME}` });
}

test.describe.configure({ mode: 'serial' });

test.describe('chat files over the inline limit', () => {
  test('asks for large files when it reads the account', async ({ page }) => {
    const server = await openChat(page);

    await expect.poll(() => server.meCarriedToken(), { timeout: LOAD_TIMEOUT_MS }).toBe(true);
  });

  test('holds the send while the file is checked, then sends it once it is ready', async ({
    page,
  }) => {
    const server = await openChat(page);

    await attachAndSend(page);
    await expect(verifying(page)).toBeVisible({ timeout: UPLOAD_TIMEOUT_MS });
    expect(server.sentTurns).toEqual([]);
    expect(server.creates()).toBe(1);
    expect(server.requests.filter((line) => line.startsWith(`PUT ${STORAGE_PATH}/`))).toHaveLength(
      PART_COUNT,
    );

    server.setIntake('ready');
    await expect.poll(() => server.sentTurns.length, { timeout: UPLOAD_TIMEOUT_MS }).toBe(1);
    expect(server.sentTurns[0]).toContain(ASSET_ID);
  });

  test('shows the server refusal and sends nothing when the file is rejected', async ({ page }) => {
    const server = await openChat(page);

    await attachAndSend(page);
    await expect(verifying(page)).toBeVisible({ timeout: UPLOAD_TIMEOUT_MS });
    server.setIntake('rejected');

    await expect(
      page.getByText(`${FILE_NAME} was not attached because it contains malware.`).first(),
    ).toBeVisible({
      timeout: UPLOAD_TIMEOUT_MS,
    });
    expect(server.sentTurns).toEqual([]);
  });

  test('cancels the intake when the person cancels while the file is checked', async ({ page }) => {
    const server = await openChat(page);

    await attachAndSend(page);
    await expect(verifying(page)).toBeVisible({ timeout: UPLOAD_TIMEOUT_MS });
    server.requests.length = 0;
    await page.getByRole('button', { name: `Cancel upload of ${FILE_NAME}` }).click();

    const cancel = `DELETE ${INTAKES_PATH}/${INTAKE_ID}`;
    const intakeRequestsFromCancel = () => {
      const intakeRequests = server.requests.filter((line) => line.includes(`${INTAKES_PATH}/`));
      const cancelledAt = intakeRequests.indexOf(cancel);
      return cancelledAt === -1 ? [] : intakeRequests.slice(cancelledAt);
    };
    await expect
      .poll(intakeRequestsFromCancel, { timeout: UPLOAD_TIMEOUT_MS })
      .toEqual([cancel, `GET ${INTAKES_PATH}/${INTAKE_ID}`]);
    expect(server.requests.filter((line) => line === cancel)).toHaveLength(1);
    expect(server.sentTurns).toEqual([]);
  });

  test('resumes after a reload by sending only the part storage is missing', async ({ page }) => {
    const server = await openChat(page);
    server.failPartOnce(PART_COUNT);

    await attachAndSend(page);
    await expect(page.getByText('The upload was interrupted').first()).toBeVisible({
      timeout: UPLOAD_TIMEOUT_MS,
    });
    expect(server.creates()).toBe(1);

    server.storeParts(Array.from({ length: PART_COUNT - 1 }, (_, index) => index + 1));
    server.setIntake('ready');
    server.requests.length = 0;
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByLabel(COMPOSER_LABEL)).toBeVisible({ timeout: LOAD_TIMEOUT_MS });
    await attachAndSend(page);

    await expect.poll(() => server.sentTurns.length, { timeout: UPLOAD_TIMEOUT_MS }).toBe(1);
    expect(server.creates()).toBe(1);
    expect(server.requests).toContain(`GET ${UPLOADS_PATH}/${UPLOAD_ID}?session=${SESSION}`);
    expect(server.requests.filter((line) => line.startsWith(`PUT ${STORAGE_PATH}/`))).toEqual([
      `PUT ${STORAGE_PATH}/${UPLOAD_ID}/${PART_COUNT}`,
    ]);
  });
});
