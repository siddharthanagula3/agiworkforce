import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { GeneratedFile } from '@agiworkforce/types';

import { usePublishedSitesStore } from '@features/sites/stores/published-sites-store';
import { useArtifactsStore } from '../../stores/artifacts-store';
import type { ArtifactData } from './ArtifactPreview';
import { InlineArtifactCards } from './InlineArtifactCards';

const CALCULATOR: ArtifactData = {
  id: 'artifact-calculator',
  type: 'html',
  title: 'Desk Calculator',
  language: 'html',
  content:
    '<!-- @artifact -->\n<!doctype html><html><head><title>Desk Calculator</title></head><body><main>0</main></body></html>',
};

const BRIEF: ArtifactData = {
  id: 'artifact-brief',
  type: 'document',
  title: 'Launch brief',
  language: 'markdown',
  content: '# Launch brief\n\nShip it.',
};

function generatedFileArtifact(
  preview: Pick<ArtifactData, 'type' | 'language'>,
  file: Pick<GeneratedFile, 'kind' | 'fileName' | 'mimeType'>,
): ArtifactData {
  return {
    id: `genfile-${file.fileName}`,
    title: file.fileName,
    content: 'Item,Quantity\nMugs,3',
    ...preview,
    generatedFile: {
      id: file.fileName,
      computeSessionId: 'generated-message-1',
      ownerUserId: '',
      sourceSurface: 'web',
      privacyMode: 'managed',
      providerMode: 'ManagedGateway',
      uri: `/api/files/${file.fileName}`,
      byteCount: 2560,
      checksumSha256: '',
      previewDerivatives: [],
      createdAt: '2026-10-13T00:00:00.000Z',
      ...file,
    },
  };
}

function cardDescription(artifact: ArtifactData): string | null {
  const { unmount } = render(<InlineArtifactCards artifacts={[artifact]} />);
  const open = screen.getByRole('button', { name: `Open artifact: ${artifact.title}` });
  const description = document.getElementById(open.getAttribute('aria-describedby') ?? '');
  const text = description?.textContent ?? null;
  unmount();
  return text;
}

beforeEach(() => {
  useArtifactsStore.getState().reset();
  useArtifactsStore.getState().setPanelOpen(false);
  usePublishedSitesStore.setState({ byArtifactId: {}, status: 'ready' });
});

