import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The desktop updater shipped dead on every platform for the whole 1.2.0 line, and
 * every existing test over this route passed the entire time. They passed because
 * they hand-wrote `target: 'linux-x86_64'` — a string the real client never sent.
 * The client asked for `/api/releases/darwin/1.2.0`; the route only knows
 * `darwin-aarch64`; it 204'd forever.
 *
 * A route test cannot catch that on its own: the route was always correct. The bug
 * lived in the URL template on the other side of the contract. So this file asserts
 * both halves against each other and derives the client's string the way the plugin
 * does, instead of restating what the route already believes.
 */

const REPO_ROOT = path.resolve(__dirname, '../../../../../..');
const TAURI_CONF = path.join(REPO_ROOT, 'apps/desktop/src-tauri/tauri.conf.json');
const ROUTE = path.join(REPO_ROOT, 'apps/web/app/api/releases/[target]/[version]/route.ts');

/**
 * tauri-plugin-updater substitutes `{{target}}` with `updater_os()`, which returns a
 * bare OS name, and `{{arch}}` with `std::env::consts::ARCH`. The combined
 * `{target}-{arch}` form exists in the plugin but is NOT what the URL path
 * interpolation calls, which is the entire bug — so this mirrors the substitution
 * rather than the convenience function.
 */
const UPDATER_OS = ['darwin', 'windows', 'linux'] as const;
const UPDATER_ARCH = ['aarch64', 'x86_64'] as const;

/**
 * The os/arch pairs a shipped installer actually exists for. Windows and Linux are
 * built x86_64-only, so an arm64 client on either legitimately has nothing to be
 * offered and a 204 is the correct answer rather than a routing gap. Listed
 * explicitly so that stays a decision on the record instead of an accident, and so
 * adding an arm64 build fails this file until the route learns the target.
 */
const SHIPPED: ReadonlyArray<
  readonly [(typeof UPDATER_OS)[number], (typeof UPDATER_ARCH)[number]]
> = [
  ['darwin', 'aarch64'],
  ['darwin', 'x86_64'],
  ['windows', 'x86_64'],
  ['linux', 'x86_64'],
];

function endpointTemplates(): string[] {
  const conf = JSON.parse(readFileSync(TAURI_CONF, 'utf8')) as {
    plugins?: { updater?: { endpoints?: string[] } };
  };
  return conf.plugins?.updater?.endpoints ?? [];
}

