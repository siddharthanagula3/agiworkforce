import { describe, expect, it } from 'vitest';
import type { Message } from '@shared/stores/web-chat-store';
import type { Artifact } from '../../stores/artifacts-store';
import {
  buildTaskDockSummary,
  connectorDisplayName,
  hasWorkSession,
  skillDisplayName,
  taskDockRunKey,
} from './taskDockSummary';

const TURN_ID = 'assistant-1';

function activityMessage(entries: unknown[], status = 'running'): Message {
  return {
    id: TURN_ID,
    role: 'assistant',
    content: 'Working.',
    createdAt: '2026-09-05T12:00:01.000Z',
    metadata: {
      sendReplay: { workMode: 'agiwork' },
      agentActivity: {
        schemaVersion: 1,
        sessionId: 'conv-1',
        turnId: TURN_ID,
        lastSequence: entries.length,
        status,
        startedAtMs: 1_000,
        updatedAtMs: 9_000,
        entries,
      },
    },
  } as unknown as Message;
}

function searchToolEntry(): Record<string, unknown> {
  return {
    kind: 'tool',
    id: 'tool-search',
    toolCallId: 'call-search',
    name: 'web_search',
    category: 'web-search',
    summary: 'Searching the web',
    status: 'completed',
    startedAtMs: 1_000,
    completedAtMs: 2_000,
    query: 'weather in lisbon',
    sources: [
      { url: 'https://www.ipma.pt/en/otempo/prev.localidade/', title: 'Lisbon forecast' },
      { url: 'https://weather.example.com/lisbon?utm_source=x', title: 'Lisbon weather' },
    ],
  };
}

describe('taskDockSummary sources', () => {
  it('groups a tool call sources under its query with host and favicon', () => {
    const summary = buildTaskDockSummary({
      messages: [activityMessage([searchToolEntry()])],
      artifacts: [],
    });

    expect(summary.sources).toHaveLength(1);
    const group = summary.sources[0]!;
    expect(group.label).toBe('weather in lisbon');
    expect(group.sources.map((source) => source.host)).toEqual(['ipma.pt', 'weather.example.com']);
    expect(group.sources[0]!.title).toBe('Lisbon forecast');
    expect(group.sources[0]!.faviconUrl).toContain('ipma.pt');
  });

  it('keeps a detached source-list entry as its own group', () => {
    const summary = buildTaskDockSummary({
      messages: [
        activityMessage([
          {
            kind: 'sources',
            id: 'sources-1',
            query: 'lisbon rainfall',
            sources: [{ url: 'https://example.org/rain', title: 'Rainfall' }],
            emittedAtMs: 3_000,
          },
        ]),
      ],
      artifacts: [],
    });

    expect(summary.sources.map((group) => group.label)).toEqual(['lisbon rainfall']);
    expect(summary.sources[0]!.sources[0]!.url).toBe('https://example.org/rain');
  });

  it('adds a fetched page as a row and never repeats a url already listed', () => {
    const summary = buildTaskDockSummary({
      messages: [
        activityMessage([
          searchToolEntry(),
          {
            kind: 'tool',
            id: 'tool-fetch',
            toolCallId: 'call-fetch',
            name: 'web_fetch',
            category: 'web-fetch',
            summary: 'Read ipma.pt',
            status: 'completed',
            input: { url: 'https://www.ipma.pt/en/otempo/prev.localidade/' },
            startedAtMs: 2_000,
            completedAtMs: 3_000,
          },
        ]),
      ],
      artifacts: [],
    });

    expect(summary.sources).toHaveLength(1);
    expect(summary.sources[0]!.sources).toHaveLength(2);
  });

  it('falls back to the turn s own citation list when no activity carried sources', () => {
    const message = {
      id: TURN_ID,
      role: 'assistant',
      content: 'Answer [1].',
      createdAt: '2026-09-05T12:00:01.000Z',
      metadata: {
        searchResults: {
          query: 'lisbon',
          results: [{ url: 'https://example.com/a', title: 'A' }],
        },
      },
    } as unknown as Message;

    const summary = buildTaskDockSummary({ messages: [message], artifacts: [] });
    expect(summary.sources[0]!.label).toBe('lisbon');
    expect(summary.sources[0]!.sources[0]!.title).toBe('A');
  });
});