describe('InlineArtifactCards: the compact artifact card', () => {
  it('names an HTML artifact in a card and runs nothing in the message', () => {
    render(<InlineArtifactCards artifacts={[CALCULATOR]} />);

    const card = screen.getByTestId('artifact-card');
    expect(within(card).getByText('Desk Calculator')).toBeVisible();
    expect(within(card).getByText('Artifact')).toBeVisible();
    expect(within(card).getByRole('button', { name: 'Download Desk Calculator' })).toBeVisible();
    expect(card.querySelector('iframe')).toBeNull();
  });

  it('opens the artifact in the panel, then offers Hide while it is the one open', () => {
    render(<InlineArtifactCards artifacts={[CALCULATOR]} />);

    const open = screen.getByRole('button', { name: 'Open artifact: Desk Calculator' });
    expect(open).toHaveTextContent('Open');
    expect(open).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(open);

    expect(useArtifactsStore.getState().panelOpen).toBe(true);
    expect(useArtifactsStore.getState().selectedArtifactId).toBe(CALCULATOR.id);
    const hide = screen.getByRole('button', { name: 'Hide artifact: Desk Calculator' });
    expect(hide).toHaveTextContent('Hide');
    expect(hide).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(hide);
    expect(useArtifactsStore.getState().panelOpen).toBe(false);
  });

  it('describes a document by kind and extension, with the same card and panel', () => {
    render(<InlineArtifactCards artifacts={[BRIEF]} />);

    const open = screen.getByRole('button', { name: 'Open artifact: Launch brief' });
    expect(open).toHaveAccessibleDescription('Document · MD');
    fireEvent.click(open);
    expect(useArtifactsStore.getState().selectedArtifactId).toBe(BRIEF.id);
  });

  it('badges a generated workbook and deck with the format of the file, not of its preview', () => {
    const workbook = generatedFileArtifact(
      { type: 'spreadsheet', language: 'csv' },
      {
        kind: 'xlsx',
        fileName: 'audit_round4_shop.xlsx',
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      },
    );
    const deck = generatedFileArtifact(
      { type: 'presentation', language: 'markdown' },
      {
        kind: 'pptx',
        fileName: 'repair-together-workshop.pptx',
        mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      },
    );

    expect(cardDescription(workbook)).toBe('Spreadsheet · XLSX · 2.5 KB · Managed');
    expect(cardDescription(deck)).toBe('Slides · PPTX · 2.5 KB · Managed');
  });

  it.each([
    [
      'CSV',
      { type: 'csv', language: 'csv' },
      { kind: 'csv', fileName: 'shop.csv', mimeType: 'text/csv' },
      'Spreadsheet · CSV · 2.5 KB · Managed',
    ],
    [
      'Markdown',
      { type: 'document', language: 'markdown' },
      { kind: 'markdown', fileName: 'brief.md', mimeType: 'text/markdown' },
      'Document · MD · 2.5 KB · Managed',
    ],
    [
      'PDF',
      { type: 'document', language: 'pdf' },
      { kind: 'pdf', fileName: 'report.pdf', mimeType: 'application/pdf' },
      'Document · PDF · 2.5 KB · Managed',
    ],
    [
      'Word',
      { type: 'document', language: 'docx' },
      {
        kind: 'docx',
        fileName: 'letter.docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      },
      'Document · DOCX · 2.5 KB · Managed',
    ],
    [
      'image',
      { type: 'image', language: 'png' },
      { kind: 'image', fileName: 'chart.png', mimeType: 'image/png' },
      'Image · PNG · 2.5 KB · Managed',
    ],
    [
      'source code',
      { type: 'code', language: 'py' },
      { kind: 'other', fileName: 'totals.py', mimeType: 'text/x-python' },
      'Code · PY · 2.5 KB · Managed',
    ],
  ] as const)('keeps the badge of a generated %s file', (_format, preview, file, badge) => {
    expect(cardDescription(generatedFileArtifact(preview, file))).toBe(badge);
  });

  it('leaves the size out when the file reports none', () => {
    const empty = generatedFileArtifact(
      { type: 'document', language: 'pdf' },
      { kind: 'pdf', fileName: 'blank.pdf', mimeType: 'application/pdf' },
    );
    expect(
      cardDescription({ ...empty, generatedFile: { ...empty.generatedFile!, byteCount: 0 } }),
    ).toBe('Document · PDF · Managed');
  });

  it('names an unrecognised generated file by what is known about it, never by its preview', () => {
    const unknownExtension = generatedFileArtifact(
      { type: 'code', language: 'text' },
      { kind: 'other', fileName: 'ledger.sqlite', mimeType: 'application/octet-stream' },
    );
    const nothingKnown = generatedFileArtifact(
      { type: 'code', language: 'export' },
      { kind: 'other', fileName: 'export', mimeType: '' },
    );

    expect(cardDescription(unknownExtension)).toBe('Code · SQLITE · 2.5 KB · Managed');
    expect(cardDescription(nothingKnown)).toBe('Code · FILE · 2.5 KB · Managed');
  });

  it('says a published artifact is published, to whom, and links to its site page', () => {
    usePublishedSitesStore.setState({
      status: 'ready',
      byArtifactId: {
        [CALCULATOR.id]: {
          token: 'tok123',
          shareUrl: 'https://agiworkforce.com/a/tok123',
          visibility: 'public',
          sitePath: '/chat/sites/tok123',
        },
      },
    });
    render(<InlineArtifactCards artifacts={[CALCULATOR]} />);

    expect(screen.getByText('Artifact · Published · Public')).toBeVisible();
    expect(
      screen.getByRole('link', { name: 'Open the published site for Desk Calculator' }),
    ).toHaveAttribute('href', '/chat/sites/tok123');
  });

  it('draws every card from theme role tokens, never a fixed hue that fails in one theme', () => {
    const { container } = render(<InlineArtifactCards artifacts={[CALCULATOR, BRIEF]} />);

    const classes = Array.from(container.querySelectorAll('[class]'), (node) =>
      node.getAttribute('class'),
    ).join(' ');
    expect(classes).not.toMatch(
      /\b(?:text|bg|border)-(?:orange|sky|violet|fuchsia|emerald|amber)-\d{2,3}\b/u,
    );
  });

  it('caps the message at three cards and opens the rest from one row', () => {
    const many = Array.from({ length: 5 }, (_, index) => ({
      ...BRIEF,
      id: `artifact-${index}`,
      title: `File ${index}`,
    }));
    render(<InlineArtifactCards artifacts={many} />);

    expect(screen.getAllByTestId('artifact-card')).toHaveLength(3);
    fireEvent.click(screen.getByRole('button', { name: 'View 2 more artifacts' }));
    expect(useArtifactsStore.getState().selectedArtifactId).toBe('artifact-3');
    expect(screen.getByRole('button', { name: 'Download all' })).toBeVisible();
  });
});
