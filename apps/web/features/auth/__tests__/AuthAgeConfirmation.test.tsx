import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { ACCOUNT_AGE_FIELD_LABEL } from '@agiworkforce/types';

import { AuthAgeConfirmation } from '../AuthAgeConfirmation';
import { useSignupAgeGate } from '../useSignupAgeGate';

function Harness({ disabled }: { disabled: boolean }) {
  const gate = useSignupAgeGate(true);
  return (
    <>
      <button type="button">Elsewhere</button>
      <AuthAgeConfirmation gate={gate} disabled={disabled} />
    </>
  );
}

describe('AuthAgeConfirmation', () => {
  it('heads the age step and labels the group with that heading', () => {
    render(<Harness disabled={false} />);

    const heading = screen.getByRole('heading', { level: 2, name: 'Confirm your age' });
    expect(heading).toBeVisible();
    expect(screen.getByRole('group', { name: 'Confirm your age' })).toContainElement(
      screen.getByLabelText(ACCOUNT_AGE_FIELD_LABEL),
    );
  });

  it('focuses the age field once it is ready, so the person can type straight away', () => {
    const { rerender } = render(<Harness disabled />);
    const field = screen.getByLabelText(ACCOUNT_AGE_FIELD_LABEL);
    expect(document.activeElement).not.toBe(field);

    rerender(<Harness disabled={false} />);
    expect(document.activeElement).toBe(field);
  });

  it('does not take focus from a control the person already moved to', () => {
    const { rerender } = render(<Harness disabled />);
    const elsewhere = screen.getByRole('button', { name: 'Elsewhere' });
    elsewhere.focus();

    rerender(<Harness disabled={false} />);
    expect(document.activeElement).toBe(elsewhere);
  });
});
