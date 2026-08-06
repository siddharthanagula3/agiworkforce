import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { StartupRecoveryBootstrap, type StartupRecoveryInvoke } from './StartupRecoveryBootstrap';

describe('StartupRecoveryBootstrap', () => {
  it('never mounts normal application children when native startup needs recovery', async () => {
    const invokeCommand = vi.fn(async (command: string) => {
      if (command === 'startup_get_recovery_state') {
        return {
          code: 'DB_UNLOCK',
          title: 'AGI could not unlock local data',
          message: 'The database could not be opened with a verified key.',
          dataPreserved: true,
        };
      }
      return undefined;
    }) as StartupRecoveryInvoke;
    const normalAppMounted = vi.fn();

    function NormalApplication() {
      normalAppMounted();
      return <div>Normal application</div>;
    }

    render(
      <StartupRecoveryBootstrap nativeRuntime invokeCommand={invokeCommand}>
        <NormalApplication />
      </StartupRecoveryBootstrap>,
    );

    expect(screen.getByRole('status')).toHaveTextContent('Opening encrypted local data');
    expect(screen.queryByText('Normal application')).not.toBeInTheDocument();
    expect(normalAppMounted).not.toHaveBeenCalled();

    expect(
      await screen.findByRole('heading', { name: 'AGI could not unlock local data' }),
    ).toBeInTheDocument();
    expect(document.title).toBe('AGI — Local data recovery');
    expect(screen.queryByText('Normal application')).not.toBeInTheDocument();
    expect(normalAppMounted).not.toHaveBeenCalled();
    expect(invokeCommand).toHaveBeenCalledWith('startup_get_recovery_state');
  });

  it('mounts normal children only after native startup reports no recovery state', async () => {
    const invokeCommand = vi.fn().mockResolvedValue(null) as StartupRecoveryInvoke;

    render(
      <StartupRecoveryBootstrap nativeRuntime invokeCommand={invokeCommand}>
        <div>Normal application</div>
      </StartupRecoveryBootstrap>,
    );

    expect(screen.queryByText('Normal application')).not.toBeInTheDocument();
    expect(await screen.findByText('Normal application')).toBeInTheDocument();
  });

  it('covers the native WebView background for the full recovery lifetime', async () => {
    const invokeCommand = vi.fn().mockResolvedValue({
      code: 'DB_UNLOCK',
      title: 'AGI could not unlock local data',
      message: 'The database could not be opened with a verified key.',
      dataPreserved: true,
    }) as StartupRecoveryInvoke;
    const originalHtmlBackground = document.documentElement.style.backgroundColor;
    const originalBodyBackground = document.body.style.backgroundColor;

    const { unmount } = render(
      <StartupRecoveryBootstrap nativeRuntime invokeCommand={invokeCommand}>
        <div>Normal application</div>
      </StartupRecoveryBootstrap>,
    );

    expect(
      await screen.findByRole('heading', { name: 'AGI could not unlock local data' }),
    ).toBeInTheDocument();
    expect(document.documentElement.style.backgroundColor).toBe('rgb(8, 11, 16)');
    expect(document.body.style.backgroundColor).toBe('rgb(8, 11, 16)');

    unmount();
    expect(document.documentElement.style.backgroundColor).toBe(originalHtmlBackground);
    expect(document.body.style.backgroundColor).toBe(originalBodyBackground);
  });

  it('escapes to recovery when the native startup check never answers', async () => {
    // Regression: a `tauri dev` session sat on "Opening encrypted local data…"
    // indefinitely while the backend was provably idle in its event loop. The
    // invoke promise neither resolved nor rejected, so the existing catch-based
    // fallback could not fire and the user had no retry, diagnostics, or quit.
    vi.useFakeTimers();
    try {
      const neverSettles = vi.fn(() => new Promise<never>(() => {})) as StartupRecoveryInvoke;
      const normalAppMounted = vi.fn();

      function NormalApplication() {
        normalAppMounted();
        return <div>Normal application</div>;
      }

      render(
        <StartupRecoveryBootstrap nativeRuntime invokeCommand={neverSettles} timeoutMs={10_000}>
          <NormalApplication />
        </StartupRecoveryBootstrap>,
      );

      expect(screen.getByRole('status')).toHaveTextContent('Opening encrypted local data');

      await act(async () => {
        vi.advanceTimersByTime(10_000);
      });

      expect(
        screen.getByRole('heading', { name: 'AGI could not verify local data' }),
      ).toBeInTheDocument();
      // The recovery screen is the escape hatch: it must never fall through to
      // the normal app when local data could not be verified.
      expect(normalAppMounted).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not escape to recovery when the native check answers before the timeout', async () => {
    vi.useFakeTimers();
    try {
      const invokeCommand = vi.fn().mockResolvedValue(null) as StartupRecoveryInvoke;

      render(
        <StartupRecoveryBootstrap nativeRuntime invokeCommand={invokeCommand} timeoutMs={10_000}>
          <div>Normal application</div>
        </StartupRecoveryBootstrap>,
      );

      await act(async () => {
        await Promise.resolve();
      });
      expect(screen.getByText('Normal application')).toBeInTheDocument();

      // Firing the (now cancelled) timer must not tear a healthy app down.
      await act(async () => {
        vi.advanceTimersByTime(60_000);
      });
      expect(screen.getByText('Normal application')).toBeInTheDocument();
      expect(
        screen.queryByRole('heading', { name: 'AGI could not verify local data' }),
      ).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not call native startup commands in browser-only rendering', () => {
    const invokeCommand = vi.fn() as unknown as StartupRecoveryInvoke;

    render(
      <StartupRecoveryBootstrap nativeRuntime={false} invokeCommand={invokeCommand}>
        <div>Browser application</div>
      </StartupRecoveryBootstrap>,
    );

    expect(screen.getByText('Browser application')).toBeInTheDocument();
    expect(invokeCommand).not.toHaveBeenCalled();
  });
});
