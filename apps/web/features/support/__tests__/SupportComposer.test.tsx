import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { SUPPORT_MAX_QUESTION_LENGTH } from '@agiworkforce/cloud-contracts/support';
import { SupportComposer } from '../components/SupportComposer';

describe('SupportComposer', () => {
  it('caps typing at the length the server accepts', () => {
    render(<SupportComposer disabled={false} onAsk={() => undefined} />);

    const input = screen.getByLabelText('Ask a support question');
    expect(input).toHaveAttribute('maxlength', String(SUPPORT_MAX_QUESTION_LENGTH));
    expect(SUPPORT_MAX_QUESTION_LENGTH).toBe(600);
  });

  it('sends the trimmed question and clears the field', () => {
    const onAsk = vi.fn();
    render(<SupportComposer disabled={false} onAsk={onAsk} />);
    const input = screen.getByLabelText('Ask a support question');

    fireEvent.change(input, { target: { value: '  how do I sign in  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ask' }));

    expect(onAsk).toHaveBeenCalledWith('how do I sign in');
    expect(input).toHaveValue('');
  });
});
