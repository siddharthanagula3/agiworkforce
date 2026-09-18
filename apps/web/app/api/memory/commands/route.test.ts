import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({
  csrf: vi.fn(async (..._args: unknown[]): Promise<Response | null> => null),
  rateLimit: vi.fn(async (..._args: unknown[]): Promise<Response | null> => null),
  query: vi.fn(async (..._args: unknown[]) => [] as unknown[]),
  scopedDb: vi.fn(),
  runMemoryCommand: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: (...a: unknown[]) => mocks.csrf(...a) }));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: (...a: unknown[]) => mocks.rateLimit(...a) }));
vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: (...a: unknown[]) => mocks.scopedDb(...a),
}));
vi.mock('@/lib/cors', () => ({
  withCorsRoute: <T>(handler: T) => handler,
  handleCorsPreflightRequest: vi.fn(() => null),
}));
vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock('@/lib/services/memory-commands', () => ({
  runMemoryCommand: (...a: unknown[]) => mocks.runMemoryCommand(...a),
}));

const { POST } = await import('./route');

function postRequest(body: unknown) {
  return new NextRequest('https://agiworkforce.com/api/memory/commands', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/memory/commands', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.csrf.mockResolvedValue(null);
    mocks.rateLimit.mockResolvedValue(null);
    mocks.scopedDb.mockResolvedValue({
      db: { query: (...a: unknown[]) => mocks.query(...a) },
      userId: 'user-1',
      organizationId: null,
    });
  });

  it('returns a null command when the turn asked for nothing', async () => {
    mocks.runMemoryCommand.mockResolvedValue(null);
    const response = await POST(postRequest({ message: 'I live in Berlin' }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ command: null });
  });

  it('returns the confirmation a stored remember produced', async () => {
    mocks.runMemoryCommand.mockResolvedValue({
      kind: 'remember',
      command: { kind: 'remember', subject: 'I use TypeScript', utterance: '' },
      outcome: {
        status: 'stored',
        fact: 'I use TypeScript',
        category: 'fact',
        message: 'Saved to memory: I use TypeScript',
      },
    });

    const body = await (
      await POST(postRequest({ message: 'Remember that I use TypeScript' }))
    ).json();

    expect(body.status).toBe('stored');
    expect(body.message).toBe('Saved to memory: I use TypeScript');
    expect(body.requiresConfirmation).toBeUndefined();
  });

  it('asks for confirmation before deleting anything', async () => {
    mocks.runMemoryCommand.mockResolvedValue({
      kind: 'forget',
      command: { kind: 'forget', subject: 'Berlin', utterance: '' },
      outcome: {
        status: 'confirmation_required',
        removed: [{ id: 'm1', content: 'User lives in Berlin' }],
        message: 'Forgetting this cannot be undone.',
      },
    });

    const body = await (await POST(postRequest({ message: 'Forget about Berlin' }))).json();

    expect(body.requiresConfirmation).toBe(true);
    expect(body.memories).toEqual([{ id: 'm1', content: 'User lives in Berlin' }]);
  });

  it('confirms a real deletion and names what went', async () => {
    mocks.runMemoryCommand.mockResolvedValue({
      kind: 'forget',
      command: { kind: 'forget', subject: 'Berlin', utterance: '' },
      outcome: {
        status: 'forgotten',
        removed: [{ id: 'm1', content: 'User lives in Berlin' }],
        message: 'Forgotten, and it will not come back: "User lives in Berlin"',
      },
    });

    const body = await (
      await POST(postRequest({ message: 'Forget about Berlin', confirmed: true }))
    ).json();

    expect(body.status).toBe('forgotten');
    expect(body.requiresConfirmation).toBe(false);
    expect(body.memories).toEqual([{ id: 'm1', content: 'User lives in Berlin' }]);
    expect(mocks.runMemoryCommand).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ userId: 'user-1' }),
      expect.objectContaining({ confirmed: true }),
    );
  });

  it('refuses a cross-site command before reading anything', async () => {
    mocks.csrf.mockResolvedValue(NextResponse.json({ error: 'csrf' }, { status: 403 }));
    const response = await POST(postRequest({ message: 'Forget about Berlin', confirmed: true }));
    expect(response.status).toBe(403);
    expect(mocks.scopedDb).not.toHaveBeenCalled();
    expect(mocks.runMemoryCommand).not.toHaveBeenCalled();
  });

  it('honours the rate limit before authenticating', async () => {
    mocks.rateLimit.mockResolvedValue(NextResponse.json({ error: 'slow' }, { status: 429 }));
    const response = await POST(postRequest({ message: 'Remember that I use pnpm' }));
    expect(response.status).toBe(429);
    expect(mocks.runMemoryCommand).not.toHaveBeenCalled();
  });

  it('rejects a body that is not a memory command', async () => {
    expect((await POST(postRequest({ message: '' }))).status).toBe(400);
    expect(mocks.runMemoryCommand).not.toHaveBeenCalled();
  });
});
