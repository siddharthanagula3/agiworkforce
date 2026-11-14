import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { NextRequest, NextResponse } from 'next/server';
import { buildExternalSharingGateResponse } from '@/lib/managed-compute-gate';
import { moderateManagedPrompt } from '@/lib/moderation';
import { inspectOutboundContent } from '@/lib/security/outbound-content-inspection';
import { resolveSecretHandlingPolicy } from '@/lib/services/organization-policy-gate';
import { preparePublishedArtifactPublication } from './published-artifact-publication-policy';
type ManagedComputeGateModule = typeof import('@/lib/managed-compute-gate');
type ModerationModule = typeof import('@/lib/moderation');
type OutboundContentInspectionModule = typeof import('@/lib/security/outbound-content-inspection');
type OrganizationPolicyGateModule = typeof import('@/lib/services/organization-policy-gate');

vi.mock('server-only', () => ({}));
vi.mock('@/lib/managed-compute-gate', async () => ({
  ...(await vi.importActual<ManagedComputeGateModule>('@/lib/managed-compute-gate')),
  buildExternalSharingGateResponse: vi.fn(),
}));
vi.mock('@/lib/moderation', async () => ({
  ...(await vi.importActual<ModerationModule>('@/lib/moderation')),
  moderateManagedPrompt: vi.fn(),
}));
vi.mock('@/lib/security/outbound-content-inspection', async () => ({
  ...(await vi.importActual<OutboundContentInspectionModule>(
    '@/lib/security/outbound-content-inspection',
  )),
  inspectOutboundContent: vi.fn(),
}));
vi.mock('@/lib/services/organization-policy-gate', async () => ({
  ...(await vi.importActual<OrganizationPolicyGateModule>(
    '@/lib/services/organization-policy-gate',
  )),

  resolveSecretHandlingPolicy: vi.fn(),
}));

const query = vi.fn();
const db = { query } as unknown as DatabaseAdapter;
const input = {
  request: new NextRequest('https://app.agiworkforce.test/api/artifacts/publish'),
  userId: 'owner',
  organizationId: 'active-org',
  artifactId: 'server-artifact',
  conversationId: 'server-conversation',
  title: 'Historical title',
  content: 'Historical content',
};

beforeEach(() => {
  vi.resetAllMocks();
  query.mockResolvedValue([
    { organization_id: 'conversation-org' },
    { organization_id: 'shared-org' },
  ]);
  vi.mocked(buildExternalSharingGateResponse).mockResolvedValue(null);
  vi.mocked(moderateManagedPrompt).mockReturnValue({ allowed: true, action: 'allow' });
  vi.mocked(inspectOutboundContent).mockResolvedValue({
    action: 'allowed',
    value: input.content,
    findings: [],
  });
});

describe('publication preparation shared by restore and Publish', () => {
  it('checks conversation and share policies before moderation and outbound inspection', async () => {
    await expect(preparePublishedArtifactPublication(db, input)).resolves.toEqual({
      content: input.content,
    });
    expect(query).toHaveBeenCalledTimes(1);
    const [sql, parameters] = query.mock.calls[0]!;
    expect(parameters).toEqual([input.userId, input.artifactId, input.conversationId]);
    expect(sql).toContain('public.web_conversations');
    expect(sql).toContain('coalesce(');
    expect(sql).toContain('publication.conversation_id');
    expect(sql).toContain('conversation.user_id = $1');
    expect(sql).toContain('public.organization_shared_artifacts');
    expect(sql).toContain('publication.id = share.published_artifact_id');
    expect(sql).toContain('publication.user_id = $1 and publication.artifact_id = $2');
    expect(buildExternalSharingGateResponse).toHaveBeenCalledExactlyOnceWith(
      input.userId,
      input.request,
      ['conversation-org', 'shared-org'],
    );
    expect(moderateManagedPrompt).toHaveBeenCalledExactlyOnceWith({
      userId: input.userId,
      segments: [input.title, input.content],
      surface: 'published-artifact',
    });
    const order = [
      query,
      buildExternalSharingGateResponse,
      moderateManagedPrompt,
      inspectOutboundContent,
    ].map((mock) => vi.mocked(mock).mock.invocationCallOrder[0]!);
    expect(order).toEqual([...order].sort((left, right) => left - right));
  });

  it('retains null conversation fallback and nullable organization results', async () => {
    query.mockResolvedValue([{ organization_id: null }, { organization_id: 'shared-org' }]);
    await preparePublishedArtifactPublication(db, { ...input, conversationId: null });
    expect(query.mock.calls[0]?.[1]).toEqual([input.userId, input.artifactId, null]);
    expect(buildExternalSharingGateResponse).toHaveBeenCalledWith(input.userId, input.request, [
      null,
      'shared-org',
    ]);
  });

  it('returns the sharing refusal before moderation or outbound inspection', async () => {
    const refusal = new NextResponse('blocked by organization', { status: 403 });
    vi.mocked(buildExternalSharingGateResponse).mockResolvedValue(refusal);
    await expect(preparePublishedArtifactPublication(db, input)).resolves.toBe(refusal);
    expect(moderateManagedPrompt).not.toHaveBeenCalled();
    expect(inspectOutboundContent).not.toHaveBeenCalled();
  });

  it('fails moderation before inspecting outbound content', async () => {
    vi.mocked(moderateManagedPrompt).mockReturnValue({
      allowed: false,
      action: 'block',
      refusal: 'blocked',
      categories: [],
      ruleIds: [],
    });
    await expect(preparePublishedArtifactPublication(db, input)).rejects.toThrow('usage policy');
    expect(inspectOutboundContent).not.toHaveBeenCalled();
  });

  it('uses artifact_publish identity and the owner secret policy, returning redacted content', async () => {
    vi.mocked(inspectOutboundContent).mockResolvedValue({
      action: 'redacted',
      value: '[REDACTED]',
      findings: [],
    });
    await expect(preparePublishedArtifactPublication(db, input)).resolves.toEqual({
      content: '[REDACTED]',
    });
    expect(inspectOutboundContent).toHaveBeenCalledExactlyOnceWith({
      channel: 'artifact_publish',
      value: input.content,
      userId: input.userId,
      organizationId: input.organizationId,
      resourceId: input.artifactId,
      resolveMode: expect.any(Function),
    });
    const inspection = vi.mocked(inspectOutboundContent).mock.calls[0]![0];
    await inspection.resolveMode!();
    expect(resolveSecretHandlingPolicy).toHaveBeenCalledExactlyOnceWith(db, input.userId);
  });

  it('refuses outbound blocked content', async () => {
    vi.mocked(inspectOutboundContent).mockResolvedValue({
      action: 'blocked',
      message: 'Secret blocked',
      findings: [],
    });
    await expect(preparePublishedArtifactPublication(db, input)).rejects.toThrow('Secret blocked');
  });

  it('fails closed on policy lookup failure', async () => {
    query.mockRejectedValue(new Error('policy unavailable'));
    await expect(preparePublishedArtifactPublication(db, input)).rejects.toThrow(
      'policy unavailable',
    );
    expect(buildExternalSharingGateResponse).not.toHaveBeenCalled();
    expect(moderateManagedPrompt).not.toHaveBeenCalled();
    expect(inspectOutboundContent).not.toHaveBeenCalled();
  });
});
