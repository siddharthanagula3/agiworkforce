import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const WEB_ROOT = join(__dirname, '..', '..');
const REPO_ROOT = join(WEB_ROOT, '..', '..');
const API_ROOT = join(WEB_ROOT, 'app', 'api');

const SKIP = /^(?:\.|node_modules$|\.next$|dist$|build$|out$|coverage$|target$|__mocks__$)/;
const SOURCE = /\.(?:tsx?|mts|mjs|jsx?|rs|swift|kt|json|html|ya?ml)$/;
const TEST_FILE = /\.(?:test|spec)\.[tj]sx?$/;
// A registry names a route by its file path, which is never a call to it.
const ROUTE_FILE_PATH = /app\/api\/[^\s'"`]*route\.tsx?/g;

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

  // Left over from the Tauri build, which is no longer the public desktop
  // (D-2026-09-15-04); nothing calls it, and it leaves with that build.
  { url: '/api/releases/latest/[platform]', why: 'Tauri latest-manifest lookup, no caller' },

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

  // Platform-admin procedures are deliberately API-only. They are used during
  // incidents and maintenance, not exposed as ordinary product controls.
  {
    url: '/api/admin/cost-operations',
    why: 'platform-admin incident report for cost loops and rollups with operator-supplied thresholds',
  },
  {
    url: '/api/admin/feature-flags/kill-switches',
    why: 'platform-admin emergency brake for model, provider and capability incidents',
  },
  {
    url: '/api/admin/feature-flags/stale',
    why: 'platform-admin maintenance operation for reviewed stale-flag cleanup',
  },
  {
    url: '/api/admin/support-access',
    why: 'two-operator break-glass procedure called from the production-access runbook',
  },

  // Authenticated protocol endpoints support API and cross-surface clients.
  // A first-party web screen is not their only valid consumer.
  {
    url: '/api/files/uploads',
    why: 'cross-surface resumable video-upload protocol creates a multipart upload',
  },
  {
    url: '/api/files/uploads/[uploadId]',
    why: 'cross-surface resumable video-upload protocol signs, completes and aborts parts',
  },
  {
    url: '/api/github/issues',
    why: 'authenticated GitHub integration API for issue readers and comment clients',
  },
  {
    url: '/api/media/image/cancel',
    why: 'cross-surface durable image-job protocol cancels a server-owned job',
  },
  {
    url: '/api/media/image/retry',
    why: 'cross-surface durable image-job protocol retries the existing billed reservation',
  },
  {
    url: '/api/memory/commands',
    why: 'cross-surface explicit remember and confirmed-forget command protocol',
  },
  {
    url: '/api/completion',
    why: 'retired managed-execution endpoint kept so an old client gets one fixed refusal; only registries name it',
  },
  {
    url: '/api/me/routing-preferences',
    why: 'the chat request path reads these preferences server side; no settings control calls the route yet',
  },
  {
    url: '/api/settings/identities',
    why: 'lists and unlinks sign-in methods behind step-up; the settings pane that calls it is not built yet',
  },
  {
    url: '/api/settings/organization/keys',
    why: 'enrols, rotates, replaces and revokes the workspace encryption key; the settings pane that calls it is not built yet',
  },
  {
    url: '/api/settings/organization/keys/rewrap',
    why: 'moves ciphertext off a retired key version and retires it; the settings pane that calls it is not built yet',
  },
  {
    url: '/api/settings/security/compromise',
    why: 'authenticated emergency account-compromise response, not a routine settings control',
  },
  {
    url: '/api/voice/live/sessions/active',
    why: 'cross-device voice reconnect and session-history protocol',
  },

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
  {
    url: '/api/plugins/updates',
    why: 'plugins directory work in flight; version offers and permission re-consent are not surfaced yet',
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
        return readFileSync(file, 'utf8').replace(ROUTE_FILE_PATH, '');
      } catch {
        return '';
      }
    });
}

// A route segment is a path taken from disk, so it can carry any character the
// filesystem allows. Escaping only the slash left every other metacharacter
// live: a directory named `c++` compiled to a quantifier and either threw or,
// worse, matched text that is not a call to this route. Each literal segment is
// escaped whole, and only the `[param]` segments become patterns.
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
}

function segmentPattern(segment: string): string {
  if (segment.startsWith('[...')) return '.+';
  if (segment.startsWith('[')) return '[^"\'`\\s]+';
  return escapeRegExp(segment);
}

function callerlessUrls(): string[] {
  const corpus = callerCorpus();
  return routeUrls()
    .filter(({ segments }) => {
      const patterns = [new RegExp(`\\/api\\/${segments.map(segmentPattern).join('\\/')}`)];
      const firstDynamic = segments.findIndex((segment) => segment.startsWith('['));
      if (firstDynamic > 0) {
        const prefix = segments.slice(0, firstDynamic).map(escapeRegExp).join('\\/');
        patterns.push(new RegExp(`\\/api\\/${prefix}['"\`/]`));
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
