/**
 * Unit tests for the artifact-publish service.
 *
 * Covers:
 *   1. Local publish returns file:// URL and a LocalPublishResult.
 *   2. Cloud (byok/managed) publish returns WaitlistPublishResult — no network.
 *   3. Trust-boundary throws when generated-file URI is not file://.
 *   4. Sync-rule throws on developer-session surfaces (cli, vscode, chrome).
 *   5. Missing localFileWriter throws on local path.
 */

import { describe, it, expect, vi } from 'vitest';
import { publishArtifact } from '../artifacts';
import type { PublishableArtifact, LocalFileWriter } from '../artifacts';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const baseArtifact: PublishableArtifact = {
  id: 'art-001',
  title: 'Hello World',
  content: 'console.log("hello")',
  type: 'code',
  language: 'javascript',
};

/** A fake localFileWriter that returns a deterministic file:// URL. */
const fakeLocalWriter: LocalFileWriter = async (artifact) =>
  `file:///Users/test/AGI/artifacts/${artifact.id}.txt`;

/** A fake writer that returns a non-file:// URL to trigger trust-boundary. */
const nonFileWriter: LocalFileWriter = async (artifact) =>
  `https://cloud.example.com/artifacts/${artifact.id}`;

// ---------------------------------------------------------------------------
// 1. Local publish returns file:// URL
// ---------------------------------------------------------------------------

describe('publishArtifact — local path', () => {
  it('returns a LocalPublishResult with a file:// shareUrl', async () => {
    const result = await publishArtifact({
      artifact: baseArtifact,
      privacyMode: 'local',
      surface: 'desktop',
      localFileWriter: fakeLocalWriter,
    });

    expect(result.kind).toBe('local');
    if (result.kind !== 'local') return; // narrow type

    expect(result.shareUrl).toMatch(/^file:\/\//);
    expect(result.shareToken).toBeTruthy();
    expect(result.waitlistGated).toBe(false);
    expect(typeof result.publishedAt).toBe('string');
    expect(result.publishedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/); // ISO 8601
  });

  it('calls the localFileWriter with the artifact', async () => {
    const mockWriter = vi.fn(fakeLocalWriter);
    await publishArtifact({
      artifact: baseArtifact,
      privacyMode: 'local',
      surface: 'web',
      localFileWriter: mockWriter,
    });
    expect(mockWriter).toHaveBeenCalledWith(baseArtifact);
  });

  it('throws when localFileWriter is absent on local path', async () => {
    await expect(
      publishArtifact({ artifact: baseArtifact, privacyMode: 'local', surface: 'desktop' }),
    ).rejects.toThrow('localFileWriter adapter is required');
  });
});

// ---------------------------------------------------------------------------
// 2. Cloud paths return waitlist-gated (no network)
// ---------------------------------------------------------------------------

describe('publishArtifact — cloud waitlist gate', () => {
  it.each(['byok', 'managed'] as const)(
    'returns WaitlistPublishResult for privacyMode=%s without touching the network',
    async (privacyMode) => {
      // Assert no fetch / network calls are made by confirming the function
      // resolves to waitlist shape immediately. If a cloud endpoint were hit,
      // it would throw in a node environment with no network stub.
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('no network'));

      const result = await publishArtifact({
        artifact: baseArtifact,
        privacyMode,
        surface: 'desktop',
        // localFileWriter intentionally omitted — cloud path must not use it
      });

      expect(result.kind).toBe('waitlist');
      expect(result.shareUrl).toBeNull();
      expect(result.waitlistGated).toBe(true);
      // Confirm fetch was never called
      expect(fetchSpy).not.toHaveBeenCalled();

      fetchSpy.mockRestore();
    },
  );
});

// ---------------------------------------------------------------------------
// 3. Trust-boundary throws on non-file:// URI
// ---------------------------------------------------------------------------

describe('publishArtifact — trust-boundary enforcement', () => {
  it('throws when the localFileWriter returns a non-file:// URL', async () => {
    await expect(
      publishArtifact({
        artifact: baseArtifact,
        privacyMode: 'local',
        surface: 'desktop',
        localFileWriter: nonFileWriter,
      }),
    ).rejects.toThrow(/trust-boundary violation/i);
  });
});

// ---------------------------------------------------------------------------
// 4. Sync-rule throws on developer-session surfaces
// ---------------------------------------------------------------------------

describe('publishArtifact — surface sync-rule enforcement', () => {
  it.each(['cli', 'vscode', 'chrome'] as const)(
    'throws AGI sync-rule violation for surface=%s',
    async (surface) => {
      await expect(
        publishArtifact({
          artifact: baseArtifact,
          privacyMode: 'local',
          surface,
          localFileWriter: fakeLocalWriter,
        }),
      ).rejects.toThrow(/sync-rule violation/i);
    },
  );

  it.each(['web', 'desktop', 'mobile'] as const)(
    'does NOT throw for allowed surface=%s',
    async (surface) => {
      await expect(
        publishArtifact({
          artifact: baseArtifact,
          privacyMode: 'local',
          surface,
          localFileWriter: fakeLocalWriter,
        }),
      ).resolves.not.toThrow();
    },
  );
});