describe('taskDockSummary context', () => {
  it('lists the connectors, skills and project a run used', () => {
    const summary = buildTaskDockSummary({
      messages: [
        activityMessage([
          {
            kind: 'tool',
            id: 'tool-connector',
            toolCallId: 'call-connector',
            name: 'mcp__gmail__send',
            category: 'connector',
            summary: 'Using Gmail connector',
            status: 'completed',
            startedAtMs: 1_000,
          },
          {
            kind: 'tool',
            id: 'tool-skill',
            toolCallId: 'call-skill',
            name: 'skill',
            category: 'skill',
            summary: 'Reading skill',
            status: 'completed',
            input: { action: 'load', name: 'weather-report' },
            startedAtMs: 1_500,
          },
        ]),
      ],
      artifacts: [],
      projectName: 'Field notes',
    });

    expect(summary.context).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'project', label: 'Field notes', mark: 'F' }),
        expect.objectContaining({ kind: 'connector', label: 'Gmail', mark: 'G' }),
        expect.objectContaining({ kind: 'skill', label: 'Weather Report' }),
      ]),
    );
  });

  it('names a connector from its qualified tool name when the summary is generic', () => {
    expect(connectorDisplayName('mcp__github__list_prs', 'Using connector')).toBe('Github');
    expect(connectorDisplayName('mcp__custom-9f2__act', 'Using connector')).toBeUndefined();
    expect(connectorDisplayName('mcp__github__list_prs', 'Review Canva action')).toBe('Canva');
  });

  it('names a skill from the load argument, not the generic phrase', () => {
    expect(skillDisplayName({ action: 'load', name: 'pdf_report' }, 'Reading skill')).toBe(
      'Pdf Report',
    );
    expect(skillDisplayName(undefined, 'Reading skill')).toBe('Reading skill');
  });
});

describe('taskDockSummary outputs and run identity', () => {
  const artifact: Artifact = {
    id: 'artifact-1',
    type: 'document',
    title: 'report.md',
    content: '# Report',
    messageId: TURN_ID,
    conversationId: 'conv-1',
    createdAt: new Date('2026-09-05T12:00:01.000Z'),
  } as unknown as Artifact;

  it('carries conversation artifacts and generated files into outputs', () => {
    const message = activityMessage([]);
    (message.metadata as Record<string, unknown>)['generatedFiles'] = [
      {
        id: 'file-1',
        fileName: 'summary.pdf',
        mimeType: 'application/pdf',
        uri: '/api/files/file-1',
        byteCount: 2_048,
        kind: 'pdf',
      },
    ];

    const summary = buildTaskDockSummary({ messages: [message], artifacts: [artifact] });
    expect(summary.outputs.map((output) => output.name)).toEqual(['report.md', 'summary.pdf']);
  });

  it('keys the run by the newest turn that reported activity', () => {
    expect(taskDockRunKey('conv-1', [activityMessage([])])).toBe(`conv-1:${TURN_ID}`);
    expect(taskDockRunKey('conv-1', [])).toBeNull();
    expect(taskDockRunKey(null, [activityMessage([])])).toBeNull();
  });

  it('recognises a work session from a persisted turn and from the composer mode', () => {
    expect(hasWorkSession([], 'agiwork')).toBe(true);
    expect(hasWorkSession([activityMessage([])], 'chat')).toBe(true);
    expect(
      hasWorkSession(
        [
          {
            id: 'plain',
            role: 'user',
            content: 'Hello',
            createdAt: '2026-09-05T12:00:00.000Z',
          } as unknown as Message,
        ],
        'chat',
      ),
    ).toBe(false);
  });
});
