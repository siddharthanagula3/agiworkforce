import { describe, expect, it } from 'vitest';
import { modelsCatalog } from '@agiworkforce/types';
import {
  MAX_STORED_SEARCH_RESULTS,
  MAX_STORED_SEARCHES,
  MAX_STORED_TOOL_RESULT_CHARS,
  messageDetailFromRow,
  storedAttachmentList,
  temporaryHistoryTurns,
  TurnDetailRecorder,
  unreadableImageNotice,
} from '../localChatTurn';

const image = { id: 'i', type: 'image' as const, name: 'a.png' };
const file = { id: 'f', type: 'file' as const, name: 'a.txt' };
const [visionModelId] = Object.entries(modelsCatalog.models).find(
  ([, metadata]) => metadata.capabilities.vision,
)!;
const [textOnlyModelId] = Object.entries(modelsCatalog.models).find(
  ([, metadata]) => !metadata.capabilities.vision,
)!;

describe('unreadableImageNotice', () => {
  it('names the model and the images it would ignore', () => {
    const notice = unreadableImageNotice(textOnlyModelId, [image, image, file]);
    expect(notice).toMatch(/cannot read images/);
    expect(notice).toMatch(/the 2 attached images/);
  });

  it('stays quiet for a vision model, for files only, and when the route picks the model', () => {
    expect(unreadableImageNotice(visionModelId, [image])).toBeNull();
    expect(unreadableImageNotice(textOnlyModelId, [file])).toBeNull();
    expect(unreadableImageNotice(undefined, [image])).toBeNull();
  });

  it('treats a model the catalog does not know as unable to read images, as the native runtime does', () => {
    expect(unreadableImageNotice('fixture-unknown-local-model', [image])).toMatch(/cannot read/);
  });
});

describe('TurnDetailRecorder', () => {
  it('keeps calls in start order and shortens oversized output for history', () => {
    const recorder = new TurnDetailRecorder();
    recorder.recordCall('a', 'read_file', { path: 'x' });
    recorder.recordCall('b', 'web_search', {});
    recorder.recordResult('b', 'web_search', undefined, 'timed out');
    recorder.recordResult('a', 'read_file', 'y'.repeat(MAX_STORED_TOOL_RESULT_CHARS + 10));

    const calls = recorder.toolCalls()!;
    expect(calls.map((call) => [call.id, call.status])).toEqual([
      ['a', 'completed'],
      ['b', 'failed'],
    ]);
    expect(calls[0]?.result?.length).toBeLessThan(MAX_STORED_TOOL_RESULT_CHARS + 60);
    expect(calls[0]?.result).toMatch(/shortened in saved history/);
    expect(calls[1]?.error).toBe('timed out');
  });

  it('reports nothing for a plain text turn', () => {
    const recorder = new TurnDetailRecorder();
    recorder.appendThinking('   ');
    expect(recorder.toolCalls()).toBeNull();
    expect(recorder.thinking()).toBeNull();
  });
});

describe('storedAttachmentList and messageDetailFromRow', () => {
  it('stores names, kinds and sizes, never file content', () => {
    const stored = storedAttachmentList([
      new File(['abcd'], 'shot.png', { type: 'image/png' }),
      new File(['ab'], 'notes.md', { type: 'text/markdown' }),
    ]);
    expect(stored).toEqual([
      { id: '0:shot.png', name: 'shot.png', type: 'image', size: 4 },
      { id: '1:notes.md', name: 'notes.md', type: 'file', size: 2 },
    ]);
    expect(storedAttachmentList([])).toBeNull();
  });

  it('carries how compaction left a row, and nothing for a value it does not know', () => {
    expect(messageDetailFromRow({ compaction: 'summarized', feedback: 'up' })).toEqual({
      metadata: { feedback: 'up', compaction: 'summarized' },
    });
    expect(messageDetailFromRow({ compaction: 'summary' })).toEqual({
      metadata: { compaction: 'summary' },
    });
    expect(messageDetailFromRow({ compaction: 'other' })).toEqual({});
  });

  it('drops malformed rows instead of failing the whole reload', () => {
    expect(
      messageDetailFromRow({
        tool_calls: [{ id: 1 }, { id: 'ok', name: 'shell', args: null, status: 'completed' }],
        attachments: 'not-a-list',
        thinking: '',
      }),
    ).toEqual({
      toolCalls: [{ id: 'ok', name: 'shell', args: {}, status: 'completed' }],
    });
  });
});

describe('turn sources in saved history', () => {
  const search = (id: string, count: number) => ({
    id,
    query: 'rust async',
    results: Array.from({ length: count }, (_, index) => ({
      url: `https://example.com/${id}/${index}`,
      title: `Result ${index}`,
    })),
    resultCount: count,
  });

  it('records each search once and bounds what is stored', () => {
    const recorder = new TurnDetailRecorder();
    expect(recorder.sources()).toBeNull();

    recorder.recordSearch(search('s1', MAX_STORED_SEARCH_RESULTS + 5));
    recorder.recordSearch(search('s1', 2));
    for (let index = 0; index < MAX_STORED_SEARCHES + 3; index += 1) {
      recorder.recordSearch(search(`extra-${index}`, 1));
    }

    const stored = recorder.sources()!;
    expect(stored).toHaveLength(MAX_STORED_SEARCHES);
    expect(stored[0]!.results).toHaveLength(2);
  });

  it('restores stored searches as citations and drops rows that no longer parse', () => {
    const restored = messageDetailFromRow({
      sources: [
        {
          id: 's1',
          query: 'rust async',
          results: [
            { url: 'https://www.example.com/async', title: 'Async book', snippet: 'Futures' },
            { url: 'https://www.example.com/async', title: 'Duplicate' },
            { url: 'javascript:alert(1)', title: 'Script' },
            { title: 'No address' },
          ],
          resultCount: 4,
        },
        { query: 'no id', results: [] },
        'not a search',
      ],
    });

    expect(restored.citations).toEqual([
      {
        id: 'https://www.example.com/async',
        url: 'https://www.example.com/async',
        title: 'Async book',
        domain: 'example.com',
        snippet: 'Futures',
      },
    ]);
    expect(messageDetailFromRow({ sources: 'broken' }).citations).toBeUndefined();
    expect(messageDetailFromRow({}).citations).toBeUndefined();
  });
});

describe('temporaryHistoryTurns', () => {
  it('keeps user and assistant turns and drops the trailing copy of this turn', () => {
    expect(
      temporaryHistoryTurns(
        [
          { role: 'system', content: 'hidden' },
          { role: 'user', content: 'first' },
          { role: 'assistant', content: '' },
          { role: 'assistant', content: 'answer' },
          { role: 'user', content: 'second' },
        ],
        'second',
      ),
    ).toEqual([
      { role: 'user', content: 'first' },
      { role: 'assistant', content: 'answer' },
    ]);
    expect(temporaryHistoryTurns(undefined, 'hi')).toEqual([]);
  });
});
