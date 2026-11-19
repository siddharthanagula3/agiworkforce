/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import type { StepUpChallenge, StepUpSession } from '../src/features/auth/services/stepUp';

const mockGrant = jest.fn();
const mockSignOut = jest.fn();
const mockSignOutAllAccounts = jest.fn();
jest.mock('../src/features/auth/services/stepUp', () => ({
  requestStepUpGrant: (...args: unknown[]) => mockGrant(...args),
}));
jest.mock('../src/features/auth/store', () => ({
  useAuthStore: (
    selector: (state: {
      signOut: typeof mockSignOut;
      signOutAllAccounts: typeof mockSignOutAllAccounts;
    }) => unknown,
  ) => selector({ signOut: mockSignOut, signOutAllAccounts: mockSignOutAllAccounts }),
}));
jest.mock('../src/ui/theme', () => ({ useThemeColors: () => ({}) }));
jest.mock('../src/ui/theme/tokens', () => ({ dialogPadding: 16, typeScale: {} }));
jest.mock('../src/features/chat/chrome/keyboardSafeComposer', () => ({
  keyboardAvoidingBehavior: () => 'padding',
}));
jest.mock('../components/ui/Text', () => ({ Text: require('react-native').Text }));
jest.mock('../components/ui/PressableBox', () => ({
  PressableBox: require('react-native').Pressable,
}));
jest.mock('../components/ui/Button', () => {
  const { Pressable, Text } = require('react-native');
  return {
    Button: ({
      title,
      onPress,
      disabled,
    }: {
      title: string;
      onPress: () => void;
      disabled?: boolean;
    }) => (
      <Pressable onPress={onPress} disabled={disabled}>
        <Text>{title}</Text>
      </Pressable>
    ),
  };
});
import { StepUpModal } from '../src/features/auth/components/StepUpModal';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}
function fixture(
  id: number,
  methods: Record<string, unknown>,
  current = () => true,
): StepUpChallenge {
  return {
    attemptId: id,
    action: 'password.change',
    resourceId: null,
    consequence: 'Fixture consequence',
    level: 'first_factor',
    identity: {
      session: methods as unknown as StepUpSession,
      account: { ownerId: 'account-a', epoch: 1 },
      isCurrent: current,
    },
    signal: new AbortController().signal,
    isCurrent: current,
  };
}
const password = {
  status: 'needs_first_factor',
  supportedFirstFactors: [{ strategy: 'password' }],
};
const flush = async () => {
  await act(async () => {
    await Promise.resolve();
  });
};

beforeEach(() => {
  jest.clearAllMocks();
  mockGrant.mockResolvedValue({ kind: 'granted', token: 'fixture-grant' });
});

test('Sign in again ends every account on the phone and never leaves a rejection unhandled', async () => {
  mockSignOutAllAccounts.mockRejectedValue(new Error('sign-out failed'));
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  const cancelled = jest.fn();
  const challenge = fixture(1, {
    startVerification: async () => ({ status: 'needs_first_factor', supportedFirstFactors: [] }),
  });
  const view = render(
    <StepUpModal challenge={challenge} onCancel={cancelled} onSatisfied={jest.fn()} />,
  );
  await flush();

  fireEvent.press(view.getByText('Sign in again'));
  await flush();

  expect(cancelled).toHaveBeenCalledTimes(1);
  expect(mockSignOutAllAccounts).toHaveBeenCalledTimes(1);
  expect(mockSignOut).not.toHaveBeenCalled();
  expect(warn).toHaveBeenCalledWith(
    '[StepUpModal] sign-out for a fresh sign-in failed:',
    expect.any(Error),
  );
  warn.mockRestore();
});

test('an unmounted verification completion cannot mint a token or satisfy the replacement', async () => {
  const old = deferred<unknown>();
  const oldMint = jest.fn();
  const oldSatisfied = jest.fn();
  const newSatisfied = jest.fn();
  const first = fixture(1, { startVerification: () => old.promise, getToken: oldMint });
  const second = fixture(2, { startVerification: async () => password });
  const view = render(
    <StepUpModal key={1} challenge={first} onCancel={jest.fn()} onSatisfied={oldSatisfied} />,
  );
  view.rerender(
    <StepUpModal key={2} challenge={second} onCancel={jest.fn()} onSatisfied={newSatisfied} />,
  );
  await act(async () => {
    old.resolve({ status: 'complete' });
  });
  expect(oldMint).not.toHaveBeenCalled();
  expect(mockGrant).not.toHaveBeenCalled();
  expect(oldSatisfied).not.toHaveBeenCalled();
  expect(newSatisfied).not.toHaveBeenCalled();
});

