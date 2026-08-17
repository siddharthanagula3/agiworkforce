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
  ALL_DISCOVERABLE_SURFACE_CAPABILITIES,
  DISCOVERABLE_SURFACE_CAPABILITIES,
  getSurfaceCapabilityAvailability,
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

  it('WEB exposes camera (getUserMedia is wired in the composer) but not the photo library', () => {
    expect(isCapabilityEnabled('web', 'canUseCamera')).toBe(true);
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

describe('cross-surface capability discovery', () => {
  const surfaces = ['web', 'desktop', 'mobile', 'cli', 'vscode', 'chrome'] as const;

  it('defines an explicit boolean for every capability and canonical surface', () => {
    for (const capability of ALL_DISCOVERABLE_SURFACE_CAPABILITIES) {
      for (const surface of surfaces) {
        expect(typeof DISCOVERABLE_SURFACE_CAPABILITIES[capability].availability[surface]).toBe(
          'boolean',
        );
      }
    }
  });

  it('keeps surface-bound capabilities discoverable without claiming VS Code support', () => {
    for (const capability of ALL_DISCOVERABLE_SURFACE_CAPABILITIES) {
      const presentation = getSurfaceCapabilityAvailability(capability, 'vscode');
      expect(presentation.available).toBe(false);
      expect(presentation.statusLabel).toBe('Unavailable in this context');
      expect(presentation.availableSurfaceLabels.length).toBeGreaterThan(0);
      expect(presentation.tooltip).toMatch(/^Available in .+\.$/u);
    }
  });

  it('names the shipped surfaces for browser control and computer use', () => {
    for (const capability of ['browser-control', 'computer-use'] as const) {
      const presentation = getSurfaceCapabilityAvailability(capability, 'vscode');
      expect(presentation.availableSurfaceLabels).toEqual(['Desktop app', 'Chrome extension']);
      expect(presentation.tooltip).toBe('Available in Desktop app and Chrome extension.');
      expect(getSurfaceCapabilityAvailability(capability, 'desktop').available).toBe(true);
      expect(getSurfaceCapabilityAvailability(capability, 'chrome').available).toBe(true);
    }
  });

  it('derives managed plugin availability from the synced-app runtime matrix', () => {
    expect(getSurfaceCapabilityAvailability('managed-plugins', 'web').available).toBe(true);
    expect(getSurfaceCapabilityAvailability('managed-plugins', 'desktop').available).toBe(true);
    expect(getSurfaceCapabilityAvailability('managed-plugins', 'mobile').available).toBe(false);
  });
});
