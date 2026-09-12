import { describe, expect, it } from 'vitest';

import {
  AssistantTurnSourceCollector,
  MAX_PERSISTED_CODE_OUTPUT_CHARS,
  MAX_PERSISTED_TURN_GENERATED_FILES,
  MAX_PERSISTED_TURN_SOURCES,
} from './assistant-turn-sources';

function searchResultsEvent(content: unknown): Record<string, unknown> {
  return { choices: [{ delta: { x_search_results: { content } } }] };
}

function webResult(url: string, title = `Title for ${url}`, snippet = 'a snippet') {
  return { type: 'web_search_result', url, title, encrypted_content: snippet };
}

function citationEvent(url: string, title: string): Record<string, unknown> {
  return { choices: [{ delta: { x_citation: { url, title } } }] };
}

function codeResultEvent(content: unknown): Record<string, unknown> {
  return {
    choices: [{ delta: { x_code_result: { type: 'code_execution_tool_result', content } } }],
  };
}

function generatedFilesEvent(files: unknown[]): Record<string, unknown> {
  return { choices: [{ delta: { x_generated_files: { files } } }] };
}

function wireFile(fileName: string, overrides: Record<string, unknown> = {}) {
  return {
    id: `asset-${fileName}`,
    file_name: fileName,
    mime_type: 'image/png',
    uri: `/api/files/asset-${fileName}`,
    byte_count: 12,
    kind: 'image',
    surface: 'file',
    previewable: true,
    ...overrides,
  };
}

