import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ArtifactPreview, type ArtifactData } from './ArtifactPreview';

const loadWorkbookSheets = vi.fn();

vi.mock('../../lib/office-file-preview', () => ({
  loadWorkbookSheets: (uri: string) => loadWorkbookSheets(uri),
}));

const SHEETS = [
  { name: 'Instructions', csv: 'step,note\n1,Fill in the budget' },
  { name: 'Budget', csv: 'item,cost\nrent,900' },
];

function workbookArtifact(overrides: Partial<ArtifactData> = {}): ArtifactData {
  return {
    id: 'genfile-workbook',
    type: 'spreadsheet',
    language: 'csv',
    title: 'Grant application.xlsx',
    content: SHEETS[0]!.csv,
    generatedFile: {
      id: 'workbook',
      computeSessionId: 'generated-message-1',
      ownerUserId: '',
      sourceSurface: 'web',
      privacyMode: 'managed',
      providerMode: 'ManagedGateway',
      kind: 'xlsx',
      fileName: 'Grant application.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      uri: '/api/files/workbook',
      byteCount: 4096,
      checksumSha256: '',
      previewDerivatives: [],
      createdAt: '2026-10-13T00:00:00.000Z',
    },
    ...overrides,
  };
}

beforeEach(() => {
  loadWorkbookSheets.mockReset();
  loadWorkbookSheets.mockResolvedValue(SHEETS);
});

describe('ArtifactPreview · generated workbook', () => {
  it('shows a tab for every worksheet and switches between them without touching the artifact', async () => {
    render(<ArtifactPreview variant="panel" artifact={workbookArtifact()} />);

    const tabs = await screen.findByRole('tablist', { name: 'Worksheets' });
    expect(
      within(tabs)
        .getAllByRole('tab')
        .map((tab) => tab.textContent),
    ).toEqual(['Instructions', 'Budget']);
    expect(loadWorkbookSheets).toHaveBeenCalledWith('/api/files/workbook');

    fireEvent.click(within(tabs).getByRole('tab', { name: 'Budget' }));
    expect(screen.getByText('rent')).toBeTruthy();
    expect(screen.queryByText('Fill in the budget')).toBeNull();
  });

  it('says when the file was last modified even without a version history', async () => {
    render(<ArtifactPreview variant="panel" artifact={workbookArtifact()} />);

    const modified = await screen.findByTestId('artifact-last-modified');
    expect(modified.textContent).toMatch(/^Last modified /);
    expect(modified.getAttribute('datetime')).toBe('2026-10-13T00:00:00.000Z');
  });

  it('keeps the single table when the workbook cannot be read', async () => {
    loadWorkbookSheets.mockRejectedValue(new Error('HTTP 500'));
    render(<ArtifactPreview variant="panel" artifact={workbookArtifact()} />);

    await waitFor(() => expect(loadWorkbookSheets).toHaveBeenCalled());
    expect(screen.queryByRole('tablist', { name: 'Worksheets' })).toBeNull();
    expect(screen.getByText('Fill in the budget')).toBeTruthy();
  });

  it('shows no tabs when the shown content is no longer the workbook', async () => {
    render(
      <ArtifactPreview
        variant="panel"
        artifact={workbookArtifact({ content: 'item,cost\nrent,950' })}
      />,
    );

    await waitFor(() => expect(loadWorkbookSheets).toHaveBeenCalled());
    expect(screen.queryByRole('tablist', { name: 'Worksheets' })).toBeNull();
  });

  it('does not read a workbook for a plain table', () => {
    render(
      <ArtifactPreview variant="panel" artifact={workbookArtifact({ generatedFile: undefined })} />,
    );

    expect(loadWorkbookSheets).not.toHaveBeenCalled();
  });
});
