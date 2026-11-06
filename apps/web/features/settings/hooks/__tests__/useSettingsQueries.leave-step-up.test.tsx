import {
  client, deferred, fetchMock, fixture, getCsrfToken, identity, json, leaveReceipt,
  LEAVE_PATH, ORG, OTHER_ORG, reads, transferReceipt, TRANSFER_PATH, transport,
  useLeaveOrganization, useTransferOrganizationOwnership, workspace, wrapper, writes,
} from './organization-membership-fixture';
import { StrictMode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MANAGED_CLOUD_ORGANIZATION_HEADER, MANAGED_CLOUD_WORKSPACES_PATH } from '@agiworkforce/cloud-contracts';
import { useSelectWorkspace } from '@/features/workspaces/hooks/use-workspaces';
import { admitWorkspace, observeWorkspaceOwner, workspaceQueryKey } from '@/features/workspaces/lib/workspace-admission';
import { useSessionSnapshot } from '@/lib/identity/useSessionSnapshot';
import type { PreparedWorkspaceMembershipAction } from '../use-organization-membership-mutation';

const operations = [
  { name: 'leave', path: LEAVE_PATH, method: 'DELETE', useMutation: useLeaveOrganization,
    input: () => ({ organizationId: ORG, successorUserId: 'successor' }),
    body: { successorUserId: 'successor' }, receipt: () => leaveReceipt('successor') },
  { name: 'transfer', path: TRANSFER_PATH, method: 'POST', useMutation: useTransferOrganizationOwnership,
    input: () => ({ organizationId: ORG, toUserId: 'successor', outgoingOwnerRole: 'viewer' as const }),
    body: { organizationId: ORG, toUserId: 'successor', outgoingOwnerRole: 'viewer' }, receipt: transferReceipt },
];

