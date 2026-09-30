import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  PHASE_DEVELOPMENT_SERVER,
  PHASE_PRODUCTION_BUILD,
  PHASE_PRODUCTION_SERVER,
} from 'next/constants';
import { afterEach, describe, expect, it } from 'vitest';
import { measureRouteIsolation, writeRouteIsolationCounts } from './route-isolation-counts';

const temporaryRoots: string[] = [];

function fixtureRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'agi-route-isolation-'));
  temporaryRoots.push(root);
  mkdirSync(join(root, 'lib', 'legal'), { recursive: true });
  for (const [route, source] of [
    ['scoped', 'getUserScopedDb'],
    ['owner', 'getNeonDb'],
    ['mixed', 'getRlsCapableDb getStripeWebhookDb'],
    ['public', 'NextResponse.json'],
    ['__tests__/ignored', 'getNeonDb'],
  ]) {
    const directory = join(root, 'app', 'api', route!);
    mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, 'route.ts'), source!);
  }
  return root;
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('build-time route isolation counts', () => {
  it('counts mixed accessor routes as owner-connected and excludes tests', () => {
    expect(measureRouteIsolation(join(fixtureRoot(), 'app', 'api'))).toEqual({
      rlsScoped: 1,
      ownerConnection: 2,
      noDatabase: 1,
      databaseBacked: 3,
    });
  });

  it.each([PHASE_PRODUCTION_BUILD, PHASE_DEVELOPMENT_SERVER])(
    'emits measured counts in %s',
    (phase) => {
      const root = fixtureRoot();
      writeRouteIsolationCounts(phase, root);
      const contents = readFileSync(
        join(root, 'lib', 'legal', 'route-isolation.generated.json'),
        'utf8',
      );
      expect(JSON.parse(contents)).toEqual(measureRouteIsolation(join(root, 'app', 'api')));
    },
  );

  it('keeps the frozen artifact when production startup has no route source tree', () => {
    const root = fixtureRoot();
    writeRouteIsolationCounts(PHASE_PRODUCTION_BUILD, root);
    const output = join(root, 'lib', 'legal', 'route-isolation.generated.json');
    const before = readFileSync(output, 'utf8');
    rmSync(join(root, 'app'), { recursive: true });

    expect(() => writeRouteIsolationCounts(PHASE_PRODUCTION_SERVER, root)).not.toThrow();
    expect(readFileSync(output, 'utf8')).toBe(before);
  });

  it('fails generation rather than inventing counts without route sources', () => {
    const root = fixtureRoot();
    rmSync(join(root, 'app'), { recursive: true });

    expect(() => writeRouteIsolationCounts(PHASE_PRODUCTION_BUILD, root)).toThrow();
  });
});
