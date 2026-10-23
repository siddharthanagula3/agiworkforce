import { StrictMode, type ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  call: vi.fn(),
  connectors: vi.fn(),
  session: { isLoaded: true, isSignedIn: true, userId: 'viewer' as string | null },
}));
vi.mock('@/lib/identity/client', () => ({ useSession: () => mocks.session }));
vi.mock('@/features/chat/components/artifacts/artifactRuntimeClient', () => ({
  callArtifactRuntime: mocks.call,
  describeArtifactRuntimeConnectors: mocks.connectors,
  ArtifactRuntimeSignInRequiredError: class extends Error {},
}));
import { usePublishedArtifactRuntime } from './usePublishedArtifactRuntime';
beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  mocks.session = { isLoaded: true, isSignedIn: true, userId: 'viewer' };
  mocks.call.mockResolvedValue('owned result');
  mocks.connectors.mockResolvedValue([]);
});

describe('published artifact host ownership across asynchronous waits', () => {
  it('retires consent for a replaced artifact without running the old request or saving it under the new artifact', async () => {
    const { result, rerender } = renderHook(
      ({ token }) => usePublishedArtifactRuntime(token, undefined, true),
      { initialProps: { token: 'artifact-a' } },
    );
    let pending!: Promise<unknown>;
    act(() => {
      pending = result.current
        .host!.handle({ op: 'complete', prompt: 'owned request', connectors: [] })
        .catch((error: Error) => error.message);
    });
    await waitFor(() => expect(result.current.askingForAi).not.toBeNull());
    rerender({ token: 'artifact-b' });
    act(() => result.current.answerAiRequest({ allowed: true, allowedTools: [] }));
    await pending;
    expect(mocks.call).not.toHaveBeenCalled();
    expect(localStorage.getItem('agiworkforce-artifact-ai:viewer:artifact-b:ai')).toBeNull();
  });

  it('refuses a retained old host after the visible artifact changes', async () => {
    const { result, rerender } = renderHook(({ token }) => usePublishedArtifactRuntime(token), {
      initialProps: { token: 'artifact-a' },
    });
    const old = result.current.host!;
    rerender({ token: 'artifact-b' });
    await expect(
      old.handle({ op: 'storage.set', key: 'counter', value: '1', shared: false }),
    ).rejects.toThrow(/changed/);
    expect(mocks.call).not.toHaveBeenCalled();
  });
});

it('aborts an in-flight request when the account or visible artifact changes', async () => {
  let signal: AbortSignal | undefined;
  mocks.call.mockImplementationOnce(
    async (_token, _request, options) =>
      new Promise((_resolve, reject) => {
        signal = options.signal;
        signal!.addEventListener('abort', () => reject(new DOMException('Stopped', 'AbortError')), {
          once: true,
        });
      }),
  );
  const { result, rerender } = renderHook(({ token }) => usePublishedArtifactRuntime(token), {
    initialProps: { token: 'artifact-a' },
  });
  let pending!: Promise<unknown>;
  act(() => {
    pending = result.current
      .host!.handle({ op: 'storage.get', key: 'counter', shared: false })
      .catch((error: Error) => error.message);
  });
  expect(signal?.aborted).toBe(false);
  mocks.session = { isLoaded: true, isSignedIn: false, userId: null };
  rerender({ token: 'artifact-a' });
  expect(signal?.aborted).toBe(true);
  expect(await pending).toMatch(/changed/);
  expect(result.current.askingForAi).toBeNull();
});

it('keeps a live request context after StrictMode setup and cleanup replay', async () => {
  const wrapper = ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode>;
  const { result } = renderHook(() => usePublishedArtifactRuntime('artifact-a'), { wrapper });
  await expect(
    result.current.host!.handle({ op: 'storage.get', key: 'counter', shared: false }),
  ).resolves.toBe('owned result');
  expect(mocks.call.mock.calls[0]![2].signal.aborted).toBe(false);
});

it('retires a pending request when the visible content changes under the same publication', async () => {
  const { result, rerender } = renderHook(
    ({ content }) => usePublishedArtifactRuntime('artifact-a', content, true),
    { initialProps: { content: 'first revision' } },
  );
  let pending!: Promise<unknown>;
  act(() => {
    pending = result.current
      .host!.handle({ op: 'complete', prompt: 'owned', connectors: [] })
      .catch((error: Error) => error.message);
  });
  await waitFor(() => expect(result.current.askingForAi).not.toBeNull());
  rerender({ content: 'replacement revision' });
  expect(await pending).toMatch(/changed/);
  expect(mocks.call).not.toHaveBeenCalled();
});

it('does not let a late connector description overwrite the replacement artifact consent', async () => {
  let oldDescription!: (value: unknown) => void;
  mocks.connectors
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          oldDescription = resolve;
        }),
    )
    .mockResolvedValueOnce([{ id: 'gmail', label: 'Current app', connected: true, tools: [] }]);
  const { result, rerender, unmount } = renderHook(
    ({ token }) => usePublishedArtifactRuntime(token, undefined, true),
    { initialProps: { token: 'artifact-a' } },
  );
  let first!: Promise<unknown>;
  act(() => {
    first = result.current
      .host!.handle({ op: 'complete', prompt: 'first', connectors: ['gmail'] })
      .catch((error: Error) => error.message);
  });
  rerender({ token: 'artifact-b' });
  let second!: Promise<unknown>;
  act(() => {
    second = result.current
      .host!.handle({ op: 'complete', prompt: 'second', connectors: ['gmail'] })
      .catch((error: Error) => error.message);
  });
  await waitFor(() =>
    expect(result.current.askingForAi?.connectors?.[0]?.label).toBe('Current app'),
  );
  await act(async () => {
    oldDescription([{ id: 'gmail', label: 'Old app', connected: true, tools: [] }]);
    await Promise.resolve();
  });
  expect(result.current.askingForAi?.connectors?.[0]?.label).toBe('Current app');
  expect(await first).toMatch(/changed/);
  unmount();
  expect(await second).toMatch(/changed/);
  expect(mocks.call).not.toHaveBeenCalled();
});

