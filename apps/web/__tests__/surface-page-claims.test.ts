import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Claim guards for the surface and audience pages, written after the flagship
 * rewrite (d42d3cb15) carried four false claims across with it. Each rule below
 * pins the true statement to the code that decides it and bans the phrasing the
 * rewrite shipped, so the next rewrite cannot reintroduce it.
 *
 * Follows app/chrome-extension/__tests__/chrome-boundary-claims.test.ts: the
 * page is read as text and matched on the words a future writer types, whether
 * or not the component renders under test.
 */

const WEB_ROOT = join(__dirname, '..');
const REPO_ROOT = join(WEB_ROOT, '..', '..');

function rendered(relativePath: string): string {
  return readFileSync(join(WEB_ROOT, relativePath), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//gu, '')
    .replace(/^\s*\/\/.*$/gmu, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/gu, '');
}

function collapsed(relativePath: string): string {
  return rendered(relativePath).replace(/\s+/gu, ' ');
}

const MINUTE_WORDS: Record<string, string> = {
  '5': 'five',
  '10': 'ten',
  '15': 'fifteen',
  '20': 'twenty',
  '30': 'thirty',
  '60': 'sixty',
};

function cronMinuteInterval(path: string): string {
  const manifest = JSON.parse(readFileSync(join(REPO_ROOT, 'vercel.json'), 'utf8')) as {
    crons?: Array<{ path: string; schedule: string }>;
  };
  const entry = manifest.crons?.find((cron) => cron.path === path);
  expect(entry, `${path} is not scheduled in vercel.json`).toBeDefined();
  const minutes = /^\*\/(\d+) /u.exec(entry!.schedule);
  expect(minutes, `${path} is not on a minute interval: ${entry!.schedule}`).not.toBeNull();
  const word = MINUTE_WORDS[minutes![1]!];
  expect(word, `no word for a ${minutes![1]!} minute interval`).toBeDefined();
  return word!;
}

describe('/enterprise, audit delivery cadence matches the cron that delivers it', () => {
  it('states the interval vercel.json actually schedules', () => {
    const word = cronMinuteInterval('/api/cron/drain-audit-streams');
    const page = collapsed('app/enterprise/page.tsx');
    expect(page).toMatch(new RegExp(`drained to your endpoint every ${word} minutes`, 'u'));
  });

  it('never claims a cadence faster than the drain runs', () => {
    const word = cronMinuteInterval('/api/cron/drain-audit-streams');
    const page = collapsed('app/enterprise/page.tsx');
    for (const [, candidate] of Object.entries(MINUTE_WORDS)) {
      if (candidate === word) continue;
      expect(
        new RegExp(`every ${candidate} minutes`, 'u').test(page),
        `page claims audit batches drain every ${candidate} minutes`,
      ).toBe(false);
    }
  });

  it('keeps the batches described as signed per workspace', () => {
    const page = collapsed('app/enterprise/page.tsx');
    expect(page).toMatch(/signed with a per-workspace secret/iu);
  });
});

describe('/status, the Postgres row admits the probe throttle', () => {
  it('reads a throttle window out of the health check', () => {
    const source = readFileSync(join(WEB_ROOT, 'lib/server/health-check.ts'), 'utf8');
    const declared = /const DATABASE_PROBE_MIN_INTERVAL_SECONDS = ([\d_]+)/u.exec(source);
    expect(declared, 'the database probe throttle is gone from health-check.ts').not.toBeNull();
    expect(Number(declared![1]!.replace(/_/gu, ''))).toBe(3600);
  });

  it('says a pass is reused rather than implying every load runs a query', () => {
    const page = collapsed('app/status/page.tsx');
    expect(page).toMatch(/reused for up to an hour/iu);
    expect(
      /A query is executed against the primary database and returns\.'/u.test(page),
      'the Postgres row dropped the throttle caveat and claims a query every time',
    ).toBe(false);
  });
});

describe('/business, enterprise admin controls are not underclaimed', () => {
  it('names the controls that ship, since the entitlement gates them rather than a contract', () => {
    const page = collapsed('app/business/page.tsx');
    expect(page).toMatch(/single sign-on/iu);
    expect(page).toMatch(/SCIM/u);
    expect(page).toMatch(/audit trail/iu);
    expect(page).toMatch(/retention/iu);
    expect(page).toMatch(/entitlement/iu);
  });

  it('does not call a shipped, entitlement-gated control a commitment', () => {
    const page = collapsed('app/business/page.tsx');
    for (const [label, pattern] of [
      ['identity and audit are commitments', /contract-scoped commitments/iu],
      ['controls are not self-serve', /rather than self-serve settings/iu],
    ] as ReadonlyArray<readonly [string, RegExp]>) {
      expect(pattern.test(page), `page still claims: ${label}`).toBe(false);
    }
  });

  it('agrees with /enterprise, which states the same controls as implemented', () => {
    expect(collapsed('app/enterprise/page.tsx')).toMatch(/implemented and live/iu);
  });
});

describe('/desktop, platform availability matches what the release workflow publishes', () => {
  it('publishes a notarized universal macOS build', () => {
    const workflow = readFileSync(
      join(REPO_ROOT, '.github', 'workflows', 'release-desktop.yml'),
      'utf8',
    );
    expect(workflow).toMatch(/--target universal-apple-darwin/u);
    expect(workflow).toMatch(/build-macos:/u);
  });

  it('does not tell a reader that macOS installers are unpublished', () => {
    const page = collapsed('app/desktop/page.tsx');
    for (const [label, pattern] of [
      ['macOS installers not published', /macOS (?:and Windows )?installers? (?:are |is )?not/iu],
      ['macOS has no release date', /macOS[^.]*no release date/iu],
      ['only Linux is checked', /Check AGI Desktop for Linux\./u],
    ] as ReadonlyArray<readonly [string, RegExp]>) {
      expect(pattern.test(page), `page still claims: ${label}`).toBe(false);
    }
  });

  it('keeps Windows stated as unpublished, which is still true', () => {
    const page = collapsed('app/desktop/page.tsx');
    expect(page).toMatch(/Windows[^']*not published/iu);
  });

  it('still gates every download on a verified signature', () => {
    const page = collapsed('app/desktop/page.tsx');
    expect(page).toMatch(/verifies a signed build/iu);
  });
});

describe('/cli, no subcommand the binary refuses to expose', () => {
  it('does not advertise an agi cloud command', () => {
    const page = collapsed('app/cli/page.tsx');
    expect(
      /\bagi cloud\b(?! command)/u.test(page),
      'page advertises an agi cloud command the binary does not define',
    ).toBe(false);
  });

  it('matches the guard in the binary that keeps the command unexposed', () => {
    const lib = readFileSync(join(REPO_ROOT, 'apps', 'cli', 'src', 'lib.rs'), 'utf8');
    expect(lib).toMatch(/cli_does_not_advertise_an_unimplemented_cloud_task_surface/u);
  });

  it('says where managed runs go instead', () => {
    expect(collapsed('app/cli/page.tsx')).toMatch(/managed runs use the normal model path/iu);
  });
});
