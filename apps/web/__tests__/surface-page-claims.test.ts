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

/**
 * What a workflow builds and what a user can download are different facts, and
 * this page is about the second one. An earlier pass read `release-desktop.yml`,
 * saw macOS signed and notarized, and rewrote the page to list a notarized dmg
 * under "Published package assets". No macOS asset has ever been published: the
 * latest desktop release carries three Linux files and nothing else. Reasoning
 * from the pipeline to the shelf is the mistake these cases exist to stop.
 */
describe('/desktop separates what is built from what is published', () => {
  it('builds and notarizes macOS in the release workflow', () => {
    const workflow = readFileSync(
      join(REPO_ROOT, '.github', 'workflows', 'release-desktop.yml'),
      'utf8',
    );
    expect(workflow).toMatch(/--target universal-apple-darwin/u);
    expect(workflow).toMatch(/build-macos:/u);
  });

  it('never lists a macOS asset as published', () => {
    const page = collapsed('app/desktop/page.tsx');
    for (const [label, pattern] of [
      ['a notarized dmg among the published assets', /Published package assets[^}]*macOS/iu],
      ['macOS carried by the published package list', /Published package assets[^}]*\.dmg/iu],
    ] as ReadonlyArray<readonly [string, RegExp]>) {
      expect(pattern.test(page), `page claims: ${label}`).toBe(false);
    }
  });

  it('says plainly that macOS is built but not yet published', () => {
    const page = collapsed('app/desktop/page.tsx');
    expect(page).toMatch(/not yet published/iu);
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

describe('/get-started, a bare agi login is the managed-cloud sign-in, not a BYOK key paste', () => {
  it('reads the default login provider out of the binary', () => {
    const auth = readFileSync(join(REPO_ROOT, 'apps', 'cli', 'src', 'auth.rs'), 'utf8');
    expect(auth).toMatch(
      /fn is_agiworkforce_login_provider[\s\S]{0,160}matches!\(provider, None \| Some\("agi"\) \| Some\("agiworkforce"\)\)/u,
    );
    expect(auth).toMatch(
      /is_agiworkforce_login_provider\(provider\) \{\s*return login_agiworkforce\(\)/u,
    );
    expect(auth).toMatch(
      /is_api_key_provider\(pid\) \{\s*interactive_api_key_login_for_provider\(pid\)/u,
    );
  });

  it('names the provider argument and the store the key lands in', () => {
    const page = collapsed('app/get-started/page.tsx');
    expect(page).toMatch(/agi login &lt;provider&gt;/u);
    expect(page).toMatch(/saved to the OS credential store/iu);
    expect(page).toMatch(/bare <code>agi login<\/code> signs into AGI managed cloud/iu);
    expect(page).toMatch(/agi login anthropic/u);
  });

  it('never offers a bare agi login as the way to paste a provider key', () => {
    const page = collapsed('app/get-started/page.tsx');
    for (const [label, pattern] of [
      ['bare agi login pastes a provider key', /<code>agi login<\/code>\. Paste/u],
      ['the key is merely encrypted on device', /Encrypted on device/iu],
      [
        'the byok transcript line is a bare agi login',
        /# byok:[^}]*\}, \{ kind: 'cmd', text: 'agi login' \}/u,
      ],
    ] as ReadonlyArray<readonly [string, RegExp]>) {
      expect(pattern.test(page), `page still claims: ${label}`).toBe(false);
    }
  });
});

describe('/get-started, desktop availability matches the release pipeline', () => {
  it('requires Apple signing and notarization in the desktop release workflow', () => {
    const workflow = readFileSync(
      join(REPO_ROOT, '.github', 'workflows', 'release-desktop.yml'),
      'utf8',
    );
    expect(workflow).toMatch(/build-macos:/u);
    expect(workflow).toMatch(/Notarized/u);
  });

  it('states the signature gate and keeps both unpublished platforms unpublished', () => {
    const page = collapsed('app/get-started/page.tsx');
    expect(page).toMatch(/signed and notarized by the release job/iu);
    // The distinction the page has to keep: notarized in the pipeline is not
    // the same as downloadable, and no macOS asset has been published.
    expect(page).toMatch(/has not been published yet/iu);
    expect(page).toMatch(/release API verifies that platform's signature/iu);
    expect(page).toMatch(/Windows installers have not been published/iu);
  });

  it('does not tell a reader every platform but Linux is unsigned', () => {
    const page = collapsed('app/get-started/page.tsx');
    expect(
      /other platforms are not yet signed/iu.test(page),
      'page still claims macOS desktop builds are unsigned',
    ).toBe(false);
  });
});

describe('/get-started, BYOK surfaces are stated with their release state', () => {
  it('keeps VS Code out of the list of surfaces BYOK runs on today', () => {
    const page = collapsed('app/get-started/page.tsx');
    expect(
      /Local and BYOK run on Desktop, the CLI and VS Code/u.test(page),
      'page claims BYOK runs on VS Code today, which has no published release',
    ).toBe(false);
    expect(page).toMatch(/Local and BYOK run on Desktop and the CLI today/u);
  });
});

describe('/docs, the Chrome card names the route the panel actually answers on', () => {
  it('agrees with /chrome-extension, which was corrected to name Managed Cloud', () => {
    const chrome = collapsed('app/chrome-extension/page.tsx');
    expect(chrome).toMatch(/Chat answers come back from AGI Managed Cloud/iu);
    expect(chrome).toMatch(/the Desktop bridge is an optional local handoff/iu);
  });

  it('says the panel answers from Managed Cloud and pairing is optional', () => {
    const page = collapsed('app/docs/page.tsx');
    expect(page).toMatch(/Answers come back from AGI Managed Cloud/iu);
    expect(page).toMatch(/pairing Desktop is an optional local road/iu);
  });

  it('never puts the panel chat work on the paired Desktop', () => {
    const page = collapsed('app/docs/page.tsx');
    expect(
      /paired Desktop handles the real work/iu.test(page),
      'page still routes extension chat through the paired Desktop',
    ).toBe(false);
  });
});

describe('/about, the colophon names every face the page is set in', () => {
  it('loads Newsreader as the display face of the agi design system', () => {
    const layout = readFileSync(join(WEB_ROOT, 'app', 'layout.tsx'), 'utf8');
    expect(layout).toMatch(/Newsreader/u);
    expect(layout).toMatch(/variable: '--font-newsreader'/u);
    const globals = readFileSync(join(WEB_ROOT, 'app', 'globals.css'), 'utf8');
    expect(globals).toMatch(/--agi-font-display: var\(--font-newsreader\)/u);
  });

  it('lists Newsreader alongside Geist and JetBrains Mono', () => {
    const page = collapsed('app/about/page.tsx');
    expect(page).toMatch(/Newsreader, Geist & JetBrains Mono/u);
    expect(
      /'Geist & JetBrains Mono'/u.test(page),
      'colophon omits the Newsreader display face the headings are set in',
    ).toBe(false);
  });
});
