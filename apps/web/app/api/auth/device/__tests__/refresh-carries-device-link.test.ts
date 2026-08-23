import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const routes = join(process.cwd(), 'app/api/auth/device');

function read(file: string): string {
  return readFileSync(join(routes, file), 'utf8');
}

// Rotation writes a new row per refresh. If it drops device_id, a device's
// credential becomes anonymous the first time it refreshes, and per-device
// unlink silently degrades to revoking nothing.
describe('device credentials stay attributable to the device that holds them', () => {
  it('records the device when the family is first issued', () => {
    const source = read('token/route.ts');
    const insert = source.slice(source.indexOf('INSERT INTO device_refresh_tokens'));
    expect(insert).toContain('device_id');
    expect(insert).toContain('device_name');
    expect(source).toContain('record.device_id');
  });

  it('carries the device forward on every rotation', () => {
    const source = read('refresh/route.ts');
    const insert = source.slice(source.indexOf('INSERT INTO device_refresh_tokens'));
    expect(insert).toContain('device_id');
    expect(source).toContain('current.device_id');
    expect(source).toMatch(/SELECT[\s\S]*t\.device_id/);
  });
});
