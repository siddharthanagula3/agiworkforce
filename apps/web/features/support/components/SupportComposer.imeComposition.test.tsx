import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { SupportComposer } from './SupportComposer';

describe('SupportComposer Enter during input-method composition', () => {
  it('does not send while Enter confirms a candidate, then sends on the next Enter', () => {
    const onAsk = vi.fn();
    render(<SupportComposer onAsk={onAsk} disabled={false} />);
    const field = screen.getByRole('textbox');

    fireEvent.change(field, { target: { value: 'konnichiwa' } });
    fireEvent.keyDown(field, { key: 'Enter', isComposing: true });
    fireEvent.keyDown(field, { key: 'Enter', keyCode: 229 });
    expect(onAsk).not.toHaveBeenCalled();

    fireEvent.keyDown(field, { key: 'Enter' });
    expect(onAsk).toHaveBeenCalledWith('konnichiwa');
  });
});
