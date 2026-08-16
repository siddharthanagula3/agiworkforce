import { describe, expect, it } from 'vitest';
import { EffectiveCapabilityDocumentSchema } from '@agiworkforce/cloud-contracts';
import { CAPABILITY_DOCUMENT_VERSION_UNRESOLVED } from '@agiworkforce/types';
import {
  ME_CAPABILITY_HANDSHAKE_VERSION,
  buildMeCapabilityHandshake,
  isMeCapabilityHandshakeStale,
  toWireCapabilityHandshake,
} from './capability-handshake-service';

const BASE_INPUT = {
  userId: 'user_1',
  surface: 'web' as const,
  cloudExecutionDeploymentEnabled: true,
  computedAt: '2026-07-15T00:00:00.000Z',
};

describe('buildMeCapabilityHandshake — document identity', () => {
  it('carries sessionId=userId, a schema-prefixed CONTENT version, and the injected computedAt', () => {
    const document = buildMeCapabilityHandshake({ ...BASE_INPUT, tier: 'pro' });
    expect(document.sessionId).toBe('user_1');
    expect(document.version).not.toBe(ME_CAPABILITY_HANDSHAKE_VERSION);
    expect(document.version.startsWith(`${ME_CAPABILITY_HANDSHAKE_VERSION}#`)).toBe(true);
    expect(document.computedAt).toBe('2026-07-15T00:00:00.000Z');
  });

  it('defaults computedAt to now when not injected', () => {
    const before = Date.now();
    const document = buildMeCapabilityHandshake({
      userId: 'user_1',
      tier: 'free',
      surface: 'web',
      cloudExecutionDeploymentEnabled: true,
    });
    const after = Date.now();
    const computedAtMs = new Date(document.computedAt).getTime();
    expect(computedAtMs).toBeGreaterThanOrEqual(before);
    expect(computedAtMs).toBeLessThanOrEqual(after);
  });

  it('records real per-layer provenance, not opaque booleans', () => {
    const document = buildMeCapabilityHandshake({ ...BASE_INPUT, tier: 'pro' });
    expect(document.sources.tier).toBe('tier:pro');
    expect(document.sources.surface).toBe('surface:web');
    expect(document.sources.model).toMatch(/^models\.json@/);
    expect(document.sources.settings).toBe('settings:none-configured');
  });
});

describe('buildMeCapabilityHandshake — tier-layer honesty (the required property)', () => {
  it('free tier: grants search, voice, and connectors while keeping Deep Research paid', () => {
    const document = buildMeCapabilityHandshake({ ...BASE_INPUT, tier: 'free' });
    expect(document.granted).toContain('canUseWebSearch');
    expect(document.granted).not.toContain('canUseDeepResearch');
    expect(document.granted).toContain('canUseVoice');
    expect(document.granted).toContain('canUseConnectors');
    expect(document.deniedBy.canUseDeepResearch).toEqual(['tier']);
  });

  it('free tier still grants universal capabilities no tier field restricts (free users can chat)', () => {
    const document = buildMeCapabilityHandshake({ ...BASE_INPUT, tier: 'free' });
    expect(document.granted).toContain('canChat');
    expect(document.granted).toContain('canUploadFiles');
    expect(document.granted).toContain('canUseImages');
    expect(document.granted).toContain('canUseMarketplace');
    expect(document.granted).toContain('canUseBilling');
    expect(document.granted).toContain('canUseCloudModels');
  });

  it('pro tier: grants search, voice, and connectors, but still denies deep research (max/enterprise-only)', () => {
    const document = buildMeCapabilityHandshake({ ...BASE_INPUT, tier: 'pro' });
    expect(document.granted).toContain('canUseWebSearch');
    expect(document.granted).toContain('canUseVoice');
    expect(document.granted).toContain('canUseConnectors');
    expect(document.granted).not.toContain('canUseDeepResearch');
    expect(document.deniedBy.canUseDeepResearch).toEqual(['tier']);
  });

  it('max tier: grants deep research too', () => {
    const document = buildMeCapabilityHandshake({ ...BASE_INPUT, tier: 'max' });
    expect(document.granted).toContain('canUseDeepResearch');
  });

  it('enterprise tier grants deep research under its negotiated limits', () => {
    const document = buildMeCapabilityHandshake({ ...BASE_INPUT, tier: 'enterprise' });
    expect(document.granted).toContain('canUseDeepResearch');
  });

  it('an unknown/missing tier string normalizes to the free policy, not an open grant', () => {
    const missing = buildMeCapabilityHandshake({ ...BASE_INPUT, tier: null });
    const bogus = buildMeCapabilityHandshake({ ...BASE_INPUT, tier: 'not_a_real_tier' });
    for (const document of [missing, bogus]) {
      expect(document.granted).toContain('canUseWebSearch');
      expect(document.sources.tier).toBe('tier:free');
    }
  });
});

