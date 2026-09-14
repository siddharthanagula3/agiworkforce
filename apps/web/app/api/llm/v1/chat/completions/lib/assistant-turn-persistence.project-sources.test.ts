import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ execute: vi.fn(), query: vi.fn(async () => [] as unknown[]) }));

vi.mock('@/lib/server/neon-db', () => {
  const pool = {
    execute: mocks.execute,
    query: mocks.query,
    transaction: (run: (tx: unknown) => Promise<unknown>) => run(pool),
  };
  return { getNeonDb: () => pool };
});
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { projectPersistedMessageMetadata } from '@agiworkforce/cloud-contracts';
import type { ProjectFileCitation } from '@agiworkforce/types';

import { persistAssistantTurn } from './assistant-turn-persistence';
import type { ProcessedRequest } from './request-processor';

const PROJECT_SOURCES: ProjectFileCitation[] = [
  {
    fileName: 'pricing.pdf',
    fileId: '44444444-4444-4444-8444-444444444444',
    projectId: '55555555-5555-4555-8555-555555555555',
    snippet: 'Refunds are issued to the original payment method within 14 days.',
    anchor: { page: 4 },
  },
  {
    fileName: 'handbook.md',
    fileId: '66666666-6666-4666-8666-666666666666',
    projectId: '55555555-5555-4555-8555-555555555555',
    snippet: 'Support hours are 09:00 to 17:00 UTC.',
    anchor: { headingPath: ['Pricing', 'Refunds'] },
  },
];

function processed(projectSources: readonly ProjectFileCitation[]): ProcessedRequest {
  return {
    requestId: 'request-1',
    organizationId: null,
    conversationId: '22222222-2222-4222-8222-222222222222',
    assistantMessageId: '33333333-3333-4333-8333-333333333333',
    conversationIsTemporary: false,
    projectSources,
  } as ProcessedRequest;
}

function insertedMetadata(): Record<string, unknown> {
  const [, params] = mocks.execute.mock.calls.find(([text]) =>
    String(text).includes('insert into web_messages'),
  ) as [string, unknown[]];
  return JSON.parse(String(params[7])) as Record<string, unknown>;
}

describe('assistant turn persistence -> project sources', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.execute.mockResolvedValue(1);
    mocks.query.mockResolvedValue([{ active_leaf_message_id: null }]);
  });

  it('writes each passage anchor into the saved message metadata', async () => {
    await persistAssistantTurn({
      userId: 'user-1',
      processed: processed(PROJECT_SOURCES),
      snapshot: {
        content: 'Refunds take 14 days.',
        model: 'fixture-model',
        provider: 'fixture-provider',
        inputTokens: 10,
        outputTokens: 2,
        truncated: false,
      },
    });

    expect(insertedMetadata()['projectSources']).toEqual(PROJECT_SOURCES);
  });

  it('saves the turn even when the answer text is empty', async () => {
    await persistAssistantTurn({
      userId: 'user-1',
      processed: processed(PROJECT_SOURCES),
      snapshot: {
        content: '',
        model: 'fixture-model',
        provider: 'fixture-provider',
        inputTokens: 10,
        outputTokens: 0,
        truncated: false,
      },
    });

    expect(insertedMetadata()['projectSources']).toHaveLength(2);
  });

  it('keeps the anchors inside the stored metadata bound', () => {
    const oversized = Array.from({ length: 40 }, (_, index) => ({
      fileName: `file-${index}.pdf`.repeat(40),
      fileId: `id-${index}`,
      projectId: 'project-1',
      snippet: 'x'.repeat(4_000),
      anchor: { headingPath: ['a'.repeat(400), 'b'.repeat(400), 'c'.repeat(400), 'd'] },
    }));

    const bounded = projectPersistedMessageMetadata({ projectSources: oversized })?.[
      'projectSources'
    ] as ProjectFileCitation[];

    expect(bounded.length).toBeLessThanOrEqual(8);
    for (const citation of bounded) {
      expect(citation.anchor?.headingPath?.length ?? 0).toBeLessThanOrEqual(3);
    }
    expect(JSON.stringify(bounded).length).toBeLessThanOrEqual(2_500);
  });
});