describe.each(operations)('owned workspace $name lifetime', (operation) => {
  async function mount() {
    transport(async () => json(operation.receipt()));
    const mounted = renderHook(({ active }) => ({
      mutation: operation.useMutation(active), select: useSelectWorkspace(), capture: useSessionSnapshot(),
    }), { wrapper, initialProps: { active: true } });
    await waitFor(() => expect(mounted.result.current.mutation.canMutate).toBe(true));
    return mounted;
  }
  function prepare(mutation: ReturnType<typeof useLeaveOrganization> | ReturnType<typeof useTransferOrganizationOwnership>) {
    let prepared: PreparedWorkspaceMembershipAction | null = null;
    act(() => { prepared = mutation.prepare(operation.input() as never); });
    expect(prepared).not.toBeNull();
    return prepared!;
  }

  it('captures exact input and admits a duplicate submit once without retiring its own barrier publication', async () => {
    const { result } = await mount();
    const csrf = deferred<string>();
    vi.mocked(getCsrfToken).mockReturnValueOnce(csrf.promise);
    const input = operation.input();
    let prepared!: PreparedWorkspaceMembershipAction;
    act(() => { prepared = result.current.mutation.prepare(input as never)!; });
    input.organizationId = OTHER_ORG;
    if ('successorUserId' in input) input.successorUserId = 'replacement';
    if ('toUserId' in input) input.toUserId = 'replacement';
    act(() => { prepared.submit(); prepared.submit(); });
    await waitFor(() => expect(getCsrfToken).toHaveBeenCalledOnce());
    expect(result.current.mutation.phase).toBe('writing');
    expect(writes()).toHaveLength(0);
    await act(async () => csrf.resolve('captured-csrf'));
    await waitFor(() => expect(result.current.mutation.phase).toBe('receipt'));
    expect(writes()).toHaveLength(1);
    const [path, init] = writes()[0]!;
    expect(path).toBe(operation.path);
    expect(init).toMatchObject({ method: operation.method, credentials: 'omit' });
    expect(JSON.parse(String(init?.body))).toEqual(operation.body);
    expect(new Headers(init?.headers).get(MANAGED_CLOUD_ORGANIZATION_HEADER)).toBe(ORG);
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer captured-token');
    expect(new Headers(init?.headers).get('x-csrf-token')).toBe('captured-csrf');
    expect(result.current.mutation.data).toEqual(operation.receipt());
    expect(result.current.mutation.data && 'userId' in result.current.mutation.data
      ? result.current.mutation.data.userId : fixture.accountId).not.toBe(fixture.auth.userId);
    expect(fixture.finalize).not.toHaveBeenCalled();
    expect(reads()).toHaveLength(1);
    expect(fixture.success).not.toHaveBeenCalled();
  });

  it('serializes same-render mutate calls with the canonical workspace selector', async () => {
    const { result } = await mount();
    const csrf = deferred<string>();
    vi.mocked(getCsrfToken).mockReturnValueOnce(csrf.promise);
    const mutate = result.current.mutation.mutate;
    let selection!: Promise<unknown>;
    act(() => {
      mutate(operation.input() as never);
      mutate(operation.input() as never);
      selection = result.current.select.mutateAsync(OTHER_ORG);
      void selection.catch(() => undefined);
    });
    await act(async () => { await expect(selection).rejects.toThrow(); csrf.resolve('csrf'); });
    await waitFor(() => expect(result.current.mutation.phase).toBe('receipt'));
    expect(writes()).toHaveLength(1);
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'PUT')).toHaveLength(0);
  });

  it.each(['session', 'workspace', 'close'] as const)('rejects retained confirmation after %s retirement', async (transition) => {
    const mounted = await mount();
    const prepared = prepare(mounted.result.current.mutation);
    act(() => {
      if (transition === 'session') identity();
      if (transition === 'workspace') {
        const owner = observeWorkspaceOwner(mounted.result.current.capture())!;
        const next = workspace(OTHER_ORG);
        admitWorkspace(owner, owner.epoch, JSON.stringify([next.scope, next.activeWorkspaceId, next.activeOrganizationId]));
      }
      if (transition === 'close') mounted.rerender({ active: false });
    });
    act(() => { prepared.submit(); prepared.cancel(); });
    expect(prepared.isCurrent()).toBe(false);
    expect(getCsrfToken).not.toHaveBeenCalled();
    expect(writes()).toHaveLength(0);
    expect(fixture.finalize).not.toHaveBeenCalled();
  });

  it('does not let retired callbacks cancel a replacement confirmation after close and reopen', async () => {
    const mounted = await mount();
    const oldPrepare = mounted.result.current.mutation.prepare;
    const old = prepare(mounted.result.current.mutation);
    const queuedNotifications = [...fixture.listeners];
    mounted.rerender({ active: false });
    mounted.rerender({ active: true });
    await waitFor(() => expect(mounted.result.current.mutation.canMutate).toBe(true));
    const replacement = prepare(mounted.result.current.mutation);
    act(() => { old.cancel(); old.submit(); for (const notify of queuedNotifications) notify(); });
    expect(mounted.result.current.mutation.phase).toBe('confirming');
    expect(replacement.isCurrent()).toBe(true);
    let stale: PreparedWorkspaceMembershipAction | null = null;
    act(() => { stale = oldPrepare(operation.input() as never); });
    expect(stale).toBeNull();
    expect(replacement.isCurrent()).toBe(true);
    act(() => replacement.submit());
    await waitFor(() => expect(mounted.result.current.mutation.phase).toBe('receipt'));
    expect(writes()).toHaveLength(1);
  });

  it.each(['csrf', 'token'] as const)('does not dispatch after retirement during %s acquisition', async (boundary) => {
    const mounted = await mount();
    const gate = deferred<string>();
    if (boundary === 'csrf') vi.mocked(getCsrfToken).mockReturnValueOnce(gate.promise);
    else fixture.sdk.session!.getToken = vi.fn(() => gate.promise);
    const token = fixture.sdk.session!.getToken;
    act(() => mounted.result.current.mutation.mutate(operation.input() as never));
    await waitFor(() => expect(boundary === 'csrf' ? getCsrfToken : token).toHaveBeenCalled());
    act(() => identity());
    mounted.rerender({ active: true });
    await act(async () => gate.resolve('retired-token'));
    expect(writes()).toHaveLength(0);
    expect(mounted.result.current.mutation.data).toBeUndefined();
    expect(fixture.finalize).not.toHaveBeenCalled();
    expect(fixture.error).not.toHaveBeenCalled();
  });

  it.each(['response', 'receipt-body', 'refusal-body'] as const)('suppresses late %s after owner retirement', async (boundary) => {
    const mounted = await mount();
    const response = deferred<Response>(); const body = deferred<unknown>();
    const parsing = vi.fn(() => body.promise);
    const pendingResponse = json({}, boundary === 'refusal-body' ? 409 : 200);
    vi.spyOn(pendingResponse, 'json').mockImplementation(parsing);
    transport(async () => boundary === 'response' ? response.promise : pendingResponse);
    act(() => mounted.result.current.mutation.mutate(operation.input() as never));
    await waitFor(() => expect(writes()).toHaveLength(1));
    if (boundary !== 'response') await waitFor(() => expect(parsing).toHaveBeenCalled());
    act(() => identity());
    mounted.rerender({ active: true });
    client.setQueryData(['replacement-account'], { kept: true });
    await act(async () => {
      response.resolve(json(operation.receipt()));
      body.resolve(boundary === 'refusal-body' ? { error: 'Old refusal' } : operation.receipt());
    });
    expect(writes()[0]![1]?.signal?.aborted).toBe(true);
    expect(mounted.result.current.mutation.data).toBeUndefined();
    expect(mounted.result.current.mutation.error).toBeNull();
    expect(client.getQueryData(['replacement-account'])).toEqual({ kept: true });
    expect(fixture.finalize).not.toHaveBeenCalled();
  });

  it.each(['network', 'server', 'json'] as const)('keeps dispatched unknown %s blocked without automatic or manual resend', async (failure) => {
    const mounted = await mount();
    transport(async () => {
      if (failure === 'network') throw new TypeError('Lost response');
      return failure === 'server' ? json({ error: 'Unavailable' }, 503) : new Response('{', { status: 200 });
    });
    const prepared = prepare(mounted.result.current.mutation);
    act(() => prepared.submit());
    await waitFor(() => expect(mounted.result.current.mutation.phase).toBe('uncertain'));
    act(() => { prepared.submit(); prepared.cancel(); mounted.result.current.mutation.mutate(operation.input() as never); });
    expect(writes()).toHaveLength(1);
    expect(mounted.result.current.mutation.error?.message).toContain('could not confirm');
    expect(mounted.result.current.mutation.canMutate).toBe(false);
    mounted.rerender({ active: false });
    mounted.rerender({ active: true });
    expect(mounted.result.current.mutation.canMutate).toBe(false);
    expect(fixture.finalize).not.toHaveBeenCalled();
    expect(fixture.success).not.toHaveBeenCalled();
  });

  it('keeps a final 409 response uncertain rather than assuming the action did not run', async () => {
    const { result } = await mount();
    transport(async () => json({ error: { message: 'That member has left.' } }, 409));
    act(() => result.current.mutation.mutate(operation.input() as never));
    await waitFor(() => expect(result.current.mutation.phase).toBe('uncertain'));
    expect(result.current.mutation.canMutate).toBe(false);
    act(() => result.current.mutation.mutate(operation.input() as never));
    expect(writes()).toHaveLength(1);
    expect(fixture.success).not.toHaveBeenCalled();
  });

  it('disposes a subscription that retires synchronously before its unsubscribe is returned', async () => {
    const { result } = await mount();
    const release = vi.fn();
    fixture.sdk.addListener = (listener) => {
      identity();
      listener();
      return release;
    };
    let prepared: PreparedWorkspaceMembershipAction | null = null;
    act(() => { prepared = result.current.mutation.prepare(operation.input() as never); });
    expect(prepared).toBeNull();
    expect(release).toHaveBeenCalledOnce();
    expect(writes()).toHaveLength(0);
    expect(getCsrfToken).not.toHaveBeenCalled();
  });

  it('continues once with canonical workspace B, not the requested organization or Personal', async () => {
    const { result } = await mount();
    act(() => result.current.mutation.mutate(operation.input() as never));
    await waitFor(() => expect(result.current.mutation.phase).toBe('receipt'));
    const next = deferred<Response>();
    fetchMock.mockImplementation(async (path) => String(path) === MANAGED_CLOUD_WORKSPACES_PATH ? next.promise : json(operation.receipt()));
    const resume = result.current.mutation.continueAfterReceipt;
    let first!: Promise<void>; let second!: Promise<void>;
    act(() => { first = resume(); second = resume(); });
    await waitFor(() => expect(reads()).toHaveLength(2));
    await act(async () => { next.resolve(json(workspace(OTHER_ORG))); await Promise.all([first, second]); });
    expect(fixture.finalize).toHaveBeenCalledExactlyOnceWith(client, OTHER_ORG,
      expect.objectContaining({ session: expect.objectContaining({ userId: fixture.auth.userId }) }), undefined, fixture.accountId);
    expect(fixture.applyCacheScope).toHaveBeenCalledWith({ accountId: fixture.accountId, workspaceId: OTHER_ORG }, expect.any(Function));
    expect(fixture.navigate).toHaveBeenCalledOnce();
    expect(writes()).toHaveLength(1);
  });

  it('retries only canonical refresh after Continue fails', async () => {
    const { result } = await mount();
    act(() => result.current.mutation.mutate(operation.input() as never));
    await waitFor(() => expect(result.current.mutation.phase).toBe('receipt'));
    fetchMock.mockImplementation(async () => json({ error: 'Unavailable' }, 503));
    await act(async () => result.current.mutation.continueAfterReceipt());
    expect(result.current.mutation.phase).toBe('receipt');
    expect(result.current.mutation.data).toEqual(operation.receipt());
    expect(result.current.mutation.error?.message).toContain('without repeating the action');
    fetchMock.mockImplementation(async () => json(workspace(OTHER_ORG)));
    await act(async () => result.current.mutation.continueAfterReceipt());
    expect(writes()).toHaveLength(1);
    expect(fixture.navigate).toHaveBeenCalledOnce();
  });

  it('retires confirmation when the canonical product account changes under the same native session', async () => {
    const { result } = await mount();
    const old = prepare(result.current.mutation);
    const capturedPrepare = result.current.mutation.prepare;
    const owner = observeWorkspaceOwner(result.current.capture())!;
    const providerSubject = fixture.auth.userId;
    fixture.accountId = 'replacement-product-account';
    act(() => client.setQueryData(workspaceQueryKey(owner), workspace()));
    await waitFor(() => expect(result.current.mutation.actorUserId).toBe(fixture.accountId));
    expect(fixture.auth.userId).toBe(providerSubject);
    act(() => { old.submit(); old.cancel(); });
    expect(old.isCurrent()).toBe(false);
    let stale: PreparedWorkspaceMembershipAction | null = null;
    act(() => { stale = capturedPrepare(operation.input() as never); });
    expect(stale).toBeNull();
    expect(writes()).toHaveLength(0);
    const fresh = prepare(result.current.mutation);
    act(() => fresh.submit());
    await waitFor(() => expect(result.current.mutation.phase).toBe('receipt'));
    expect(writes()).toHaveLength(1);
    expect(result.current.mutation.data).toEqual(operation.receipt());
  });

  it.each(['missing', 'different'] as const)('does not finalize Continue when canonical accountId is %s', async (kind) => {
    const { result } = await mount();
    act(() => result.current.mutation.mutate(operation.input() as never));
    await waitFor(() => expect(result.current.mutation.phase).toBe('receipt'));
    fetchMock.mockImplementation(async () => json({ ...workspace(OTHER_ORG), accountId: kind === 'missing' ? undefined : 'another-product-account' }));
    const retainedContinue = result.current.mutation.continueAfterReceipt;
    await act(async () => retainedContinue());
    if (kind === 'missing') {
      expect(result.current.mutation.phase).toBe('receipt');
      expect(result.current.mutation.data).toEqual(operation.receipt());
      expect(result.current.mutation.error?.message).toContain('without repeating the action');
    } else {
      expect(result.current.mutation.phase).toBeNull();
      expect(result.current.mutation.data).toBeUndefined();
      expect(result.current.mutation.error).toBeNull();
      expect(result.current.mutation.canMutate).toBe(false);
      const readCount = reads().length;
      await act(async () => retainedContinue());
      expect(reads()).toHaveLength(readCount);
    }
    expect(fixture.finalize).not.toHaveBeenCalled();
    expect(fixture.navigate).not.toHaveBeenCalled();
    expect(writes()).toHaveLength(1);
  });

  it('does not revive old prepare, mutate, or submit callbacks when the product mapping returns A to B to A', async () => {
    const { result } = await mount();
    const originalAccount = fixture.accountId;
    const originalKey = result.current.mutation.ownerKey;
    const oldPrepare = result.current.mutation.prepare;
    const oldMutate = result.current.mutation.mutate;
    const old = prepare(result.current.mutation);
    const owner = observeWorkspaceOwner(result.current.capture())!;
    fixture.accountId = 'temporary-product-account';
    act(() => client.setQueryData(workspaceQueryKey(owner), workspace()));
    await waitFor(() => expect(result.current.mutation.actorUserId).toBe(fixture.accountId));
    fixture.accountId = originalAccount;
    act(() => client.setQueryData(workspaceQueryKey(owner), workspace()));
    await waitFor(() => expect(result.current.mutation.actorUserId).toBe(originalAccount));
    expect(result.current.mutation.ownerKey).not.toBe(originalKey);
    let stale: PreparedWorkspaceMembershipAction | null = null;
    act(() => {
      old.submit(); old.cancel(); oldMutate(operation.input() as never);
      stale = oldPrepare(operation.input() as never);
    });
    expect(stale).toBeNull();
    expect(old.isCurrent()).toBe(false);
    expect(result.current.mutation.phase).toBeNull();
    expect(writes()).toHaveLength(0);
    act(() => result.current.mutation.mutate(operation.input() as never));
    await waitFor(() => expect(result.current.mutation.phase).toBe('receipt'));
    expect(writes()).toHaveLength(1);
  });

  it.each(['read', 'cancel', 'scope'] as const)('preserves replacement state when Continue retires during %s', async (boundary) => {
    const mounted = await mount();
    act(() => mounted.result.current.mutation.mutate(operation.input() as never));
    await waitFor(() => expect(mounted.result.current.mutation.phase).toBe('receipt'));
    const gate = deferred<void>(); const next = deferred<Response>();
    if (boundary === 'read') fetchMock.mockImplementation(async () => next.promise);
    else fetchMock.mockImplementation(async () => json(workspace(OTHER_ORG)));
    const cancel = vi.spyOn(client, 'cancelQueries');
    if (boundary === 'cancel') cancel.mockImplementationOnce(() => gate.promise);
    if (boundary === 'scope') fixture.applyCacheScope.mockImplementationOnce(() => gate.promise.then(() => false));
    let pending!: Promise<void>;
    act(() => { pending = mounted.result.current.mutation.continueAfterReceipt(); });
    await waitFor(() => expect(boundary === 'read' ? reads().length : boundary === 'cancel' ? cancel.mock.calls.length : fixture.applyCacheScope.mock.calls.length).toBeGreaterThan(boundary === 'read' ? 1 : 0));
    act(() => identity());
    mounted.rerender({ active: true });
    client.setQueryData(['replacement-account'], { kept: true });
    await act(async () => { next.resolve(json(workspace(OTHER_ORG))); gate.resolve(); await pending; });
    expect(client.getQueryData(['replacement-account'])).toEqual({ kept: true });
    expect(fixture.navigate).not.toHaveBeenCalled();
    expect(mounted.result.current.mutation.data).toBeUndefined();
    expect(mounted.result.current.mutation.error).toBeNull();
  });
});

