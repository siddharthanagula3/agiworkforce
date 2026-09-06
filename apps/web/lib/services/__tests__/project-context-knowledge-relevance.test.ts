import { describe, expect, it, vi } from 'vitest';
import {
  formatProjectSystemPrompt,
  loadProjectContext,
  type ProjectContext,
} from '../project-context-service';

function makeContext(overrides: Partial<ProjectContext> = {}): ProjectContext {
  return {
    projectId: 'proj-1',
    name: 'Launch Plan',
    description: null,
    instructions: null,
    knowledgeFiles: [],
    siblingChats: [],
    ...overrides,
  };
}

function stubDb(
  files: Array<{ file_name: string; summary: string | null; extracted_text: string | null }>,
) {
  return vi
    .fn()
    .mockResolvedValueOnce([
      { id: 'proj-1', name: 'Launch Plan', description: null, instructions: null },
    ])
    .mockResolvedValueOnce(files)
    .mockResolvedValueOnce([]);
}

describe('project knowledge retrieval by relevance', () => {
  it('puts the file that matches the request ahead of the merely newest file', async () => {
    const query = stubDb([
      {
        file_name: 'offsite-agenda.md',
        summary: 'Team offsite schedule',
        extracted_text: 'Breakfast at nine.',
      },
      {
        file_name: 'refund-policy.md',
        summary: 'How refunds are handled',
        extracted_text: 'Refunds are issued within 14 days.',
      },
    ]);

    const context = await loadProjectContext(
      { query },
      {
        projectId: 'proj-1',
        userId: 'user-1',
        currentUserQuery: 'what is our refund window?',
      },
    );

    expect(context?.knowledgeFiles.map((file) => file.fileName)).toEqual([
      'refund-policy.md',
      'offsite-agenda.md',
    ]);
  });

  it('keeps added order when the request matches nothing', async () => {
    const query = stubDb([
      { file_name: 'a.md', summary: null, extracted_text: 'alpha' },
      { file_name: 'b.md', summary: null, extracted_text: 'beta' },
    ]);

    const context = await loadProjectContext(
      { query },
      { projectId: 'proj-1', userId: 'user-1', currentUserQuery: 'unrelated request' },
    );

    expect(context?.knowledgeFiles.map((file) => file.fileName)).toEqual(['a.md', 'b.md']);
  });

  it('names files whose text could not be extracted instead of dropping them silently', () => {
    const prompt = formatProjectSystemPrompt(
      makeContext({
        knowledgeFiles: [
          { fileName: 'readable.md', summary: null, extractedText: 'usable content' },
          { fileName: 'scanned-contract.pdf', summary: 'Signed contract', extractedText: null },
        ],
      }),
    );

    expect(prompt).toContain('no readable extracted text');
    expect(prompt).toContain('scanned-contract.pdf');
  });
});

describe('project knowledge retrieval across scripts', () => {
  it('ranks a Cyrillic match ahead of newer unrelated files', async () => {
    const query = stubDb([
      {
        file_name: 'notes-1.md',
        summary: 'Заметки о встрече',
        extracted_text: 'Обсуждали расписание.',
      },
      {
        file_name: 'policy.md',
        summary: 'Политика возврата',
        extracted_text: 'Возврат средств производится в течение 14 дней.',
      },
    ]);

    const context = await loadProjectContext(
      { query },
      {
        projectId: 'proj-1',
        userId: 'user-1',
        currentUserQuery: 'какой у нас срок возврата средств?',
      },
    );

    expect(context?.knowledgeFiles.map((file) => file.fileName)).toEqual([
      'policy.md',
      'notes-1.md',
    ]);
  });

  it('ranks a Han match without word spacing ahead of newer unrelated files', async () => {
    const query = stubDb([
      {
        file_name: 'agenda.md',
        summary: '会议日程',
        extracted_text: '早餐九点开始。',
      },
      {
        file_name: 'refunds.md',
        summary: '退款政策',
        extracted_text: '退款在十四天内处理。',
      },
    ]);

    const context = await loadProjectContext(
      { query },
      {
        projectId: 'proj-1',
        userId: 'user-1',
        currentUserQuery: '我们的退款期限是多久？',
      },
    );

    expect(context?.knowledgeFiles.map((file) => file.fileName)).toEqual([
      'refunds.md',
      'agenda.md',
    ]);
  });
});
