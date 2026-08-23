import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('@/stores/artifactStore', () => {
  const state = { setActiveArtifact: vi.fn(), openPanel: vi.fn() };
  return {
    useArtifactStore: (selector: (s: Record<string, unknown>) => unknown) => selector(state),
  };
});

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { TooltipProvider } from '@/ui/Tooltip';
import { ArtifactToolbar } from '../ArtifactToolbar';

const DDE = "=cmd|'/c calc'!A0";

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
  URL.createObjectURL = vi.fn(() => 'blob:artifact-toolbar-test');
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

function download(artifactType: string, content: string): CapturedDownload {
  render(
    <TooltipProvider>
      <ArtifactToolbar
        artifactId="art-1"
        artifactType={artifactType as never}
        title="Q3 report"
        content={content}
      />
    </TooltipProvider>,
  );
  fireEvent.click(screen.getByLabelText('Download'));
  const last = captured[captured.length - 1];
  expect(last).toBeDefined();
  return last!;
}

describe('ArtifactToolbar download', () => {
  it('neutralizes a formula in a spreadsheet artifact', () => {
    const file = download('spreadsheet', DDE);

    expect(file.fileName).toBe('Q3 report.csv');
    expect(file.body).not.toBe(DDE);
    expect(file.body.replace(/^"/, '')).toMatch(/^'/);
    expect(file.mime).toBe('text/csv;charset=utf-8;');
  });

  it('leaves a benign table byte-identical', () => {
    const content = 'name,score\nAlice,30\nBob,-7';
    expect(download('spreadsheet', content).body).toBe(content);
  });

  it.each(['name,,city\r\nA,B\r\n1,2,3,4\r\n\r\n', ' name ; score \nAlice;30\n'])(
    'exports %j exactly as the model wrote it',
    (content) => {
      expect(download('spreadsheet', content).body).toBe(content);
    },
  );

  it('leaves a non-spreadsheet artifact untouched', () => {
    const file = download('document', '=1+1');

    expect(file.fileName).toBe('Q3 report.md');
    expect(file.body).toBe('=1+1');
    expect(file.mime).toBe('text/plain');
  });
});
