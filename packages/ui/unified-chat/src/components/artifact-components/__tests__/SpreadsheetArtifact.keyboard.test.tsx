import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SpreadsheetArtifact } from '../SpreadsheetArtifact';
import type { Artifact } from '../../../lib/types';

const artifact = {
  id: 'sheet-1',
  type: 'spreadsheet',
  title: 'Quarterly',
  content: 'region,units\nnorth,10\nsouth,20\neast,30',
} as unknown as Artifact;

function grid() {
  return screen.getByRole('grid');
}

function selectedCell() {
  return grid().querySelector('[aria-selected="true"]');
}

describe('SpreadsheetArtifact keyboard selection', () => {
  it('exposes the table as a grid of cells rather than a plain table', () => {
    render(<SpreadsheetArtifact artifact={artifact} />);

    expect(grid()).toBeTruthy();
    expect(screen.getAllByRole('columnheader').length).toBeGreaterThan(0);
    expect(screen.getAllByRole('gridcell').length).toBe(6);
  });

  it('selects the first cell and moves with the arrow keys, which only the mouse could do', () => {
    render(<SpreadsheetArtifact artifact={artifact} />);
    const region = screen.getByRole('group', { name: 'Quarterly' });

    expect(selectedCell()).toBeNull();

    fireEvent.keyDown(region, { key: 'ArrowDown' });
    expect(selectedCell()?.textContent).toContain('north');

    fireEvent.keyDown(region, { key: 'ArrowRight' });
    expect(selectedCell()?.textContent).toContain('10');

    fireEvent.keyDown(region, { key: 'ArrowDown' });
    expect(selectedCell()?.textContent).toContain('20');

    fireEvent.keyDown(region, { key: 'ArrowLeft' });
    expect(selectedCell()?.textContent).toContain('south');
  });

  it('stops at the edges instead of wrapping to another row', () => {
    render(<SpreadsheetArtifact artifact={artifact} />);
    const region = screen.getByRole('group', { name: 'Quarterly' });

    fireEvent.keyDown(region, { key: 'ArrowDown' });
    fireEvent.keyDown(region, { key: 'ArrowLeft' });
    expect(selectedCell()?.textContent).toContain('north');

    fireEvent.keyDown(region, { key: 'ArrowUp' });
    expect(selectedCell()?.textContent).toContain('north');
  });

  it('jumps to the last row and column with a modifier', () => {
    render(<SpreadsheetArtifact artifact={artifact} />);
    const region = screen.getByRole('group', { name: 'Quarterly' });

    fireEvent.keyDown(region, { key: 'ArrowDown' });
    fireEvent.keyDown(region, { key: 'ArrowDown', ctrlKey: true });
    expect(selectedCell()?.textContent).toContain('east');

    fireEvent.keyDown(region, { key: 'End' });
    expect(selectedCell()?.textContent).toContain('30');
  });

  it('clears the selection on Escape', () => {
    render(<SpreadsheetArtifact artifact={artifact} />);
    const region = screen.getByRole('group', { name: 'Quarterly' });

    fireEvent.keyDown(region, { key: 'ArrowDown' });
    expect(selectedCell()).not.toBeNull();

    fireEvent.keyDown(region, { key: 'Escape' });
    expect(selectedCell()).toBeNull();
  });

  it('reaches the same cell the mouse reaches, so both paths select one thing', () => {
    render(<SpreadsheetArtifact artifact={artifact} />);
    const region = screen.getByRole('group', { name: 'Quarterly' });

    fireEvent.click(screen.getAllByRole('gridcell')[3]!);
    const byMouse = selectedCell()?.textContent;

    fireEvent.keyDown(region, { key: 'Escape' });
    fireEvent.keyDown(region, { key: 'ArrowDown' });
    fireEvent.keyDown(region, { key: 'ArrowDown' });
    fireEvent.keyDown(region, { key: 'ArrowRight' });

    expect(selectedCell()?.textContent).toBe(byMouse);
  });
});
