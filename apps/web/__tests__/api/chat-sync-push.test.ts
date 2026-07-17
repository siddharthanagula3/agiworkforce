/** POST /api/chat/sync — server-version CAS and optional-field ownership. */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const queryMock = vi.fn();

vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: vi.fn(async () => ({ db: { query: queryMock }, userId: 'u1' })),
}));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => undefined) }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn(async () => undefined) }));

import { POST } from '@/app/api/chat/sync/route';
import { NextRequest } from 'next/server';

beforeEach(() => {
  queryMock.mockReset();
  queryMock.mockResolvedValue([
    {
      kind: 'applied',
      id: '0190a000-0000-7000-8000-0000000000cc',
      server_version: '1',
      current: null,
    },
  ]);
});

function postReq(body: unknown) {
  return new NextRequest('http://localhost/api/chat/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/chat/sync — revision CAS', () => {
  it('uses server revisions/clocks and preserves fields omitted by Desktop', async () => {
    const res = await POST(
      postReq({
        protocolVersion: 2,
        conversations: [
          {
            id: '0190a000-0000-7000-8000-0000000000cc',
            title: 'Desktop chat',
            baseVersion: '7',
          },
        ],
        messages: [],
      }),
    );
    expect(res.status).toBe(200);

    const convCall = queryMock.mock.calls.find((c) =>
      String(c[0]).includes('update web_conversations'),
    );
    expect(convCall).toBeDefined();
    const sql = String(convCall![0]);
    // Desktop omits model/project/pinned because its SQLite row does not own them.
    expect(sql).toContain('when incoming.has_model then incoming.model else existing.model');
    expect(sql).toContain('existing.server_version = incoming.base_version');
    expect(sql).toContain('updated_at = now()');
    expect(sql).not.toContain('excluded.updated_at');
  });

  it('returns a non-disclosing conflict for a message id outside the tenant', async () => {
    const res = await POST(
      postReq({
        protocolVersion: 2,
        messages: [
          {
            id: '0190a000-0000-7000-8000-0000000000dd',
            conversationId: '0190a000-0000-7000-8000-0000000000cc',
            role: 'user',
            content: 'hello',
          },
        ],
      }),
    );
    expect(res.status).toBe(200);

    const messageCall = queryMock.mock.calls.find((call) =>
      String(call[0]).includes('insert into web_messages'),
    );
    expect(messageCall).toBeDefined();
    const sql = String(messageCall![0]);
    expect(sql).toContain('current.id is null or owner.id is null');
    expect(sql).not.toContain('current.id is null or owner.id is not null');
  });

  it('admits an artifact message owner only inside the same owned conversation', async () => {
    const conversationId = '0190a000-0000-7000-8000-0000000000cc';
    const messageId = '0190a000-0000-7000-8000-0000000000dd';
    const res = await POST(
      postReq({
        protocolVersion: 2,
        artifacts: [
          {
            id: '0190a000-0000-7000-8000-0000000000ee',
            conversationId,
            messageId,
            artifactType: 'react',
            content: 'export default function A() { return <div /> }',
            baseVersion: '0',
          },
        ],
      }),
    );
    expect(res.status).toBe(200);

    const artifactCall = queryMock.mock.calls.find((call) =>
      String(call[0]).includes('insert into web_artifacts'),
    );
    expect(artifactCall).toBeDefined();
    const sql = String(artifactCall![0]);
    expect(sql).toContain('source_message.id = incoming.message_id');
    expect(sql).toContain('source_message.conversation_id = incoming.conversation_id');
    expect(sql).toContain('source_parent.user_id = $1');
    expect(sql).toContain('source_message.deleted_at is null');
  });

  it.each(['foreign', 'deleted'])(
    'returns a non-disclosing conflict for a valid-looking %s artifact message UUID',
    async () => {
      const artifactId = '0190a000-0000-7000-8000-0000000000ee';
      queryMock.mockResolvedValueOnce([
        { kind: 'conflict', id: artifactId, server_version: null, current: null },
      ]);
      const res = await POST(
        postReq({
          protocolVersion: 2,
          artifacts: [
            {
              id: artifactId,
              conversationId: '0190a000-0000-7000-8000-0000000000cc',
              messageId: '0190a000-0000-7000-8000-0000000000dd',
              artifactType: 'react',
              content: 'export default function A() { return <div /> }',
              baseVersion: '0',
            },
          ],
        }),
      );
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({
        applied: { artifacts: [] },
        conflicts: { artifacts: [{ id: artifactId, current: null }] },
      });
    },
  );

  it('allows a later valid artifact-owner replay and keeps its ack idempotent', async () => {
    const artifactId = '0190a000-0000-7000-8000-0000000000ee';
    const requestBody = {
      protocolVersion: 2 as const,
      artifacts: [
        {
          id: artifactId,
          conversationId: '0190a000-0000-7000-8000-0000000000cc',
          messageId: '0190a000-0000-7000-8000-0000000000dd',
          artifactType: 'react',
          content: 'export default function A() { return <div /> }',
          baseVersion: '0',
        },
      ],
    };
    queryMock
      .mockResolvedValueOnce([
        { kind: 'conflict', id: artifactId, server_version: null, current: null },
      ])
      .mockResolvedValueOnce([
        { kind: 'applied', id: artifactId, server_version: '7', current: null },
      ])
      .mockResolvedValueOnce([
        { kind: 'applied', id: artifactId, server_version: '7', current: null },
      ]);

    const rejected = await POST(postReq(requestBody));
    expect(await rejected.json()).toMatchObject({ conflicts: { artifacts: [{ id: artifactId }] } });

    const accepted = await POST(postReq(requestBody));
    expect(await accepted.json()).toMatchObject({
      applied: { artifacts: [{ id: artifactId, server_version: '7' }] },
      conflicts: { artifacts: [] },
    });

    requestBody.artifacts[0]!.baseVersion = '7';
    const replayed = await POST(postReq(requestBody));
    expect(await replayed.json()).toMatchObject({
      applied: { artifacts: [{ id: artifactId, server_version: '7' }] },
      conflicts: { artifacts: [] },
    });
  });
});
