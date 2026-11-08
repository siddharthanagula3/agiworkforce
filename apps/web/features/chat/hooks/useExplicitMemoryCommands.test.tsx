import { createRequestAuthority } from '@/lib/identity/request-authority';
import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createCloudMemoryFixture,
  getCloudMemoryFixtureSession,
} from '@/features/memory/__tests__/CloudMemoryFixture';

const mocks = vi.hoisted(() => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));

vi.mock('sonner', () => ({ toast: mocks.toast }));
vi.mock('@/lib/identity/useSessionSnapshot', () => ({
  useSessionSnapshot: () => getCloudMemoryFixtureSession,
  useReadonlyIdentityLifetime: () => () => {
    const session = getCloudMemoryFixtureSession();
    return { isCurrent: () => session?.isCurrent() === true };
  },
}));

import { useExplicitMemoryCommands } from './use-explicit-memory-commands';

const scope = { conversationId: null, projectId: null };
let fixture: ReturnType<typeof createCloudMemoryFixture>;

function respond(status: number, body: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input) =>
      String(input).startsWith('/api/memory?')
        ? new Response(JSON.stringify({ memories: [], hasMore: false }))
        : new Response(JSON.stringify(body), { status }),
    ),
  );
}

describe('explicit memory commands', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fixture = createCloudMemoryFixture();
  });
  afterEach(() => {
    fixture.retire();
    vi.unstubAllGlobals();
  });

  it('renders a receipt for a refused command that carries no message', async () => {
    respond(200, { command: { kind: 'remember', subject: 'x' }, status: 'refused' });
    const { result } = renderHook(() => useExplicitMemoryCommands(), { wrapper: fixture.wrapper });
    const report = await result.current.runExplicitMemoryCommand(
      'Remember x',
      scope,
      createRequestAuthority(fixture.session),
    );

    expect(report).toEqual({ kind: 'remember', status: 'refused' });
    expect(mocks.toast).toHaveBeenCalledWith(expect.stringContaining('Not saved'));
  });

  it('never claims nothing changed when the transport outcome is unknown', async () => {
    respond(500, {});
    const { result } = renderHook(() => useExplicitMemoryCommands(), { wrapper: fixture.wrapper });
    const report = await result.current.runExplicitMemoryCommand(
      'Remember x',
      scope,
      createRequestAuthority(fixture.session),
    );

    expect(report).toEqual({ kind: 'remember', status: 'failed' });
    const message = String(mocks.toast.error.mock.calls[0]![0]);
    expect(message).toMatch(/could not be confirmed|unknown/);
    expect(message).not.toMatch(/nothing was changed/i);
  });
});
