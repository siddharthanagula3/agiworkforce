import { isContextSourceClass, type ContextSource } from '@agiworkforce/context';
import { describe, expect, it, vi } from 'vitest';
import { loadManagedMemoryContext } from '@/lib/services/managed-memory-context-service';
import { loadPastChatExcerpts } from '@/lib/services/past-chat-context-service';
import { loadProjectContext } from '@/lib/services/project-context-service';
import { agiWorkGoalContextSource, agiWorkPlanContextSource } from '../agiwork-plan';
import { buildContextManifest } from './context-manifest';

function expectWellFormed(source: ContextSource) {
  expect(isContextSourceClass(source.sourceClass)).toBe(true);
  expect(source.id).toBe(`${source.sourceClass}:${source.provenance.locator}`);
  expect(source.provenance.locator.length).toBeGreaterThan(0);
  expect(source.trust.isMerelyData).toBe(!source.trust.isInstruction);
  expect(source.trust.requiresFence).toBe(!source.trust.isInstruction);
  if (source.trust.requiresFence) expect(source.trust.fenceTag).toBeTruthy();
  if (source.trust.isExternal) expect(source.trust.isInstruction).toBe(false);
}

describe('every loader returns typed context sources', () => {
  it('memory rows carry account provenance and stay data, not instruction', async () => {
    const query = vi.fn().mockResolvedValue([
      {
        id: 'mem-1',
        content: 'I prefer concise answers.',
        category: 'preference',
        pinned: true,
        updated_at: '2026-09-17T08:00:00.000Z',
      },
    ]);

    const [memory] = await loadManagedMemoryContext(
      { query },
      { userId: 'user-1', organizationId: 'org-1' },
    );

    expect(memory?.source.sourceClass).toBe('account_memory');
    expect(memory?.source.provenance).toMatchObject({
      origin: 'account_store',
      authoredBy: 'user',
      recordId: 'mem-1',
      ownerUserId: 'user-1',
      organizationId: 'org-1',
      capturedAt: '2026-09-17T08:00:00.000Z',
    });
    expect(memory?.source.trust.canGenerateMemory).toBe(true);
    expect(memory?.source.trust.isInstruction).toBe(false);
    expectWellFormed(memory!.source);
  });

  it('past-chat excerpts record which side of the conversation wrote them', async () => {
    const query = vi.fn().mockResolvedValue([
      {
        id: 'message-1',
        conversation_id: 'conversation-1',
        role: 'assistant',
        content: 'The bowline is your favourite mooring knot.',
        created_at: '2026-09-16T08:00:00.000Z',
        title: 'Knots',
      },
    ]);

    const [excerpt] = await loadPastChatExcerpts(
      { query },
      { userId: 'user-1', query: 'What did I say my favourite mooring knot was?' },
    );

    expect(excerpt?.source.sourceClass).toBe('past_chat');
    expect(excerpt?.source.provenance.authoredBy).toBe('assistant');
    expect(excerpt?.source.provenance.conversationId).toBe('conversation-1');
    expect(excerpt?.source.trust.isUserAuthored).toBe(false);
    expectWellFormed(excerpt!.source);
  });

  it('a project load names its instruction, its files and its sibling chats', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([
        {
          id: 'project-1',
          name: 'Launch Plan',
          description: null,
          instructions: 'Answer tersely.',
          organization_id: 'org-1',
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'file-1',
          file_name: 'pricing.md',
          summary: null,
          extracted_text: 'Pro costs $20 per month.',
          extracted_anchors: null,
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'conversation-1',
          title: 'Pricing chat',
          updated_at: '2026-09-16T12:00:00.000Z',
          role: 'user',
          content: 'How much is Pro?',
          created_at: '2026-09-16T11:59:00.000Z',
        },
      ]);

    const context = await loadProjectContext(
      { query },
      { projectId: 'project-1', userId: 'user-1' },
    );

    expect(context?.sources.map((source) => source.sourceClass)).toEqual([
      'project_instruction',
      'project_knowledge_file',
      'project_sibling_chat',
    ]);
    const [instruction, file, sibling] = context!.sources;
    expect(instruction?.trust.level).toBe('instruction');
    expect(file?.trust.level).toBe('untrusted');
    expect(file?.provenance.recordId).toBe('file-1');
    expect(sibling?.provenance.authoredBy).toBe('mixed');
    for (const source of context!.sources) expectWellFormed(source);
  });

  it('an AGI Work turn contributes its goal and its plan state', () => {
    const goal = agiWorkGoalContextSource({ turnId: 'turn-1', conversationId: 'conversation-1' });
    const plan = agiWorkPlanContextSource({ turnId: 'turn-1', planId: 'plan-1', version: 3 });

    expect(goal.sourceClass).toBe('agent_instruction');
    expect(plan.sourceClass).toBe('current_task_state');
    expect(plan.provenance.locator).toBe('work_plans/plan-1@3');
    expectWellFormed(goal);
    expectWellFormed(plan);

    const manifest = buildContextManifest([goal, plan]);
    expect(manifest.instructions).toHaveLength(2);
    expect(manifest.external).toHaveLength(0);
  });
});
