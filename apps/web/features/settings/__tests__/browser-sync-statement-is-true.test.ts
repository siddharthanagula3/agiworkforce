import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const privacySection = readFileSync(
  join(process.cwd(), 'features/settings/sections/PrivacySection.tsx'),
  'utf8',
);
const settingsStore = readFileSync(
  join(process.cwd(), 'shared/stores/web-settings-store.ts'),
  'utf8',
);

function webSourcesMentioning(needle: string): string[] {
  const repoRoot = resolve(process.cwd(), '../..');
  return execFileSync('git', ['grep', '-l', needle, '--', 'apps/web'], {
    cwd: repoRoot,
    encoding: 'utf8',
  })
    .split('\n')
    .filter(Boolean)
    .filter((file) => !file.includes('__tests__') && !file.endsWith('.test.ts'));
}

/**
 * A whole Sync page used to describe, by category, what syncs from where. Most
 * of it was about other surfaces and its status pills were words typed into the
 * markup. It is replaced by one sentence next to the export control, and a
 * sentence that promises specific behaviour still has to be checkable against
 * the code that would provide it.
 */
describe('the browser sync statement describes what actually happens', () => {
  it('is the sentence the Privacy pane shows beside export', () => {
    expect(privacySection).toMatch(
      /Artifacts you create here are synced to your account; conversations are stored in your account directly, not synced from this browser\./,
    );
  });

  it('claims artifacts sync because the only web client of the sync protocol pushes them', () => {
    const clients = webSourcesMentioning("'/api/chat/sync'");
    expect(clients).toContain('apps/web/features/chat/services/artifact-cloud-sync.ts');
    expect(clients.filter((file) => !file.startsWith('apps/web/app/api/'))).toEqual([
      'apps/web/features/chat/services/artifact-cloud-sync.ts',
    ]);
  });

  it('claims conversations are stored rather than synced, and nothing pushes them', () => {
    const push = readFileSync(
      join(process.cwd(), 'features/chat/services/artifact-cloud-sync.ts'),
      'utf8',
    );
    expect(push).toMatch(/artifacts \}\)/);
    expect(push).not.toMatch(/conversations:/);
  });

  it('makes no claim about appearance, which lives in a device-local store', () => {
    expect(settingsStore).toContain('createJSONStorage(() => localStorage)');
    expect(privacySection).not.toMatch(/appearance[\s\S]{0,40}sync/i);
  });

  it('leaves the other surfaces to describe themselves', () => {
    expect(privacySection).not.toMatch(/Desktop Cloud syncs/i);
  });
});

function webSource(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), 'utf8');
}

function sliceBetween(source: string, start: string, end: string): string {
  const from = source.indexOf(start);
  expect(from, `expected to find ${start}`).toBeGreaterThan(-1);
  const to = source.indexOf(end, from + start.length);
  expect(to, `expected to find ${end} after ${start}`).toBeGreaterThan(from);
  return source.slice(from, to);
}

function expectInOrder(source: string, earlier: string, later: string): void {
  const earlierAt = source.indexOf(earlier);
  const laterAt = source.indexOf(later);
  expect(earlierAt, `expected to find ${earlier}`).toBeGreaterThan(-1);
  expect(laterAt, `expected to find ${later}`).toBeGreaterThan(earlierAt);
}