describe('AssistantTurnSourceCollector', () => {
  it('collects the pages a turn cited, in the order they arrived', () => {
    const collector = new AssistantTurnSourceCollector();
    collector.ingestWireEvent(
      searchResultsEvent([webResult('https://a.example'), webResult('https://b.example')]),
    );

    expect(collector.snapshot()).toEqual([
      { url: 'https://a.example', title: 'Title for https://a.example', snippet: 'a snippet' },
      { url: 'https://b.example', title: 'Title for https://b.example', snippet: 'a snippet' },
    ]);
  });

  it('keeps one entry per page when a turn grounds the same source twice', () => {
    const collector = new AssistantTurnSourceCollector();
    collector.ingestWireEvent(searchResultsEvent([webResult('https://a.example')]));
    collector.ingestWireEvent(searchResultsEvent([webResult('https://a.example', 'Second look')]));

    expect(collector.snapshot()).toHaveLength(1);
    expect(collector.snapshot()?.[0]?.title).toBe('Title for https://a.example');
  });

  it('falls back to the url when a result carries no title', () => {
    const collector = new AssistantTurnSourceCollector();
    collector.ingestWireEvent(
      searchResultsEvent([{ type: 'web_search_result', url: 'https://a.example' }]),
    );

    expect(collector.snapshot()?.[0]).toEqual({
      url: 'https://a.example',
      title: 'https://a.example',
      snippet: '',
    });
  });

  it('returns nothing for a turn that cited nothing', () => {
    const collector = new AssistantTurnSourceCollector();
    collector.ingestWireEvent({ choices: [{ delta: { content: 'plain text' } }] });

    expect(collector.snapshot()).toBeUndefined();
  });

  it('ignores a failed search, which cites no pages', () => {
    const collector = new AssistantTurnSourceCollector();
    collector.ingestWireEvent(
      searchResultsEvent({ type: 'web_search_tool_result_error', error_code: 'max_uses_exceeded' }),
    );

    expect(collector.snapshot()).toBeUndefined();
  });

  it('ignores an entry that is not a web result, and one with no url', () => {
    const collector = new AssistantTurnSourceCollector();
    collector.ingestWireEvent(
      searchResultsEvent([
        { type: 'something_else', url: 'https://a.example' },
        { type: 'web_search_result' },
      ]),
    );

    expect(collector.snapshot()).toBeUndefined();
  });

  it('bounds how much one turn can write into a row', () => {
    const collector = new AssistantTurnSourceCollector();
    const many = Array.from({ length: MAX_PERSISTED_TURN_SOURCES + 15 }, (_, index) =>
      webResult(`https://example.test/${index}`),
    );
    collector.ingestWireEvent(searchResultsEvent(many));

    expect(collector.snapshot()).toHaveLength(MAX_PERSISTED_TURN_SOURCES);
  });

  it('bounds a single oversized snippet', () => {
    const collector = new AssistantTurnSourceCollector();
    collector.ingestWireEvent(
      searchResultsEvent([webResult('https://a.example', 'T', 'x'.repeat(5_000))]),
    );

    expect(collector.snapshot()?.[0]?.snippet.length).toBeLessThanOrEqual(500);
  });

  /**
   * The pages a turn cited and the pages it searched are two lists that only
   * partly overlap. Persisting the searched list alone left a reloaded answer
   * whose [n] markers pointed at outlets the row never recorded, so the markers
   * rendered with nothing behind them and the Sources count was short.
   */
  it('collects the cited pages in marker order, separately from the searched pages', () => {
    const collector = new AssistantTurnSourceCollector();
    collector.ingestWireEvent(searchResultsEvent([webResult('https://searched.example')]));
    collector.ingestWireEvent(citationEvent('https://cited.example', 'Cited Outlet'));
    collector.ingestWireEvent(citationEvent('https://searched.example', 'Searched Outlet'));

    expect(collector.citationSnapshot()).toEqual([
      { type: 'url_citation', url: 'https://cited.example', title: 'Cited Outlet' },
      { type: 'url_citation', url: 'https://searched.example', title: 'Searched Outlet' },
    ]);
    expect(collector.snapshot()).toHaveLength(1);
  });

  it('records one entry per cited page when the model cites it twice', () => {
    const collector = new AssistantTurnSourceCollector();
    collector.ingestWireEvent(citationEvent('https://a.example', 'First'));
    collector.ingestWireEvent(citationEvent('https://a.example', 'Second'));

    expect(collector.citationSnapshot()).toHaveLength(1);
    expect(collector.citationSnapshot()?.[0]?.title).toBe('First');
  });

  it('ignores a citation with no url or no title, which cannot open anything', () => {
    const collector = new AssistantTurnSourceCollector();
    collector.ingestWireEvent(citationEvent('', 'No link'));
    collector.ingestWireEvent(citationEvent('https://a.example', ''));

    expect(collector.citationSnapshot()).toBeUndefined();
  });

  it('reads citations out of raw SSE bytes, the shape the stream really carries', () => {
    const collector = new AssistantTurnSourceCollector();
    collector.ingestWireBytes(
      new TextEncoder().encode(
        `data: ${JSON.stringify(citationEvent('https://a.example', 'A'))}\n\ndata: [DONE]\n\n`,
      ),
    );

    expect(collector.citationSnapshot()).toEqual([
      { type: 'url_citation', url: 'https://a.example', title: 'A' },
    ]);
  });

  /**
   * The source cap used to short-circuit the whole ingest, so a turn that
   * searched widely before it cited would have recorded no citation at all.
   */
  it('still collects citations after the source cap is reached', () => {
    const collector = new AssistantTurnSourceCollector();
    collector.ingestWireEvent(
      searchResultsEvent(
        Array.from({ length: MAX_PERSISTED_TURN_SOURCES }, (_, index) =>
          webResult(`https://example.test/${index}`),
        ),
      ),
    );
    collector.ingestWireEvent(citationEvent('https://cited.example', 'Cited Outlet'));

    expect(collector.snapshot()).toHaveLength(MAX_PERSISTED_TURN_SOURCES);
    expect(collector.citationSnapshot()).toHaveLength(1);
  });

  it('bounds how many citations one turn can write into a row', () => {
    const collector = new AssistantTurnSourceCollector();
    for (let index = 0; index < MAX_PERSISTED_TURN_SOURCES + 15; index += 1) {
      collector.ingestWireEvent(citationEvent(`https://example.test/${index}`, `T${index}`));
    }

    expect(collector.citationSnapshot()).toHaveLength(MAX_PERSISTED_TURN_SOURCES);
  });

  /**
   * The result panel was written only by the client save. A non-retryable
   * failure left a reloaded answer that said what the script printed with no
   * output anywhere on the page, so the claim could not be checked at all.
   */
  it('collects what a code-execution run printed', () => {
    const collector = new AssistantTurnSourceCollector();
    collector.ingestWireEvent(
      codeResultEvent({
        stdout: '42\n',
        stderr: '',
        return_code: 0,
        type: 'code_execution_result',
      }),
    );

    expect(collector.codeExecutionSnapshot()).toEqual({
      stdout: '42\n',
      stderr: '',
      returnCode: 0,
    });
  });

  it('keeps the last run of a turn that executed code twice', () => {
    const collector = new AssistantTurnSourceCollector();
    collector.ingestWireEvent(codeResultEvent({ stdout: 'first', stderr: '', return_code: 0 }));
    collector.ingestWireEvent(
      codeResultEvent({ stdout: 'second', stderr: 'oops', return_code: 1 }),
    );

    expect(collector.codeExecutionSnapshot()).toEqual({
      stdout: 'second',
      stderr: 'oops',
      returnCode: 1,
    });
  });

  it('records a failing run, which is the output a reader most needs', () => {
    const collector = new AssistantTurnSourceCollector();
    collector.ingestWireEvent(
      codeResultEvent({ stdout: '', stderr: 'Traceback: boom', return_code: 1 }),
    );

    expect(collector.codeExecutionSnapshot()).toEqual({
      stdout: '',
      stderr: 'Traceback: boom',
      returnCode: 1,
    });
  });

  it('bounds a run that printed megabytes', () => {
    const collector = new AssistantTurnSourceCollector();
    collector.ingestWireEvent(
      codeResultEvent({ stdout: 'x'.repeat(80_000), stderr: '', return_code: 0 }),
    );

    expect(collector.codeExecutionSnapshot()?.stdout.length).toBe(MAX_PERSISTED_CODE_OUTPUT_CHARS);
  });

  /**
   * A tool error and a file-reference payload both carry no output record.
   * Recording an empty result for either would have persisted a blank result
   * panel onto a turn that never produced one.
   */
  it.each([
    ['a tool error', { type: 'code_execution_tool_result_error', error_code: 'unavailable' }],
    ['a file-reference payload', [{ type: 'code_execution_output', file_id: 'file_1' }]],
    ['a content-free frame', { type: 'code_execution_result' }],
  ])('records nothing for %s', (_label, content) => {
    const collector = new AssistantTurnSourceCollector();
    collector.ingestWireEvent(codeResultEvent(content));

    expect(collector.codeExecutionSnapshot()).toBeUndefined();
  });

  /**
   * The bytes behind a generated file were already persisted and downloadable.
   * Only the row pointing at them was client-written, so a failed save dropped
   * every chart and download chip off an answer whose text still described them.
   */
  it('collects the files a turn attached, in the camelCase shape the row holds', () => {
    const collector = new AssistantTurnSourceCollector();
    collector.ingestWireEvent(
      generatedFilesEvent([wireFile('chart.png', { checksum_sha256: 'a'.repeat(64) })]),
    );

    expect(collector.generatedFilesSnapshot()).toEqual([
      {
        id: 'asset-chart.png',
        fileName: 'chart.png',
        mimeType: 'image/png',
        uri: '/api/files/asset-chart.png',
        byteCount: 12,
        kind: 'image',
        checksumSha256: 'a'.repeat(64),
        surface: 'file',
        previewable: true,
      },
    ]);
  });

  it('replaces a re-emitted file in place rather than listing it twice', () => {
    const collector = new AssistantTurnSourceCollector();
    collector.ingestWireEvent(generatedFilesEvent([wireFile('chart.png'), wireFile('data.csv')]));
    collector.ingestWireEvent(
      generatedFilesEvent([wireFile('chart.png', { id: 'asset-final', byte_count: 99 })]),
    );

    const files = collector.generatedFilesSnapshot();
    expect(files).toHaveLength(2);
    expect(files?.[0]).toMatchObject({ fileName: 'chart.png', id: 'asset-final', byteCount: 99 });
    expect(files?.[1]?.fileName).toBe('data.csv');
  });

  it('drops a file the shared wire parser rejects, exactly as the client does', () => {
    const collector = new AssistantTurnSourceCollector();
    collector.ingestWireEvent(
      generatedFilesEvent([{ id: 'asset-1', file_name: 'no-uri.png' }, wireFile('good.png')]),
    );

    expect(collector.generatedFilesSnapshot()).toHaveLength(1);
    expect(collector.generatedFilesSnapshot()?.[0]?.fileName).toBe('good.png');
  });

  it('bounds how many files one turn can write into a row', () => {
    const collector = new AssistantTurnSourceCollector();
    collector.ingestWireEvent(
      generatedFilesEvent(
        Array.from({ length: MAX_PERSISTED_TURN_GENERATED_FILES + 15 }, (_, index) =>
          wireFile(`file-${index}.png`),
        ),
      ),
    );

    expect(collector.generatedFilesSnapshot()).toHaveLength(MAX_PERSISTED_TURN_GENERATED_FILES);
  });

  it('returns nothing for a turn that ran no code and attached no file', () => {
    const collector = new AssistantTurnSourceCollector();
    collector.ingestWireEvent({ choices: [{ delta: { content: 'plain text' } }] });

    expect(collector.codeExecutionSnapshot()).toBeUndefined();
    expect(collector.generatedFilesSnapshot()).toBeUndefined();
  });

  /**
   * The source cap short-circuits the rest of the ingest. A turn that searched
   * widely before it ran code would otherwise have recorded no output.
   */
  it('still collects code output and files after the source cap is reached', () => {
    const collector = new AssistantTurnSourceCollector();
    collector.ingestWireEvent(
      searchResultsEvent(
        Array.from({ length: MAX_PERSISTED_TURN_SOURCES }, (_, index) =>
          webResult(`https://example.test/${index}`),
        ),
      ),
    );
    collector.ingestWireEvent(codeResultEvent({ stdout: 'after', stderr: '', return_code: 0 }));
    collector.ingestWireEvent(generatedFilesEvent([wireFile('late.png')]));

    expect(collector.codeExecutionSnapshot()?.stdout).toBe('after');
    expect(collector.generatedFilesSnapshot()).toHaveLength(1);
  });

  it('reads both out of raw SSE bytes, the shape the stream really carries', () => {
    const collector = new AssistantTurnSourceCollector();
    collector.ingestWireBytes(
      new TextEncoder().encode(
        `data: ${JSON.stringify(codeResultEvent({ stdout: 'hi', stderr: '', return_code: 0 }))}\n\n` +
          `data: ${JSON.stringify(generatedFilesEvent([wireFile('out.png')]))}\n\ndata: [DONE]\n\n`,
      ),
    );

    expect(collector.codeExecutionSnapshot()?.stdout).toBe('hi');
    expect(collector.generatedFilesSnapshot()?.[0]?.fileName).toBe('out.png');
  });

  it.each([
    ['a frame with no choices', { id: 'chunk' }],
    ['a frame whose delta carries no search block', { choices: [{ delta: { content: 'x' } }] }],
    ['a non-object', 'data: [DONE]'],
    ['null', null],
  ])('survives %s', (_label, event) => {
    const collector = new AssistantTurnSourceCollector();
    expect(() => collector.ingestWireEvent(event)).not.toThrow();
    expect(collector.snapshot()).toBeUndefined();
  });
});
