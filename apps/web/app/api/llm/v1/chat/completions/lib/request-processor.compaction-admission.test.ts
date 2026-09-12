import { describe, expect, it } from 'vitest';

import { buildCompactionRoutingRequest } from './request-processor';

/**
 * `WEB-SEC-SCAN-2026-09-09-F31`.
 *
 * Compaction is a second provider call carrying the conversation itself, and it
 * resolved its own route with none of the admission the main turn gets: no
 * retention requirement, no workspace model policy, not even the set of
 * providers this deployment holds a credential for. A workspace that requires
 * zero data retention could therefore have its whole transcript summarised by a
 * provider that retains it, silently, on the turn that overflowed the window.
 *
 * The regression to guard is narrow and specific: the admission arguments get
 * dropped at the call site, exactly as they were before. So these assert the
 * request that compaction routes on, not which model the registry happens to
 * return, which would make the test a hostage to catalogue edits.
 *
 * Failing closed is safe here. The caller falls back to a mechanical trim,
 * which makes no provider call at all, so a workspace with no compliant route
 * loses summary quality and never leaks the transcript.
 */
describe('context compaction routes under the same admission as the turn', () => {
  it('carries the zero-retention requirement', () => {
    expect(buildCompactionRoutingRequest({ zeroDataRetentionOnly: true })).toMatchObject({
      zeroDataRetentionOnly: true,
    });
  });

  it('omits the requirement when the workspace does not ask for it', () => {
    expect(buildCompactionRoutingRequest({ zeroDataRetentionOnly: false })).not.toHaveProperty(
      'zeroDataRetentionOnly',
    );
  });

  it('omits it when no policy was resolved', () => {
    expect(buildCompactionRoutingRequest({})).not.toHaveProperty('zeroDataRetentionOnly');
  });

  it('carries the credentialed provider set', () => {
    const request = buildCompactionRoutingRequest({
      availableProviderIds: new Set(['openai', 'google']),
    });

    expect(request).toHaveProperty('availableProviderIds');
    expect([...(request.availableProviderIds ?? [])].sort()).toEqual(['google', 'openai']);
  });

  it('carries the workspace model policy', () => {
    const policy = { allowedModels: ['gpt-5.6-luna'] } as never;
    const request = buildCompactionRoutingRequest({ organizationPolicy: policy });

    expect(request.organizationPolicy).toBe(policy);
  });

  it('still compacts on the economy alias, so the fix changed admission and not cost', () => {
    const request = buildCompactionRoutingRequest({});

    expect(request).toMatchObject({ selection: 'auto', subscriptionTier: 'free' });
  });

  it('leaves the rest of the request identical when nothing constrains it', () => {
    const open = buildCompactionRoutingRequest({});
    const constrained = buildCompactionRoutingRequest({ zeroDataRetentionOnly: true });

    expect({ ...constrained, zeroDataRetentionOnly: undefined }).toEqual({
      ...open,
      zeroDataRetentionOnly: undefined,
    });
  });
});
