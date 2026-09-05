import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StyleSelector } from './StyleSelector';
import { useStyleStore, DEFAULT_PRESET_STYLE } from '@features/chat/stores/style-store';

vi.mock('@/app/settings/_lib/preferences-client', () => ({
  fetchPreferenceNamespace: vi.fn().mockResolvedValue(null),
  savePreferenceNamespace: vi.fn().mockResolvedValue(undefined),
}));

describe('StyleSelector trigger', () => {
  beforeEach(() => {
    act(() => {
      useStyleStore.setState({
        style: 'default',
        length: 'brief',
        activeCustomStyleId: null,
        customStyles: [],
      });
    });
  });

  it('paints the active style with accent tokens defined in both themes', () => {
    act(() => {
      useStyleStore.getState().setStyle('detailed');
    });
    render(<StyleSelector />);

    const trigger = screen.getByRole('button', { name: 'Response style' });
    expect(trigger).toHaveTextContent('Detailed');
    expect(trigger.className).toContain('text-[var(--chat-accent-primary-text)]');
    expect(trigger.className).not.toMatch(/text-amber-/);
  });

  // Concise is the shipped default, so an untouched composer must not look like
  // the user has overridden something.
  it('does not paint the chip active while still on the shipped default', () => {
    act(() => {
      useStyleStore.getState().setStyle(DEFAULT_PRESET_STYLE);
      useStyleStore.getState().setLength('brief');
    });
    render(<StyleSelector />);

    const trigger = screen.getByRole('button', { name: 'Response style' });
    expect(trigger).toHaveTextContent('Style');
    expect(trigger.className).not.toContain('text-[var(--chat-accent-primary-text)]');
  });

  // It lives in the "+" menu beside Skills and Connectors, so it carries their
  // row shape: full width, the same padding and text size, and a label that
  // survives a narrow composer instead of collapsing to a bare icon.
  it('renders as a full-width labelled menu row at every width', () => {
    render(<StyleSelector />);

    const trigger = screen.getByRole('button', { name: 'Response style' });
    const label = screen.getByText('Style');

    expect(trigger.contains(label)).toBe(true);
    expect(label.className).not.toContain('hidden');
    for (const rowClass of ['w-full', 'px-3', 'py-2', 'text-sm']) {
      expect(trigger.className).toContain(rowClass);
    }
    expect(trigger.className).not.toContain('rounded-full');
  });
});
