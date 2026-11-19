import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { createSitePolicyPublicationOwner } from '../src/background/site-policy-publication';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function policyFixture() {
  const user = createSitePolicyPublicationOwner();
  const admin = createSitePolicyPublicationOwner();
  let userAllows = false;
  let policy = 'allow';
  const cancel = vi.fn();
  const readAdmin = (pending: Promise<string>, startup = false) => {
    const owner = admin.claim();
    return pending
      .catch(() => 'unavailable')
      .then((next) => {
        admin.publish(owner, () => {
          policy = next;
          if (!startup && next !== 'allow') cancel();
        });
      });
  };
  return {
    cancel,
    snapshot: () => ({ userAllows, policy }),
    startUser: (pending: Promise<boolean>) => {
      const owner = user.claim();
      return pending.then((next) => {
        user.publish(owner, () => {
          userAllows = next;
        });
      });
    },
    changeUser: (next: boolean) => {
      user.claim();
      userAllows = next;
    },
    readAdmin,
    changeAdmin: (area: string, relevant: boolean, pending: Promise<string>) => {
      if ((area !== 'local' && area !== 'managed') || !relevant) return Promise.resolve();
      return readAdmin(pending);
    },
  };
}

describe('site-policy publication ownership', () => {
  it.each([true, false])('keeps a user event over the opposite startup result %s', async (old) => {
    const fixture = policyFixture();
    const pending = deferred<boolean>();
    const done = fixture.startUser(pending.promise);
    fixture.changeUser(!old);
    pending.resolve(old);
    await done;
    expect(fixture.snapshot().userAllows).toBe(!old);
  });

  it.each([true, false])('drops stale admin startup success or failure (%s)', async (fails) => {
    const fixture = policyFixture();
    const pending = deferred<string>();
    const done = fixture.readAdmin(pending.promise, true);
    await fixture.changeAdmin('managed', true, Promise.resolve('allow'));
    if (fails) pending.reject(new Error('old read failed'));
    else pending.resolve('deny');
    await done;
    expect(fixture.snapshot().policy).toBe('allow');
    expect(fixture.cancel).not.toHaveBeenCalled();
  });

  it('does not let startup allow overwrite a current denial', async () => {
    const fixture = policyFixture();
    const pending = deferred<string>();
    const done = fixture.readAdmin(pending.promise, true);
    await fixture.changeAdmin('local', true, Promise.resolve('deny'));
    pending.resolve('allow');
    await done;
    expect(fixture.snapshot().policy).toBe('deny');
    expect(fixture.cancel).toHaveBeenCalledOnce();
  });

  it.each(['local', 'managed'])(
    'shares effective admin ownership across %s events',
    async (area) => {
      const fixture = policyFixture();
      const pending = deferred<string>();
      const done = fixture.changeAdmin(area, true, pending.promise);
      await fixture.changeAdmin(
        area === 'local' ? 'managed' : 'local',
        true,
        Promise.resolve('deny'),
      );
      pending.resolve('allow');
      await done;
      expect(fixture.snapshot().policy).toBe('deny');
      expect(fixture.cancel).toHaveBeenCalledOnce();
    },
  );

  it.each([true, false])(
    'does not cancel for stale reload failure or denial (%s)',
    async (fails) => {
      const fixture = policyFixture();
      const pending = deferred<string>();
      const done = fixture.changeAdmin('local', true, pending.promise);
      await fixture.changeAdmin('managed', true, Promise.resolve('allow'));
      if (fails) pending.reject(new Error('old read failed'));
      else pending.resolve('deny');
      await done;
      expect(fixture.snapshot().policy).toBe('allow');
      expect(fixture.cancel).not.toHaveBeenCalled();
    },
  );

  it('keeps source ownership independent and ignores unrelated events', async () => {
    const fixture = policyFixture();
    const pendingUser = deferred<boolean>();
    const pendingAdmin = deferred<string>();
    const userDone = fixture.startUser(pendingUser.promise);
    const adminDone = fixture.readAdmin(pendingAdmin.promise, true);
    await fixture.changeAdmin('local', false, Promise.resolve('deny'));
    await fixture.changeAdmin('sync', true, Promise.resolve('deny'));
    fixture.changeUser(true);
    pendingAdmin.resolve('deny');
    pendingUser.resolve(false);
    await Promise.all([userDone, adminDone]);
    expect(fixture.snapshot()).toEqual({ userAllows: true, policy: 'deny' });
    expect(fixture.cancel).not.toHaveBeenCalled();

    const nextUser = deferred<boolean>();
    const nextUserDone = fixture.startUser(nextUser.promise);
    await fixture.changeAdmin('managed', true, Promise.resolve('allow'));
    nextUser.resolve(false);
    await nextUserDone;
    expect(fixture.snapshot().userAllows).toBe(false);
  });

  it('preserves the cache while a current read is pending and cancels on current failure', async () => {
    const fixture = policyFixture();
    const pending = deferred<string>();
    const done = fixture.changeAdmin('local', true, pending.promise);
    expect(fixture.snapshot().policy).toBe('allow');
    expect(fixture.cancel).not.toHaveBeenCalled();
    pending.reject(new Error('current read failed'));
    await done;
    expect(fixture.snapshot().policy).toBe('unavailable');
    expect(fixture.cancel).toHaveBeenCalledOnce();
  });
});

