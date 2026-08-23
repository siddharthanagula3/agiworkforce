import { describe, it, expect, vi } from 'vitest';
import { publishArtifact, resolveOriginPrivacyMode } from '../artifacts';
import type { PublishableArtifact, LocalFileWriter } from '../artifacts';

const baseArtifact: PublishableArtifact = {
  id: 'art-001',
  title: 'Hello World',
  content: 'console.log("hello")',
  type: 'code',
  language: 'javascript',
};

const fakeLocalWriter: LocalFileWriter = async (artifact) =>
  `file:///Users/test/AGI/artifacts/${artifact.id}.txt`;

const nonFileWriter: LocalFileWriter = async (artifact) =>
  `https://cloud.example.com/artifacts/${artifact.id}`;

describe('publishArtifact — local path', () => {
  it('returns a LocalPublishResult with a file:// shareUrl', async () => {
    const result = await publishArtifact({
      artifact: baseArtifact,
      privacyMode: 'local',
      surface: 'desktop',
      localFileWriter: fakeLocalWriter,
    });

    expect(result.kind).toBe('local');
    if (result.kind !== 'local') return;

    expect(result.shareUrl).toMatch(/^file:\/\//);
    expect(result.shareToken).toBeTruthy();
    expect(typeof result.publishedAt).toBe('string');
    expect(result.publishedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
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

describe('publishArtifact — cloud path (no waitlist gate)', () => {
  it.each(['byok', 'managed'] as const)(
    'returns an honest unavailable result for privacyMode=%s when no cloudPublisher is injected',
    async (privacyMode) => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('no network'));

      const result = await publishArtifact({
        artifact: baseArtifact,
        privacyMode,
        originPrivacyMode: privacyMode,
        surface: 'desktop',
        // localFileWriter intentionally omitted — cloud path must not use it
      });

      expect(result.kind).toBe('unavailable');
      expect(result.shareUrl).toBeNull();
      if (result.kind === 'unavailable') {
        expect(result.reason).not.toMatch(/waitlist/i);
        expect(result.reason.length).toBeGreaterThan(0);
      }
      expect(fetchSpy).not.toHaveBeenCalled();

      fetchSpy.mockRestore();
    },
  );

  it('publishes a managed-origin artifact through the host-injected cloudPublisher', async () => {
    const cloudPublisher = vi.fn(async () => ({
      shareUrl: 'https://share.example.invalid/a1',
      publishedAt: '2026-07-25T00:00:00.000Z',
    }));

    const result = await publishArtifact({
      artifact: baseArtifact,
      privacyMode: 'managed',
      originPrivacyMode: 'managed',
      surface: 'desktop',
      cloudPublisher,
    });

    expect(cloudPublisher).toHaveBeenCalledWith(baseArtifact, 'managed');
    expect(result.kind).toBe('cloud');
    expect(result.shareUrl).toBe('https://share.example.invalid/a1');
  });

  it('throws when the injected cloudPublisher resolves without a shareUrl', async () => {
    await expect(
      publishArtifact({
        artifact: baseArtifact,
        privacyMode: 'managed',
        originPrivacyMode: 'managed',
        surface: 'desktop',
        cloudPublisher: async () => ({ shareUrl: '' }),
      }),
    ).rejects.toThrow(/shareUrl/);
  });
});

// SECURITY-FIX F3 (CWE-863): the caller-declared privacyMode is no longer the
// authorization decision on its own. These cases fail on the pre-fix code,
// where a UI hardcoding `privacyMode: 'managed'` uploaded Local/BYOK content.
describe('publishArtifact — origin trust-boundary cross-check', () => {
  const cloudPublisher = () =>
    vi.fn(async () => ({ shareUrl: 'https://share.example.invalid/leak' }));

  it.each(['local', 'byok'] as const)(
    'never hands a %s-origin artifact to the managed cloud publisher, even when the caller declares managed',
    async (originPrivacyMode) => {
      const publisher = cloudPublisher();

      const result = await publishArtifact({
        artifact: baseArtifact,
        privacyMode: 'managed',
        originPrivacyMode,
        surface: 'web',
        cloudPublisher: publisher,
      });

      expect(publisher).not.toHaveBeenCalled();
      expect(result.kind).toBe('unavailable');
      expect(result.shareUrl).toBeNull();
      if (result.kind === 'unavailable') {
        expect(result.reason).toMatch(
          originPrivacyMode === 'local' ? /created in Local mode/i : /created in BYOK mode/i,
        );
      }
    },
  );

  it('refuses a cloud publish when the artifact origin is unknown', async () => {
    const publisher = cloudPublisher();

    const result = await publishArtifact({
      artifact: baseArtifact,
      privacyMode: 'managed',
      surface: 'web',
      cloudPublisher: publisher,
    });

    expect(publisher).not.toHaveBeenCalled();
    expect(result.kind).toBe('unavailable');
    if (result.kind === 'unavailable') expect(result.reason).toMatch(/unknown/i);
  });

  it('refuses when the declared mode does not match a managed-origin artifact', async () => {
    const publisher = cloudPublisher();

    const result = await publishArtifact({
      artifact: baseArtifact,
      privacyMode: 'byok',
      originPrivacyMode: 'managed',
      surface: 'web',
      cloudPublisher: publisher,
    });

    expect(publisher).not.toHaveBeenCalled();
    expect(result.kind).toBe('unavailable');
  });

  it('still exports locally for a local-origin artifact', async () => {
    const result = await publishArtifact({
      artifact: baseArtifact,
      privacyMode: 'local',
      originPrivacyMode: 'local',
      surface: 'desktop',
      localFileWriter: fakeLocalWriter,
    });

    expect(result.kind).toBe('local');
  });
});

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

describe('resolveOriginPrivacyMode — most restrictive observed boundary wins', () => {
  it('reports no origin at all when the host observed no signal', () => {
    expect(resolveOriginPrivacyMode([])).toBeUndefined();
    expect(resolveOriginPrivacyMode([undefined, null, ''])).toBeUndefined();
  });

  it('ignores unrecognized wire values instead of treating them as a boundary', () => {
    expect(resolveOriginPrivacyMode(['Managed', 'cloud', 'ollama'])).toBeUndefined();
  });

  it('lets an observed local or byok signal outrank a managed default', () => {
    expect(resolveOriginPrivacyMode(['managed', 'ManagedGateway', 'Local'])).toBe('local');
    expect(resolveOriginPrivacyMode(['managed', 'DirectByok'])).toBe('byok');
    expect(resolveOriginPrivacyMode(['byok', 'local'])).toBe('local');
  });

  it('maps provider modes onto their privacy boundary', () => {
    expect(resolveOriginPrivacyMode(['ManagedNative'])).toBe('managed');
    expect(resolveOriginPrivacyMode(['DirectByok'])).toBe('byok');
    expect(resolveOriginPrivacyMode(['Local'])).toBe('local');
  });

  it('refuses the cloud publish for an origin it could not resolve', async () => {
    const cloudPublisher = vi.fn(async () => ({ shareUrl: 'https://example.com/s/1' }));

    const result = await publishArtifact({
      artifact: baseArtifact,
      privacyMode: 'managed',
      surface: 'web',
      originPrivacyMode: resolveOriginPrivacyMode(['not-a-privacy-mode']),
      cloudPublisher,
    });

    expect(cloudPublisher).not.toHaveBeenCalled();
    expect(result.kind).toBe('unavailable');
  });
});
