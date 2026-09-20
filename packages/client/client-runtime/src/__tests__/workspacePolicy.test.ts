import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_WORKSPACE_CONTROLS,
  type EffectiveWorkspacePolicyResponse,
} from '@agiworkforce/types';
import {
  createWorkspacePolicyPoller,
  disabledWorkspaceFeatures,
  isWorkspaceFeatureEnabled,
  type WorkspacePolicyCache,
} from '../workspacePolicy';

const ORG = '11111111-1111-4111-8111-111111111111';

function governed(revision: number, overrides: Record<string, boolean> = {}) {
  return {
    organizationId: ORG,
    governed: true,
    revision,
    controls: {
      ...DEFAULT_WORKSPACE_CONTROLS,
      featureAccess: { ...DEFAULT_WORKSPACE_CONTROLS.featureAccess, ...overrides },
      appliedOverrideIds: [],
      revision,
      blockingRules: [],
    },
    code: null,
  } satisfies EffectiveWorkspacePolicyResponse;
}

function json(body: unknown, etag: string, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ETag: etag } });
}

function memoryCache(
  initial: string | null = null,
): WorkspacePolicyCache & { value: string | null } {
  const cache = {
    value: initial,
    read: () => cache.value,
    write: (next: string | null) => {
      cache.value = next;
    },
  };
  return cache;
}

describe('workspace policy poller', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('applies a changed policy on the next poll without a reload', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(json(governed(1), '"a"'))
      .mockResolvedValueOnce(json(governed(2, { code: false }), '"b"'));
    const poller = createWorkspacePolicyPoller({ request, intervalMs: 1000 });
    const seen: boolean[] = [];
    poller.subscribe(() =>
      seen.push(isWorkspaceFeatureEnabled(poller.getSnapshot().policy, 'code')),
    );

    const stop = poller.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(isWorkspaceFeatureEnabled(poller.getSnapshot().policy, 'code')).toBe(true);

    await vi.advanceTimersByTimeAsync(1000);
    expect(poller.getSnapshot().policy?.revision).toBe(2);
    expect(disabledWorkspaceFeatures(poller.getSnapshot().policy)).toEqual(['code']);
    expect(seen[seen.length - 1]).toBe(false);
    expect(request.mock.calls[1]?.[0]).toEqual({ 'If-None-Match': '"a"' });
    stop();
  });

  it('keeps the policy it has when the server answers 304', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(json(governed(3, { work: false }), '"c"'))
      .mockResolvedValueOnce(new Response(null, { status: 304 }));
    const poller = createWorkspacePolicyPoller({ request });

    await poller.refresh();
    const snapshot = await poller.refresh();

    expect(snapshot.policy?.revision).toBe(3);
    expect(snapshot.source).toBe('network');
    expect(snapshot.stale).toBe(false);
  });

  it('serves the cached policy while offline and reconciles when the network returns', async () => {
    const cache = memoryCache(
      JSON.stringify({ etag: '"d"', policy: governed(4, { research: false }) }),
    );
    const request = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(json(governed(5), '"e"'));
    const poller = createWorkspacePolicyPoller({ request, cache });

    expect(poller.getSnapshot().source).toBe('cache');
    const offline = await poller.refresh();
    expect(offline.stale).toBe(true);
    expect(isWorkspaceFeatureEnabled(offline.policy, 'research')).toBe(false);
    expect(request.mock.calls[0]?.[0]).toEqual({ 'If-None-Match': '"d"' });

    const online = await poller.refresh();
    expect(online.policy?.revision).toBe(5);
    expect(isWorkspaceFeatureEnabled(online.policy, 'research')).toBe(true);
    expect(JSON.parse(cache.value ?? '{}').etag).toBe('"e"');
  });

  it('forgets the cached policy when the session is signed out', async () => {
    const cache = memoryCache(JSON.stringify({ etag: '"f"', policy: governed(6) }));
    const poller = createWorkspacePolicyPoller({
      request: vi.fn().mockResolvedValue(new Response(null, { status: 401 })),
      cache,
    });

    const snapshot = await poller.refresh();

    expect(snapshot.policy).toBeNull();
    expect(cache.value).toBeNull();
  });

  it('refuses a malformed policy rather than treating missing features as allowed', async () => {
    const poller = createWorkspacePolicyPoller({
      request: vi
        .fn()
        .mockResolvedValue(
          json({ organizationId: ORG, governed: true, revision: 1, controls: {} }, '"g"'),
        ),
    });

    const snapshot = await poller.refresh();

    expect(snapshot.policy).toBeNull();
    expect(snapshot.stale).toBe(true);
  });
});