test('synchronous duplicate submit sends only one SDK attempt and cancel ignores its completion', async () => {
  const verification = deferred<unknown>();
  const attempt = jest.fn(() => verification.promise);
  const mint = jest.fn();
  const satisfied = jest.fn();
  const cancelled = jest.fn();
  const challenge = fixture(1, {
    startVerification: async () => password,
    attemptFirstFactorVerification: attempt,
    getToken: mint,
  });
  const view = render(
    <StepUpModal challenge={challenge} onCancel={cancelled} onSatisfied={satisfied} />,
  );
  await flush();
  fireEvent.changeText(view.getByLabelText('Password'), 'fixture-password');
  act(() => {
    fireEvent.press(view.getByText('Confirm'));
    fireEvent.press(view.getByText('Confirm'));
  });
  expect(attempt).toHaveBeenCalledTimes(1);
  fireEvent.press(view.getByText('Cancel'));
  await act(async () => {
    verification.resolve({ status: 'complete' });
  });
  expect(cancelled).toHaveBeenCalledTimes(1);
  expect(mint).not.toHaveBeenCalled();
  expect(satisfied).not.toHaveBeenCalled();
});

test('a stale token completion cannot request or display a grant', async () => {
  let current = true;
  const token = deferred<string>();
  const mint = jest.fn(() => token.promise);
  const satisfied = jest.fn();
  const challenge = fixture(
    1,
    { startVerification: async () => ({ status: 'complete' }), getToken: mint },
    () => current,
  );
  render(<StepUpModal challenge={challenge} onCancel={jest.fn()} onSatisfied={satisfied} />);
  await flush();
  expect(mint).toHaveBeenCalledWith({ skipCache: true });
  current = false;
  await act(async () => {
    token.resolve('fixture-token');
  });
  expect(mockGrant).not.toHaveBeenCalled();
  expect(satisfied).not.toHaveBeenCalled();
});

test('server second-factor level and offered backup-code choice remain intact', async () => {
  const start = jest.fn().mockResolvedValue({
    status: 'needs_second_factor',
    supportedSecondFactors: [{ strategy: 'totp' }, { strategy: 'backup_code' }],
  });
  const attempt = jest.fn().mockResolvedValue({ status: 'complete' });
  const challenge = {
    ...fixture(1, {
      startVerification: start,
      attemptSecondFactorVerification: attempt,
      getToken: async () => 'fixture-token',
    }),
    level: 'second_factor' as const,
  };
  const satisfied = jest.fn();
  const view = render(
    <StepUpModal challenge={challenge} onCancel={jest.fn()} onSatisfied={satisfied} />,
  );
  await flush();
  expect(start).toHaveBeenCalledWith({ level: 'second_factor' });
  fireEvent.press(view.getByText('Use a backup code instead'));
  fireEvent.changeText(view.getByLabelText('Backup code'), 'fixture-backup-code');
  fireEvent.press(view.getByText('Confirm'));
  await flush();
  expect(attempt).toHaveBeenCalledWith({ strategy: 'backup_code', code: 'fixture-backup-code' });
  expect(satisfied).toHaveBeenCalledWith('fixture-grant');
});

test('same-key rerender with fresh callbacks retains the exact binding and input', async () => {
  const start = jest.fn().mockResolvedValue(password);
  const attempt = jest.fn().mockResolvedValue({ status: 'complete' });
  const challenge = fixture(1, {
    startVerification: start,
    attemptFirstFactorVerification: attempt,
    getToken: async () => 'fixture-token',
  });
  const originalSatisfied = jest.fn();
  const replacementSatisfied = jest.fn();
  const view = render(
    <StepUpModal
      key={1}
      challenge={challenge}
      onCancel={jest.fn()}
      onSatisfied={originalSatisfied}
    />,
  );
  await flush();
  fireEvent.changeText(view.getByLabelText('Password'), 'fixture-entered-password');
  view.rerender(
    <StepUpModal
      key={1}
      challenge={challenge}
      onCancel={jest.fn()}
      onSatisfied={replacementSatisfied}
    />,
  );
  await flush();
  expect(start).toHaveBeenCalledTimes(1);
  expect(view.getByLabelText('Password').props.value).toBe('fixture-entered-password');
  fireEvent.press(view.getByText('Confirm'));
  await flush();
  expect(originalSatisfied).toHaveBeenCalledWith('fixture-grant');
  expect(replacementSatisfied).not.toHaveBeenCalled();
});
