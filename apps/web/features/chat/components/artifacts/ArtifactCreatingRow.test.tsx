import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import { ArtifactCreatingRow, creatingArtifactLabel } from './ArtifactCreatingRow';

describe('ArtifactCreatingRow', () => {
  it('names the artifact being written once its title has streamed in', () => {
    expect(
      creatingArtifactLabel(
        'html',
        '<!-- @artifact -->\n<!doctype html>\n<html><head><title>Desk Calculator</title>',
      ),
    ).toBe('Creating Desk Calculator');
  });

  it('names the kind of artifact before any title arrives, never its marker or markup', () => {
    expect(creatingArtifactLabel('html', '<!-- @artifact -->\n<!doctype html>\n<html>')).toBe(
      'Creating HTML artifact',
    );
    expect(creatingArtifactLabel('jsx', '// @artifact\n')).toBe('Creating React artifact');
  });

  it('shows the live line count and opens the code being written on click', () => {
    const onShow = vi.fn();
    render(
      <ArtifactCreatingRow
        language="html"
        content={'<!-- @artifact -->\n<!doctype html>\n<html>'}
        onShow={onShow}
      />,
    );

    const row = screen.getByRole('button', { name: /Show the code being written/ });
    expect(row).toHaveTextContent('Creating HTML artifact');
    expect(row).toHaveTextContent('3 lines');
    expect(row.textContent).not.toContain('@artifact');

    fireEvent.click(row);
    expect(onShow).toHaveBeenCalledOnce();
  });
});
