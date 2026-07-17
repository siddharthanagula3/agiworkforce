import { describe, it, expect } from 'vitest';
import {
  PLATFORM_CAPABILITIES,
  ALL_PLATFORM_CAPABILITIES,
  CAPABILITY_METADATA,
  isCapabilityEnabled,
  getPlatformCapabilities,
  getCapabilityMetadata,
  getCapabilitiesByDomain,
  capabilityRequiresConfirmation,
  type PlatformCapability,
} from '../capabilities';

const VALID_DOMAINS = [
  'core',
  'media',
  'input',
  'execution',
  'filesystem',
  'automation',
  'models',
  'networking',
  'developer',
  'commerce',
  'system',
];

// The desktop-local capabilities that MUST NOT leak onto web or mobile.
const DESKTOP_ONLY: PlatformCapability[] = [
  'canUseWorkingDirectory',
  'canUseFileSystem',
  'canRunLocalCode',
  'canUseTerminal',
  'canUseLocalDatabase',
  'canTakeScreenshot',
  'canUseClipboard',
  'canUseBrowserAutomation',
  'canUseDesktopAutomation',
  'canUseLocalMcp',
  'canUseLocalModels',
  'canUseNativeIntegrations',
];

describe('platform capability matrix', () => {
  it('defines every capability for every synced surface (exhaustive matrix)', () => {
    for (const platform of ['web', 'desktop', 'mobile'] as const) {
      const row = PLATFORM_CAPABILITIES[platform];
      for (const cap of ALL_PLATFORM_CAPABILITIES) {
        expect(typeof row[cap]).toBe('boolean');
      }
    }
  });

  it('WEB exposes NO desktop-only capability (acceptance bar: absent on web)', () => {
    for (const cap of DESKTOP_ONLY) {
      expect(isCapabilityEnabled('web', cap)).toBe(false);
    }
  });

  it('MOBILE exposes NO desktop-only capability (acceptance bar: absent on mobile)', () => {
    for (const cap of DESKTOP_ONLY) {
      expect(isCapabilityEnabled('mobile', cap)).toBe(false);
    }
  });

  it('DESKTOP is a superset of WEB (every web capability is also on desktop)', () => {
    for (const cap of ALL_PLATFORM_CAPABILITIES) {
      if (isCapabilityEnabled('web', cap)) {
        expect(isCapabilityEnabled('desktop', cap)).toBe(true);
      }
    }
  });

  it('DESKTOP exposes every desktop-only capability', () => {
    for (const cap of DESKTOP_ONLY) {
      expect(isCapabilityEnabled('desktop', cap)).toBe(true);
    }
  });

  it('MOBILE exposes its device capabilities (camera, photos, notifications)', () => {
    expect(isCapabilityEnabled('mobile', 'canUseCamera')).toBe(true);
    expect(isCapabilityEnabled('mobile', 'canUsePhotos')).toBe(true);
    expect(isCapabilityEnabled('mobile', 'canUseNotifications')).toBe(true);
  });

  it('WEB does NOT expose mobile device capabilities (camera/photos)', () => {
    expect(isCapabilityEnabled('web', 'canUseCamera')).toBe(false);
    expect(isCapabilityEnabled('web', 'canUsePhotos')).toBe(false);
  });

  it('cloud capabilities are universal (chat/images/upload/voice/marketplace/billing)', () => {
    for (const platform of ['web', 'desktop', 'mobile'] as const) {
      expect(isCapabilityEnabled(platform, 'canChat')).toBe(true);
      expect(isCapabilityEnabled(platform, 'canUseImages')).toBe(true);
      expect(isCapabilityEnabled(platform, 'canUploadFiles')).toBe(true);
      expect(isCapabilityEnabled(platform, 'canUseVoice')).toBe(true);
      expect(isCapabilityEnabled(platform, 'canUseMarketplace')).toBe(true);
      expect(isCapabilityEnabled(platform, 'canUseBilling')).toBe(true);
    }
  });

  it('web cloud code execution (E2B) stays enabled; web local run-code does not', () => {
    expect(isCapabilityEnabled('web', 'canUseCloudExecution')).toBe(true);
    expect(isCapabilityEnabled('web', 'canRunLocalCode')).toBe(false);
  });

  it('getPlatformCapabilities returns a complete row; unknown platform defaults safely', () => {
    expect(getPlatformCapabilities('web')).toBe(PLATFORM_CAPABILITIES.web);
    // Unknown capability on a known platform → false (defensive default).
    expect(isCapabilityEnabled('web', 'totally-unknown' as PlatformCapability)).toBe(false);
  });
});

describe('capability metadata (domains + permissions, additive layer)', () => {
  it('EVERY capability has metadata with a valid domain', () => {
    for (const cap of ALL_PLATFORM_CAPABILITIES) {
      const meta = getCapabilityMetadata(cap);
      expect(meta, `missing metadata for ${cap}`).toBeDefined();
      expect(VALID_DOMAINS).toContain(meta.domain);
    }
  });

  it('metadata covers exactly the matrix keys (no orphan / missing entries)', () => {
    expect(Object.keys(CAPABILITY_METADATA).sort()).toEqual([...ALL_PLATFORM_CAPABILITIES].sort());
  });

  it('getCapabilitiesByDomain groups correctly', () => {
    expect(getCapabilitiesByDomain('automation')).toEqual(
      expect.arrayContaining(['canUseBrowserAutomation', 'canUseDesktopAutomation']),
    );
    expect(getCapabilitiesByDomain('developer')).toEqual(
      expect.arrayContaining(['canUseTerminal']),
    );
  });

  it('every capability flagged dangerous/destructive/local-exec is desktop-only (web=mobile=false)', () => {
    for (const cap of ALL_PLATFORM_CAPABILITIES) {
      const p = getCapabilityMetadata(cap).permissions;
      if (p?.dangerous || p?.destructive) {
        expect(isCapabilityEnabled('web', cap), `${cap} dangerous but on web`).toBe(false);
        expect(isCapabilityEnabled('mobile', cap), `${cap} dangerous but on mobile`).toBe(false);
      }
    }
  });

  it('capabilityRequiresConfirmation reflects the descriptor', () => {
    expect(capabilityRequiresConfirmation('canUseTerminal')).toBe(true);
    expect(capabilityRequiresConfirmation('canChat')).toBe(false);
  });
});
