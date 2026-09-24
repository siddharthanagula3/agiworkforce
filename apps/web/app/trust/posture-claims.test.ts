import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ledgerRows } from '../../../../scripts/check-trust-claims.mjs';

vi.mock('@clerk/nextjs/server', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  createRouteMatcher: () => () => false,
  clerkMiddleware:
    (handler: (auth: unknown, request: NextRequest, event: unknown) => Response) =>
    (request: NextRequest, event: unknown) =>
      handler({}, request, event),
}));

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const WEB_ROOT = path.join(REPO_ROOT, 'apps', 'web');
const TRUST = 'apps/web/app/trust/page.tsx';
const SECURITY = 'apps/web/app/security/page.tsx';

function repoText(relative: string): string {
  return readFileSync(path.join(REPO_ROOT, relative), 'utf8');
}

function row(page: string, label: string): string {
  const found = ledgerRows(repoText(page)).find((entry) => entry.label === label);
  expect(found, `${page} publishes no row "${label}"`).toBeDefined();
  return found?.value ?? '';
}

const workflows = readdirSync(path.join(REPO_ROOT, '.github', 'workflows'))
  .filter((name) => /\.ya?ml$/u.test(name))
  .map((name) => ({ name, text: repoText(`.github/workflows/${name}`) }));

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { recursive: true, encoding: 'utf8' })
    .filter((entry) => /\.tsx?$/u.test(entry) && !/(__tests__|\.test\.|\.spec\.)/u.test(entry))
    .map((entry) => path.join(directory, entry));
}

describe('/trust release signing names the pipeline that ships the desktop app', () => {
  const workflow = repoText('.github/workflows/release-desktop-cloud.yml');

  it('signs and notarizes each Mac architecture and verifies both before anything is uploaded', () => {
    const credentials = workflow.indexOf('Require Apple signing and notarization credentials');
    const build = workflow.indexOf('electron-builder --mac --arm64 --x64');
    const verify = workflow.indexOf('xcrun stapler validate');
    const upload = workflow.indexOf('gh release upload');

    expect(credentials).toBeGreaterThan(-1);
    expect(build).toBeGreaterThan(credentials);
    expect(verify).toBeGreaterThan(build);
    expect(upload).toBeGreaterThan(verify);

    const text = row(TRUST, 'Release signing');
    expect(text).toContain('a signed and notarized disk image for each Mac architecture');
    expect(text).toContain('before anything is uploaded');
  });

  it('builds the desktop app for no platform but macOS, so the row claims no Windows signing', () => {
    const windowsBuilds = workflows
      .filter(({ text }) => /electron-builder[^\n]*(--win\b|--windows\b|\s-w\b)/u.test(text))
      .map(({ name }) => name);
    expect(windowsBuilds).toEqual([]);

    const text = row(TRUST, 'Release signing');
    expect(text).toContain('There is no Windows build of the desktop app');
    expect(text).not.toMatch(/Trusted Signing|universal disk image/u);
  });
});

describe('/trust continuity rows name the restore drill that is scheduled', () => {
  it('runs the host-neutral drill on a weekly schedule', () => {
    const drill = repoText('.github/workflows/db-restore-drill.yml');
    expect(drill).toMatch(/schedule:\s*\n\s*- cron: '\d+ \d+ \* \* \d'/u);
    expect(drill).toContain('node scripts/db-restore-drill-logical.mjs');
  });

  it('runs the point-in-time drill against the real database from no workflow', () => {
    const scheduled = workflows
      .filter(({ text }) => /scripts\/db-restore-drill\.mjs/u.test(text))
      .map(({ name }) => name);
    expect(scheduled).toEqual([]);
  });

  it('says both, and never that no restore test is scheduled at all', () => {
    const posture = row(TRUST, 'Business continuity evidence');
    const evidence = row(TRUST, 'Business continuity and disaster recovery');

    expect(posture).toContain('the host-neutral one runs every week');
    expect(posture).toContain(
      'The point-in-time drill against the real database is run by a human',
    );
    for (const text of [posture, evidence]) {
      expect(text).toContain('no scheduled restore test against the production database');
      expect(text).not.toMatch(/no scheduled restore test(?! against the production database)/u);
    }
  });
});

