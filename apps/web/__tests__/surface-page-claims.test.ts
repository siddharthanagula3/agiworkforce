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

/**
 * Second pass over the product surfaces, for the same reason as the block
 * above: the flagship rewrite carried claims across that no code backs. Two
 * rules the cases below encode, both learned the expensive way.
 *
 * A pipeline is not a shelf. `release-desktop.yml` builds macOS, and no macOS
 * asset has ever been published; `apps/extension-vscode` is a complete
 * extension, and no VSIX has ever been published either. `gh release view
 * <tag> --json assets` is the only thing that settles an availability claim.
 *
 * A value that exists is not a value a reader sees. `answeredByLabel` is
 * computed on every assistant turn, and it renders inside the More-actions
 * dropdown, not under the reply, so "a receipt under every reply" was false
 * while the receipt code was right there.
 */

function fileText(relativePath: string): string {
  return readFileSync(join(WEB_ROOT, relativePath), 'utf8');
}

function repoText(...segments: string[]): string {
  return readFileSync(join(REPO_ROOT, ...segments), 'utf8');
}

describe('/byok, VS Code is named with the release state it actually has', () => {
  it('reads VS Code as coming soon out of the shared surface table', () => {
    const constants = fileText('lib/marketing-constants.ts');
    expect(constants).toMatch(/vscode: COMING_SOON_LABEL/u);
    expect(constants).toMatch(/COMING_SOON_LABEL = 'Coming soon'/u);
  });

  it('states the released surfaces the way /help already does', () => {
    const page = collapsed('app/byok/page.tsx');
    expect(page).toMatch(
      /Desktop and the CLI have published releases; the VS Code extension is coming soon/u,
    );
    expect(page).toMatch(/Released', value: 'Desktop and the CLI\. VS Code is coming soon\./u);
    expect(page).toMatch(/Coming soon\. The extension hands the key/u);
    expect(collapsed('app/help/page.tsx')).toMatch(
      /Desktop and the CLI have published releases; the VS Code extension is/u,
    );
  });

  it('never titles the page as if VS Code took keys today', () => {
    const page = collapsed('app/byok/page.tsx');
    expect(
      /bring your own keys to Desktop, CLI, and VS Code/u.test(page),
      'page titles VS Code as a surface that accepts keys today, and no VSIX is published',
    ).toBe(false);
  });
});

describe('/byok, custody names the store each runtime really writes to', () => {
  it('reads three different stores out of the three runtimes', () => {
    expect(
      repoText('apps', 'desktop', 'src-tauri', 'src', 'sys', 'commands', 'mcp_oauth.rs'),
    ).toMatch(/let encrypted = encrypt_credential\(Some\(encryption\.inner\(\)\), &key\)\?;/u);
    expect(repoText('apps', 'cli', 'src', 'auth.rs')).toMatch(
      /const AUTH_KEYRING_SERVICE: &str = "com\.agiworkforce\.cli\.auth";/u,
    );
    expect(repoText('apps', 'extension-vscode', 'src', 'utils', 'api.ts')).toMatch(
      /secrets\.store\(SECRET_KEY, apiKey\)/u,
    );
  });

  it('says Desktop encrypts into its own database rather than a platform keychain', () => {
    const page = collapsed('app/byok/page.tsx');
    expect(page).toMatch(/Desktop encrypts the key into its local settings database/u);
    expect(page).toMatch(/the CLI uses the OS keyring/u);
  });

  it('never puts all three keys in a platform credential store', () => {
    const page = collapsed('app/byok/page.tsx');
    for (const [label, pattern] of [
      ['every runtime uses a platform credential store', /its own platform credential store/u],
      ['custody is the platform-provided store', /the credential store its own platform provides/u],
    ] as ReadonlyArray<readonly [string, RegExp]>) {
      expect(pattern.test(page), `page still claims: ${label}`).toBe(false);
    }
  });
});

describe('/web, the browser surface has one route and it is managed cloud', () => {
  it('reads the single trust mode the web chat route stamps on every turn', () => {
    const processor = fileText('app/api/llm/v1/chat/completions/lib/request-processor.ts');
    expect(processor).toMatch(/const MANAGED_WEB_CLOUD_TRUST_MODE = 'managed_cloud';/u);
    expect(fileText('lib/marketing-constants.ts')).toMatch(
      /'Web, Mobile, Chrome, and the managed-only Electron shell do not accept provider keys\.'/u,
    );
  });

  it('counts one route in the numbers band', () => {
    const page = collapsed('app/web/page.tsx');
    expect(page).toMatch(/value: '1', label: 'route: AGI managed cloud'/u);
  });

  it('never offers Local or BYOK as a route of the browser surface', () => {
    const page = collapsed('app/web/page.tsx');
    for (const [label, pattern] of [
      ['the browser has three routes', /routes: Local, BYOK, Cloud/u],
      ['the browser runs on your provider key', /providers on your key/u],
    ] as ReadonlyArray<readonly [string, RegExp]>) {
      expect(pattern.test(page), `page still claims: ${label}`).toBe(false);
    }
  });
});

