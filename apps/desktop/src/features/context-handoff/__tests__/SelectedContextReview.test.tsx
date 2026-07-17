import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const nativeMock = vi.hoisted(() => ({
  listeners: new Map<string, (event: { payload: unknown }) => void>(),
  listen: vi.fn(),
  invoke: vi.fn(),
  unlisten: vi.fn(),
}));

vi.mock('../../../lib/tauri-mock', () => ({
  isTauri: true,
  listen: nativeMock.listen,
  invoke: nativeMock.invoke,
}));

import { useAppModeStore } from '../../../stores/appModeStore';
import { SELECTED_CONTEXT_HANDOFF_TTL_MS, SelectedContextReview } from '../SelectedContextReview';

const NOW = 1_750_000_000_000;

function validPayload(overrides: Record<string, unknown> = {}) {
  return {
    text: 'First reviewed selection',
    context_url: 'https://example.com/private',
    tab_id: 17,
    selected_at: NOW,
    ...overrides,
  };
}

async function emit(payload: unknown) {
  await act(async () => {
    nativeMock.listeners.get('extension:selected_text_query')?.({ payload });
  });
}

function nativeClearCalls() {
  return nativeMock.invoke.mock.calls.filter(
    ([command]) => command === 'extension_clear_selected_context_handoff',
  );
}

describe('SelectedContextReview', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    nativeMock.listeners.clear();
    nativeMock.listen.mockReset();
    nativeMock.invoke.mockReset();
    nativeMock.unlisten.mockReset();
    nativeMock.listen.mockImplementation(
      async (eventName: string, callback: (event: { payload: unknown }) => void) => {
        nativeMock.listeners.set(eventName, callback);
        return nativeMock.unlisten;
      },
    );
    nativeMock.invoke.mockImplementation(async (command: string) => {
      if (command === 'extension_get_pending_selected_context_handoff') return null;
      return true;
    });
    useAppModeStore.setState({ mode: 'local' });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('queues multiple authenticated selections and handles each decision independently', async () => {
    const onAccept = vi.fn();
    render(<SelectedContextReview onAccept={onAccept} />);
    await act(async () => Promise.resolve());

    await emit(validPayload());
    await emit(
      validPayload({
        text: 'Second reviewed selection',
        context_url: 'https://second.example.org/article',
        tab_id: 18,
        selected_at: NOW + 1,
      }),
    );

    expect(screen.getByText('First reviewed selection')).toBeInTheDocument();
    expect(screen.getByText(/1 of 2 pending selections/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    await act(async () => Promise.resolve());

    expect(screen.queryByText('First reviewed selection')).not.toBeInTheDocument();
    expect(screen.getByText('Second reviewed selection')).toBeInTheDocument();
    expect(onAccept).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Accept context' }));
    await act(async () => Promise.resolve());

    expect(onAccept).toHaveBeenCalledTimes(1);
    expect(onAccept).toHaveBeenCalledWith(
      expect.objectContaining({
        text: 'Second reviewed selection',
        contextUrl: 'https://second.example.org/article',
        tabId: 18,
      }),
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('hydrates a native stage that arrived before the frontend listener mounted', async () => {
    nativeMock.invoke.mockImplementation(async (command: string) => {
      if (command === 'extension_get_pending_selected_context_handoff') return validPayload();
      return true;
    });

    render(<SelectedContextReview onAccept={vi.fn()} />);
    await act(async () => Promise.resolve());

    expect(nativeMock.invoke).toHaveBeenCalledWith(
      'extension_get_pending_selected_context_handoff',
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('First reviewed selection')).toBeInTheDocument();
  });

  it('fails closed for malformed or smuggled native event payloads', async () => {
    const onAccept = vi.fn();
    render(<SelectedContextReview onAccept={onAccept} />);
    await act(async () => Promise.resolve());

    await emit(validPayload({ destination: 'managed-cloud' }));
    await emit(validPayload({ context_url: 'https://example.com/private?secret=value' }));
    await emit(validPayload({ text: 'hidden\u202Etext' }));
    await emit(validPayload({ tab_id: 0 }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(nativeClearCalls()).toHaveLength(0);
    expect(onAccept).not.toHaveBeenCalled();
  });

  it('clears an event that is already stale instead of surfacing it', async () => {
    render(<SelectedContextReview onAccept={vi.fn()} />);
    await act(async () => Promise.resolve());

    await emit(validPayload({ selected_at: NOW - SELECTED_CONTEXT_HANDOFF_TTL_MS - 1 }));
    await act(async () => Promise.resolve());

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(nativeMock.invoke).toHaveBeenCalledWith('extension_clear_selected_context_handoff', {
      handoff: {
        text: 'First reviewed selection',
        context_url: 'https://example.com/private',
        tab_id: 17,
        selected_at: NOW - SELECTED_CONTEXT_HANDOFF_TTL_MS - 1,
      },
    });
  });

  it('expires and clears a staged preview while the review UI is open', async () => {
    render(<SelectedContextReview onAccept={vi.fn()} />);
    await act(async () => Promise.resolve());
    await emit(validPayload());

    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(SELECTED_CONTEXT_HANDOFF_TTL_MS + 1);
    });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(nativeClearCalls()).toHaveLength(1);
  });

  it('keeps the review visible and inserts nothing when native clearing fails', async () => {
    const onAccept = vi.fn();
    nativeMock.invoke.mockImplementation(async (command: string) => {
      if (command === 'extension_get_pending_selected_context_handoff') return null;
      throw new Error('Native stage unavailable');
    });
    render(<SelectedContextReview onAccept={onAccept} />);
    await act(async () => Promise.resolve());
    await emit(validPayload());

    fireEvent.click(screen.getByRole('button', { name: 'Accept context' }));
    await act(async () => Promise.resolve());

    expect(screen.getByRole('alert')).toHaveTextContent('Native stage unavailable');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(onAccept).not.toHaveBeenCalled();
  });

  it('blocks acceptance outside the Local Desktop trust plane', async () => {
    const onAccept = vi.fn();
    useAppModeStore.setState({ mode: 'cloud' });
    render(<SelectedContextReview onAccept={onAccept} />);
    await act(async () => Promise.resolve());
    await emit(validPayload());

    expect(screen.getByText('Switch to Local Desktop to accept this context.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Accept context' })).toBeDisabled();
    expect(nativeClearCalls()).toHaveLength(0);
    expect(onAccept).not.toHaveBeenCalled();
  });

  it('unregisters the native listener on unmount', async () => {
    const view = render(<SelectedContextReview onAccept={vi.fn()} />);
    await act(async () => Promise.resolve());

    view.unmount();

    expect(nativeMock.unlisten).toHaveBeenCalledTimes(1);
  });

  it('disposes a listener that resolves after the component unmounts', async () => {
    let resolveListener: ((unlisten: () => void) => void) | null = null;
    nativeMock.listen.mockReturnValueOnce(
      new Promise<() => void>((resolve) => {
        resolveListener = resolve;
      }),
    );
    const view = render(<SelectedContextReview onAccept={vi.fn()} />);
    view.unmount();

    await act(async () => {
      resolveListener?.(nativeMock.unlisten);
      await Promise.resolve();
    });

    expect(nativeMock.unlisten).toHaveBeenCalledTimes(1);
  });
});
