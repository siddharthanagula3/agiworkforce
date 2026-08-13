import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// The Desktop Vitest project transforms this suite through its browser-like
// module environment, where `import.meta.url` is not guaranteed to use the
// `file:` scheme accepted by `readFileSync`. Vitest runs this package with
// `apps/desktop` as cwd, which is also the owner boundary for both paths.
const builderConfig = readFileSync(resolve(process.cwd(), 'electron-builder.yml'), 'utf8');
const releaseWorkflow = readFileSync(
  resolve(process.cwd(), '../../.github/workflows/release-desktop-cloud.yml'),
  'utf8',
);

describe('Electron cloud release source guards', () => {
  it('registers the packaged cloud deep-link protocol', () => {
    expect(builderConfig).toMatch(/protocols:[\s\S]*schemes:[\s\S]*agiworkforce-cloud/);
  });

  it('ships only the supported signed DMG path, without a fictional updater feed', () => {
    expect(builderConfig).not.toMatch(/api\/releases\/electron\/mac/);
    expect(builderConfig).not.toMatch(/target:\s*zip/);
    expect(builderConfig).not.toMatch(/^publish:/m);
    expect(releaseWorkflow).not.toMatch(/latest-mac\.yml|"\$out"\/\*\.zip/);
  });

  it('pins every downstream checkout to the validated release tag', () => {
    const downstream = releaseWorkflow.slice(releaseWorkflow.indexOf('\n  validate:'));
    expect(downstream.match(/uses:\s*actions\/checkout@v6/g)).toHaveLength(2);
    expect(
      downstream.match(/ref:\s*\$\{\{ needs\.prepare-release\.outputs\.tag \}\}/g),
    ).toHaveLength(2);
    expect(releaseWorkflow).toMatch(/refs\/tags\/\$\{TAG\}\^\{commit\}/);
  });

  it('keeps no-checkout publication jobs repository-scoped and cleans every orphan draft', () => {
    const publishSection = releaseWorkflow.slice(
      releaseWorkflow.indexOf('\n  publish-release:'),
      releaseWorkflow.indexOf('\n  cleanup-on-failure:'),
    );
    const cleanupSection = releaseWorkflow.slice(
      releaseWorkflow.indexOf('\n  cleanup-on-failure:'),
    );

    expect(publishSection).not.toMatch(/actions\/checkout/);
    expect(publishSection).toMatch(/GH_REPO:\s*\$\{\{ github\.repository \}\}/);
    expect(cleanupSection).not.toMatch(/actions\/checkout/);
    expect(cleanupSection).toMatch(/GH_REPO:\s*\$\{\{ github\.repository \}\}/);
    expect(cleanupSection).toContain(
      "always() && needs.prepare-release.result == 'success' && needs.publish-release.result != 'success'",
    );
  });
});
