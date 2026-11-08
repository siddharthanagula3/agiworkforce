import {
  challenge,
  deferred,
  fixture,
  grants,
  identity,
  json,
  leaveReceipt,
  ORG,
  OTHER_ORG,
  transferReceipt,
  transport,
  useLeaveOrganization,
  useTransferOrganizationOwnership,
  verification,
  wrapper,
  writes,
} from './OrganizationMembershipFixture';
import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { STEP_UP_TOKEN_HEADER } from '@/features/auth/step-up-fetch';

const transferInput = () => ({
  organizationId: ORG,
  toUserId: 'successor',
  outgoingOwnerRole: 'viewer' as const,
});
function Harness({ active = true, leave = false }: { active?: boolean; leave?: boolean }) {
  const leaving = useLeaveOrganization(active);
  const transferring = useTransferOrganizationOwnership(active);
  const mutation = leave ? leaving : transferring;
  return (
    <>
      <button
        disabled={!mutation.canMutate}
        onClick={() =>
          leave
            ? leaving.mutate({ organizationId: ORG, successorUserId: 'successor' })
            : transferring.mutate(transferInput())
        }
      >
        Submit workspace action
      </button>
      {mutation.stepUpDialog}
      <output aria-label="Workspace phase">{mutation.phase ?? 'idle'}</output>
      <output aria-label="Workspace error">{mutation.error?.message}</output>
    </>
  );
}
async function mount(leave = false) {
  const mounted = render(<Harness leave={leave} />, { wrapper });
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Submit workspace action' })).toBeEnabled(),
  );
  return mounted;
}
const submit = () =>
  fireEvent.click(screen.getByRole('button', { name: 'Submit workspace action' }));

