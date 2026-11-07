import { useEffect } from 'react';
import { cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import {
  useEmailAddressVerification,
  type EmailAddressVerificationScope,
  type IdentityEmailAddressVerification,
} from '../client';
import { createRequestAuthority } from '../request-authority';
import { useSessionSnapshot } from '../useSessionSnapshot';

interface AddressResult {
  id: string;
  emailAddress: string;
  verification: { status: string };
}

interface NativeAddress extends AddressResult {
  prepareVerification: Mock<(options: { strategy: 'email_code' }) => Promise<AddressResult>>;
  attemptVerification: Mock<(options: { code: string }) => Promise<AddressResult>>;
}

interface UserResult {
  id: string;
  emailAddresses: NativeAddress[];
}

interface NativeUser extends UserResult {
  reload: Mock<() => Promise<UserResult>>;
}

const fixture = vi.hoisted(() => {
  const address = (
    id = 'email-a',
    emailAddress = 'pending@example.test',
    status = 'unverified',
  ): NativeAddress => ({
    id,
    emailAddress,
    verification: { status },
    prepareVerification: vi.fn<(options: { strategy: 'email_code' }) => Promise<AddressResult>>(
      async () => ({
        id,
        emailAddress,
        verification: { status },
      }),
    ),
    attemptVerification: vi.fn<(options: { code: string }) => Promise<AddressResult>>(async () => ({
      id,
      emailAddress,
      verification: { status: 'verified' },
    })),
  });
  const user = (id = 'account-a', emailAddresses = [address()]): NativeUser => {
    const resource: NativeUser = {
      id,
      emailAddresses,
      reload: vi.fn<() => Promise<UserResult>>(),
    };
    resource.reload.mockImplementation(async () => resource);
    return resource;
  };
  const session = (id = 'session-a', owner = user()) => ({
    id,
    user: owner,
    getToken: vi.fn(async () => 'fixture-token'),
  });
  const native = session();
  const listeners = new Set<() => void>();
  const removals: Mock<() => void>[] = [];
  const subscription = {
    emitInitial: false,
    onSubscribe: null as (() => void) | null,
  };
  return {
    address,
    user,
    session,
    listeners,
    removals,
    subscription,
    auth: {
      isLoaded: true,
      isSignedIn: true,
      userId: 'account-a',
      sessionId: 'session-a',
    },
    providerUser: native.user,
    providerSession: native,
    sdk: {
      loaded: true,
      user: native.user,
      session: native,
      addListener: (listener: () => void) => {
        listeners.add(listener);
        const remove = vi.fn(() => {
          listeners.delete(listener);
        });
        removals.push(remove);
        subscription.onSubscribe?.();
        if (subscription.emitInitial) listener();
        return remove;
      },
    },
  };
});

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => fixture.auth,
  useClerk: () => fixture.sdk,
  useSession: () => ({ session: fixture.providerSession }),
  useUser: () => ({ isLoaded: true, isSignedIn: true, user: fixture.providerUser }),
  useSignUp: () => ({ fetchStatus: 'idle', signUp: {} }),
}));
vi.mock('@agiworkforce/local-runtime-contract', () => ({ getHostBridge: () => null }));

const network = vi.fn<typeof fetch>();

beforeEach(() => {
  fixture.listeners.clear();
  fixture.removals.length = 0;
  fixture.subscription.emitInitial = false;
  fixture.subscription.onSubscribe = null;
  fixture.sdk.loaded = true;
  fixture.sdk.session = fixture.session();
  fixture.sdk.user = fixture.sdk.session.user;
  fixture.providerUser = fixture.sdk.user;
  fixture.providerSession = fixture.sdk.session;
  fixture.auth = {
    isLoaded: true,
    isSignedIn: true,
    userId: 'account-a',
    sessionId: 'session-a',
  };
  network.mockReset();
  network.mockRejectedValue(new Error('Unexpected network request in native email fixture'));
  vi.stubGlobal('fetch', network);
});

