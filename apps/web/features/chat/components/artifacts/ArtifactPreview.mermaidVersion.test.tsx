import { useEffect, useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ArtifactPreview } from './ArtifactPreview';
import { useArtifactsStore } from '../../stores/artifacts-store';

type UnifiedChatModule = typeof import('@agiworkforce/unified-chat');

vi.mock('@agiworkforce/unified-chat', async (importOriginal) => ({
  ...(await importOriginal<UnifiedChatModule>()),
  MermaidDiagram: ({
    source,
    onRenderResult,
  }: {
    source: string;
    onRenderResult?: (result: { svg: string } | null) => void;
  }) => {
    const report = useRef(onRenderResult);
    report.current = onRenderResult;
    useEffect(() => {
      report.current?.({ svg: `<svg>${source}</svg>` });
    }, [source]);
    return <div data-testid="modeled-mermaid">{source}</div>;
  },
}));

const ARTIFACT_ID = 'artifact-mermaid-version-1';
const V1 = 'flowchart TD\n  A[Draft] --> B[Review]';
const V2 = 'flowchart TD\n  A[Approved] --> B[Release]';

function seed() {
  const store = useArtifactsStore.getState();
  for (const content of [V1, V2]) {
    store.upsertArtifact({
      id: ARTIFACT_ID,
      type: 'mermaid',
      language: 'mermaid',
      title: 'Flow',
      content,
      messageId: 'msg-1',
      conversationId: 'conv-1',
    });
  }
}

function renderPanel() {
  const artifact = useArtifactsStore.getState().artifacts.find((a) => a.id === ARTIFACT_ID)!;
  return render(
    <ArtifactPreview
      artifact={artifact}
      variant="panel"
      versionHistory={useArtifactsStore.getState().getArtifactVersions(ARTIFACT_ID)}
    />,
  );
}

function openDownloads() {
  fireEvent.keyDown(screen.getByRole('button', { name: 'Download artifact' }), { key: 'Enter' });
}

function closeMenu() {
  fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
}

function readBlob(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

describe('Mermaid SVG download custody', () => {
  const blobs: Blob[] = [];

  beforeEach(() => {
    blobs.length = 0;
    useArtifactsStore.getState().reset();
    Object.assign(URL, {
      createObjectURL: vi.fn((blob: Blob) => {
        blobs.push(blob);
        return 'blob:modeled';
      }),
      revokeObjectURL: vi.fn(),
    });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('exports the SVG of the version that is shown', async () => {
    seed();
    renderPanel();

    openDownloads();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Download as SVG' }));

    expect(blobs).toHaveLength(1);
    expect(await readBlob(blobs[0]!)).toBe(`<svg>${V2}</svg>`);
  });

  it('withdraws the SVG download when an older version is opened from the source view', () => {
    seed();
    renderPanel();

    fireEvent.click(screen.getByRole('button', { name: 'Source' }));
    fireEvent.click(screen.getByRole('button', { name: 'Previous version' }));

    openDownloads();
    expect(screen.getByRole('menuitem', { name: 'Download as HTML' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Download as SVG' })).toBeNull();
    closeMenu();
  });

  it('exports the older version once its preview has rendered', async () => {
    seed();
    renderPanel();

    fireEvent.click(screen.getByRole('button', { name: 'Source' }));
    fireEvent.click(screen.getByRole('button', { name: 'Previous version' }));
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));

    openDownloads();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Download as SVG' }));

    expect(await readBlob(blobs[0]!)).toBe(`<svg>${V1}</svg>`);
  });
});