describe('background publication wiring', () => {
  const background = readFileSync(
    resolve(dirname(fileURLToPath(import.meta.url)), '../src/background.ts'),
    'utf8',
  );
  const startup = background.slice(
    background.indexOf('const siteAllowlistPublication ='),
    background.indexOf('function isOriginApprovedForAutomation'),
  );
  const events = background.slice(
    background.indexOf(
      "chrome.storage.onChanged.addListener((changes, area) => {\n  if (area !== 'local' || !changes[SITE_ALLOWLIST_STORAGE_KEY])",
    ),
    background.indexOf('let quickModeCache ='),
  );

  it('claims separate startup ownership before starting reads and guards both admin outcomes', () => {
    expect(startup).toContain(
      'const siteAllowlistPublication = createSitePolicyPublicationOwner();',
    );
    expect(startup).toContain(
      'const adminSitePolicyPublication = createSitePolicyPublicationOwner();',
    );
    expect(startup).toContain('startupSiteAllowlistOwner = siteAllowlistPublication.claim()');
    expect(startup).toContain('startupAdminSitePolicyOwner = adminSitePolicyPublication.claim()');
    expect(startup).toContain('const siteAllowlistReady');
    expect(startup).toContain('readAdminSitePolicy()');
    expect(
      startup.indexOf('startupSiteAllowlistOwner = siteAllowlistPublication.claim()'),
    ).toBeLessThan(startup.indexOf('const siteAllowlistReady'));
    expect(
      startup.indexOf('startupAdminSitePolicyOwner = adminSitePolicyPublication.claim()'),
    ).toBeLessThan(startup.indexOf('readAdminSitePolicy()'));
    expect(startup).toContain(
      'siteAllowlistPublication.publish(startupSiteAllowlistOwner, () => {',
    );
    expect(
      startup.match(/adminSitePolicyPublication\.publish\(startupAdminSitePolicyOwner/g),
    ).toHaveLength(2);
    expect(startup).not.toContain('cancelActiveRunUnlessOriginStillApproved(');
    expect(startup).toContain('siteAllowlistLoaded = true;');
  });

  it('invalidates user startup before publishing and gates reload cancellation with its publication', () => {
    expect(events).toMatch(
      /if \(area !== 'local' \|\| !changes\[SITE_ALLOWLIST_STORAGE_KEY\]\) return;\s+siteAllowlistPublication\.claim\(\);\s+const next/,
    );
    expect(events).toMatch(
      /if \(\(area !== 'local' && area !== 'managed'\) \|\| !changes\[ADMIN_SITE_POLICY_STORAGE_KEY\]\) return;\s+const owner = adminSitePolicyPublication\.claim\(\);\s+void readAdminSitePolicy\(\)/,
    );
    expect(events).toMatch(
      /adminSitePolicyPublication\.publish\(owner, \(\) => \{\s+adminSitePolicyCache = policy;\s+cancelActiveRunUnlessOriginStillApproved\(isOriginApprovedForAutomation\);\s+cancelInPagePromptsOnUnapprovedOrigins\(\);\s+void notifyPageAccessChanged\(\(\) => true\);\s+\}\);/,
    );
  });
});