describe('buildMeCapabilityHandshake — surface layer (web denies desktop-only capabilities regardless of tier)', () => {
  it('never grants desktop-only capabilities on the web surface even for the highest tier', () => {
    const document = buildMeCapabilityHandshake({
      ...BASE_INPUT,
      tier: 'enterprise',
      surface: 'web',
    });
    for (const desktopOnly of [
      'canUseWorkingDirectory',
      'canUseFileSystem',
      'canRunLocalCode',
      'canUseTerminal',
      'canUseLocalMcp',
      'canUseLocalModels',
    ] as const) {
      expect(document.granted).not.toContain(desktopOnly);
      expect(document.deniedBy[desktopOnly]).toContain('surface');
    }
  });

  it('grants desktop-only capabilities on the desktop surface (same tier, different surface)', () => {
    const webDoc = buildMeCapabilityHandshake({ ...BASE_INPUT, tier: 'max', surface: 'web' });
    const desktopDoc = buildMeCapabilityHandshake({
      ...BASE_INPUT,
      tier: 'max',
      surface: 'desktop',
    });
    expect(webDoc.granted).not.toContain('canUseFileSystem');
    expect(desktopDoc.granted).toContain('canUseFileSystem');
  });
});

describe('buildMeCapabilityHandshake — model/deployment layer for cloud execution', () => {
  it('denies canUseCloudExecution when the E2B deployment flag is off, even at max tier', () => {
    const document = buildMeCapabilityHandshake({
      ...BASE_INPUT,
      tier: 'max',
      cloudExecutionDeploymentEnabled: false,
    });
    expect(document.granted).not.toContain('canUseCloudExecution');
    expect(document.deniedBy.canUseCloudExecution).toContain('model');
  });

  it('grants canUseCloudExecution when the deployment flag is on (current catalog has code-execution models)', () => {
    const document = buildMeCapabilityHandshake({
      ...BASE_INPUT,
      tier: 'max',
      cloudExecutionDeploymentEnabled: true,
    });
    expect(document.granted).toContain('canUseCloudExecution');
  });
});

describe('toWireCapabilityHandshake', () => {
  it('produces a payload that validates against the live EffectiveCapabilityDocumentSchema', () => {
    const document = buildMeCapabilityHandshake({ ...BASE_INPUT, tier: 'free' });
    const wire = toWireCapabilityHandshake(document);
    const parsed = EffectiveCapabilityDocumentSchema.safeParse(wire);
    expect(parsed.success).toBe(true);
  });

  it('preserves every value across the readonly -> mutable normalization', () => {
    const document = buildMeCapabilityHandshake({ ...BASE_INPUT, tier: 'pro' });
    const wire = toWireCapabilityHandshake(document);
    expect(wire.granted.slice().sort()).toEqual([...document.granted].sort());
    expect(wire.deniedBy).toEqual(document.deniedBy);
    expect(wire.sessionId).toBe(document.sessionId);
    expect(wire.sources).toEqual(document.sources);
  });
});

describe('capability-document versioning + staleness (W5 tail — replaces placeholder versions)', () => {
  it('is stable across identical inputs (idempotent recomputation, no counter storage)', () => {
    const a = buildMeCapabilityHandshake({ ...BASE_INPUT, tier: 'pro' });
    const b = buildMeCapabilityHandshake({ ...BASE_INPUT, tier: 'pro' });
    expect(a.version).toBe(b.version);
  });

  it('identifies POLICY content, not the user: same tier/surface/flags hash identically across users', () => {
    const a = buildMeCapabilityHandshake({ ...BASE_INPUT, tier: 'pro' });
    const b = buildMeCapabilityHandshake({ ...BASE_INPUT, userId: 'user_2', tier: 'pro' });
    expect(a.version).toBe(b.version);
    expect(a.sessionId).not.toBe(b.sessionId);
  });

  it('bumps on a tier change, a surface change, and a deployment-flag flip', () => {
    const base = buildMeCapabilityHandshake({ ...BASE_INPUT, tier: 'pro' }).version;

    expect(buildMeCapabilityHandshake({ ...BASE_INPUT, tier: 'free' }).version).not.toBe(base);
    expect(
      buildMeCapabilityHandshake({ ...BASE_INPUT, tier: 'pro', surface: 'desktop' }).version,
    ).not.toBe(base);
    expect(
      buildMeCapabilityHandshake({
        ...BASE_INPUT,
        tier: 'pro',
        cloudExecutionDeploymentEnabled: false,
      }).version,
    ).not.toBe(base);
  });

  it('staleness: a snapshot taken at version N is fresh against N and stale against N+1', () => {
    const atPro = buildMeCapabilityHandshake({ ...BASE_INPUT, tier: 'pro' });
    const snapshotRef = { version: atPro.version };

    expect(isMeCapabilityHandshakeStale(snapshotRef, atPro)).toBe(false);

    const afterUpgrade = buildMeCapabilityHandshake({ ...BASE_INPUT, tier: 'max' });
    expect(isMeCapabilityHandshakeStale(snapshotRef, afterUpgrade)).toBe(true);
  });

  it('the unresolved session-label placeholder is ALWAYS stale (forces a re-handshake)', () => {
    const current = buildMeCapabilityHandshake({ ...BASE_INPUT, tier: 'pro' });
    expect(
      isMeCapabilityHandshakeStale({ version: CAPABILITY_DOCUMENT_VERSION_UNRESOLVED }, current),
    ).toBe(true);
  });
});
