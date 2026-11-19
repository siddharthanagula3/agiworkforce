import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const WEB_APP = join(__dirname, '..', '..');
const REPO_ROOT = join(WEB_APP, '..', '..', '..');
const RELAY_SRC = join(REPO_ROOT, 'services', 'signaling-server', 'src');

function read(...segments: string[]): string {
  return readFileSync(join(...segments), 'utf8');
}

function collapsed(source: string): string {
  return source.replace(/\s+/gu, ' ').replace(/&rsquo;/gu, '’');
}

function constantMs(source: string, name: string): number {
  const expression = new RegExp(`export const ${name} = ([\\d_ *]+);`, 'u').exec(source)?.[1];
  expect(expression, `${name} not found`).toBeDefined();
  return expression!
    .split('*')
    .map((factor) => Number(factor.trim().replace(/_/gu, '')))
    .reduce((product, factor) => product * factor, 1);
}

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

const privacy = collapsed(read(WEB_APP, 'privacy', 'page.tsx'));
const relayConstants = read(RELAY_SRC, 'constants.ts');
const relay = collapsed(read(RELAY_SRC, 'index.ts'));
const relayStore = read(RELAY_SRC, 'db.ts');
const erasure = read(WEB_APP, '..', 'lib', 'server', 'account-erasure.ts');
const exportRoute = read(WEB_APP, 'api', 'user', 'export', 'route.ts');

describe('/privacy, the Remote Control pairing record', () => {
  it('names what the pairing record holds', () => {
    expect(privacy).toContain(
      'a pairing record holding the pairing code, your account and the workspace it was made in, the paired device identifiers and a rotating connection credential',
    );
  });

  it('states the seven-day ceiling the relay enforces', () => {
    expect(constantMs(relayConstants, 'PAIRING_MAX_LIFETIME_MS_DEFAULT')).toBe(7 * DAY_MS);
    expect(relay).toContain('session.createdAt + pairingMaxLifetimeMs');
    expect(privacy).toContain('while the pairing lasts, at most seven days from when it was made');
  });

  it('states the hour the expiry sweep waits before deleting', () => {
    expect(constantMs(relayConstants, 'EXPIRED_PAIRING_PRUNE_GRACE_MS')).toBe(HOUR_MS);
    expect(relayStore).toMatch(
      /DELETE FROM signaling_sessions WHERE code IN \(SELECT code FROM signaling_sessions WHERE expires_at < \$1/u,
    );
    expect(privacy).toContain('its sweep deletes it about an hour after the pairing expires');
  });

  it('says ending the pairing deletes the record, because the relay deletes the row then', () => {
    expect(relay).toMatch(
      /async function handleEndPairing[\s\S]*?await deleteStoredPairing\(client\.code\)/u,
    );
    expect(relayStore).toContain("'DELETE FROM signaling_sessions WHERE code = $1'");
    expect(privacy).toContain('deletes the pairing record when either device ends the pairing');
  });

  it('says account deletion and the export treat it as the code does', () => {
    expect(erasure).toContain(
      "{ table: 'signaling_sessions', column: 'metadata', jsonKey: 'userId' }",
    );
    expect(exportRoute).toMatch(/UNEXPORTED_USER_TABLES[\s\S]*?signaling_sessions:/u);
    expect(privacy).toContain('Deleting your account deletes it too.');
    expect(privacy).toContain('left out of your data export because it holds a live credential');
  });
});
