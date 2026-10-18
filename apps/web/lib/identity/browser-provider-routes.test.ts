import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { needsBrowserIdentityProvider, routeNeedsBrowserIdentity } from './browser-provider-routes';

const APP_ROOT = join(__dirname, '..', '..', 'app');
const SKIPPED_DIRECTORIES = new Set(['api', '__tests__']);
const SESSION_READER = /from '(?:@\/lib\/identity\/client|@clerk\/nextjs)'/u;
const DYNAMIC_SEGMENT_SAMPLE = 'sample';

function appSources(directory: string, found: string[] = []): string[] {
  for (const entry of readdirSync(directory)) {
    const full = join(directory, entry);
    if (statSync(full).isDirectory()) {
      if (!SKIPPED_DIRECTORIES.has(entry)) appSources(full, found);
      continue;
    }
    if (/\.tsx?$/u.test(entry) && !/\.(test|spec)\.tsx?$/u.test(entry)) found.push(full);
  }
  return found;
}

function routeOf(file: string): string {
  const segments = relative(APP_ROOT, file)
    .split(sep)
    .slice(0, -1)
    .filter((segment) => !(segment.startsWith('(') && segment.endsWith(')')))
    .map((segment) => (segment.startsWith('[') ? DYNAMIC_SEGMENT_SAMPLE : segment));
  return `/${segments.join('/')}`;
}

describe('browser identity provider routes', () => {
  it.each([
    '/chat',
    '/chat/session-1',
    '/settings/general',
    '/workspace/people',
    '/login',
    '/signup/complete',
    '/auth/device',
    '/apps',
    '/connectors/mcp-directory',
    '/gallery',
    '/invite',
    '/plugins/example',
    '/pricing',
    '/pricing?seats=5#pricing-team-title',
    '/refund-policy',
    '/refund-policy/',
    '/refund-policy#request',
    '/skills',
    '/slack/link',
    '/slack/link?token=link-code',
  ])('mounts identity for %s', (pathname) => {
    expect(needsBrowserIdentityProvider(pathname)).toBe(true);
  });

  it.each(['/', '/terms', '/features/ai-chat', '/cookies', '/about'])(
    'keeps identity out of %s',
    (pathname) => {
      expect(needsBrowserIdentityProvider(pathname)).toBe(false);
    },
  );

  it('matches whole route segments rather than lookalike prefixes', () => {
    expect(needsBrowserIdentityProvider('/chatty')).toBe(false);
    expect(needsBrowserIdentityProvider('/pluginshop')).toBe(false);
    expect(needsBrowserIdentityProvider('/pricing-history')).toBe(false);
    expect(needsBrowserIdentityProvider('/refund-policy-history')).toBe(false);
    expect(needsBrowserIdentityProvider('/shared-artifact-history')).toBe(false);
    expect(needsBrowserIdentityProvider('/slack/linkage')).toBe(false);
    expect(needsBrowserIdentityProvider('/slack')).toBe(false);
  });

  it('mounts identity for the rendered Slack account-link route behind a rewrite', () => {
    expect(routeNeedsBrowserIdentity('/', ['(public)', 'slack', 'link'])).toBe(true);
  });

  it('mounts identity for the rendered refund request route behind a rewrite', () => {
    expect(routeNeedsBrowserIdentity('/', ['(public)', 'refund-policy'])).toBe(true);
  });

  it('mounts identity for a published artifact viewer that reads the session', () => {
    const path = `/shared-artifact/${'a'.repeat(24)}`;
    expect(needsBrowserIdentityProvider(path)).toBe(true);
    expect(needsBrowserIdentityProvider(`${path}/?view=source#main-content`)).toBe(true);
  });

  it('mounts identity for the rendered published artifact route behind a rewrite', () => {
    expect(routeNeedsBrowserIdentity('/', ['shared-artifact', 'a'.repeat(24)])).toBe(true);
  });

  it('mounts identity on every route whose own files read the session', () => {
    const readers = appSources(APP_ROOT).filter((file) =>
      SESSION_READER.test(readFileSync(file, 'utf8')),
    );
    expect(readers.length).toBeGreaterThan(0);

    const unmounted = readers
      .filter((file) => !needsBrowserIdentityProvider(routeOf(file)))
      .map((file) => `${relative(APP_ROOT, file)} renders at ${routeOf(file)}`);

    expect(unmounted, `these read the session where no provider is mounted`).toEqual([]);
  });
});