describe('/web, the served-by label is stated where the code renders it', () => {
  it('renders the answering model inside the message actions menu', () => {
    const bubble = collapsed('features/chat/components/messages/MessageBubble.tsx');
    expect(bubble).toMatch(/const answeredByModelId = !isUser \?/u);
    expect(bubble).toMatch(
      /<DropdownMenuLabel[\s\S]{0,900}\{answeredByLabel && \( <span className="block truncate">\{answeredByLabel\}<\/span> \)\}/u,
    );
  });

  it('gates the inline receipt line on Auto having moved off the pin', () => {
    const bubble = collapsed('features/chat/components/messages/MessageBubble.tsx');
    expect(bubble).toMatch(
      /\{!isUser && !message\.isStreaming && modelEscalation && \( <p data-testid="model-escalation-receipt"/u,
    );
  });

  it('names the actions menu and the condition the inline receipt has', () => {
    const page = collapsed('app/web/page.tsx');
    expect(page).toMatch(/names the model that answered it in its actions menu/u);
    expect(page).toMatch(/whenever Auto left the model you pinned/u);
  });

  it('never promises a receipt under every reply', () => {
    const page = collapsed('app/web/page.tsx');
    for (const [label, pattern] of [
      ['a served-by receipt under every reply', /served-by receipt under every reply/u],
      ['a receipt on every reply', /Receipt · on every reply/u],
      ['the reply itself names its route', /the reply names the route that served it/u],
    ] as ReadonlyArray<readonly [string, RegExp]>) {
      expect(pattern.test(page), `page still claims: ${label}`).toBe(false);
    }
  });
});

describe('/plugins, a declared pack is never given an install command', () => {
  it('builds an install command only from a published distribution', () => {
    const detail = collapsed('app/plugins/[id]/page.tsx');
    expect(detail).toMatch(/const installCommand = installable && entry\.distribution/u);
  });

  it('says a declared pack prints no command', () => {
    const page = collapsed('app/plugins/page.tsx');
    expect(page).toMatch(/prints none, because there is nothing published to install yet/u);
  });

  it('never sends a reader to a command a declared pack does not carry', () => {
    const page = collapsed('app/plugins/page.tsx');
    expect(
      /The rest are installed from the desktop app or the CLI with the command shown on the pack/u.test(
        page,
      ),
      'page still claims every non-web pack shows an install command',
    ).toBe(false);
  });
});

describe('/vscode-extension and /solutions keep VS Code unpublished', () => {
  it('has a complete extension in the tree, which is not the same as a published VSIX', () => {
    expect(repoText('apps', 'extension-vscode', 'src', 'utils', 'api.ts')).toMatch(
      /vscode\.SecretStorage/u,
    );
    expect(fileText('lib/marketing-constants.ts')).toMatch(/vscode: COMING_SOON_LABEL/u);
  });

  it('says plainly that no VSIX has been published', () => {
    expect(collapsed('app/vscode-extension/page.tsx')).toMatch(/No VSIX has been published yet/u);
  });

  it('never presents the preview build as the shipped thing', () => {
    expect(
      /Here's what works today/u.test(collapsed('app/vscode-extension/page.tsx')),
      'page still presents an unpublished preview as what works today',
    ).toBe(false);
  });

  it('keeps the solutions index honest about which half of AGI Code is released', () => {
    const page = collapsed('app/solutions/page.tsx');
    expect(page).toMatch(/The released agi binary, and the VS Code extension/u);
    expect(
      /The agi binary and the VS Code extension that spawns it over stdio/u.test(page),
      'solutions index still lists the unpublished extension as a route you can take today',
    ).toBe(false);
  });
});

/**
 * Pre-release claim audit, 2026-09-12: /changelog and /contact-sales.
 *
 * A changelog is the one page a reader trusts to be literal, so each entry is
 * pinned to the artefact that settles it. Three of them were not:
 *
 * - The 2026-09-05 entry repeated "a served-by receipt on every reply", the
 *   exact phrasing the /web guard above already bans. The label renders in the
 *   message actions menu.
 * - The CLI v1.0 entry advertised a Homebrew tap and a tested install.sh.
 *   siddharthanagula3/homebrew-tap is private, and install.sh refuses to
 *   install without SHA256SUMS plus its sigstore bundle, neither of which is
 *   published on v-cli-1.0.0 (five archives, nothing else).
 * - The desktop entry read "desktop with release signing". release-desktop.yml
 *   builds and verifies signatures; no published release carries one.
 *
 * And /contact-sales listed dedicated capacity among the shipped Enterprise
 * controls while /faq lists it among what is not built, and called retention
 * enforcement shipped when the owner has to turn it on.
 */

describe('/changelog, the served-by line names where the code renders it', () => {
  it('renders the answering model inside the message actions menu', () => {
    const bubble = collapsed('features/chat/components/messages/MessageBubble.tsx');
    expect(bubble).toMatch(/const answeredByModelId = !isUser \?/u);
    expect(bubble).toMatch(
      /<DropdownMenuLabel[\s\S]{0,900}\{answeredByLabel && \( <span className="block truncate">\{answeredByLabel\}<\/span> \)\}/u,
    );
  });

  it('dates the entry to the menu the label lives in', () => {
    expect(collapsed('lib/changelog-entries.ts')).toMatch(
      /the model that answered a reply named in that reply's actions menu/u,
    );
  });

  it('never re-announces a receipt under every reply', () => {
    const entries = collapsed('lib/changelog-entries.ts');
    for (const [label, pattern] of [
      ['a served-by receipt on every reply', /served-by receipt on every reply/u],
      ['a receipt under every reply', /receipt under every reply/u],
    ] as ReadonlyArray<readonly [string, RegExp]>) {
      expect(pattern.test(entries), `changelog still claims: ${label}`).toBe(false);
    }
  });
});

describe('/changelog, CLI v1.0 promises no install route the release cannot serve', () => {
  it('reads the provenance gate install.sh actually enforces', () => {
    const installer = repoText('scripts', 'install.sh');
    expect(installer).toMatch(/releases\/download\/\$\{version\}\/SHA256SUMS/u);
    expect(installer).toMatch(
      /Release signature metadata is missing; refusing to install unverified bytes/u,
    );
  });

  it('says why neither install route reaches that release', () => {
    const entries = collapsed('lib/changelog-entries.ts');
    expect(entries).toMatch(/the Homebrew tap repository is private/u);
    expect(entries).toMatch(
      /install\.sh refuses to install without the signed checksum manifest the release does not carry/u,
    );
  });

  it('never presents the tap or the installer as a route a reader can take', () => {
    const entries = collapsed('lib/changelog-entries.ts');
    for (const [label, pattern] of [
      ['the Homebrew tap is auto-generated', /Homebrew tap auto-generated/u],
      ['install.sh is tested', /install\.sh tested/u],
    ] as ReadonlyArray<readonly [string, RegExp]>) {
      expect(pattern.test(entries), `changelog still claims: ${label}`).toBe(false);
    }
  });
});

describe('/changelog, desktop signing is a pipeline and is dated as one', () => {
  it('has a workflow that builds and verifies an updater signature', () => {
    const workflow = repoText('.github', 'workflows', 'release-desktop.yml');
    expect(workflow).toMatch(/target\/release\/bundle\/appimage\/\*\.AppImage\.sig/u);
  });

  it('states that no signed installer has been published from it', () => {
    const entries = collapsed('lib/changelog-entries.ts');
    expect(entries).toMatch(/No signed installer has been published from it yet/u);
    expect(entries).toMatch(/\.AppImage, \.deb and \.rpm assets and no signature/u);
  });

  it('never dates release signing as a shipped desktop capability', () => {
    expect(
      /desktop with release signing/u.test(collapsed('lib/changelog-entries.ts')),
      'changelog still dates release signing as something the desktop shipped',
    ).toBe(false);
  });
});

describe('/contact-sales, capacity matches the pool Enterprise is actually given', () => {
  it('reads Enterprise off the same shared managed pool as every other plan', () => {
    const caps = collapsed('lib/billing/managed-usage-caps.ts');
    expect(caps).toMatch(
      /enterprise: \{ monthlyUnits: 0, weeklyUnits: 0, fiveHourUnits: 0, dailyUnits: 0, unlimited: true, \}/u,
    );
    expect(collapsed('app/faq/page.tsx')).toMatch(/What is NOT built: dedicated capacity/u);
  });

  it('says so on the page a buyer reads before the FAQ', () => {
    expect(collapsed('app/contact-sales/page.tsx')).toMatch(
      /Dedicated capacity is not built: every plan draws on the same managed pool/u,
    );
  });

  it('never lists dedicated capacity among the controls a contract turns on', () => {
    const page = collapsed('app/contact-sales/page.tsx');
    for (const [label, pattern] of [
      [
        'dedicated capacity is handled under contract',
        /dedicated capacity is handled under contract/u,
      ],
      ['capacity is reserved for the org', /reserved capacity/iu],
    ] as ReadonlyArray<readonly [string, RegExp]>) {
      expect(pattern.test(page), `page still claims: ${label}`).toBe(false);
    }
  });
});

describe('/contact-sales, retention enforcement is named as the opt-in it is', () => {
  it('reads the opt-in the enterprise page already states', () => {
    expect(collapsed('app/enterprise/page.tsx')).toMatch(
      /decides whether it is enforced; until enforcement is on, the window is recorded, nothing is deleted/u,
    );
  });

  it('carries the same condition into the sales copy', () => {
    expect(collapsed('app/contact-sales/page.tsx')).toMatch(
      /per-organization retention windows and legal holds are shipped, with enforcement off until your owner turns it on/u,
    );
  });

  it('never ships retention enforcement as unconditional', () => {
    expect(
      /retention windows with enforcement and legal holds are shipped/u.test(
        collapsed('app/contact-sales/page.tsx'),
      ),
      'page still ships retention enforcement as unconditional',
    ).toBe(false);
  });
});
