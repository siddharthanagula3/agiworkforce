import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';

import type { ArtifactData } from './ArtifactPreview';
import {
  ArtifactCreatedRow,
  ArtifactCreatingRow,
  creatingArtifactLabel,
} from './ArtifactCreatingRow';
import { artifactFileName } from './artifact-labels';

afterEach(() => {
  vi.useRealTimers();
});

describe('artifactFileName', () => {
  it('turns a title into a kebab-case file name with the extension of its kind', () => {
    expect(artifactFileName({ title: 'Desk Calculator', type: 'html' })).toBe(
      'desk-calculator.html',
    );
    expect(artifactFileName({ title: 'Budget Tracker!', type: 'react' })).toBe(
      'budget-tracker.jsx',
    );
    expect(
      artifactFileName({ title: 'Launch brief', type: 'document', language: 'markdown' }),
    ).toBe('launch-brief.md');
  });

  it('keeps a name that already carries an extension and falls back when there is no title', () => {
    expect(artifactFileName({ title: 'report.pdf', type: 'document' })).toBe('report.pdf');
    expect(artifactFileName({ title: undefined, type: 'svg' })).toBe('artifact.svg');
  });
});

describe('ArtifactCreatingRow', () => {
  it('names the file being written once its title has streamed in', () => {
    expect(
      creatingArtifactLabel(
        'html',
        '<!-- @artifact -->\n<!doctype html>\n<html><head><title>Desk Calculator</title>',
      ),
    ).toBe('Creating desk-calculator.html');
  });

  it('names a generic file before any title arrives, never the marker or markup', () => {
    expect(creatingArtifactLabel('html', '<!-- @artifact -->\n<!doctype html>\n<html>')).toBe(
      'Creating artifact.html',
    );
    expect(creatingArtifactLabel('jsx', '// @artifact\n')).toBe('Creating artifact.jsx');
  });

  it('shows the live line count and time, and opens the code being written on click', () => {
    vi.useFakeTimers();
    const onShow = vi.fn();
    render(
      <ArtifactCreatingRow
        language="html"
        content={'<!-- @artifact -->\n<!doctype html>\n<html>'}
        onShow={onShow}
      />,
    );

    const row = screen.getByRole('button', { name: /Show the code being written/ });
    expect(row).toHaveTextContent('Creating artifact.html');
    expect(row).toHaveTextContent('3 lines');
    act(() => {
      vi.advanceTimersByTime(3_000);
    });
    expect(row).toHaveTextContent('3 lines · 3s');
    expect(row.textContent).not.toContain('@artifact');

    fireEvent.click(row);
    expect(onShow).toHaveBeenCalledOnce();
  });
});

describe('ArtifactCreatedRow', () => {
  const calculator: ArtifactData = {
    id: 'a1',
    type: 'html',
    title: 'Desk Calculator',
    content: 'one\ntwo',
  };

  it('collapses to one line naming what was made and lists the files when opened', () => {
    render(<ArtifactCreatedRow artifacts={[calculator]} />);

    const row = screen.getByTestId('artifact-created-row');
    expect(row).not.toHaveAttribute('open');
    expect(screen.getByText('Created a file')).toBeVisible();
    fireEvent.click(screen.getByText('Created a file'));
    expect(row).toHaveAttribute('open');
    expect(screen.getByText('Created desk-calculator.html')).toBeVisible();
    expect(screen.getByText('2 lines')).toBeVisible();
  });

  it('counts several files and renders nothing for none', () => {
    const { container, rerender } = render(
      <ArtifactCreatedRow artifacts={[calculator, { ...calculator, id: 'a2', title: 'Timer' }]} />,
    );
    expect(screen.getByText('Created 2 files')).toBeVisible();
    rerender(<ArtifactCreatedRow artifacts={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