function routeTargetKeys(): string[] {
  const source = readFileSync(ROUTE, 'utf8');
  const table = source.match(/TARGET_PLATFORMS[^{]*\{([\s\S]*?)\}/u);
  if (!table) throw new Error('TARGET_PLATFORMS table not found in the release route');
  return [...table[1].matchAll(/'([^']+)'\s*:/gu)].map((match) => match[1]);
}

function renderTarget(template: string, os: string, arch: string): string {
  const url = template.replace('{{target}}', os).replace('{{arch}}', arch);
  const afterReleases = url.split('/api/releases/')[1];
  if (!afterReleases) throw new Error(`endpoint does not address the releases route: ${template}`);
  return afterReleases.split('/')[0]!;
}

describe('desktop updater target contract', () => {
  it('addresses the release route at all', () => {
    const templates = endpointTemplates();
    expect(templates.length).toBeGreaterThan(0);
    for (const template of templates) {
      expect(template).toContain('/api/releases/');
    }
  });

  it('sends a target the route recognises, for every platform an installer exists for', () => {
    const templates = endpointTemplates();
    const known = new Set(routeTargetKeys());

    const unrecognised: string[] = [];
    for (const template of templates) {
      for (const [os, arch] of SHIPPED) {
        const target = renderTarget(template, os, arch);
        if (!known.has(target)) unrecognised.push(`${os}/${arch} \u2192 ${target}`);
      }
    }

    expect(unrecognised).toEqual([]);
  });

  it('answers 204 rather than routing for an arch with no installer', () => {
    const templates = endpointTemplates();
    const known = new Set(routeTargetKeys());
    const shipped = new Set(SHIPPED.map(([os, arch]) => `${os}/${arch}`));

    for (const template of templates) {
      for (const os of UPDATER_OS) {
        for (const arch of UPDATER_ARCH) {
          if (shipped.has(`${os}/${arch}`)) continue;
          expect(known.has(renderTarget(template, os, arch))).toBe(false);
        }
      }
    }
  });

  it('interpolates arch, because omitting it is what broke every client', () => {
    for (const template of endpointTemplates()) {
      expect(template).toContain('{{target}}');
      expect(template).toContain('{{arch}}');
    }
  });

  it('records that a bare os name is not a valid target', () => {
    const known = new Set(routeTargetKeys());
    for (const os of UPDATER_OS) {
      expect(known.has(os)).toBe(false);
    }
  });
});

/**
 * The selector half of the same contract. These shapes are what the build pipeline
 * actually produces, and every one of them matched nothing before this was fixed:
 * macOS builds a single universal artifact whose name carries no arch token, and
 * Windows emits a bare NSIS `.exe` because `createUpdaterArtifacts` is `true`
 * rather than `"v1Compatible"`.
 */
describe('updater asset selection matches what the pipeline builds', () => {
  const asset = (name: string) => ({
    name,
    browserDownloadUrl: `https://github.com/org/repo/releases/download/v1.3.0/${name}`,
    size: 1,
  });

  const releaseWith = (...names: string[]) =>
    ({
      id: 1,
      tagName: 'v-desktop-1.3.0',
      version: '1.3.0',
      notes: '',
      publishedAt: '2026-08-27T00:00:00Z',
      assets: names.flatMap((name) => [asset(name), asset(`${name}.sig`)]),
    }) as never;

  it('accepts the untagged universal macOS archive for both darwin targets', async () => {
    const { selectSignedDesktopUpdaterAsset } = await import(
      '@/lib/releases/github-desktop-releases'
    );
    const release = releaseWith('AGI.app.tar.gz');

    expect(selectSignedDesktopUpdaterAsset(release, 'darwin-aarch64')?.binary.name).toBe(
      'AGI.app.tar.gz',
    );
    expect(selectSignedDesktopUpdaterAsset(release, 'darwin-x86_64')?.binary.name).toBe(
      'AGI.app.tar.gz',
    );
  });

  it('keeps darwin-universal strict, so an untagged archive is not mistaken for it', async () => {
    const { selectSignedDesktopUpdaterAsset } = await import(
      '@/lib/releases/github-desktop-releases'
    );
    expect(
      selectSignedDesktopUpdaterAsset(releaseWith('AGI.app.tar.gz'), 'darwin-universal'),
    ).toBeNull();
  });

  it('accepts the v2 NSIS installer and no longer requires the v1 zip', async () => {
    const { selectSignedDesktopUpdaterAsset } = await import(
      '@/lib/releases/github-desktop-releases'
    );
    expect(
      selectSignedDesktopUpdaterAsset(releaseWith('AGI_1.3.0_x64-setup.exe'), 'windows-x86_64')
        ?.binary.name,
    ).toBe('AGI_1.3.0_x64-setup.exe');
  });

  it('returns null when a binary has no signature sibling', async () => {
    const { selectSignedDesktopUpdaterAsset } = await import(
      '@/lib/releases/github-desktop-releases'
    );
    const unsigned = {
      id: 1,
      tagName: 'v-desktop-1.3.0',
      version: '1.3.0',
      notes: '',
      publishedAt: '2026-08-27T00:00:00Z',
      assets: [asset('AGI.app.tar.gz')],
    } as never;
    expect(selectSignedDesktopUpdaterAsset(unsigned, 'darwin-aarch64')).toBeNull();
  });
});
