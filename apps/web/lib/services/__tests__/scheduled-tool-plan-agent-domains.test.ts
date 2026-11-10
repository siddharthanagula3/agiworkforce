import { beforeEach, describe, expect, it, vi } from 'vitest';
type ScanModule0 = typeof import('@/app/api/llm/v1/chat/completions/lib/tool-approval-policy');
type ConnectorPolicyServiceModule = typeof import('@/lib/services/connector-policy-service');

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  connectorsAllowed: vi.fn(async () => false),
  workspacePolicy: vi.fn(async () => null as { allow: string[]; deny: string[] } | null),
  approvalPolicy: vi.fn(async () => 'auto_approve_read_only'),
}));

vi.mock('@/lib/connectors/connector-capability', () => ({
  connectorsAllowedWithoutRequest: mocks.connectorsAllowed,
}));

vi.mock('@/lib/services/connector-policy-service', async (importOriginal) => ({
  ...(await importOriginal<ConnectorPolicyServiceModule>()),
  readWorkspaceWebDomainPolicy: mocks.workspacePolicy,
}));

vi.mock('@/app/api/llm/v1/chat/completions/lib/tool-approval-policy', async (importOriginal) => ({
  ...(await importOriginal<ScanModule0>()),
  loadToolApprovalPolicy: mocks.approvalPolicy,
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { requireProviderDefaultModel } from '@agiworkforce/types';
import { buildScheduledToolPlan } from '../scheduled-agent-executor';

const MODEL = requireProviderDefaultModel('openai');

function plan(agentWebDomains?: { name: string; allow: string[]; deny: string[] } | null) {
  return buildScheduledToolPlan({
    db: {} as never,
    userId: 'user-owner',
    organizationId: null,
    planTier: 'pro',
    provider: 'openai',
    model: MODEL,
    webAllowed: true,
    connectors: null,
    ...(agentWebDomains !== undefined ? { agentWebDomains } : {}),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.connectorsAllowed.mockResolvedValue(false);
  mocks.workspacePolicy.mockResolvedValue(null);
});

describe('the website rules of an agent in a scheduled run', () => {
  it('carries the sites an agent blocks into the run', async () => {
    const result = await plan({ name: 'Notes', allow: [], deny: ['example.com'] });

    expect(result.webFetch).toBe(true);
    expect(result.webDomainPolicy).toEqual({ allow: [], deny: ['example.com'] });
  });

  it('carries the only sites an agent may read into the run', async () => {
    const result = await plan({ name: 'Notes', allow: ['docs.example.org'], deny: [] });

    expect(result.webDomainPolicy).toEqual({ allow: ['docs.example.org'], deny: [] });
  });

  it('narrows the workspace rules with the agent rules', async () => {
    mocks.workspacePolicy.mockResolvedValue({ allow: [], deny: ['ads.example.net'] });

    const result = await plan({ name: 'Notes', allow: [], deny: ['example.com'] });

    expect([...(result.webDomainPolicy?.deny ?? [])].sort()).toEqual([
      'ads.example.net',
      'example.com',
    ]);
  });

  it('offers no web tools when the agent sites sit outside the workspace allowlist', async () => {
    mocks.workspacePolicy.mockResolvedValue({ allow: ['docs.example.org'], deny: [] });

    const result = await plan({ name: 'Notes', allow: ['other.example.net'], deny: [] });

    expect(result.webSearch).toBe(false);
    expect(result.webFetch).toBe(false);
    expect(result.webDomainPolicy).toBeUndefined();
  });

  it('leaves a run without an agent on the workspace rules alone', async () => {
    mocks.workspacePolicy.mockResolvedValue({ allow: [], deny: ['ads.example.net'] });

    const result = await plan();

    expect(result.webDomainPolicy).toEqual({ allow: [], deny: ['ads.example.net'] });
  });
});
