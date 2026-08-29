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
});
