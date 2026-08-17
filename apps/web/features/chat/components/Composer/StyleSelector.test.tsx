import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StyleSelector } from './StyleSelector';
import { useStyleStore } from '@features/chat/stores/style-store';

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
      useStyleStore.getState().setStyle('concise');
    });
    render(<StyleSelector />);

    const trigger = screen.getByRole('button', { name: 'Response style' });
    expect(trigger).toHaveTextContent('Concise');
    expect(trigger.className).toContain('text-[var(--chat-accent-primary-text)]');
    expect(trigger.className).not.toMatch(/text-amber-/);
  });
});
