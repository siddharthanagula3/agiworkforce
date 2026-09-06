import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { parseAgentEventDelta } from '@agiworkforce/cloud-contracts';
import {
  createSkillToolDefinition,
  formatSkillsForToolPrompt,
  type Skill,
} from '@agiworkforce/skills';

const provider = vi.hoisted(() => ({ stream: vi.fn() }));
vi.mock('./tool-loop-anthropic', () => ({
  buildToolLoopStream: provider.stream,
  buildServingRouteId: (...args: unknown[]) => args.join(':'),
}));

vi.mock('@/lib/e2b/runtime', () => ({
  getE2BExecutor: vi.fn().mockResolvedValue(null),
  pauseE2BSession: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/server/generated-file-persist', () => ({
  persistGeneratedFileBytes: vi.fn(),
  MAX_GENERATED_FILE_BYTES: 20 * 1024 * 1024,
}));

const userSkillService = vi.hoisted(() => ({ findUserSkillByName: vi.fn() }));
vi.mock('@/lib/services/user-skill-service', () => userSkillService);

const directorySkills = vi.hoisted(() => ({
  findInstalledDirectorySkill: vi.fn(async () => null as Skill | null),
}));
vi.mock('@/features/plugins/server/directory/installed-skills', () => directorySkills);

const neonAdapter = vi.hoisted(() => ({ query: vi.fn(async (_sql: string) => [] as unknown[]) }));
vi.mock('@/lib/server/neon-db', () => {
  const emptyAdapter = {
    query: neonAdapter.query,
    execute: async () => 0,
    transaction: async (fn: (tx: unknown) => unknown) => fn(emptyAdapter),
    withUser: () => emptyAdapter,
    withOrg: () => emptyAdapter,
    dispose: async () => {},
  };
  return { getNeonDb: () => emptyAdapter };
});

import { resetManagedSkillCatalogCacheForTests } from '@/lib/services/skill-catalog-service';
import { resolveToolRetrySafety, runToolLoop } from './tool-loop';
import type { ProcessedRequest } from './request-processor';
import type { UserSkillRecord } from '@/lib/services/user-skill-service';

function sseStream(events: unknown[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const payload = events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join('');
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(payload));
      controller.close();
    },
  });
}

function toolCallStream(name: string): ReadableStream<Uint8Array> {
  return sseStream([
    {
      choices: [
        {
          delta: {
            tool_calls: [
              {
                index: 0,
                id: 'call_skill_1',
                type: 'function',
                function: {
                  name: 'skill',
                  arguments: JSON.stringify({ action: 'load', name }),
                },
              },
            ],
          },
          index: 0,
        },
      ],
      model: 'test-model',
    },
    { choices: [{ delta: {}, finish_reason: 'tool_calls', index: 0 }], model: 'test-model' },
  ]);
}

function finalAnswerStream(text: string): ReadableStream<Uint8Array> {
  return sseStream([
    { choices: [{ delta: { content: text }, index: 0 }], model: 'test-model' },
    { choices: [{ delta: {}, finish_reason: 'stop', index: 0 }], model: 'test-model' },
  ]);
}

function makeSkill(root: string): Skill {
  return {
    name: 'design-review',
    description: 'Review UI for release polish.',
    body: 'Inspect the rendered interface and cite concrete defects.',
    contentHash: `sha256:${'0'.repeat(64)}`,
    filePath: join(root, 'design-review', 'SKILL.md'),
    source: 'personal',
    metadata: {},
    frontmatter: {},
  };
}

