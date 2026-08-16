import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { TooltipProvider } from '@/components/ui/Tooltip';
import { ArtifactRenderer } from '../ArtifactRenderer';
import type { Artifact } from '../../../types/chat';

vi.mock('@/providers/ThemeProvider', () => ({
  useThemeContext: () => ({ theme: 'light', setTheme: vi.fn() }),
}));

vi.mock('@/stores/codeStore', () => ({
  useCodeStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      rootPath: null,
      openFile: vi.fn(),
      setActiveFile: vi.fn(),
    }),
}));

vi.mock('@/components/ui/PromptDialog', () => ({
  usePrompt: () => ({ prompt: vi.fn(), dialog: null }),
}));

function makeArtifact(overrides: Partial<Artifact> & Pick<Artifact, 'id' | 'type'>): Artifact {
  return { content: '', ...overrides };
}

function renderWithProviders(ui: ReactElement) {
  return render(<TooltipProvider>{ui}</TooltipProvider>);
}

const CSV = 'name,score\nCharlie,5\nAlice,30\nBob,7';

describe('ArtifactRenderer (desktop wrapper) tabular routing', () => {
  it('renders a `table` artifact with real CSV content as a sortable table (not "Invalid table data")', () => {
    renderWithProviders(
      <ArtifactRenderer artifact={makeArtifact({ id: 't1', type: 'table', content: CSV })} />,
    );

    expect(screen.queryByText(/invalid table data/i)).toBeNull();
    expect(screen.queryByText(/unsupported artifact type/i)).toBeNull();
    expect(screen.getByTestId('spreadsheet-artifact')).toBeTruthy();
    expect(screen.getByText('Charlie')).toBeTruthy();
    expect(screen.getByText('Alice')).toBeTruthy();

    fireEvent.click(screen.getByTitle('Sort by score'));
    const scoreHeader = screen.getByTitle('Sort by score').closest('th');
    expect(scoreHeader?.getAttribute('aria-sort')).toBe('ascending');
  });

  it('renders a `csv` artifact through the shared tabular path', () => {
    renderWithProviders(
      <ArtifactRenderer artifact={makeArtifact({ id: 'c1', type: 'csv', content: CSV })} />,
    );

    expect(screen.queryByText(/unsupported artifact type/i)).toBeNull();
    expect(screen.getByTestId('spreadsheet-artifact')).toBeTruthy();
    expect(screen.getByTestId('spreadsheet-table')).toBeTruthy();
    expect(screen.getByText('Bob')).toBeTruthy();
  });

  it('still renders legacy JSON array-of-objects `table` content', () => {
    const json = JSON.stringify([
      { city: 'Austin', pop: 979882 },
      { city: 'Boston', pop: 675647 },
    ]);
    renderWithProviders(
      <ArtifactRenderer artifact={makeArtifact({ id: 't2', type: 'table', content: json })} />,
    );

    expect(screen.getByTestId('spreadsheet-artifact')).toBeTruthy();
    expect(screen.getByText('Austin')).toBeTruthy();
  });
});

describe('ArtifactRenderer (desktop wrapper) email routing', () => {
  it('renders an `email` artifact with header chrome and body', () => {
    const content =
      'Subject: Quarterly update\nTo: team@example.com\n\nHi all,\n\nNumbers look good.';
    renderWithProviders(
      <ArtifactRenderer artifact={makeArtifact({ id: 'e1', type: 'email', content })} />,
    );

    expect(screen.queryByText(/unsupported artifact type/i)).toBeNull();
    expect(screen.getByTestId('email-artifact')).toBeTruthy();
    expect(screen.getByTestId('email-subject').textContent).toContain('Quarterly update');
    expect(screen.getByTestId('email-body').textContent).toContain('Numbers look good.');
  });
});
