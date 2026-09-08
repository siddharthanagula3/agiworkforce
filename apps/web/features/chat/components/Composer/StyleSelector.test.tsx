import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

describe('a custom style can be edited, not only made and deleted', () => {
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

  it('opens the form on the style it was asked to edit', async () => {
    let id = '';
    act(() => {
      id = useStyleStore.getState().addCustomStyle('Shipping forecast', 'Be terse.', 'Rain later.');
    });
    const user = userEvent.setup();
    render(<StyleSelector />);

    await user.click(screen.getByRole('button', { name: 'Response style' }));
    await user.click(screen.getByRole('button', { name: 'Edit Shipping forecast' }));

    expect(screen.getByText('Edit Custom Style')).toBeVisible();
    expect(screen.getByLabelText('Name')).toHaveValue('Shipping forecast');
    expect(screen.getByLabelText('Writing sample')).toHaveValue('Rain later.');
    expect(screen.getByLabelText('Style instruction')).toHaveValue('Be terse.');
    expect(useStyleStore.getState().customStyles[0]?.id).toBe(id);
  });

  it('writes the edit back through updateCustomStyle without making a second style', async () => {
    act(() => {
      useStyleStore.getState().addCustomStyle('Shipping forecast', 'Be terse.', 'Rain later.');
    });
    const user = userEvent.setup();
    render(<StyleSelector />);

    await user.click(screen.getByRole('button', { name: 'Response style' }));
    await user.click(screen.getByRole('button', { name: 'Edit Shipping forecast' }));

    const instruction = screen.getByLabelText('Style instruction');
    await user.clear(instruction);
    await user.type(instruction, 'Write like a weather bulletin.');
    await user.click(screen.getByRole('button', { name: /Save changes/ }));

    await waitFor(() => {
      const styles = useStyleStore.getState().customStyles;
      expect(styles).toHaveLength(1);
      expect(styles[0]?.instruction).toBe('Write like a weather bulletin.');
      expect(styles[0]?.sampleText).toBe('Rain later.');
    });
  });

  it('leaves the stored style alone when the edit is cancelled', async () => {
    act(() => {
      useStyleStore.getState().addCustomStyle('Shipping forecast', 'Be terse.', 'Rain later.');
    });
    const user = userEvent.setup();
    render(<StyleSelector />);

    await user.click(screen.getByRole('button', { name: 'Response style' }));
    await user.click(screen.getByRole('button', { name: 'Edit Shipping forecast' }));

    const instruction = screen.getByLabelText('Style instruction');
    await user.clear(instruction);
    await user.type(instruction, 'Something else entirely.');
    await user.click(screen.getByRole('button', { name: /Cancel/ }));

    expect(useStyleStore.getState().customStyles[0]?.instruction).toBe('Be terse.');
    expect(screen.queryByText('Edit Custom Style')).toBeNull();
  });

  it('still creates a new style when the form was not opened from a style', async () => {
    const user = userEvent.setup();
    render(<StyleSelector />);

    await user.click(screen.getByRole('button', { name: 'Response style' }));
    await user.click(screen.getByRole('button', { name: /Create Custom Style/ }));

    await user.type(screen.getByLabelText('Name'), 'Plain');
    await user.type(screen.getByLabelText('Style instruction'), 'Say it once, in plain words.');
    await user.click(screen.getByRole('button', { name: /^Save$/ }));

    await waitFor(() => {
      const styles = useStyleStore.getState().customStyles;
      expect(styles).toHaveLength(1);
      expect(styles[0]?.name).toBe('Plain');
    });
  });

  it('labels every field in both the create and the edit form', async () => {
    act(() => {
      useStyleStore.getState().addCustomStyle('Shipping forecast', 'Be terse.', 'Rain later.');
    });
    const user = userEvent.setup();
    render(<StyleSelector />);

    await user.click(screen.getByRole('button', { name: 'Response style' }));
    await user.click(screen.getByRole('button', { name: /Create Custom Style/ }));
    for (const field of ['Name', 'Writing sample', 'Style instruction']) {
      expect(screen.getByLabelText(field)).toBeVisible();
    }

    await user.click(screen.getByRole('button', { name: /Cancel/ }));
    await user.click(screen.getByRole('button', { name: 'Edit Shipping forecast' }));
    for (const field of ['Name', 'Writing sample', 'Style instruction']) {
      expect(screen.getByLabelText(field)).toBeVisible();
    }
  });
});
