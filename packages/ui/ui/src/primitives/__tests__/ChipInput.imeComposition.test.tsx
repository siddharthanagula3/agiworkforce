import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ChipInput } from '../ChipInput';

describe('ChipInput during input-method composition', () => {
  it('keeps the draft when Enter confirms a candidate, then commits on the next Enter', () => {
    const onChange = vi.fn();
    render(<ChipInput values={[]} onChange={onChange} label="Domains" />);
    const input = screen.getByRole('textbox');

    fireEvent.change(input, { target: { value: 'example' } });
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true });
    fireEvent.keyDown(input, { key: 'Enter', keyCode: 229 });
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith(['example']);
  });
});
