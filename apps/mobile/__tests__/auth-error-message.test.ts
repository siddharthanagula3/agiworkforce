import { authErrorMessage } from '../src/features/auth/components/authErrorMessage';

describe('mobile auth error messages', () => {
  it('maps classified authentication failures to useful recovery copy', () => {
    expect(authErrorMessage({ errors: [{ code: 'form_password_incorrect' }] }, 'sign-in')).toBe(
      'The email and password do not match. Try again.',
    );
    expect(authErrorMessage({ errors: [{ code: 'form_code_incorrect' }] }, 'sign-up')).toBe(
      'That code is incorrect. Check the latest email and try again.',
    );
    expect(authErrorMessage({ status: 429 }, 'sign-in')).toBe(
      'Too many attempts. Try again later.',
    );
  });

  it('never displays unclassified vendor diagnostics', () => {
    const error = { errors: [{ message: 'Token failed at /private/auth-route' }] };
    expect(authErrorMessage(error, 'sign-in')).toBe('Could not complete sign-in. Try again.');
    expect(authErrorMessage(error, 'sign-up')).toBe('Could not complete sign-up. Try again.');
    expect(authErrorMessage(error, 'send-code')).toBe("We couldn't send a code. Try again.");
  });
});
