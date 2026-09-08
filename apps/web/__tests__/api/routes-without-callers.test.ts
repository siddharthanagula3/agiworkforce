import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const WEB_ROOT = join(__dirname, '..', '..');
const REPO_ROOT = join(WEB_ROOT, '..', '..');
const API_ROOT = join(WEB_ROOT, 'app', 'api');

const SKIP = /^(?:\.|node_modules$|\.next$|dist$|build$|out$|coverage$|target$|__mocks__$)/;
const SOURCE = /\.(?:tsx?|mts|mjs|jsx?|rs|swift|kt|json|html|ya?ml)$/;
const TEST_FILE = /\.(?:test|spec)\.[tj]sx?$/;

/**
 * A route nothing calls is either a mistake or a decision. This pins the
 * decisions so the set cannot regrow quietly: adding a route with no caller
 * fails here until someone writes down why it has none.
 *
 * The search under-reports on purpose. A caller may write the whole path or
 * build it from a constant that stops at the last static segment, so both
 * count, and a route reached either way is treated as called.
 */
const CALLERLESS: ReadonlyArray<{ url: string; why: string }> = [
  // Retired endpoints that answer 410 rather than 404, so a client built
  // against an older build is told the endpoint is gone instead of guessing.
  { url: '/api/agents/collaboration', why: 'retired, answers 410' },
  { url: '/api/agents/communication', why: 'retired, answers 410' },
  { url: '/api/agents/communication/[id]', why: 'retired, answers 410' },
  { url: '/api/agents/execute', why: 'retired, answers 410, pinned by agents-execute.test.ts' },
  { url: '/api/agents/log-message', why: 'retired, answers 410' },
  {
    url: '/api/agents/session',
    why: 'retired, answers 410, pinned by agents-session-retired.test.ts',
  },
  { url: '/api/agents/tool-executions', why: 'retired, answers 410' },
  { url: '/api/agents/tools', why: 'retired, answers 410' },
  { url: '/api/agents/tools/[id]', why: 'retired, answers 410' },
  { url: '/api/mission', why: 'retired, answers 410' },
  { url: '/api/usage/deduct', why: 'retired, answers 410' },

  // Called by someone else's server, which is the whole point of the endpoint.
  { url: '/api/scim/v2/Groups', why: 'the customer identity provider calls this' },
  { url: '/api/scim/v2/Groups/[groupId]', why: 'the customer identity provider calls this' },
  { url: '/api/scim/v2/ResourceTypes', why: 'SCIM discovery, read by the identity provider' },
  { url: '/api/scim/v2/Schemas', why: 'SCIM discovery, read by the identity provider' },
  {
    url: '/api/scim/v2/ServiceProviderConfig',
    why: 'SCIM discovery, read by the identity provider',
  },
  { url: '/api/scim/v2/Users', why: 'the customer identity provider calls this' },
  { url: '/api/scim/v2/Users/[userId]', why: 'the customer identity provider calls this' },
  { url: '/api/mobile/iap/apple-notifications', why: 'the App Store server calls this' },
  { url: '/api/mobile/iap/google-notifications', why: 'the Play billing service calls this' },
  { url: '/api/github/webhook', why: 'GitHub delivers webhooks here' },
  { url: '/api/github/oauth/callback', why: 'GitHub redirects the user here after authorization' },

  // Another surface or the browser reaches these without naming the path in
  // committed source.
  { url: '/api/auth/desktop-token', why: 'the desktop app exchanges its token here' },
  { url: '/api/auth/set-token', why: 'paired with desktop-token, covered by b2-set-token.test.ts' },
  { url: '/api/auth/clear-token', why: 'the sign-out half of the set-token pair' },
  {
    url: '/api/uploads/chat-attachment/put',
    why: 'the browser PUTs to the signed url this issues',
  },
  { url: '/api/uploads/knowledge-file/put', why: 'the browser PUTs to the signed url this issues' },
  { url: '/api/interactive-cards/respond', why: 'an interactive card posts its response here' },
  { url: '/api/llm/v1/chat/completions/resume-input', why: 'a tool approval resumes a run here' },

  // Built this wave by another executor; their surfaces are still landing.
  { url: '/api/plugins/authored', why: 'plugins directory work in flight' },
  { url: '/api/plugins/installations', why: 'plugins directory work in flight' },
  { url: '/api/plugins/installations/[id]', why: 'plugins directory work in flight' },
  { url: '/api/plugins/marketplace-installations', why: 'plugins directory work in flight' },
  { url: '/api/plugins/marketplace-installations/[id]', why: 'plugins directory work in flight' },
  {
    url: '/api/plugins/marketplace-installations/[id]/settings',
    why: 'plugins directory work in flight',
  },
  { url: '/api/plugins/marketplaces', why: 'plugins directory work in flight' },
  { url: '/api/plugins/marketplaces/[id]', why: 'plugins directory work in flight' },
  { url: '/api/plugins/marketplaces/[id]/refresh', why: 'plugins directory work in flight' },
  { url: '/api/plugins/marketplaces/entries', why: 'plugins directory work in flight' },
  { url: '/api/plugins/uploads', why: 'plugins directory work in flight' },

  // Live handlers with no caller, kept for a stated reason. The other nine of
  // this group were deleted; each of these four is here because deleting it
  // would cost more than it saves.
  {
    url: '/api/releases/check',
    why: 'no caller, but one of its cases also covers the live nightly manifest route; removing it safely is its own change',
  },
  {
    url: '/api/settings/organization/deletion/cancel',
    why: 'no caller, but it cancels the deletion POST /api/settings/organization schedules; deleting the cancel and leaving the request is a regression',
  },
  {
    url: '/api/llm/v1/route/preview',
    why: 'no caller; routing is out of scope this wave under decision D-34',
  },
  {
    url: '/api/me/routing-preferences',
    why: 'no caller; WEB-ROUTE-ROUTING-PREFERENCE-PERSISTED-CALLER-01 owns it and routing is out of scope under D-34',
  },
];

