import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  STEP_UP_ACTIONS,
  STEP_UP_ACTION_IDS,
  stepUpActionSpec,
  type StepUpAction,
} from '../step-up/actions';

const WEB_ROOT = path.resolve(__dirname, '../../..');
const SEARCH_ROOTS = ['app', 'lib', 'features'];
const SKIP_DIRECTORIES = new Set(['node_modules', '.next', 'dist', '__tests__']);

function isTestFile(file: string): boolean {
  return /\.(test|spec)\.tsx?$/.test(file);
}

function sourceFiles(directory: string, collected: string[] = []): string[] {
  for (const entry of readdirSync(directory)) {
    const full = path.join(directory, entry);
    if (statSync(full).isDirectory()) {
      if (!SKIP_DIRECTORIES.has(entry)) sourceFiles(full, collected);
      continue;
    }
    if (!/\.tsx?$/.test(entry) || isTestFile(entry)) continue;
    collected.push(full);
  }
  return collected;
}

const PRODUCT_FILES = SEARCH_ROOTS.flatMap((root) => sourceFiles(path.join(WEB_ROOT, root)));

/** `action: '<id>'` as every requireStepUp call site writes it. */
const ACTION_LITERAL = /\baction:\s*'([a-z_]+\.[a-z_]+)'/g;

function callSites(): Map<string, string[]> {
  const sites = new Map<string, string[]>();
  for (const file of PRODUCT_FILES) {
    const source = readFileSync(file, 'utf8');
    if (!source.includes('requireStepUp')) continue;
    const relative = path.relative(WEB_ROOT, file).split(path.sep).join('/');
    for (const match of source.matchAll(ACTION_LITERAL)) {
      const action = match[1] as string;
      sites.set(action, [...(sites.get(action) ?? []), relative]);
    }
  }
  return sites;
}

/**
 * Declared actions no route demands yet, each with the reason there is nothing
 * to gate. An entry earns its place by naming a fact about the code; a new
 * unenforced action is a failure, never a new entry.
 */
const UNENFORCED: Readonly<Record<string, string>> = {
  'account.delete':
    'app/api/user/delete-account/route.ts schedules the deletion and asks for no fresh factor',
  'email.change':
    'no server route changes the account email; the identity provider owns that flow in the browser',
  'api_credential.reveal':
    'nothing reads stored credential material back: api-keys are returned once at creation and masked afterwards',
};