it('rejects a target outside canonical admission and does not create an intent under StrictMode', async () => {
  const { result } = renderHook(() => useLeaveOrganization(), {
    wrapper: ({ children }) => <StrictMode>{wrapper({ children })}</StrictMode>,
  });
  await waitFor(() => expect(result.current.canMutate).toBe(true));
  let prepared: PreparedWorkspaceMembershipAction | null = null;
  act(() => { prepared = result.current.prepare({ organizationId: OTHER_ORG }); });
  expect(prepared).toBeNull();
  expect(getCsrfToken).not.toHaveBeenCalled();
  expect(writes()).toHaveLength(0);
});

it('does not admit critical membership changes without a canonical product account ID', async () => {
  fetchMock.mockImplementation(async () => json({ ...workspace(), accountId: undefined }));
  const { result } = renderHook(() => useLeaveOrganization(), { wrapper });
  await waitFor(() => expect(result.current.organizationId).toBe(ORG));
  expect(result.current.canMutate).toBe(false);
  expect(result.current.actorUserId).toBeNull();
  let prepared: PreparedWorkspaceMembershipAction | null = null;
  act(() => { prepared = result.current.prepare({ organizationId: ORG }); });
  expect(prepared).toBeNull();
  expect(getCsrfToken).not.toHaveBeenCalled();
  expect(writes()).toHaveLength(0);
});
