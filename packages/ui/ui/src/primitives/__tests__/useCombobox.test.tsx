import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { useCombobox } from '../useCombobox';

const ITEMS = ['alpha', 'beta', 'gamma'];

function Harness({
  onSelect,
  onEscape,
}: {
  onSelect: (item: string) => void;
  onEscape?: () => void;
}) {
  const { inputProps, getOptionProps } = useCombobox({
    items: ITEMS,
    listboxId: 'harness-listbox',
    expanded: true,
    getOptionId: (item) => `harness-${item}`,
    onSelect,
    ...(onEscape ? { onEscape } : {}),
  });
  return (
    <>
      <input aria-label="Filter" {...inputProps} />
      <div id="harness-listbox" role="listbox">
        {ITEMS.map((item) => (
          <div key={item} {...getOptionProps(item)}>
            {item}
          </div>
        ))}
      </div>
    </>
  );
}

describe('useCombobox', () => {
  it('wires the combobox to its listbox and the first option', () => {
    render(<Harness onSelect={vi.fn()} />);
    const input = screen.getByRole('combobox', { name: 'Filter' });

    expect(input.getAttribute('aria-controls')).toBe('harness-listbox');
    expect(input.getAttribute('aria-expanded')).toBe('true');
    expect(input.getAttribute('aria-activedescendant')).toBe('harness-alpha');
    expect(screen.getByRole('option', { name: 'alpha' }).getAttribute('aria-selected')).toBe(
      'true',
    );
  });

  it('moves the active option with arrows, Home and End, clamped at the ends', () => {
    render(<Harness onSelect={vi.fn()} />);
    const input = screen.getByRole('combobox');

    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(input.getAttribute('aria-activedescendant')).toBe('harness-alpha');
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(input.getAttribute('aria-activedescendant')).toBe('harness-beta');
    fireEvent.keyDown(input, { key: 'End' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(input.getAttribute('aria-activedescendant')).toBe('harness-gamma');
    fireEvent.keyDown(input, { key: 'Home' });
    expect(input.getAttribute('aria-activedescendant')).toBe('harness-alpha');
  });

  it('selects the active option on Enter and follows the pointer', () => {
    const onSelect = vi.fn();
    render(<Harness onSelect={onSelect} />);

    fireEvent.mouseEnter(screen.getByRole('option', { name: 'gamma' }));
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledWith('gamma');
  });

  it('hands Escape to the caller', () => {
    const onEscape = vi.fn();
    render(<Harness onSelect={vi.fn()} onEscape={onEscape} />);

    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Escape' });
    expect(onEscape).toHaveBeenCalledTimes(1);
  });
});