describe('the step-up registry and the routes that use it', () => {
  const sites = callSites();

  it('sweeps a real tree, so an empty sweep cannot pass', () => {
    expect(PRODUCT_FILES.length).toBeGreaterThan(500);
    expect(sites.size).toBeGreaterThan(0);
  });

  it('demands a fresh factor for every declared action that has somewhere to demand it', () => {
    const unenforced = STEP_UP_ACTION_IDS.filter((action) => !sites.has(action)).filter(
      (action) => !Object.hasOwn(UNENFORCED, action),
    );

    expect(
      unenforced,
      `declared step-up action(s) no route asks for: ${unenforced.join(', ')}. ` +
        'Wire the route that performs the action, or give the registry entry a reason it stays unenforced.',
    ).toEqual([]);
  });

  it('keeps the unenforced list to actions that really are declared and really are unused', () => {
    for (const [action, reason] of Object.entries(UNENFORCED)) {
      expect(STEP_UP_ACTION_IDS, `${action} is listed as unenforced but is not declared`).toContain(
        action,
      );
      expect(sites.has(action), `${action} now has a consumer: ${reason} is stale`).toBe(false);
      expect(reason.length).toBeGreaterThan(20);
    }
  });

  it('never asks for an action the registry does not declare', () => {
    const invented = [...sites.keys()].filter(
      (action) => !(STEP_UP_ACTION_IDS as readonly string[]).includes(action),
    );

    expect(
      invented,
      `requireStepUp called with undeclared action(s): ${invented.join(', ')}`,
    ).toEqual([]);
  });

  it('names the consequence of each action in a sentence the prompt can show', () => {
    for (const action of STEP_UP_ACTION_IDS) {
      const { consequence } = stepUpActionSpec(action);
      expect(consequence, `${action} has no consequence`).toMatch(/^[A-Z].*\.$/s);
      expect(
        consequence.length,
        `${action} consequence is too thin to explain anything`,
      ).toBeGreaterThan(30);
    }
  });

  it('bounds every freshness window, so no proof outlives the reason it was taken', () => {
    for (const action of STEP_UP_ACTION_IDS) {
      const { freshnessSeconds } = stepUpActionSpec(action);
      expect(freshnessSeconds, `${action} never expires`).toBeGreaterThan(0);
      expect(freshnessSeconds, `${action} stays fresh for too long`).toBeLessThanOrEqual(300);
    }
  });

  it('binds the unlink proof to the identity it was taken for', () => {
    const unlinkRoute = readFileSync(
      path.join(WEB_ROOT, 'app/api/settings/identities/route.ts'),
      'utf8',
    );

    expect(unlinkRoute).toContain("action: 'identity.unlink'");
    expect(unlinkRoute).toContain('resourceId: identityId');
  });

  it('has nothing to gate for api_credential.reveal because no route reads a secret back', () => {
    const list = readFileSync(path.join(WEB_ROOT, 'app/api/settings/api-keys/route.ts'), 'utf8');
    const masked = list.slice(list.indexOf('function maskRow'), list.indexOf('async function'));

    expect(list).toContain('api_keys: rows.map(maskRow)');
    expect(masked).toContain('key_prefix');
    for (const secret of ['key_hash', 'full_key', 'secret']) {
      expect(masked, `maskRow returns ${secret}`).not.toContain(secret);
    }
  });

  it('puts a fail-closed limiter in front of every route that spends a second factor', async () => {
    const { rateLimitConfigs } = await import('@/lib/rate-limit');
    const limiter = rateLimitConfigs['2fa-verify'];

    expect(limiter.failClosed).toBe(true);
    expect(limiter.limit).toBeLessThanOrEqual(10);

    for (const route of [
      'app/api/auth/step-up/route.ts',
      'app/api/settings/2fa/route.ts',
      'app/api/settings/2fa/validate/route.ts',
      'app/api/settings/2fa/verify/route.ts',
      'app/api/settings/2fa/backup-codes/route.ts',
    ]) {
      const source = readFileSync(path.join(WEB_ROOT, route), 'utf8');
      expect(source, `${route} spends a factor without a per-user limiter`).toContain(
        "'2fa-verify', `user:${userId}`",
      );
    }
  });

  it('gives the two irreversible account actions the shortest windows it offers', () => {
    const windows = STEP_UP_ACTION_IDS.map((action) => stepUpActionSpec(action).freshnessSeconds);
    const shortest = Math.min(...windows);

    expect(STEP_UP_ACTIONS['api_credential.reveal'].freshnessSeconds).toBe(shortest);
  });
});

describe('the actions a route can reach are the actions a challenge can mint', () => {
  it('lets the challenge route mint a proof for every declared action', () => {
    const challenge = readFileSync(path.join(WEB_ROOT, 'app/api/auth/step-up/route.ts'), 'utf8');

    expect(challenge).toContain('Object.keys(STEP_UP_ACTIONS)');
    expect(challenge).not.toMatch(/action:\s*z\.enum\(\[\s*'/);
  });

  it('refuses a proof whose action is not the one the route is performing', async () => {
    const { createStepUpGrant, verifyStepUpGrant, resetStepUpSigningKeyCache } =
      await import('../step-up/grant-token');
    process.env['CSRF_SECRET'] = 'step-up-coverage-secret-long-enough-for-hkdf';
    resetStepUpSigningKeyCache();

    const token = createStepUpGrant({
      userId: 'user-1',
      action: 'identity.unlink',
      resourceId: 'identity-1',
      method: 'totp',
    }).token;

    for (const action of STEP_UP_ACTION_IDS.filter((id) => id !== 'identity.unlink')) {
      expect(() =>
        verifyStepUpGrant(token, {
          userId: 'user-1',
          action: action as StepUpAction,
          resourceId: 'identity-1',
        }),
      ).toThrow(/subject_mismatch/);
    }
  });
});
