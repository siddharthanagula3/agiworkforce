import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DynamicServerError } from 'next/dist/client/components/hooks-server-context';
import { redirect } from 'next/navigation';
type LoggerModule = typeof import('@/lib/logger');

const mocks = vi.hoisted(() => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<LoggerModule>()),
  logger: mocks.logger,
}));

import { reportUnreadableIdentity } from './unreadable-identity';

function thrownBy(act: () => void): unknown {
  try {
    act();
  } catch (error) {
    return error;
  }
  throw new Error('Expected the call to throw');
}

beforeEach(() => {
  mocks.logger.error.mockReset();
});

describe('reportUnreadableIdentity', () => {
  it('logs the failure once, with the route it happened on', () => {
    const failure = new Error('identity unreachable');

    reportUnreadableIdentity(failure, '/connectors');

    expect(mocks.logger.error).toHaveBeenCalledTimes(1);
    expect(mocks.logger.error).toHaveBeenCalledWith(
      { error: failure, route: '/connectors' },
      expect.stringContaining('Identity could not be read'),
    );
  });

  it('hands a static-render bailout back to the framework instead of calling it a failure', () => {
    const bailout = new DynamicServerError('Route /apps used `headers`');

    expect(thrownBy(() => reportUnreadableIdentity(bailout, '/apps'))).toBe(bailout);
    expect(mocks.logger.error).not.toHaveBeenCalled();
  });

  it('hands a redirect back to the framework instead of calling it a failure', () => {
    const navigation = thrownBy(() => redirect('/login'));

    expect(thrownBy(() => reportUnreadableIdentity(navigation, '/apps'))).toBe(navigation);
    expect(mocks.logger.error).not.toHaveBeenCalled();
  });
});
