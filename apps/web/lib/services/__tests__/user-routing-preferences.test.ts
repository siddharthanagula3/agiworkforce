import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import {
  NO_USER_ROUTING_PREFERENCES,
  resolveUserRoutingPreferences,
} from '../user-routing-preferences';

const USER_ID = 'user-1';

function dbReturning(routingPreferences: unknown) {
  return {
    query: vi.fn(async () => [{ routing_preferences: routingPreferences }]),
  } as unknown as Parameters<typeof resolveUserRoutingPreferences>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
});

/**
 * `/api/me/routing-preferences` has always persisted `us_only`, and both
 * resolvers have always enforced it. Nothing read it back on the chat path, so
 * an eligible user who set it was still routed to an excluded provider.
 */
describe('resolveUserRoutingPreferences', () => {
  it('reads the preference the user saved', async () => {
    await expect(resolveUserRoutingPreferences(dbReturning({ us_only: true }), USER_ID)).resolves
      .toEqual({ usOnly: true });
  });

  it('treats an unset preference as not asked for', async () => {
    await expect(resolveUserRoutingPreferences(dbReturning({}), USER_ID)).resolves.toEqual(
      NO_USER_ROUTING_PREFERENCES,
    );
  });

  it('ignores a value that is not a boolean rather than guessing at it', async () => {
    await expect(
      resolveUserRoutingPreferences(dbReturning({ us_only: 'yes' }), USER_ID),
    ).resolves.toEqual(NO_USER_ROUTING_PREFERENCES);
  });

  it('carries other keys past without tripping on them', async () => {
    await expect(
      resolveUserRoutingPreferences(
        dbReturning({ us_only: true, geo_overlay: 'us', something_new: 1 }),
        USER_ID,
      ),
    ).resolves.toEqual({ usOnly: true });
  });

  it.each([[null], [undefined], ['not an object'], [[]]])(
    'survives a malformed stored value (%s)',
    async (stored) => {
      await expect(resolveUserRoutingPreferences(dbReturning(stored), USER_ID)).resolves.toEqual(
        NO_USER_ROUTING_PREFERENCES,
      );
    },
  );

  it('fails open when the profile cannot be read, so a turn is not lost to it', async () => {
    // Deliberately unlike the organization policy gate, which is fail-closed.
    // Missing this preference routes to a provider the user would rather avoid;
    // a workspace prohibition is a different question with a different answer.
    const db = {
      query: vi.fn(async () => {
        throw new Error('database unreachable');
      }),
    } as unknown as Parameters<typeof resolveUserRoutingPreferences>[0];

    await expect(resolveUserRoutingPreferences(db, USER_ID)).resolves.toEqual(
      NO_USER_ROUTING_PREFERENCES,
    );
  });

  it('does not query at all without a user', async () => {
    const db = dbReturning({ us_only: true });

    await expect(resolveUserRoutingPreferences(db, '')).resolves.toEqual(
      NO_USER_ROUTING_PREFERENCES,
    );
    expect(db.query).not.toHaveBeenCalled();
  });
});