describe('the artifact storage notice describes what actually happens', () => {
  const noticeCopy = webSource('features/onboarding/lib/artifact-storage-notice-copy.ts');
  const noticeComponent = webSource('features/onboarding/components/ArtifactPrivacyNotice.tsx');
  const syncRoute = webSource('app/api/chat/sync/route.ts');

  it('keeps its wording in the copy module the component renders', () => {
    expect(noticeCopy).toContain('saved to your account automatically');
    expect(noticeComponent).toContain("from '../lib/artifact-storage-notice-copy'");
    expect(noticeComponent).not.toMatch(/saved to your account/);
  });

  it.each([
    ['device-only storage', /leaves? this device/i],
    ['a bring-your-own-key boundary', /\bBYOK\b/],
    ['a browser as the place of storage', /this browser/i],
    ['that content is not sent', /\bnot sent\b/i],
    ['that content is never sent or uploaded', /never (sent|uploaded)/i],
  ])('does not claim %s', (_claim, forbidden) => {
    expect(noticeCopy).not.toMatch(forbidden);
    expect(noticeComponent).not.toMatch(forbidden);
  });

  it('sends provider handling to the Privacy settings section', () => {
    expect(noticeComponent).toContain("openSettings('privacy')");
  });

  it('claims artifacts are saved automatically because the chat page syncs them and every saved assistant turn is indexed', () => {
    expect(noticeCopy).toContain('saved to your account automatically');
    expect(webSource('features/chat/pages/WebChatPage.tsx')).toContain('useArtifactCloudSync()');
    expect(webSource('app/api/chat/conversations/[id]/messages/lib/persist-message.ts')).toContain(
      'scheduleArtifactIndexing(',
    );
    expect(
      webSource('app/api/llm/v1/chat/completions/lib/assistant-turn-persistence.ts'),
    ).toContain('scheduleArtifactIndexing(');
  });

  it('excepts temporary chats because the server refuses them before it indexes or stores an artifact', () => {
    expect(noticeCopy).toContain('except in temporary chats');
    expectInOrder(
      webSource('app/api/chat/conversations/[id]/messages/lib/persist-message.ts'),
      'if (conversation.is_temporary) throw',
      'scheduleArtifactIndexing(',
    );
    expectInOrder(
      webSource('app/api/llm/v1/chat/completions/lib/assistant-turn-persistence.ts'),
      'if (processed.conversationIsTemporary) return',
      'scheduleArtifactIndexing(',
    );
    expect(
      sliceBetween(syncRoute, 'update web_artifacts as existing', 'returning existing.id'),
    ).toContain('not parent.is_temporary');
    expect(
      sliceBetween(syncRoute, 'insert into web_artifacts', 'on conflict (id) do nothing'),
    ).toContain('not parent.is_temporary');
  });

  it('excepts chats with any local turn because their artifact batch stays off the account', () => {
    expect(noticeCopy).toContain('chats that use a local model');
    const store = webSource('features/chat/stores/artifacts-store.ts');
    const batch = sliceBetween(store, 'collectArtifactPushBatch():', 'applyArtifactPushResult(');
    expect(batch).toContain('conversationHoldsLocalTurns(');
    expect(batch).toContain('staysOffTheAccount(artifact.conversationId)');
    const localOrigin = webSource('features/chat/lib/local-origin.ts');
    expect(localOrigin).toContain('messages.some(');
    expect(localOrigin).toContain("message.metadata?.privacyMode === 'local'");
    expect(localOrigin).toContain('isLocalModelId(message.model)');
  });

  it('keeps artifacts of temporary and on-device chats out of the client push', () => {
    const pushBatch = sliceBetween(
      webSource('features/chat/stores/artifacts-store.ts'),
      'collectArtifactPushBatch()',
      'applyArtifactPushResult(',
    );
    expect(pushBatch).toContain('temporaryConversationIds()');
    expect(pushBatch).toContain('conversationHoldsLocalTurns(');
  });

  it('names a public link and the workspace because those are the two publish audiences', () => {
    expect(noticeCopy).toContain('publish an artifact, to a public link or your workspace');
    expect(webSource('features/chat/components/artifacts/publishArtifactClient.ts')).toContain(
      "'public' | 'organization'",
    );
  });

  it('names sharing the chat because a shared chat carries a snapshot of its artifacts', () => {
    expect(noticeCopy).toContain('share the chat it is in');
    expect(webSource('features/chat/hooks/use-share-conversation.ts')).toContain(
      'snapshotArtifacts(',
    );
  });
});