function makeProcessed(root: string, offerSkill = true): ProcessedRequest {
  const skill = makeSkill(root);
  return {
    chatSurface: 'web' as const,
    requestId: 'req-skill',
    chatRequest: {
      model: 'test-model',
      messages: [{ role: 'user', content: 'Review this UI.' }],
      ...(offerSkill ? { skill_name: 'design-review' } : {}),
      stream: true,
    },
    conversationId: undefined,
    requestedModel: 'test-model',
    provider: 'openai',
    estimatedCostCents: 0,
    estimatedPromptTokens: 0,
    maxTokens: 256,
    usedFallback: false,
    fallbackReason: undefined,
    originalModel: 'test-model',
    resolvedTaskType: 'general',
    classifierConfidence: 1,
    resolvedSlot: null,
    quotaFeature: 'chat',
    quotaWarningHeader: null,
    isFlagshipRequest: false,
    indicResult: undefined as never,
    llmRequest: {
      model: 'test-model',
      messages: offerSkill
        ? [
            {
              role: 'system',
              content: formatSkillsForToolPrompt([skill], { selectedSkillName: skill.name }),
            },
            { role: 'user', content: 'Review this UI.' },
          ]
        : [{ role: 'user', content: 'Review this UI.' }],
      max_tokens: 256,
      stream: true,
      tools: offerSkill ? [createSkillToolDefinition()] : undefined,
      tool_choice: offerSkill ? { type: 'function', function: { name: 'skill' } } : undefined,
    },
  } as ProcessedRequest;
}

async function collect(generator: AsyncGenerator<Uint8Array>): Promise<string> {
  const decoder = new TextDecoder();
  let output = '';
  for await (const chunk of generator) output += decoder.decode(chunk);
  return output;
}

function activityEvents(output: string) {
  return output
    .split('\n')
    .filter((line) => line.startsWith('data: {'))
    .flatMap((line) => {
      const payload = JSON.parse(line.slice('data: '.length)) as {
        choices?: Array<{ delta?: { x_agent_event?: unknown } }>;
      };
      const event = parseAgentEventDelta(payload.choices?.[0]?.delta?.x_agent_event);
      return event ? [event.event] : [];
    });
}