it.each([false, true])(
  'replays one captured %s action after native second-factor verification with a fresh owned grant',
  async (leave) => {
    const start = (fixture.sdk.session!.startVerification = vi.fn(async () => ({
      status: 'needs_second_factor',
      supportedSecondFactors: [{ strategy: 'totp' }],
    })));
    const second = fixture.sdk.session!.attemptSecondFactorVerification;
    transport(async (path, init) => {
      if (path === '/api/auth/step-up')
        return grants().length === 1 ? verification() : json({ token: 'verified-proof' });
      return new Headers(init?.headers).has(STEP_UP_TOKEN_HEADER)
        ? json(leave ? leaveReceipt('successor') : transferReceipt())
        : challenge();
    });
    await mount(leave);
    submit();
    const dialog = await screen.findByRole('dialog', { name: 'Confirm it is you' });
    fireEvent.change(await within(dialog).findByLabelText('Code from your authenticator app'), {
      target: { value: '123456' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm' }));
    await waitFor(() =>
      expect(screen.getByLabelText('Workspace phase')).toHaveTextContent('receipt'),
    );
    expect(start).toHaveBeenCalledWith({ level: 'second_factor' });
    expect(second).toHaveBeenCalledWith({ strategy: 'totp', code: '123456' });
    expect(fixture.sdk.session!.getToken).toHaveBeenCalledWith({ skipCache: true });
    expect(grants()).toHaveLength(2);
    expect(new Headers(grants()[1]![1]?.headers).get('Authorization')).toBe('Bearer fresh-token');
    expect(grants()[1]![1]?.credentials).toBe('omit');
    expect(JSON.parse(String(grants()[1]![1]?.body))).toEqual({
      action: 'organization.transfer_ownership',
      resourceId: ORG,
    });
    expect(writes()).toHaveLength(2);
    expect(writes()[1]![1]?.body).toBe(writes()[0]![1]?.body);
    expect(new Headers(writes()[1]![1]?.headers).get(STEP_UP_TOKEN_HEADER)).toBe('verified-proof');
    expect(fixture.success).not.toHaveBeenCalled();
    expect(fixture.finalize).not.toHaveBeenCalled();
  },
);

it('keeps ordinary leave proof-free with an empty captured body', async () => {
  transport(async () => json(leaveReceipt()));
  const { result } = renderHook(() => useLeaveOrganization(), { wrapper });
  await waitFor(() => expect(result.current.canMutate).toBe(true));
  act(() => result.current.mutate({ organizationId: ORG }));
  await waitFor(() => expect(result.current.phase).toBe('receipt'));
  expect(writes()).toHaveLength(1);
  expect(JSON.parse(String(writes()[0]![1]?.body))).toEqual({});
  expect(grants()).toHaveLength(0);
});

it('keeps current verification dismissal quiet and allows a fresh explicit action', async () => {
  fixture.sdk.session!.startVerification = vi.fn(async () => ({
    status: 'needs_second_factor',
    supportedSecondFactors: [{ strategy: 'totp' }],
  }));
  transport(async (path) => (path === '/api/auth/step-up' ? verification() : challenge()));
  await mount();
  submit();
  const dialog = await screen.findByRole('dialog', { name: 'Confirm it is you' });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Submit workspace action' })).toBeEnabled(),
  );
  expect(screen.getByLabelText('Workspace error')).toBeEmptyDOMElement();
  expect(fixture.error).not.toHaveBeenCalled();
  expect(fixture.success).not.toHaveBeenCalled();
  expect(writes()).toHaveLength(1);
});

const proofRetirements = (
  ['silent-grant', 'native-verification', 'fresh-token', 'verified-grant', 'retry-csrf'] as const
).flatMap((stage) => (['session', 'close'] as const).map((transition) => ({ stage, transition })));
it.each(proofRetirements)(
  'blocks proof or retry after $transition retirement at $stage',
  async ({ stage, transition }) => {
    const grant = deferred<Response>();
    const native = deferred<unknown>();
    const token = deferred<string>();
    const nativeStart = (fixture.sdk.session!.startVerification = vi.fn(() =>
      stage === 'native-verification' ? native.promise : Promise.resolve({ status: 'complete' }),
    ));
    const getToken = (fixture.sdk.session!.getToken = vi.fn(
      async (options?: { skipCache?: boolean }) =>
        options?.skipCache
          ? stage === 'fresh-token'
            ? token.promise
            : 'fresh-token'
          : 'captured-token',
    ));
    transport(async (path) => {
      if (path !== '/api/auth/step-up') return challenge();
      if (stage === 'silent-grant' || grants().length > 1 || stage === 'retry-csrf')
        return grant.promise;
      return verification();
    });
    const mounted = await mount();
    submit();
    if (stage === 'silent-grant' || stage === 'retry-csrf')
      await waitFor(() => expect(grants()).toHaveLength(1));
    if (stage === 'native-verification')
      await waitFor(() => expect(nativeStart).toHaveBeenCalled());
    if (stage === 'fresh-token')
      await waitFor(() => expect(getToken).toHaveBeenCalledWith({ skipCache: true }));
    if (stage === 'verified-grant') await waitFor(() => expect(grants()).toHaveLength(2));
    if (stage === 'retry-csrf') {
      const { getCsrfToken } = await import('@/lib/client/csrf');
      vi.mocked(getCsrfToken).mockReturnValueOnce(token.promise);
      await act(async () => grant.resolve(json({ token: 'old-proof' })));
      await waitFor(() => expect(getCsrfToken).toHaveBeenCalledTimes(3));
    }
    if (transition === 'session') {
      act(() => identity());
      mounted.rerender(<Harness />);
    } else mounted.rerender(<Harness active={false} />);
    await act(async () => {
      native.resolve({ status: 'complete' });
      token.resolve('retired-token');
      grant.resolve(json({ token: 'old-proof' }));
    });
    expect(writes()).toHaveLength(1);
    expect(grants()).toHaveLength(stage === 'verified-grant' ? 2 : 1);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByLabelText('Workspace phase')).not.toHaveTextContent('receipt');
    expect(fixture.finalize).not.toHaveBeenCalled();
    expect(fixture.success).not.toHaveBeenCalled();
    expect(fixture.error).not.toHaveBeenCalled();
  },
);

it('does not restart a proof-bearing write whose response is lost', async () => {
  transport(async (path, init) => {
    if (path === '/api/auth/step-up') return json({ token: 'proof' });
    if (new Headers(init?.headers).has(STEP_UP_TOKEN_HEADER)) throw new TypeError('Lost response');
    return challenge();
  });
  await mount();
  submit();
  await waitFor(() =>
    expect(screen.getByLabelText('Workspace phase')).toHaveTextContent('uncertain'),
  );
  expect(writes()).toHaveLength(2);
  expect(grants()).toHaveLength(1);
  expect(screen.getByRole('button', { name: 'Submit workspace action' })).toBeDisabled();
  expect(fixture.success).not.toHaveBeenCalled();
});

const invalidLeaves = [
  {
    name: 'missing identity',
    receipt: () => ({ revoked: { sessions: 0, deviceTokens: 0, apiKeys: 0 }, warnings: [] }),
  },
  { name: 'wrong workspace', receipt: () => ({ ...leaveReceipt(), organizationId: OTHER_ORG }) },
  { name: 'wrong user', receipt: () => ({ ...leaveReceipt(), userId: 'another-account' }) },
  {
    name: 'provider subject instead of product account',
    receipt: () => ({ ...leaveReceipt(), userId: fixture.auth.userId }),
  },
  {
    name: 'wrong successor',
    receipt: () => ({ ...leaveReceipt(), successorUserId: 'unexpected-successor' }),
  },
  {
    name: 'negative count',
    receipt: () => ({ ...leaveReceipt(), revoked: { sessions: -1, deviceTokens: 0, apiKeys: 0 } }),
  },
  {
    name: 'fractional count',
    receipt: () => ({ ...leaveReceipt(), sharedConnectorsUnshared: 0.5 }),
  },
  {
    name: 'unsafe integer count',
    receipt: () => ({ ...leaveReceipt(), sharedConnectorsUnshared: Number.MAX_SAFE_INTEGER + 1 }),
  },
  { name: 'missing warnings', receipt: () => ({ ...leaveReceipt(), warnings: undefined }) },
];
it.each(invalidLeaves)(
  'keeps an invalid leave receipt ($name) uncertain and never reports success',
  async ({ receipt }) => {
    transport(async () => json(receipt()));
    const { result } = renderHook(() => useLeaveOrganization(), { wrapper });
    await waitFor(() => expect(result.current.canMutate).toBe(true));
    act(() => result.current.mutate({ organizationId: ORG }));
    await waitFor(() => expect(result.current.phase).toBe('uncertain'));
    expect(result.current.data).toBeUndefined();
    expect(writes()).toHaveLength(1);
    expect(fixture.finalize).not.toHaveBeenCalled();
  },
);

it.each([
  { name: 'missing identity', receipt: {} },
  {
    name: 'wrong workspace',
    receipt: { organizationId: OTHER_ORG, ownerUserId: 'successor', previousOwnerRole: 'viewer' },
  },
  {
    name: 'wrong owner',
    receipt: { organizationId: ORG, ownerUserId: 'replacement', previousOwnerRole: 'viewer' },
  },
  {
    name: 'wrong outgoing role',
    receipt: { organizationId: ORG, ownerUserId: 'successor', previousOwnerRole: 'admin' },
  },
])('keeps an invalid transfer receipt ($name) uncertain', async ({ receipt }) => {
  transport(async () => json(receipt));
  const { result } = renderHook(() => useTransferOrganizationOwnership(), { wrapper });
  await waitFor(() => expect(result.current.canMutate).toBe(true));
  act(() => result.current.mutate(transferInput()));
  await waitFor(() => expect(result.current.phase).toBe('uncertain'));
  expect(result.current.data).toBeUndefined();
  expect(writes()).toHaveLength(1);
  expect(fixture.finalize).not.toHaveBeenCalled();
});
