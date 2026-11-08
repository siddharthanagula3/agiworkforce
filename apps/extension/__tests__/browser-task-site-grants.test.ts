import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BrowserTaskSiteGrants,
  type BrowserTaskSiteGrant,
} from '../src/features/computer-use/taskSiteGrants';
import { ONE_TIME_SITE_GRANT_MAX_MS } from '../src/features/computer-use/oneTimeSiteGrants';

const context = {
  streamId: 'stream-a',
  generation: 1,
  owner: { accountId: 'account-a', authIncarnation: 'session-a' },
};
const origin = 'https://example.com';
const pools: BrowserTaskSiteGrants[] = [];

function setup(scope: 'read' | 'act' = 'act') {
  const pool = new BrowserTaskSiteGrants();
  pools.push(pool);
  const release = vi.fn(async () => undefined);
  pool.retain(context, {
    origin,
    tabId: 7,
    scope,
    grantId: scope === 'act' ? 'site_once_grant-a' : undefined,
    release,
  });
  return { pool, release };
}

afterEach(async () => {
  await Promise.all(pools.splice(0).map((pool) => pool.releaseTask()));
  vi.useRealTimers();
});

describe('browser task site grants', () => {
  it('reuses the approved action scope for the same task and tab without extending its lifetime', async () => {
    vi.useFakeTimers();
    const { pool, release } = setup();
    expect(await pool.get(context, origin, 7, 'act')).toMatchObject({
      grantId: 'site_once_grant-a',
    });
    expect(await pool.get(context, origin, 7, 'read')).not.toBeNull();
    await vi.advanceTimersByTimeAsync(ONE_TIME_SITE_GRANT_MAX_MS - 1);
    expect(await pool.get(context, origin, 7, 'act')).not.toBeNull();
    await vi.advanceTimersByTimeAsync(1);
    expect(await pool.get(context, origin, 7, 'act')).toBeNull();
    expect(release).toHaveBeenCalledOnce();
  });

  it('never turns reading permission into action permission', async () => {
    const { pool } = setup('read');
    expect(await pool.get(context, origin, 7, 'read')).not.toBeNull();
    expect(await pool.get(context, origin, 7, 'act')).toBeNull();
  });

  it('does not reuse a grant for another task, tab or origin', async () => {
    const { pool } = setup();
    expect(await pool.get({ ...context, streamId: 'stream-b' }, origin, 7, 'act')).toBeNull();
    expect(await pool.get(context, origin, 8, 'act')).toBeNull();
    expect(await pool.get(context, 'https://other.example', 7, 'act')).toBeNull();
  });

  it.each([
    { ...context, generation: 2 },
    { ...context, owner: { ...context.owner, accountId: 'account-b' } },
    { ...context, owner: { ...context.owner, authIncarnation: 'session-b' } },
  ])('revokes grants after an account, sign-in or conversation change', async (changed) => {
    const { pool, release } = setup();
    expect(await pool.get(changed, origin, 7, 'act')).toBeNull();
    expect(release).toHaveBeenCalledOnce();
  });

  it('keeps same-origin task navigation and releases a closed or cross-origin source', async () => {
    const { pool, release } = setup();
    await pool.releaseTab(7, `${origin}/next-step`);
    expect(release).not.toHaveBeenCalled();
    await pool.releaseTab(7, 'https://other.example/');
    expect(release).toHaveBeenCalledOnce();
    expect(await pool.get(context, origin, 7, 'act')).toBeNull();
    pool.retain(context, { origin, tabId: 7, scope: 'read', release });
    await pool.releaseTab(7);
    expect(release).toHaveBeenCalledTimes(2);
  });

  it('removes authority immediately and waits for cleanup before another acquisition', async () => {
    const pool = new BrowserTaskSiteGrants();
    pools.push(pool);
    let finish!: () => void;
    const release = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    pool.retain(context, { origin, tabId: 7, scope: 'act', release });
    const cleanup = pool.releaseTask('stream-a');
    let acquired = false;
    const next = pool.get(context, origin, 7, 'act').then((value) => {
      acquired = true;
      return value;
    });
    await vi.waitFor(() => expect(release).toHaveBeenCalledOnce());
    expect(acquired).toBe(false);
    finish();
    await cleanup;
    expect(await next).toBeNull();
    expect(release).toHaveBeenCalledOnce();
  });

  it('releases other grants even if one cleanup fails', async () => {
    const { pool, release } = setup();
    pool.retain(context, {
      origin: 'https://other.example',
      tabId: 8,
      scope: 'act',
      release: () => {
        throw new Error('worker disconnected');
      },
    } as BrowserTaskSiteGrant);
    await pool.releaseTask();
    expect(release).toHaveBeenCalledOnce();
    await expect(pool.settled()).resolves.toBeUndefined();
    expect(await pool.get(context, origin, 7, 'act')).toBeNull();
  });
});
