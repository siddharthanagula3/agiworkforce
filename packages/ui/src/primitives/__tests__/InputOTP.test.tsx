import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '../InputOTP';

describe('InputOTP', () => {
  it('renders slots without crashing', () => {
    const { container } = render(
      <InputOTP maxLength={4}>
        <InputOTPGroup>
          <InputOTPSlot index={0} />
          <InputOTPSlot index={1} />
        </InputOTPGroup>
      </InputOTP>,
    );
    expect(container.querySelector('input')).toBeTruthy();
  });
});
