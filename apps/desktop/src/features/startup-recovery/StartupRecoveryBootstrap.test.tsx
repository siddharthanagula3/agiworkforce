import { act, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  StartupRecoveryBootstrap,
  type StartupRecoveryInvoke,
  type StartupStateReport,
} from './StartupRecoveryBootstrap';
import { launchHealth, recordLaunchOutcome } from '../../services/errorTracking';

vi.mock('../../services/errorTracking', () => {
  let health: {
    lastOutcome: string | null;
    lastReason: string | null;
    launches: number;
    failures: number;
    consecutiveFailures: number;
  } = { lastOutcome: null, lastReason: null, launches: 0, failures: 0, consecutiveFailures: 0 };
  return {
    recordLaunchOutcome: vi.fn((record: { outcome: string; reason?: string }) => {
      const failed = record.outcome === 'failed';
      health = {
        lastOutcome: record.outcome,
        lastReason: failed ? (record.reason ?? 'unknown') : null,
        launches: health.launches + 1,
        failures: health.failures + (failed ? 1 : 0),
        consecutiveFailures: failed ? health.consecutiveFailures + 1 : 0,
      };
      return health;
    }),
    launchHealth: () => health,
  };
});

const healthyStart: StartupStateReport = { recovery: null, upgrade: { action: 'start' } };

const unlockFailure: StartupStateReport = {
  recovery: {
    code: 'DB_UNLOCK',
    title: 'AGI could not unlock local data',
    message: 'The database could not be opened with a verified key.',
    dataPreserved: true,
  },
  upgrade: { action: 'rebuildFromCloud' },
};

describe('StartupRecoveryBootstrap', () => {
  it('never mounts normal application children when native startup needs recovery', async () => {
    const invokeCommand = vi.fn(async (command: string) => {
      if (command === 'startup_get_recovery_state') {
        return unlockFailure;
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
    await waitFor(() => expect(document.title).toBe('AGI, Local data recovery'));
    expect(screen.queryByText('Normal application')).not.toBeInTheDocument();
    expect(normalAppMounted).not.toHaveBeenCalled();
    expect(invokeCommand).toHaveBeenCalledWith('startup_get_recovery_state');
  });

  it('mounts normal children only after native startup reports no recovery state', async () => {
    const invokeCommand = vi.fn().mockResolvedValue(healthyStart) as StartupRecoveryInvoke;

    render(
      <StartupRecoveryBootstrap nativeRuntime invokeCommand={invokeCommand}>
        <div>Normal application</div>
      </StartupRecoveryBootstrap>,
    );

    expect(screen.queryByText('Normal application')).not.toBeInTheDocument();
    expect(await screen.findByText('Normal application')).toBeInTheDocument();
  });

  it('covers the native WebView background for the full recovery lifetime', async () => {
    const invokeCommand = vi.fn().mockResolvedValue(unlockFailure) as StartupRecoveryInvoke;
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
    await waitFor(() => {
      expect(document.documentElement.style.backgroundColor).toBe('rgb(8, 11, 16)');
      expect(document.body.style.backgroundColor).toBe('rgb(8, 11, 16)');
    });

    unmount();
    expect(document.documentElement.style.backgroundColor).toBe(originalHtmlBackground);
    expect(document.body.style.backgroundColor).toBe(originalBodyBackground);
  });

  it('escapes to recovery when the native startup check never answers', async () => {
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
      expect(normalAppMounted).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not escape to recovery when the native check answers before the timeout', async () => {
    vi.useFakeTimers();
    try {
      const invokeCommand = vi.fn().mockResolvedValue(healthyStart) as StartupRecoveryInvoke;

      render(
        <StartupRecoveryBootstrap nativeRuntime invokeCommand={invokeCommand} timeoutMs={10_000}>
          <div>Normal application</div>
        </StartupRecoveryBootstrap>,
      );

      await act(async () => {
        await Promise.resolve();
      });
      expect(screen.getByText('Normal application')).toBeInTheDocument();

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

  it('records a launch outcome distinct from crash reporting', async () => {
    const before = launchHealth().launches;

    render(
      <StartupRecoveryBootstrap
        nativeRuntime
        invokeCommand={vi.fn().mockResolvedValue(healthyStart) as StartupRecoveryInvoke}
      >
        <div>Normal application</div>
      </StartupRecoveryBootstrap>,
    );

    expect(await screen.findByText('Normal application')).toBeInTheDocument();
    expect(recordLaunchOutcome).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'succeeded' }),
    );
    expect(launchHealth().launches).toBe(before + 1);
    expect(launchHealth().consecutiveFailures).toBe(0);
  });

  it('counts a recovery launch as a failed launch and names the code', async () => {
    render(
      <StartupRecoveryBootstrap
        nativeRuntime
        invokeCommand={vi.fn().mockResolvedValue(unlockFailure) as StartupRecoveryInvoke}
      >
        <div>Normal application</div>
      </StartupRecoveryBootstrap>,
    );

    await screen.findByRole('heading', { name: 'AGI could not unlock local data' });
    expect(launchHealth().lastOutcome).toBe('failed');
    expect(launchHealth().lastReason).toBe('DB_UNLOCK');
  });

  it('shows the runtime-rebuild notice above the application without blocking it', async () => {
    render(
      <StartupRecoveryBootstrap
        nativeRuntime
        invokeCommand={
          vi.fn().mockResolvedValue({
            recovery: null,
            upgrade: { action: 'rebuildRuntimeArtifacts' },
          }) as StartupRecoveryInvoke
        }
      >
        <div>Normal application</div>
      </StartupRecoveryBootstrap>,
    );

    expect(await screen.findByText('Rebuilding the local model runtime')).toBeInTheDocument();
    expect(screen.getByText('Normal application')).toBeInTheDocument();
  });

  it('refuses to mount the application over data a newer build wrote', async () => {
    const normalAppMounted = vi.fn();

    function NormalApplication() {
      normalAppMounted();
      return <div>Normal application</div>;
    }

    render(
      <StartupRecoveryBootstrap
        nativeRuntime
        invokeCommand={
          vi.fn().mockResolvedValue({
            recovery: null,
            upgrade: { action: 'holdForNewerData', foundDataFormat: 4, supportedDataFormat: 1 },
          }) as StartupRecoveryInvoke
        }
      >
        <NormalApplication />
      </StartupRecoveryBootstrap>,
    );

    expect(
      await screen.findByRole('heading', { name: 'This version is older than your data' }),
    ).toBeInTheDocument();
    expect(normalAppMounted).not.toHaveBeenCalled();
    expect(launchHealth().lastReason).toBe('holdForNewerData');
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