afterEach(() => {
  try {
    expect(fixture.listeners.size).toBe(0);
    for (const remove of fixture.removals) expect(remove).toHaveBeenCalledOnce();
    expect(network).not.toHaveBeenCalled();
  } finally {
    cleanup();
    vi.unstubAllGlobals();
  }
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function owned() {
  let mounted = true;
  let retire: () => void = () => undefined;
  const hook = renderHook(() => {
    const capture = useSessionSnapshot();
    const api = useEmailAddressVerification();
    useEffect(
      () => () => {
        mounted = false;
        retire();
      },
      [],
    );
    return { capture, api };
  });
  const snapshot = hook.result.current.capture();
  expect(snapshot).not.toBeNull();
  const authority = createRequestAuthority(snapshot!, () => mounted);
  retire = authority.retire;
  const onDispatch = vi.fn();
  const scope: EmailAddressVerificationScope = {
    authority,
    emailAddress: 'pending@example.test',
    onDispatch,
  };
  return {
    ...hook,
    api: hook.result.current.api,
    authority,
    scope,
    onDispatch,
    closeEditor: () => authority.retire(),
  };
}

type Owner = ReturnType<typeof owned>;
type Action = 'sendCode' | 'verifyCode' | 'requireVerified' | 'refresh';
type Mutation = 'sendCode' | 'verifyCode';
const actions: Action[] = ['sendCode', 'verifyCode', 'requireVerified', 'refresh'];
const mutations: Mutation[] = ['sendCode', 'verifyCode'];

function invoke(
  api: IdentityEmailAddressVerification,
  action: Action,
  scope: EmailAddressVerificationScope,
  id = 'email-a',
) {
  if (action === 'refresh') return api.refresh(scope.authority);
  if (action === 'verifyCode') return api.verifyCode(id, '424242', scope);
  return api[action](id, scope);
}

function emit() {
  for (const listener of [...fixture.listeners]) listener();
}

function replaceSession(sameUser = false, sameSessionId = false) {
  const replacement = fixture.session(
    sameSessionId ? 'session-a' : 'session-b',
    fixture.user(sameUser ? 'account-a' : 'account-b'),
  );
  fixture.sdk.session = replacement;
  fixture.sdk.user = replacement.user;
  return replacement;
}

function expectNoNativeMutation(user: NativeUser) {
  for (const address of user.emailAddresses) {
    expect(address.prepareVerification).not.toHaveBeenCalled();
    expect(address.attemptVerification).not.toHaveBeenCalled();
  }
}

const retirements: { name: string; run: (owner: Owner) => void }[] = [
  { name: 'editor authority retirement', run: (owner) => owner.closeEditor() },
  { name: 'editor owner unmount', run: (owner) => owner.unmount() },
  {
    name: 'account switch before a React render',
    run: () => {
      replaceSession();
      emit();
    },
  },
  {
    name: 'same-user new session',
    run: () => {
      replaceSession(true);
      emit();
    },
  },
  {
    name: 'same-user same-ID session replacement',
    run: () => {
      replaceSession(true, true);
      emit();
    },
  },
  {
    name: 'native user object replacement with the same ID',
    run: () => {
      fixture.sdk.session.user = fixture.user();
      fixture.sdk.user = fixture.sdk.session.user;
      emit();
    },
  },
  {
    name: 'observed A/B/A session return',
    run: () => {
      const original = fixture.sdk.session;
      replaceSession();
      emit();
      fixture.sdk.session = original;
      fixture.sdk.user = original.user;
      emit();
    },
  },
];

describe('native email verification ownership', () => {
  it.each(actions)(
    'uses captured A for %s despite replacement provider-hook resources',
    async (action) => {
      const original = fixture.sdk.session;
      original.user.emailAddresses[0]!.verification.status = 'verified';
      const owner = owned();
      const replacement = fixture.session('session-b', fixture.user('account-b'));
      fixture.providerUser = replacement.user;
      fixture.providerSession = replacement;
      owner.rerender();

      await expect(invoke(owner.api, action, owner.scope)).resolves.toBeUndefined();

      expect(original.user.reload).toHaveBeenCalledOnce();
      expect(replacement.user.reload).not.toHaveBeenCalled();
      expectNoNativeMutation(replacement.user);
      expect(original.getToken).not.toHaveBeenCalled();
      expect(replacement.getToken).not.toHaveBeenCalled();
      expect(owner.onDispatch).toHaveBeenCalledTimes(
        mutations.includes(action as Mutation) ? 1 : 0,
      );
      expect(fixture.listeners.size).toBe(0);
    },
  );

  it.each(actions)(
    'fails closed for %s without a canonical native session binding',
    async (action) => {
      const authority = createRequestAuthority({
        userId: 'account-a',
        sessionId: 'session-a',
        isCurrent: () => true,
        getToken: async () => 'fixture-unbound-token',
      });
      const { result } = renderHook(useEmailAddressVerification);
      const onDispatch = vi.fn();

      await expect(
        invoke(result.current, action, {
          authority,
          emailAddress: 'pending@example.test',
          onDispatch,
        }),
      ).rejects.toMatchObject({ name: 'AbortError' });

      expect(fixture.sdk.user.reload).not.toHaveBeenCalled();
      expectNoNativeMutation(fixture.sdk.user);
      expect(onDispatch).not.toHaveBeenCalled();
      expect(fixture.removals).toHaveLength(0);
      authority.retire();
    },
  );

  it.each(actions)(
    'refuses %s before reload when the editor has already retired',
    async (action) => {
      const user = fixture.sdk.user;
      const owner = owned();
      owner.closeEditor();

      await expect(invoke(owner.api, action, owner.scope)).rejects.toMatchObject({
        name: 'AbortError',
      });

      expect(user.reload).not.toHaveBeenCalled();
      expectNoNativeMutation(user);
      expect(owner.onDispatch).not.toHaveBeenCalled();
    },
  );

  describe.each(retirements)('$name', ({ run }) => {
    it.each(actions)('rejects deferred %s reload without a dispatch', async (action) => {
      const user = fixture.sdk.user;
      const reload = deferred<UserResult>();
      user.reload.mockReturnValueOnce(reload.promise);
      const owner = owned();
      const operation = invoke(owner.api, action, owner.scope);
      const rejected = expect(operation).rejects.toMatchObject({ name: 'AbortError' });
      expect(user.reload).toHaveBeenCalledOnce();
      expect(fixture.listeners.size).toBe(1);
      expect(owner.onDispatch).not.toHaveBeenCalled();

      run(owner);

      expect(owner.authority.signal.aborted).toBe(true);
      expect(fixture.listeners.size).toBe(0);
      reload.resolve(user);
      await rejected;
      expectNoNativeMutation(user);
      expect(owner.onDispatch).not.toHaveBeenCalled();
      if (fixture.sdk.user !== user) expect(fixture.sdk.user.reload).not.toHaveBeenCalled();
    });

    it.each(mutations)('rejects a deferred native %s result after dispatch', async (action) => {
      const user = fixture.sdk.user;
      const address = user.emailAddresses[0]!;
      const native = deferred<AddressResult>();
      const started = deferred<void>();
      const method =
        action === 'sendCode' ? address.prepareVerification : address.attemptVerification;
      method.mockImplementationOnce(() => {
        started.resolve();
        return native.promise;
      });
      const owner = owned();
      const operation = invoke(owner.api, action, owner.scope);
      const rejected = expect(operation).rejects.toMatchObject({ name: 'AbortError' });
      await started.promise;
      expect(owner.onDispatch).toHaveBeenCalledOnce();
      expect(fixture.listeners.size).toBe(1);

      run(owner);

      expect(owner.authority.signal.aborted).toBe(true);
      expect(fixture.listeners.size).toBe(0);
      native.resolve({ ...address, verification: { status: 'verified' } });
      await rejected;
      expect(method).toHaveBeenCalledOnce();
      expect(owner.onDispatch).toHaveBeenCalledOnce();
      if (fixture.sdk.user !== user) {
        expect(fixture.sdk.user.reload).not.toHaveBeenCalled();
        expectNoNativeMutation(fixture.sdk.user);
      }
    });
  });

  it.each(actions)(
    'checks ownership after a %s reload even without an SDK event',
    async (action) => {
      const user = fixture.sdk.user;
      const reload = deferred<UserResult>();
      user.reload.mockReturnValueOnce(reload.promise);
      const owner = owned();
      const operation = invoke(owner.api, action, owner.scope);
      const rejected = expect(operation).rejects.toMatchObject({ name: 'AbortError' });
      const replacement = replaceSession();
      reload.resolve(user);

      await rejected;

      expect(owner.authority.signal.aborted).toBe(true);
      expectNoNativeMutation(user);
      expectNoNativeMutation(replacement.user);
      expect(replacement.user.reload).not.toHaveBeenCalled();
      expect(owner.onDispatch).not.toHaveBeenCalled();
    },
  );

  it.each(mutations)(
    'checks ownership after a native %s result without an SDK event',
    async (action) => {
      const user = fixture.sdk.user;
      const address = user.emailAddresses[0]!;
      const native = deferred<AddressResult>();
      const started = deferred<void>();
      const method =
        action === 'sendCode' ? address.prepareVerification : address.attemptVerification;
      method.mockImplementationOnce(() => {
        started.resolve();
        return native.promise;
      });
      const owner = owned();
      const operation = invoke(owner.api, action, owner.scope);
      const rejected = expect(operation).rejects.toMatchObject({ name: 'AbortError' });
      await started.promise;
      const replacement = replaceSession(true);
      native.resolve({ ...address, verification: { status: 'verified' } });

      await rejected;

      expect(owner.authority.signal.aborted).toBe(true);
      expect(replacement.user.reload).not.toHaveBeenCalled();
      expectNoNativeMutation(replacement.user);
      expect(owner.onDispatch).toHaveBeenCalledOnce();
    },
  );
});

describe('email resource admission', () => {
  it.each(['sendCode', 'verifyCode', 'requireVerified'] as const)(
    'admits %s for the requested ID and normalized address, ignoring unrelated resources',
    async (action) => {
      const unrelated = fixture.address('email-other', 'different@example.test', 'verified');
      const requested = fixture.address('email-a', ' Pending@Example.Test ', 'verified');
      fixture.sdk.user.emailAddresses = [unrelated, requested];
      const owner = owned();

      await expect(invoke(owner.api, action, owner.scope)).resolves.toBeUndefined();

      expect(unrelated.prepareVerification).not.toHaveBeenCalled();
      expect(unrelated.attemptVerification).not.toHaveBeenCalled();
      expect(requested.prepareVerification).toHaveBeenCalledTimes(action === 'sendCode' ? 1 : 0);
      expect(requested.attemptVerification).toHaveBeenCalledTimes(action === 'verifyCode' ? 1 : 0);
    },
  );

  it.each(['sendCode', 'verifyCode', 'requireVerified'] as const)(
    'refuses %s when reload removed the requested address',
    async (action) => {
      fixture.sdk.user.reload.mockResolvedValueOnce({ id: 'account-a', emailAddresses: [] });
      const owner = owned();

      await expect(invoke(owner.api, action, owner.scope)).rejects.toThrow(
        'no longer on your account',
      );

      expectNoNativeMutation(fixture.sdk.user);
      expect(owner.onDispatch).not.toHaveBeenCalled();
    },
  );

  it.each(actions)('rejects a %s reload result belonging to another user', async (action) => {
    const user = fixture.sdk.user;
    const foreign = fixture.user('account-b');
    user.reload.mockResolvedValueOnce(foreign);
    const owner = owned();

    await expect(invoke(owner.api, action, owner.scope)).rejects.toThrow('account changed');

    expectNoNativeMutation(user);
    expectNoNativeMutation(foreign);
    expect(owner.onDispatch).not.toHaveBeenCalled();
  });

  const mismatches = [
    {
      name: 'matching address with the wrong ID',
      id: 'email-other',
      email: 'pending@example.test',
    },
    { name: 'matching ID with the wrong address', id: 'email-a', email: 'different@example.test' },
  ];

  describe.each(mismatches)('$name', ({ id, email }) => {
    it.each(['sendCode', 'verifyCode', 'requireVerified'] as const)(
      'blocks %s before native dispatch',
      async (action) => {
        const address = fixture.address(id, email, 'verified');
        fixture.sdk.user.emailAddresses = [address];
        const owner = owned();

        await expect(invoke(owner.api, action, owner.scope)).rejects.toThrow(
          'no longer on your account',
        );

        expectNoNativeMutation(fixture.sdk.user);
        expect(owner.onDispatch).not.toHaveBeenCalled();
      },
    );

    it.each(mutations)('rejects the mismatched native %s return value', async (action) => {
      const address = fixture.sdk.user.emailAddresses[0]!;
      const result = { id, emailAddress: email, verification: { status: 'verified' } };
      address.prepareVerification.mockResolvedValueOnce(result);
      address.attemptVerification.mockResolvedValueOnce(result);
      const owner = owned();

      await expect(invoke(owner.api, action, owner.scope)).rejects.toThrow(
        'could not be confirmed',
      );

      expect(owner.onDispatch).toHaveBeenCalledOnce();
    });
  });

  it.each(['unverified', 'failed', 'expired', 'transferable', 'complete'])(
    'refuses native attempt status %s instead of reporting verified',
    async (status) => {
      const address = fixture.sdk.user.emailAddresses[0]!;
      address.attemptVerification.mockResolvedValueOnce({ ...address, verification: { status } });
      const owner = owned();

      await expect(owner.api.verifyCode('email-a', '424242', owner.scope)).rejects.toThrow(
        'verification could not be confirmed',
      );

      expect(address.attemptVerification).toHaveBeenCalledWith({ code: '424242' });
      expect(owner.onDispatch).toHaveBeenCalledOnce();
    },
  );

  it.each(['unverified', 'failed', 'expired', 'transferable', 'complete'])(
    'requireVerified refuses refreshed status %s without sending or attempting a code',
    async (status) => {
      fixture.sdk.user.emailAddresses[0]!.verification.status = status;
      const owner = owned();

      await expect(owner.api.requireVerified('email-a', owner.scope)).rejects.toThrow(
        'not currently verified',
      );

      expect(fixture.sdk.user.reload).toHaveBeenCalledOnce();
      expectNoNativeMutation(fixture.sdk.user);
      expect(owner.onDispatch).not.toHaveBeenCalled();
    },
  );

  it('requires the new reload result to be verified rather than a previously cached address', async () => {
    const user = fixture.sdk.user;
    user.emailAddresses[0]!.verification.status = 'verified';
    const current = fixture.address();
    user.reload.mockResolvedValueOnce({ id: user.id, emailAddresses: [current] });
    const owner = owned();

    await expect(owner.api.requireVerified('email-a', owner.scope)).rejects.toThrow(
      'not currently verified',
    );

    expectNoNativeMutation(user);
    expect(current.prepareVerification).not.toHaveBeenCalled();
    expect(current.attemptVerification).not.toHaveBeenCalled();
    expect(owner.onDispatch).not.toHaveBeenCalled();
  });

  it.each(actions)('releases %s subscriptions after a native reload failure', async (action) => {
    const failure = new Error('Fixture reload failed');
    fixture.sdk.user.reload.mockRejectedValueOnce(failure);
    const owner = owned();

    await expect(invoke(owner.api, action, owner.scope)).rejects.toBe(failure);

    expect(fixture.listeners.size).toBe(0);
    expectNoNativeMutation(fixture.sdk.user);
    expect(owner.onDispatch).not.toHaveBeenCalled();
  });
});

describe('native dispatch boundaries', () => {
  it.each(mutations)(
    'marks %s only after reload admission and immediately before native invocation',
    async (action) => {
      const user = fixture.sdk.user;
      const address = user.emailAddresses[0]!;
      const reload = deferred<UserResult>();
      const native = deferred<AddressResult>();
      const started = deferred<void>();
      const events: string[] = [];
      user.reload.mockImplementationOnce(() => {
        events.push('reload');
        return reload.promise;
      });
      const method =
        action === 'sendCode' ? address.prepareVerification : address.attemptVerification;
      method.mockImplementationOnce(() => {
        events.push('native');
        started.resolve();
        return native.promise;
      });
      const owner = owned();
      const onDispatch = vi.fn(() => {
        events.push('dispatch');
      });
      const operation = invoke(owner.api, action, { ...owner.scope, onDispatch });
      let completed = false;
      const completion = operation.then(() => {
        completed = true;
        events.push('complete');
      });
      expect(events).toEqual(['reload']);
      expect(method).not.toHaveBeenCalled();
      expect(onDispatch).not.toHaveBeenCalled();

      events.push('reload-resolved');
      reload.resolve(user);
      await started.promise;

      expect(events).toEqual(['reload', 'reload-resolved', 'dispatch', 'native']);
      expect(completed).toBe(false);
      expect(method).toHaveBeenCalledWith(
        action === 'sendCode' ? { strategy: 'email_code' } : { code: '424242' },
      );
      native.resolve({ ...address, verification: { status: 'verified' } });
      await completion;
      expect(events).toEqual(['reload', 'reload-resolved', 'dispatch', 'native', 'complete']);
      expect(onDispatch).toHaveBeenCalledOnce();
      expect(fixture.listeners.size).toBe(0);
    },
  );

  it.each(['sendCode', 'verifyCode', 'requireVerified'] as const)(
    'snapshots the %s scope, expected address, and callback before awaiting reload',
    async (action) => {
      const user = fixture.sdk.user;
      user.emailAddresses[0]!.verification.status = 'verified';
      const reload = deferred<UserResult>();
      user.reload.mockReturnValueOnce(reload.promise);
      const owner = owned();
      const originalDispatch = vi.fn();
      const replacementDispatch = vi.fn();
      const submitted = {
        authority: owner.authority,
        emailAddress: 'pending@example.test',
        onDispatch: originalDispatch,
      };
      const operation = invoke(owner.api, action, submitted);
      const replacement = createRequestAuthority(owner.authority.session);
      replacement.retire();
      submitted.authority = replacement;
      submitted.emailAddress = 'different@example.test';
      submitted.onDispatch = replacementDispatch;
      reload.resolve(user);

      await expect(operation).resolves.toBeUndefined();

      expect(originalDispatch).toHaveBeenCalledTimes(action === 'requireVerified' ? 0 : 1);
      expect(replacementDispatch).not.toHaveBeenCalled();
      expect(owner.authority.isCurrent()).toBe(true);
    },
  );

  it.each(mutations)(
    'rechecks authority when %s dispatch callback retires the editor',
    async (action) => {
      const owner = owned();
      const onDispatch = vi.fn(owner.closeEditor);

      await expect(invoke(owner.api, action, { ...owner.scope, onDispatch })).rejects.toMatchObject(
        { name: 'AbortError' },
      );

      expect(onDispatch).toHaveBeenCalledOnce();
      expectNoNativeMutation(fixture.sdk.user);
      expect(fixture.listeners.size).toBe(0);
    },
  );

  it.each(mutations)('releases a %s subscription when the native call rejects', async (action) => {
    const address = fixture.sdk.user.emailAddresses[0]!;
    const method =
      action === 'sendCode' ? address.prepareVerification : address.attemptVerification;
    const failure = new Error('Fixture native mutation failed');
    method.mockRejectedValueOnce(failure);
    const owner = owned();

    await expect(invoke(owner.api, action, owner.scope)).rejects.toBe(failure);

    expect(owner.onDispatch).toHaveBeenCalledOnce();
    expect(fixture.listeners.size).toBe(0);
  });
});

describe('synchronous SDK subscription delivery', () => {
  it.each(actions)(
    'allows initial %s emission for a current owner and releases the listener',
    async (action) => {
      fixture.sdk.user.emailAddresses[0]!.verification.status = 'verified';
      fixture.subscription.emitInitial = true;
      const owner = owned();

      await expect(invoke(owner.api, action, owner.scope)).resolves.toBeUndefined();

      expect(fixture.sdk.user.reload).toHaveBeenCalledOnce();
      expect(owner.authority.signal.aborted).toBe(false);
      expect(fixture.removals).toHaveLength(1);
      expect(fixture.listeners.size).toBe(0);
    },
  );

  it.each(actions)(
    'removes %s listener when initial delivery retires before unsubscribe returns',
    async (action) => {
      const original = fixture.sdk.user;
      const owner = owned();
      fixture.subscription.emitInitial = true;
      fixture.subscription.onSubscribe = () => {
        replaceSession();
      };

      await expect(invoke(owner.api, action, owner.scope)).rejects.toMatchObject({
        name: 'AbortError',
      });

      expect(owner.authority.signal.aborted).toBe(true);
      expect(original.reload).not.toHaveBeenCalled();
      expect(fixture.sdk.user.reload).not.toHaveBeenCalled();
      expectNoNativeMutation(original);
      expectNoNativeMutation(fixture.sdk.user);
      expect(owner.onDispatch).not.toHaveBeenCalled();
      expect(fixture.removals).toHaveLength(1);
      expect(fixture.listeners.size).toBe(0);
    },
  );
});
