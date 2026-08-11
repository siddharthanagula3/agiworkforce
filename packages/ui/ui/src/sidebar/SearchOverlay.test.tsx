import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { SearchOverlay } from './SearchOverlay';

const SESSION = {
  id: 'fixture-session',
  title: 'Demo conversation',
  updatedAt: '2026-08-11T00:00:00.000Z',
};

describe('SearchOverlay', () => {
  it('exposes a named modal and keeps focus inside the search surface', () => {
    render(
      <SearchOverlay
        open
        query=""
        onQueryChange={() => {}}
        results={[SESSION]}
        onSelect={() => {}}
        onClose={() => {}}
      />,
    );

    const dialog = screen.getByRole('dialog', { name: 'Search conversations' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    const descriptionId = dialog.getAttribute('aria-describedby');
    expect(descriptionId).toBeTruthy();
    expect(document.getElementById(descriptionId ?? '')?.textContent).toBe(
      'Search your conversation history and open a matching conversation.',
    );
    expect(document.activeElement).toBe(
      screen.getByRole('textbox', { name: 'Search conversations' }),
    );
  });

  it('closes through the modal Escape behavior', () => {
    const onClose = vi.fn();
    render(
      <SearchOverlay
        open
        query=""
        onQueryChange={() => {}}
        results={[SESSION]}
        onSelect={() => {}}
        onClose={onClose}
      />,
    );

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
