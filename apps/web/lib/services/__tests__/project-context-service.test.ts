import { describe, expect, it, vi } from 'vitest';
import {
  applyProjectContext,
  formatProjectSystemPrompt,
  loadProjectContext,
  type ProjectContext,
} from '../project-context-service';
import type { ChatCompletionRequest } from '@/app/api/llm/v1/chat/completions/lib/request-processor';

function makeContext(overrides: Partial<ProjectContext> = {}): ProjectContext {
  return {
    projectId: 'a9924d57-57b8-40e2-823b-5c0c4ed14145',
    name: 'Launch Plan',
    description: null,
    instructions: null,
    knowledgeFiles: [],
    ...overrides,
  };
}

describe('loadProjectContext', () => {
  it('returns the owned project with its knowledge-file manifest', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([
        {
          id: 'proj-1',
          name: 'Launch Plan',
          description: 'Q3 launch',
          instructions: 'Answer tersely.',
        },
      ])
      .mockResolvedValueOnce([{ file_name: 'pricing.md', summary: 'Tier table' }]);

    const context = await loadProjectContext({ query }, { projectId: 'proj-1', userId: 'user-1' });

    expect(context).toMatchObject({
      projectId: 'proj-1',
      name: 'Launch Plan',
      instructions: 'Answer tersely.',
      knowledgeFiles: [{ fileName: 'pricing.md', summary: 'Tier table' }],
    });
    // Owner guard is part of the SQL, not caller policy.
    expect(query.mock.calls[0]?.[0]).toContain('user_id = $2');
    expect(query.mock.calls[0]?.[1]).toEqual(['proj-1', 'user-1']);
  });

  it('returns null for a project the user does not own (empty row set)', async () => {
    const query = vi.fn().mockResolvedValueOnce([]);
    const context = await loadProjectContext(
      { query },
      { projectId: 'proj-foreign', userId: 'user-1' },
    );
    expect(context).toBeNull();
    // No second query for files when the project itself is not visible.
    expect(query).toHaveBeenCalledTimes(1);
  });
});

describe('formatProjectSystemPrompt', () => {
  it('renders instructions, description, and the file manifest', () => {
    const prompt = formatProjectSystemPrompt(
      makeContext({
        description: 'Q3 launch planning',
        instructions: 'Always answer in bullet points.',
        knowledgeFiles: [
          { fileName: 'pricing.md', summary: 'Tier table' },
          { fileName: 'roadmap.pdf', summary: null },
        ],
      }),
    );

    expect(prompt).toContain('project "Launch Plan"');
    expect(prompt).toContain('Q3 launch planning');
    expect(prompt).toContain('Always answer in bullet points.');
    expect(prompt).toContain('- pricing.md — Tier table');
    expect(prompt).toContain('- roadmap.pdf');
    // Capability honesty: the manifest must say contents are NOT attached.
    expect(prompt).toContain('file contents are not attached');
  });

  it('returns null when the project has nothing to inject', () => {
    expect(formatProjectSystemPrompt(makeContext())).toBeNull();
  });

  it('caps oversized instructions deterministically', () => {
    const prompt = formatProjectSystemPrompt(makeContext({ instructions: 'x'.repeat(20_000) }));
    expect(prompt).not.toBeNull();
    expect(prompt!.length).toBeLessThan(10_000);
    expect(prompt).toContain('…');
  });
});

describe('applyProjectContext', () => {
  it('merges into an existing leading system message', () => {
    const chatRequest = {
      model: 'auto',
      messages: [
        { role: 'system', content: 'Existing system prompt.' },
        { role: 'user', content: 'hi' },
      ],
      stream: false,
    } as ChatCompletionRequest;

    applyProjectContext(chatRequest, 'PROJECT BLOCK');

    expect(chatRequest.messages).toHaveLength(2);
    expect(chatRequest.messages[0]?.content).toBe('PROJECT BLOCK\n\nExisting system prompt.');
  });

  it('prepends a system message when none exists', () => {
    const chatRequest = {
      model: 'auto',
      messages: [{ role: 'user', content: 'hi' }],
      stream: false,
    } as ChatCompletionRequest;

    applyProjectContext(chatRequest, 'PROJECT BLOCK');

    expect(chatRequest.messages[0]).toEqual({ role: 'system', content: 'PROJECT BLOCK' });
    expect(chatRequest.messages).toHaveLength(2);
  });
});