describe('published artifact AI while AI in apps is switched off', () => {
  it('refuses an AI request without asking for consent or calling the server', async () => {
    const { result } = renderHook(() => usePublishedArtifactRuntime('artifact-a', 'code'));

    await expect(
      result.current.host!.handle({ op: 'complete', prompt: 'hello', connectors: [] }),
    ).rejects.toThrow('AI in apps is not available yet.');
    expect(result.current.askingForAi).toBeNull();
    expect(mocks.call).not.toHaveBeenCalled();
  });

  it('refuses an anonymous visitor the same way, without a sign-in prompt for AI', async () => {
    mocks.session = { isLoaded: true, isSignedIn: false, userId: null };
    const { result } = renderHook(() => usePublishedArtifactRuntime('artifact-a', 'code'));

    await expect(
      result.current.host!.handle({ op: 'complete', prompt: 'hello', connectors: [] }),
    ).rejects.toThrow('AI in apps is not available yet.');
    expect(result.current.signInNeeded).toBe(false);
    expect(mocks.call).not.toHaveBeenCalled();
  });

  it('keeps saved data working', async () => {
    const { result } = renderHook(() => usePublishedArtifactRuntime('artifact-a', 'code'));

    await expect(
      result.current.host!.handle({ op: 'storage.get', key: 'counter', shared: false }),
    ).resolves.toBe('owned result');
  });
});

describe('published artifact AI for a signed-out visitor', () => {
  it('asks the visitor to sign in and never calls the server', async () => {
    mocks.session = { isLoaded: true, isSignedIn: false, userId: null };
    const { result } = renderHook(() => usePublishedArtifactRuntime('artifact-a', 'code', true));

    let refusal!: Promise<unknown>;
    act(() => {
      refusal = result.current
        .host!.handle({ op: 'complete', prompt: 'hello', connectors: [] })
        .catch((error: unknown) => error);
    });
    await refusal;
    expect(result.current.signInNeeded).toBe(true);
    expect(result.current.askingForAi).toBeNull();
    expect(mocks.call).not.toHaveBeenCalled();
  });
});

describe('remembered AI consent across republished code', () => {
  async function allowOnce(content: string) {
    const hook = await settledHook(content);
    let pending!: Promise<unknown>;
    act(() => {
      pending = hook.result.current.host!.handle({ op: 'complete', prompt: 'hi', connectors: [] });
    });
    await waitFor(() => expect(hook.result.current.askingForAi).not.toBeNull());
    act(() => hook.result.current.answerAiRequest({ allowed: true, allowedTools: [] }));
    await pending;
    hook.unmount();
  }

  async function settledHook(content: string) {
    const hook = renderHook(() => usePublishedArtifactRuntime('artifact-a', content, true));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    return hook;
  }

  it('reuses consent for the exact code the viewer allowed', async () => {
    await allowOnce('version one');
    mocks.call.mockClear();
    const { result } = await settledHook('version one');

    await expect(
      result.current.host!.handle({ op: 'complete', prompt: 'again', connectors: [] }),
    ).resolves.toBe('owned result');
    expect(result.current.askingForAi).toBeNull();
  });

  it('asks again when the publisher replaces the code under the same link', async () => {
    await allowOnce('version one');
    mocks.call.mockClear();
    const { result } = await settledHook('version two');

    act(() => {
      void result.current
        .host!.handle({ op: 'complete', prompt: 'again', connectors: [] })
        .catch(() => undefined);
    });
    await waitFor(() => expect(result.current.askingForAi).not.toBeNull());
    expect(mocks.call).not.toHaveBeenCalled();
  });
});

describe('AI consent without the code to fingerprint', () => {
  it('remembers nothing and asks again on the next visit', async () => {
    const first = renderHook(() => usePublishedArtifactRuntime('artifact-a', undefined, true));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    let pending!: Promise<unknown>;
    act(() => {
      pending = first.result.current.host!.handle({ op: 'complete', prompt: 'hi', connectors: [] });
    });
    await waitFor(() => expect(first.result.current.askingForAi).not.toBeNull());
    act(() => first.result.current.answerAiRequest({ allowed: true, allowedTools: [] }));
    await pending;
    first.unmount();

    expect(Object.keys(localStorage).filter((key) => key.includes('artifact-a'))).toEqual([]);
    const second = renderHook(() => usePublishedArtifactRuntime('artifact-a', undefined, true));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    act(() => {
      void second.result.current
        .host!.handle({ op: 'complete', prompt: 'again', connectors: [] })
        .catch(() => undefined);
    });
    await waitFor(() => expect(second.result.current.askingForAi).not.toBeNull());
  });
});