describe('managed Cloud Skill tool loop', () => {
  let root: string;

  beforeEach(async () => {
    provider.stream.mockReset();
    userSkillService.findUserSkillByName.mockReset();
    neonAdapter.query.mockReset();
    neonAdapter.query.mockResolvedValue([]);
    root = await mkdtemp(join(tmpdir(), 'cloud-skill-loop-'));
    const directory = join(root, 'design-review');
    await mkdir(directory, { recursive: true });
    await writeFile(
      join(directory, 'SKILL.md'),
      [
        '---',
        'name: design-review',
        'description: Review UI for release polish.',
        '---',
        '',
        'Inspect the rendered interface and cite concrete defects.',
      ].join('\n'),
      'utf-8',
    );
    process.env['SKILLS_LAYERS'] = JSON.stringify([{ rootDir: root, source: 'personal' }]);
    resetManagedSkillCatalogCacheForTests();
  });

  afterEach(async () => {
    delete process.env['SKILLS_LAYERS'];
    resetManagedSkillCatalogCacheForTests();
    await rm(root, { recursive: true, force: true });
  });

  it('loads the real body only after a model call and emits genuine running/completed activity', async () => {
    const providerRequests: ProcessedRequest['llmRequest'][] = [];
    provider.stream
      .mockImplementationOnce((...args: unknown[]) => {
        providerRequests.push(
          JSON.parse(JSON.stringify(args[2])) as ProcessedRequest['llmRequest'],
        );
        return Promise.resolve(toolCallStream('design-review'));
      })
      .mockImplementationOnce((...args: unknown[]) => {
        providerRequests.push(
          JSON.parse(JSON.stringify(args[2])) as ProcessedRequest['llmRequest'],
        );
        return Promise.resolve(finalAnswerStream('I used the selected review guidance.'));
      });

    const output = await collect(runToolLoop(makeProcessed(root), { approvalMode: 'auto' }));

    expect(provider.stream).toHaveBeenCalledTimes(2);
    const firstRequest = providerRequests[0];
    expect(JSON.stringify(firstRequest)).not.toContain('Inspect the rendered interface');
    expect(JSON.stringify(firstRequest)).not.toContain(root);
    expect(firstRequest?.tool_choice).toEqual({
      type: 'function',
      function: { name: 'skill' },
    });

    const secondRequest = providerRequests[1]!;
    expect(secondRequest.tool_choice).toBe('auto');
    const toolResult = secondRequest.messages.find((message) => message.role === 'tool');
    expect(toolResult).toMatchObject({ role: 'tool', tool_call_id: 'call_skill_1' });
    expect(toolResult?.content).toContain('<skill_result untrusted="true"');
    expect(toolResult?.content).toContain('Inspect the rendered interface');
    expect(toolResult?.content).not.toContain(root);

    expect(output).toContain('"name":"skill"');
    expect(output).toContain('"status_phrase":"Reading skill"');
    expect(output).toContain('"status":"completed"');
    expect(output).toContain('I used the selected review guidance.');

    expect(activityEvents(output)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'tool-execution-start',
          name: 'skill',
          category: 'skill',
          summary: 'Reading skill',
        }),
        expect.objectContaining({
          type: 'tool-execution-end',
          name: 'skill',
          isError: false,
        }),
      ]),
    );
    expect(resolveToolRetrySafety('skill')).toBe('safe');
  });

  it('does not fabricate reading activity when the model never calls the tool', async () => {
    provider.stream.mockResolvedValueOnce(finalAnswerStream('No skill was needed.'));

    const output = await collect(runToolLoop(makeProcessed(root), { approvalMode: 'auto' }));

    expect(output).not.toContain('Reading skill');
    expect(output).not.toContain('"name":"skill"');
    expect(output).toContain('No skill was needed.');
  });

  it('returns a structured failed tool result for a missing exact name', async () => {
    provider.stream
      .mockResolvedValueOnce(toolCallStream('missing-skill'))
      .mockResolvedValueOnce(finalAnswerStream('That skill is unavailable.'));

    const output = await collect(runToolLoop(makeProcessed(root), { approvalMode: 'auto' }));

    expect(output).toContain('"status":"failed"');
    expect(output).toContain('Unknown skill: missing-skill');
    expect(activityEvents(output)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'tool-execution-end',
          name: 'skill',
          isError: true,
        }),
      ]),
    );
  });

  it("loads a signed-in caller's own skill when it is absent from the managed catalog", async () => {
    userSkillService.findUserSkillByName.mockResolvedValueOnce({
      id: 'user-skill-1',
      name: 'my-standup-notes',
      description: 'Format my daily standup notes.',
      body: 'Lead with blockers, then yesterday, then today.',
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-01T00:00:00.000Z',
    } satisfies UserSkillRecord);
    provider.stream
      .mockResolvedValueOnce(toolCallStream('my-standup-notes'))
      .mockResolvedValueOnce(finalAnswerStream('Notes formatted.'));

    const output = await collect(
      runToolLoop(makeProcessed(root), { approvalMode: 'auto', userId: 'caller-1' }),
    );

    expect(userSkillService.findUserSkillByName).toHaveBeenCalledWith(
      expect.anything(),
      'caller-1',
      'my-standup-notes',
    );
    expect(output).toContain('"status":"completed"');
    expect(output).toContain('skill_result untrusted');
    expect(output).toContain('my-standup-notes');
    expect(output).toContain('Lead with blockers, then yesterday, then today.');
    expect(output).toContain('Notes formatted.');
  });

  it('loads a skill from an installed directory plugin after the caller skills miss', async () => {
    userSkillService.findUserSkillByName.mockResolvedValueOnce(null);
    directorySkills.findInstalledDirectorySkill.mockResolvedValueOnce({
      name: 'session-report',
      description: 'Generate a session report.',
      body: 'Summarise tokens, cache hits and subagents.',
      contentHash: 'sha256:0000',
      filePath: 'plugins/session-report/skills/session-report/SKILL.md',
      source: 'extra',
      metadata: {},
      frontmatter: { plugin: 'session-report' },
    });
    provider.stream
      .mockResolvedValueOnce(toolCallStream('session-report'))
      .mockResolvedValueOnce(finalAnswerStream('Report ready.'));

    const output = await collect(
      runToolLoop(makeProcessed(root), { approvalMode: 'auto', userId: 'caller-1' }),
    );

    expect(directorySkills.findInstalledDirectorySkill).toHaveBeenCalledWith(
      expect.anything(),
      'caller-1',
      'session-report',
    );
    expect(output).toContain('"status":"completed"');
    expect(output).toContain('Summarise tokens, cache hits and subagents.');
    expect(output).toContain('Report ready.');
  });

  it('still fails a name that matches neither the managed catalog nor the caller skills', async () => {
    userSkillService.findUserSkillByName.mockResolvedValueOnce(null);
    provider.stream
      .mockResolvedValueOnce(toolCallStream('nowhere-skill'))
      .mockResolvedValueOnce(finalAnswerStream('That skill is unavailable.'));

    const output = await collect(
      runToolLoop(makeProcessed(root), { approvalMode: 'auto', userId: 'caller-1' }),
    );

    expect(output).toContain('"status":"failed"');
    expect(output).toContain('Unknown skill: nowhere-skill');
  });

  it('refuses a hallucinated skill call when the server did not offer the tool', async () => {
    provider.stream
      .mockResolvedValueOnce(toolCallStream('design-review'))
      .mockResolvedValueOnce(finalAnswerStream('The tool was unavailable.'));

    const output = await collect(runToolLoop(makeProcessed(root, false), { approvalMode: 'auto' }));

    expect(output).toContain('Unknown tool: skill');
    expect(output).toContain('"status":"failed"');
    expect(output).not.toContain('Inspect the rendered interface');
  });

  it('refuses to load a managed skill the caller uninstalled, with the same unknown-skill wording', async () => {
    neonAdapter.query.mockImplementation(async (sql: string) =>
      sql.includes('user_settings')
        ? [{ settings: { skills: { installs: { 'design-review': false } } } }]
        : [],
    );
    provider.stream
      .mockResolvedValueOnce(toolCallStream('design-review'))
      .mockResolvedValueOnce(finalAnswerStream('That skill is unavailable.'));

    const output = await collect(
      runToolLoop(makeProcessed(root), { approvalMode: 'auto', userId: 'caller-1' }),
    );

    expect(output).toContain('"status":"failed"');
    expect(output).toContain('Unknown skill: design-review');
    expect(output).not.toContain('Inspect the rendered interface');
    expect(
      neonAdapter.query.mock.calls.filter(([sql]) => String(sql).includes('user_settings')),
    ).toHaveLength(1);
  });

  it('loads the skill again once the caller reinstalls it', async () => {
    neonAdapter.query.mockImplementation(async (sql: string) =>
      sql.includes('user_settings') ? [{ settings: { skills: { installs: {} } } }] : [],
    );
    provider.stream
      .mockResolvedValueOnce(toolCallStream('design-review'))
      .mockResolvedValueOnce(finalAnswerStream('I used the selected review guidance.'));

    const output = await collect(
      runToolLoop(makeProcessed(root), { approvalMode: 'auto', userId: 'caller-1' }),
    );

    expect(output).toContain('"status":"completed"');
    expect(output).toContain('Inspect the rendered interface');
  });

  it('reads the install overrides once even when the skill tool is called twice in one turn', async () => {
    neonAdapter.query.mockImplementation(async (sql: string) =>
      sql.includes('user_settings') ? [{ settings: {} }] : [],
    );
    userSkillService.findUserSkillByName.mockResolvedValueOnce(null);
    provider.stream
      .mockResolvedValueOnce(toolCallStream('nowhere-skill'))
      .mockResolvedValueOnce(toolCallStream('design-review'))
      .mockResolvedValueOnce(finalAnswerStream('Done.'));

    const output = await collect(
      runToolLoop(makeProcessed(root), { approvalMode: 'auto', userId: 'caller-1' }),
    );

    expect(output).toContain('Inspect the rendered interface');
    expect(
      neonAdapter.query.mock.calls.filter(([sql]) => String(sql).includes('user_settings')),
    ).toHaveLength(1);
  });
});
