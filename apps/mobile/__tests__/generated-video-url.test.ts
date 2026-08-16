import { resolveGeneratedVideoUri } from '../src/features/video/services/videoUri';
import { API_URL } from '../lib/constants';

/**
 * The server hands back a durable video as an auth-gated, workspace-relative
 * path. Passed straight to the OS browser it opened nothing — the external-URL
 * allowlist refuses a relative URL — so a completed video was untappable.
 */

const DURABLE = '/api/files/2f4a1c8e-9b3d-4f11-8a52-7c6e0d1b93af';

describe('resolveGeneratedVideoUri', () => {
  it('makes a durable path absolute against the API origin', () => {
    expect(resolveGeneratedVideoUri(DURABLE)).toBe(`${API_URL.replace(/\/+$/, '')}${DURABLE}`);
  });

  it('leaves an already-absolute provider URL alone', () => {
    const direct = 'https://cdn.example.com/renders/clip.mp4';
    expect(resolveGeneratedVideoUri(direct)).toBe(direct);
  });

  it.each([
    ['', 'empty'],
    ['   ', 'blank'],
    ['/api/files/not-a-uuid', 'not a durable id'],
    ['/etc/passwd', 'not a files path'],
    ['javascript:alert(1)', 'a script scheme'],
    ['//evil.example/clip.mp4', 'protocol-relative'],
  ])('refuses %s (%s)', (candidate) => {
    expect(resolveGeneratedVideoUri(candidate)).toBeNull();
  });

  it('never returns a relative address, which is what made the tap a no-op', () => {
    const resolved = resolveGeneratedVideoUri(DURABLE);
    expect(resolved).not.toBeNull();
    expect(resolved!.startsWith('http')).toBe(true);
  });
});