function walk(dir: string, match: (name: string) => boolean, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP.test(entry.name)) walk(full, match, out);
    } else if (match(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

function routeUrls(): Array<{ url: string; segments: string[] }> {
  return walk(API_ROOT, (name) => name === 'route.ts' || name === 'route.tsx').map((file) => {
    const rel = relative(API_ROOT, file)
      .replace(/\/route\.tsx?$/, '')
      .split('\\')
      .join('/');
    return { url: `/api/${rel}`, segments: rel.split('/') };
  });
}

function callerCorpus(): string[] {
  const files: string[] = [];
  for (const root of ['apps', 'packages', 'services', 'infrastructure']) {
    try {
      walk(join(REPO_ROOT, root), (name) => SOURCE.test(name), files);
    } catch {
      // a surface that is not checked out here simply contributes no callers
    }
  }
  files.push(join(REPO_ROOT, 'vercel.json'));
  return files
    .filter((file) => {
      const rel = relative(REPO_ROOT, file).split('\\').join('/');
      return !rel.startsWith('apps/web/app/api/') && !TEST_FILE.test(rel);
    })
    .map((file) => {
      try {
        return readFileSync(file, 'utf8');
      } catch {
        return '';
      }
    });
}

function callerlessUrls(): string[] {
  const corpus = callerCorpus();
  return routeUrls()
    .filter(({ url, segments }) => {
      const literal = url.replace(/\[\.\.\.[^\]]+\]/g, '.+').replace(/\[[^\]]+\]/g, '[^"\'`\\s]+');
      const patterns = [new RegExp(literal.replace(/\//g, '\\/'))];
      const firstDynamic = segments.findIndex((segment) => segment.startsWith('['));
      if (firstDynamic > 0) {
        const prefix = `/api/${segments.slice(0, firstDynamic).join('/')}`;
        patterns.push(new RegExp(`${prefix.replace(/\//g, '\\/')}['"\`/]`));
      }
      return !corpus.some((text) => patterns.some((pattern) => pattern.test(text)));
    })
    .map(({ url }) => url)
    .sort();
}

describe('every api route either has a caller or a written reason', () => {
  const measured = callerlessUrls();
  const declared = new Set(CALLERLESS.map((entry) => entry.url));

  it('adds no route without a caller and without a reason', () => {
    const undeclared = measured.filter((url) => !declared.has(url));

    expect(
      undeclared,
      'give this route a caller, or add it to CALLERLESS with the reason it has none',
    ).toEqual([]);
  });

  it('keeps no reason for a route that now has a caller', () => {
    const found = new Set(measured);
    const stale = CALLERLESS.map((entry) => entry.url).filter((url) => !found.has(url));

    expect(stale, 'these have callers now, drop them from CALLERLESS').toEqual([]);
  });

  it('gives every declared route a reason worth reading', () => {
    for (const entry of CALLERLESS) {
      expect(entry.why.length, `${entry.url} needs a reason`).toBeGreaterThan(8);
    }
  });
});
