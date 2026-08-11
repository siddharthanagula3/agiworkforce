import { createHmac } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  nudge: vi.fn(),
  database: {},
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: () => mocks.database,
}));
vi.mock('@/lib/server/video-generation-jobs', () => ({
  nudgeVideoGenerationJobFromProviderEvent: (...args: unknown[]) => mocks.nudge(...args),
}));

import { POST } from './route';

const SIGNING_SECRET = 'synthetic-webhook-signing-secret';
const TASK_ID = 'synthetic-provider-task';

function request(
  input: {
    body?: string;
    status?: 'completed' | 'failed';
    signatureBody?: string;
    contentLength?: string;
  } = {},
): NextRequest {
  const status = input.status ?? 'completed';
  const body =
    input.body ??
    JSON.stringify({
      type: `video.generation.${status}`,
      created_at: new Date().toISOString(),
      data: { id: TASK_ID, status },
    });
  const timestamp = Math.floor(Date.now() / 1_000);
  const digest = createHmac('sha256', SIGNING_SECRET)
    .update(Buffer.from(`${timestamp},`))
    .update(Buffer.from(input.signatureBody ?? body))
    .digest('hex');
  return new NextRequest('http://localhost/api/media/video/openrouter-webhook', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'content-length': input.contentLength ?? String(Buffer.byteLength(body)),
      'x-openrouter-idempotency-key': `${TASK_ID}-${status}`,
      'x-openrouter-signature': `t=${timestamp},v1=${digest}`,
    },
    body,
  });
}

describe('OpenRouter video webhook route', () => {
  const savedSecret = process.env['OPENROUTER_WEBHOOK_SECRET'];

  beforeEach(() => {
    vi.clearAllMocks();
    process.env['OPENROUTER_WEBHOOK_SECRET'] = SIGNING_SECRET;
    mocks.nudge.mockResolvedValue('nudged');
  });

  afterEach(() => {
    if (savedSecret === undefined) delete process.env['OPENROUTER_WEBHOOK_SECRET'];
    else process.env['OPENROUTER_WEBHOOK_SECRET'] = savedSecret;
  });

  it('verifies exact raw bytes and only nudges the durable reconciler', async () => {
    const response = await POST(request());

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({ accepted: true, duplicate: false });
    expect(mocks.nudge).toHaveBeenCalledWith({
      db: mocks.database,
      provider: 'openrouter',
      providerTaskId: TASK_ID,
      eventKey: `${TASK_ID}-completed`,
    });
  });

  it('rejects a body changed after signing before any database access', async () => {
    const signed = JSON.stringify({
      type: 'video.generation.completed',
      created_at: new Date().toISOString(),
      data: { id: TASK_ID, status: 'completed' },
    });
    const changed = `${signed} `;

    const response = await POST(request({ body: changed, signatureBody: signed }));

    expect(response.status).toBe(401);
    expect(mocks.nudge).not.toHaveBeenCalled();
  });

  it('rejects a declared oversized payload before reading or verifying it', async () => {
    const response = await POST(request({ contentLength: String(64 * 1024 + 1) }));

    expect(response.status).toBe(413);
    expect(mocks.nudge).not.toHaveBeenCalled();
  });

  it('acknowledges a deduplicated terminal event without settling in the route', async () => {
    mocks.nudge.mockResolvedValue('duplicate');

    const response = await POST(request());

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({ accepted: true, duplicate: true });
    expect(mocks.nudge).toHaveBeenCalledOnce();
  });
});
