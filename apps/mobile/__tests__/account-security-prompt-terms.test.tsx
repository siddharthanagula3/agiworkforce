import { render, act } from '@testing-library/react-native';
import { Alert } from 'react-native';

const mockVerifyInBrowser = jest.fn();
let firePasskeyRequired: () => void = () => undefined;

jest.mock('@/src/features/auth/services/accountSecurityEvents', () => ({
  onPasskeyRequired: (listener: () => void) => {
    firePasskeyRequired = listener;
    return () => undefined;
  },
}));
jest.mock('@/src/features/auth/services/accountSecurityVerification', () => ({
  verifyAccountSecurityInBrowser: () => mockVerifyInBrowser(),
}));
jest.mock('@/services/api', () => ({
  api: { get: jest.fn(async () => ({ currentVersion: 'v1', accepted: true })), post: jest.fn() },
}));

import { AccountSecurityVerificationPrompt } from '../src/features/auth/components/AccountSecurityVerificationPrompt';
import { useTermsAcceptanceStore } from '../src/features/auth/store/termsAcceptanceStore';

describe('a passkey step-up during the sign-in Terms check', () => {
  it('runs the Terms check again once the step-up succeeds', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    mockVerifyInBrowser.mockResolvedValue('verified');
    useTermsAcceptanceStore.setState({ userId: 'person-a', status: 'error', error: 'x' });

    render(<AccountSecurityVerificationPrompt />);
    act(() => firePasskeyRequired());
    const buttons = alert.mock.calls[0]?.[2] as { text: string; onPress?: () => void }[];
    await act(async () => {
      buttons.find((button) => button.text === 'Continue')?.onPress?.();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(useTermsAcceptanceStore.getState().status).toBe('accepted');
  });
});
