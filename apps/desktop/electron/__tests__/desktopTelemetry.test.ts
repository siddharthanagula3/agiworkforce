import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DESKTOP_TELEMETRY_CAUSES,
  DESKTOP_TELEMETRY_DOMAINS,
  DESKTOP_TELEMETRY_LOG_NAME,
  DESKTOP_TELEMETRY_OUTCOMES,
  createDesktopTelemetry,
  createTelemetryLogWriter,
  telemetryRecord,
  type DesktopRelease,
  type DesktopTelemetryDomain,
} from '../runtime/desktopTelemetry';

const RELEASE: DesktopRelease = {
  version: '3.4.5',
  channel: 'cloud',
  platform: 'darwin',
  arch: 'arm64',
};

function collector() {
  const lines: string[] = [];
  return { lines, write: (line: string) => lines.push(line) };
}

describe('what a shell event is allowed to say', () => {
  it('stamps every record with the build it came from', () => {
    const record = telemetryRecord(RELEASE, { domain: 'launch', outcome: 'ok' }, 0);
    expect(record).toMatchObject({
      version: '3.4.5',
      channel: 'cloud',
      platform: 'darwin',
      arch: 'arm64',
    });
  });

  it('refuses a domain, an outcome or a cause it has no meaning for', () => {
    expect(
      telemetryRecord(RELEASE, { domain: 'made_up' as DesktopTelemetryDomain, outcome: 'ok' }, 0),
    ).toBeNull();
    expect(
      telemetryRecord(
        RELEASE,
        { domain: 'launch', outcome: 'exploded' as (typeof DESKTOP_TELEMETRY_OUTCOMES)[number] },
        0,
      ),
    ).toBeNull();
    const withStrayCause = telemetryRecord(
      RELEASE,
      {
        domain: 'sync',
        outcome: 'failed',
        cause: '/Users/someone/Documents' as (typeof DESKTOP_TELEMETRY_CAUSES)[number],
      },
      0,
    );
    expect(withStrayCause).not.toBeNull();
    expect(withStrayCause).not.toHaveProperty('cause');
  });

  it('drops a duration that is negative, absent or longer than a day', () => {
    const tooLong = telemetryRecord(
      RELEASE,
      { domain: 'cloud_request', outcome: 'ok', durationMs: 25 * 60 * 60 * 1000 },
      0,
    );
    expect(tooLong).not.toHaveProperty('durationMs');
    expect(
      telemetryRecord(RELEASE, { domain: 'cloud_request', outcome: 'ok', durationMs: -1 }, 0),
    ).not.toHaveProperty('durationMs');
    expect(
      telemetryRecord(RELEASE, { domain: 'cloud_request', outcome: 'ok', durationMs: 120.6 }, 0),
    ).toMatchObject({ durationMs: 121 });
  });

  it('writes nothing a reader has to be trusted with', () => {
    const { lines, write } = collector();
    const telemetry = createDesktopTelemetry({ release: RELEASE, write });
    telemetry.record({ domain: 'sync', outcome: 'failed', cause: 'network' });
    const written = JSON.parse(lines[0] ?? '{}') as Record<string, unknown>;
    expect(Object.keys(written).sort()).toEqual(
      ['arch', 'at', 'cause', 'channel', 'domain', 'outcome', 'platform', 'version'].sort(),
    );
  });
});

describe('what the shell can say about its own run', () => {
  it('accounts for every domain, including the ones nothing touched', () => {
    const telemetry = createDesktopTelemetry({ release: RELEASE });
    expect(telemetry.diagnostics().domains.map((entry) => entry.domain)).toEqual([
      ...DESKTOP_TELEMETRY_DOMAINS,
    ]);
    expect(telemetry.diagnostics().domains.every((entry) => entry.health === 'idle')).toBe(true);
  });

  it('reports a domain that failed as degraded, and names it once', () => {
    const telemetry = createDesktopTelemetry({ release: RELEASE });
    telemetry.record({ domain: 'local_daemon', outcome: 'failed', cause: 'not_configured' });
    const report = telemetry.diagnostics();
    expect(report.unhealthy).toEqual(['local_daemon']);
    const daemon = report.domains.find((entry) => entry.domain === 'local_daemon');
    expect(daemon).toMatchObject({ failed: 1, health: 'degraded', lastCause: 'not_configured' });
  });

  it('stops calling a domain degraded once it works again', () => {
    const telemetry = createDesktopTelemetry({ release: RELEASE });
    telemetry.record({ domain: 'updater', outcome: 'failed', cause: 'network' });
    telemetry.record({ domain: 'updater', outcome: 'ok' });
    const updater = telemetry.diagnostics().domains.find((entry) => entry.domain === 'updater');
    expect(updater).toMatchObject({ failed: 1, ok: 1, health: 'healthy' });
    expect(telemetry.diagnostics().unhealthy).toEqual([]);
  });

  it('counts a crash the shell recovered from rather than losing it', () => {
    const telemetry = createDesktopTelemetry({ release: RELEASE });
    telemetry.record({ domain: 'crash', outcome: 'failed', cause: 'crashed' });
    telemetry.record({ domain: 'crash', outcome: 'failed', cause: 'out_of_memory' });
    expect(telemetry.diagnostics().domains.find((entry) => entry.domain === 'crash')).toMatchObject(
      { failed: 2, lastCause: 'out_of_memory' },
    );
  });
});

describe('the file the log folder holds', () => {
  it('appends one line per event and rotates rather than growing without limit', () => {
    const directory = mkdtempSync(join(tmpdir(), 'agi-telemetry-'));
    const write = createTelemetryLogWriter(directory, 400);
    const telemetry = createDesktopTelemetry({ release: RELEASE, write });
    for (let index = 0; index < 8; index += 1) {
      telemetry.record({ domain: 'cloud_request', outcome: 'ok' });
    }
    const path = join(directory, DESKTOP_TELEMETRY_LOG_NAME);
    expect(existsSync(`${path}.1`)).toBe(true);
    const current = readFileSync(path, 'utf8').trim().split('\n');
    expect(current.length).toBeLessThan(8);
    expect(JSON.parse(current[0] ?? '{}')).toMatchObject({
      domain: 'cloud_request',
      version: '3.4.5',
    });
  });

  it('keeps counting when the folder cannot be written', () => {
    const write = createTelemetryLogWriter('/dev/null/not-a-directory');
    const telemetry = createDesktopTelemetry({ release: RELEASE, write });
    expect(() => telemetry.record({ domain: 'launch', outcome: 'ok' })).not.toThrow();
    expect(
      telemetry.diagnostics().domains.find((entry) => entry.domain === 'launch'),
    ).toMatchObject({ ok: 1 });
  });
});