describe('the connector call log holds what /trust and /security say it holds', () => {
  const PUBLISHED_FIELDS = ['connector_id', 'tool_name', 'occurred_at', 'outcome'];
  const BOOKKEEPING = ['id', 'user_id', 'organization_id', 'duration_ms', 'surface'];

  function loggedColumns(): string[] {
    const migrations = path.join(WEB_ROOT, 'db', 'neon');
    const columns: string[] = [];
    for (const name of readdirSync(migrations).filter((entry) => /^\d+_.*\.sql$/u.test(entry))) {
      if (name.endsWith('.down.sql')) continue;
      const sql = readFileSync(path.join(migrations, name), 'utf8');
      const table =
        /create table if not exists public\.connector_call_events \(([\s\S]*?)\n\);/iu.exec(sql);
      if (table?.[1]) {
        for (const line of table[1].split('\n')) {
          const column = /^\s{2}([a-z_]+)\s/u.exec(line)?.[1];
          if (column) columns.push(column);
        }
      }
      for (const added of sql.matchAll(
        /alter table (?:if exists )?(?:public\.)?connector_call_events\s+add column (?:if not exists )?([a-z_]+)/giu,
      )) {
        columns.push(added[1] ?? '');
      }
    }
    return columns;
  }

  it('keeps the connector call log to the connector, the tool, the time and the outcome', () => {
    const columns = loggedColumns();
    for (const field of PUBLISHED_FIELDS) expect(columns).toContain(field);
    expect(
      columns.filter((column) => ![...PUBLISHED_FIELDS, ...BOOKKEEPING].includes(column)),
    ).toEqual([]);
  });

  it('is written from the connector tool path alone, so built-in tool calls never reach it', () => {
    const writers = [
      ...sourceFiles(path.join(WEB_ROOT, 'lib')),
      ...sourceFiles(path.join(WEB_ROOT, 'app')),
      ...sourceFiles(path.join(WEB_ROOT, 'features')),
    ]
      .filter((file) => /\brecordConnectorCallOutcome\(/u.test(readFileSync(file, 'utf8')))
      .map((file) => path.relative(WEB_ROOT, file))
      .filter((file) => file !== path.join('lib', 'services', 'connector-call-log-service.ts'))
      .sort();
    expect(writers).toEqual([
      path.join('lib', 'connectors', 'health.ts'),
      path.join('lib', 'user-connector-tools.ts'),
    ]);
  });

  it('is described the same way on /trust and /security', () => {
    const trust = row(TRUST, 'Security event logging');
    const security = row(SECURITY, 'What it does not record');

    for (const text of [trust, security]) {
      expect(text).toContain('never the arguments or the result');
      expect(text).not.toMatch(/no hosted per-tool|no hosted, user-visible journal/u);
    }
    expect(trust).toContain('Calls to built-in tools are not in that log');
    expect(security).toContain('There is no hosted journal of built-in tool calls');
  });
});

describe('/trust content security row matches the policy the proxy sends', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('refuses inline script everywhere and permits inline style, the documented exemption', async () => {
    vi.stubEnv('AGI_BLOCK_EEA_TRAFFIC', '1');
    const { proxy } = await import('../../proxy');

    const response = await proxy(
      new NextRequest(
        new Request('https://agiworkforce.com/pricing', {
          headers: { 'x-vercel-ip-country': 'DE' },
        }),
      ),
      {} as never,
    );
    const policy = response?.headers.get('Content-Security-Policy') ?? '';
    const directive = (name: string) => new RegExp(`${name} ([^;]+)`, 'u').exec(policy)?.[1] ?? '';

    expect(directive('script-src')).toMatch(/'nonce-[^']+'/u);
    expect(directive('script-src')).not.toContain("'unsafe-inline'");
    expect(directive('object-src')).toBe("'none'");
    expect(directive('frame-ancestors')).toBe("'none'");
    expect(directive('style-src')).toContain("'unsafe-inline'");

    const text = row(TRUST, 'Content Security Policy');
    expect(text).toContain("no 'unsafe-inline' in script-src");
    expect(text).toContain('Inline styles are still permitted');
  });
});
