import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SpreadsheetArtifact } from '../SpreadsheetArtifact';
import type { Artifact } from '../../../lib/types';

const artifact = {
  id: 'workbook-1',
  type: 'spreadsheet',
  title: 'Grant application',
  content: 'item,cost\nrent,900\nfuel,300',
} as unknown as Artifact;

const sheets = [
  { name: 'Budget', content: 'item,cost\nrent,900\nfuel,300' },
  { name: 'Review', content: 'reviewer,status\nAda,approved' },
  { name: 'Empty', content: '' },
];

describe('SpreadsheetArtifact worksheet tabs', () => {
  it('shows no tab strip for a single table or a one-sheet workbook', () => {
    const { rerender } = render(<SpreadsheetArtifact artifact={artifact} />);
    expect(screen.queryByRole('tablist')).toBeNull();

    rerender(<SpreadsheetArtifact artifact={artifact} sheets={[sheets[0]!]} />);
    expect(screen.queryByRole('tablist')).toBeNull();
  });

  it('lists every worksheet as a tab with the first selected', () => {
    render(<SpreadsheetArtifact artifact={artifact} sheets={sheets} />);

    const tabs = within(screen.getByRole('tablist', { name: 'Worksheets' })).getAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent)).toEqual(['Budget', 'Review', 'Empty']);
    expect(tabs[0]!.getAttribute('aria-selected')).toBe('true');
    expect(screen.getByText('rent')).toBeTruthy();
  });

  it('switches the table to the chosen worksheet and drops the earlier selection and sort', () => {
    render(<SpreadsheetArtifact artifact={artifact} sheets={sheets} />);
    fireEvent.click(screen.getByRole('gridcell', { name: /rent/ }));
    fireEvent.click(screen.getByTitle('Sort by cost'));

    fireEvent.click(screen.getByRole('tab', { name: 'Review' }));

    expect(screen.getByRole('tab', { name: 'Review' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByText('Ada')).toBeTruthy();
    expect(screen.queryByText('rent')).toBeNull();
    expect(screen.getAllByRole('columnheader')[1]!.getAttribute('aria-sort')).toBe('none');
    expect(document.querySelector('[aria-selected="true"][role="gridcell"]')).toBeNull();
  });

  it('keeps the tabs reachable on a worksheet that has no table', () => {
    render(<SpreadsheetArtifact artifact={artifact} sheets={sheets} />);

    fireEvent.click(screen.getByRole('tab', { name: 'Empty' }));
    expect(screen.getByTestId('spreadsheet-artifact-fallback')).toBeTruthy();

    fireEvent.click(screen.getByRole('tab', { name: 'Budget' }));
    expect(screen.getByText('rent')).toBeTruthy();
  });
});
