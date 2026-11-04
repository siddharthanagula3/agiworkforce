import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_WORKSPACE_CONTROLS,
  DEFAULT_WORKSPACE_CODE_CONTROLS,
  EFFECTIVE_WORKSPACE_POLICY_SCHEMA_VERSION,
  isWorkspaceCountryAllowed,
  evaluateWorkspaceCodeAct,
  resolveWorkspaceCodeControls,
  type EffectiveWorkspacePolicyResponse,
} from '@agiworkforce/types';
import {
  createWorkspacePolicyPoller,
  disabledWorkspaceFeatures,
  isWorkspaceFeatureEnabled,
  parseEffectiveWorkspacePolicy,
  type WorkspacePolicyCache,
} from '../workspacePolicy';

const ORG = '11111111-1111-4111-8111-111111111111';

function governed(revision: number, overrides: Record<string, boolean> = {}) {
  return {
    schemaVersion: EFFECTIVE_WORKSPACE_POLICY_SCHEMA_VERSION,
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
    code: resolveWorkspaceCodeControls(DEFAULT_WORKSPACE_CODE_CONTROLS, []),
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
  it('retains legacy feature and Code restrictions without granting ambiguous countries', async () => {
    const legacy = {
      ...governed(7, { code: false }),
      schemaVersion: undefined,
      code: {
        ...DEFAULT_WORKSPACE_CODE_CONTROLS,
        allowMcpServers: false,
        appliedOverrideIds: [],
        revision: 7,
        blockingRules: [],
      },
    };
    const parsed = parseEffectiveWorkspacePolicy(legacy)!;
    expect(parsed.schemaVersion).toBeUndefined();
    expect(isWorkspaceFeatureEnabled(parsed, 'code')).toBe(false);
    expect(parsed.code?.allowMcpServers).toBe(false);
    expect(isWorkspaceCountryAllowed(parsed.controls!, 'US')).toBe(false);
    const cache = memoryCache(JSON.stringify({ etag: '"legacy"', policy: parsed }));
    const request = vi.fn().mockResolvedValue(json(legacy, '"legacy"'));
    const poller = createWorkspacePolicyPoller({ request, cache });
    await poller.refresh();
    expect(request.mock.calls[0]?.[0]).toEqual({});
    expect(JSON.parse(cache.value!).policy.schemaVersion).toBeUndefined();
    expect(JSON.parse(cache.value!).etag).toBeNull();
    const reopened = createWorkspacePolicyPoller({ request, cache });
    expect(isWorkspaceFeatureEnabled(reopened.getSnapshot().policy, 'code')).toBe(false);
    expect(isWorkspaceCountryAllowed(reopened.getSnapshot().policy!.controls!, 'US')).toBe(false);
  });

  it('allows current unrestricted defaults and fails closed only the malformed country projection', () => {
    const unrestricted = parseEffectiveWorkspacePolicy(governed(1))!;
    expect(isWorkspaceCountryAllowed(unrestricted.controls!, null)).toBe(true);
    const wire = governed(2, { work: false });
    const malformed = parseEffectiveWorkspacePolicy({
      ...wire,
      controls: { ...wire.controls, allowedCountries: ['invalid'] },
    })!;
    expect(isWorkspaceFeatureEnabled(malformed, 'work')).toBe(false);
    expect(isWorkspaceCountryAllowed(malformed.controls!, 'US')).toBe(false);
    const future = parseEffectiveWorkspacePolicy({ ...wire, schemaVersion: 999 })!;
    expect(isWorkspaceFeatureEnabled(future, 'work')).toBe(false);
    expect(isWorkspaceCountryAllowed(future.controls!, 'US')).toBe(false);
  });

  it('does not trust legacy nonempty lists that may have reopened a closed intersection', () => {
    const wire = governed(3, { work: false });
    const legacy = parseEffectiveWorkspacePolicy({
      ...wire,
      schemaVersion: 1,
      controls: { ...wire.controls, allowedCountries: ['FR'] },
    })!;
    expect(legacy.schemaVersion).toBe(1);
    expect(isWorkspaceFeatureEnabled(legacy, 'work')).toBe(false);
    expect(isWorkspaceCountryAllowed(legacy.controls!, 'FR')).toBe(false);
    expect(parseEffectiveWorkspacePolicy(JSON.parse(JSON.stringify(legacy)))?.schemaVersion).toBe(1);
  });

  it('never lets a false flag override a current nonempty allowlist', () => {
    const wire = governed(4);
    const parsed = parseEffectiveWorkspacePolicy({
      ...wire,
      controls: { ...wire.controls, allowedCountries: ['DE'], countryRestrictionActive: false },
    })!;
    expect(isWorkspaceCountryAllowed(parsed.controls!, 'DE')).toBe(true);
    expect(isWorkspaceCountryAllowed(parsed.controls!, 'US')).toBe(false);
  });

  it('keeps current active-empty denial through cache reload and a valid 304', async () => {
    const wire = governed(5, { work: false });
    const restricted = {
      ...wire,
      controls: { ...wire.controls, countryRestrictionActive: true },
    };
    const cache = memoryCache(JSON.stringify({ etag: '"current"', policy: restricted }));
    const request = vi.fn().mockResolvedValue(new Response(null, { status: 304 }));
    const poller = createWorkspacePolicyPoller({ request, cache });
    await poller.refresh();
    expect(request.mock.calls[0]?.[0]).toEqual({ 'If-None-Match': '"current"' });
    expect(isWorkspaceFeatureEnabled(poller.getSnapshot().policy, 'work')).toBe(false);
    expect(isWorkspaceCountryAllowed(poller.getSnapshot().policy!.controls!, 'US')).toBe(false);
  });

  it('retains feature denials when a current response omits the country discriminator', () => {
    const wire = governed(6, { work: false });
    const parsed = parseEffectiveWorkspacePolicy({
      ...wire,
      controls: { ...wire.controls, countryRestrictionActive: undefined },
    })!;
    expect(isWorkspaceFeatureEnabled(parsed, 'work')).toBe(false);
    expect(isWorkspaceCountryAllowed(parsed.controls!, 'US')).toBe(false);
  });

  it('keeps v2 country authority and feature advice while refusing ambiguous host and MCP lists', async () => {
    const wire = governed(9, { hooks: false });
    const legacy = {
      ...wire,
      schemaVersion: 2,
      code: { ...wire.code, allowedMcpServers: ['reopened.example'], allowedEgressHosts: ['reopened.example'], allowGithubConnection: false },
    };
    const parsed = parseEffectiveWorkspacePolicy(legacy)!;
    expect(isWorkspaceCountryAllowed(parsed.controls!, null)).toBe(true);
    expect(isWorkspaceFeatureEnabled(parsed, 'hooks')).toBe(false);
    expect(parsed.code?.allowGithubConnection).toBe(false);
    expect(evaluateWorkspaceCodeAct(parsed.code, { act: 'use_mcp_server', server: 'reopened.example' }).allowed).toBe(false);
    expect(evaluateWorkspaceCodeAct(parsed.code, { act: 'reach_host', host: 'reopened.example' }).allowed).toBe(false);
    const cache = memoryCache(JSON.stringify({ etag: '"v2"', policy: legacy }));
    const request = vi.fn().mockResolvedValue(json(wire, '"v3"'));
    const poller = createWorkspacePolicyPoller({ cache, request });
    await poller.refresh();
    expect(request.mock.calls[0]?.[0]).toEqual({});
    expect(poller.getSnapshot().policy?.code?.mcpRestrictionActive).toBe(false);
  });

  it('retains current active-empty host and MCP denial through serialization and 304', async () => {
    const wire = governed(10);
    wire.code.mcpRestrictionActive = true;
    wire.code.egressRestrictionActive = true;
    const cache = memoryCache(JSON.stringify({ etag: '"v3"', policy: wire }));
    const request = vi.fn().mockResolvedValue(new Response(null, { status: 304 }));
    const poller = createWorkspacePolicyPoller({ cache, request });
    await poller.refresh();
    const code = poller.getSnapshot().policy!.code;
    expect(evaluateWorkspaceCodeAct(code, { act: 'use_mcp_server' }).allowed).toBe(false);
    expect(evaluateWorkspaceCodeAct(code, { act: 'reach_host', host: 'any.example' }).allowed).toBe(false);
    expect(code?.allowGithubConnection).toBe(true);
  });

  it('trusts null Code controls only for an explicitly unscoped current response', () => {
    const personal = { ...governed(1), organizationId: null, governed: false, controls: null, code: null };
    expect(parseEffectiveWorkspacePolicy(personal)?.code).toBeNull();
    for (const wire of [
      { ...personal, organizationId: ORG },
      { ...personal, code: undefined },
      { ...personal, schemaVersion: 2 },
    ]) {
      expect(parseEffectiveWorkspacePolicy(wire)?.code?.mcpRestrictionActive).toBe(true);
      expect(parseEffectiveWorkspacePolicy(wire)?.code?.egressRestrictionActive).toBe(true);
    }
  });

  it('fails closed missing, malformed and future Code projections without dropping other advice', () => {
    const wire = governed(11, { hooks: false });
    for (const code of [null, {}, { ...wire.code, allowedMcpServers: null, allowedEgressHosts: 42 }, { ...wire.code, mcpRestrictionActive: undefined, egressRestrictionActive: undefined }]) {
      const parsed = parseEffectiveWorkspacePolicy({ ...wire, code })!;
      expect(parsed.code).not.toBeNull();
      expect(isWorkspaceFeatureEnabled(parsed, 'hooks')).toBe(false);
      expect(evaluateWorkspaceCodeAct(parsed.code, { act: 'use_mcp_server' }).allowed).toBe(false);
      expect(evaluateWorkspaceCodeAct(parsed.code, { act: 'reach_host', host: 'any.example' }).allowed).toBe(false);
    }
    const future = parseEffectiveWorkspacePolicy({ ...wire, schemaVersion: 999 })!;
    expect(evaluateWorkspaceCodeAct(future.code, { act: 'use_mcp_server' }).allowed).toBe(false);
    const inconsistent = parseEffectiveWorkspacePolicy({ ...wire, code: { ...wire.code, allowedMcpServers: ['only.example'], allowedEgressHosts: ['only.example'] } })!;
    expect(evaluateWorkspaceCodeAct(inconsistent.code, { act: 'use_mcp_server', server: 'only.example' }).allowed).toBe(true);
    expect(evaluateWorkspaceCodeAct(inconsistent.code, { act: 'reach_host', host: 'other.example' }).allowed).toBe(false);
  });

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
    expect(disabledWorkspaceFeatures(poller.getSnapshot().policy)).toEqual(['fast_mode']);

    await vi.advanceTimersByTimeAsync(1000);
    expect(poller.getSnapshot().policy?.revision).toBe(2);
    expect(disabledWorkspaceFeatures(poller.getSnapshot().policy)).toEqual(['code', 'fast_mode']);
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
