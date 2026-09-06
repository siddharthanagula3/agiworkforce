import { describe, expect, it } from 'vitest';

import {
  deriveInternalBadge,
  deriveRegistryBadge,
  isAggregatorDomain,
  parseRegistryNamespace,
  strongerBadge,
  upgradeToVerifiedBadge,
  vendorOfHost,
  vendorOfNamespace,
} from '@/lib/connectors/directory/badge';

describe('deriveInternalBadge', () => {
  it('is always first-party', () => {
    expect(deriveInternalBadge()).toBe('first-party');
  });
});

describe('parseRegistryNamespace', () => {
  it('reads the owner of a GitHub namespace', () => {
    expect(parseRegistryNamespace('io.github.acme/weather')).toEqual({
      kind: 'github',
      owner: 'acme',
    });
  });

  it('reverses a reverse-dns namespace into its domain', () => {
    expect(parseRegistryNamespace('com.notion/mcp')).toEqual({
      kind: 'domain',
      domain: 'notion.com',
    });
    expect(parseRegistryNamespace('ai.smithery/x')).toEqual({
      kind: 'domain',
      domain: 'smithery.ai',
    });
  });
});

describe('vendor recognition', () => {
  it('recognises a vendor by brand host or by the vendor domain table', () => {
    expect(vendorOfHost('mcp.notion.com')).toBe('notion');
    expect(vendorOfHost('mcp.svc.cloud.microsoft')).toBe('microsoft');
    expect(vendorOfHost('api.githubcopilot.com')).toBe('github');
  });

  it('never treats a hosting platform, aggregator or unknown domain as a vendor', () => {
    expect(vendorOfHost('acme.workers.dev')).toBeNull();
    expect(vendorOfHost('server.smithery.ai')).toBeNull();
    expect(vendorOfHost('dotprompts.com')).toBeNull();
  });

  it('recognises a vendor GitHub organisation only from the explicit tables', () => {
    expect(vendorOfNamespace({ kind: 'github', owner: 'googleapis' })).toBe('google');
    expect(vendorOfNamespace({ kind: 'github', owner: 'makenotion' })).toBe('notion');
    expect(vendorOfNamespace({ kind: 'github', owner: 'salesforcecli' })).toBe('salesforce');
    expect(vendorOfNamespace({ kind: 'github', owner: 'notion' })).toBeNull();
    expect(vendorOfNamespace({ kind: 'github', owner: 'acme' })).toBeNull();
  });
});

describe('deriveRegistryBadge', () => {
  it('is official when a recognised vendor publishes its own product', () => {
    expect(
      deriveRegistryBadge({ registryName: 'com.notion/mcp', remoteHosts: ['mcp.notion.com'] }),
    ).toBe('official');
    expect(
      deriveRegistryBadge({
        registryName: 'com.microsoft/graph',
        remoteHosts: ['mcp.svc.cloud.microsoft'],
      }),
    ).toBe('official');
    expect(
      deriveRegistryBadge({ registryName: 'io.github.googleapis/genai-toolbox', remoteHosts: [] }),
    ).toBe('official');
  });

  it('keeps a vendor official when its remote runs on a hosting platform', () => {
    expect(
      deriveRegistryBadge({
        registryName: 'io.github.stripe/toolkit',
        remoteHosts: ['x.workers.dev'],
      }),
    ).toBe('official');
  });

  it('is not official when a vendor publishes a server for another vendor product', () => {
    expect(
      deriveRegistryBadge({
        registryName: 'io.github.zapier/notion',
        remoteHosts: ['mcp.notion.com'],
      }),
    ).toBe('community');
  });

  it('is not official for a publisher whose namespace merely matches its own domain', () => {
    expect(
      deriveRegistryBadge({
        registryName: 'com.dotprompts/dotprompts',
        remoteHosts: ['dotprompts.com'],
      }),
    ).toBe('registry');
    expect(
      deriveRegistryBadge({ registryName: 'io.github.acme/tool', remoteHosts: ['api.acme.com'] }),
    ).toBe('community');
  });

  it('is not official for a GitHub handle that is not the vendor organisation', () => {
    expect(
      deriveRegistryBadge({
        registryName: 'io.github.notion/tool',
        remoteHosts: ['mcp.notion.com'],
      }),
    ).toBe('community');
  });

  it('never treats an aggregator as an official or identified publisher', () => {
    expect(isAggregatorDomain('server.smithery.ai')).toBe(true);
    expect(
      deriveRegistryBadge({
        registryName: 'ai.smithery/slack',
        remoteHosts: ['server.smithery.ai'],
      }),
    ).toBe('community');
  });

  it('is registry for a domain-verified publisher that is not a recognised vendor', () => {
    expect(
      deriveRegistryBadge({ registryName: 'com.acme/tool', remoteHosts: ['acme.workers.dev'] }),
    ).toBe('registry');
    expect(deriveRegistryBadge({ registryName: 'com.acme/tool', remoteHosts: [] })).toBe(
      'registry',
    );
  });

  it('is community for a GitHub namespace without a vendor identity', () => {
    expect(
      deriveRegistryBadge({
        registryName: 'io.github.acme/weather',
        remoteHosts: ['weather.example.com'],
      }),
    ).toBe('community');
    expect(deriveRegistryBadge({ registryName: 'io.github.acme/local', remoteHosts: [] })).toBe(
      'community',
    );
  });

  it('is community for a namespace that is itself a hosting platform subdomain', () => {
    expect(
      deriveRegistryBadge({
        registryName: 'app.netlify.meinlem/nexo',
        remoteHosts: ['meinlem.netlify.app'],
      }),
    ).toBe('community');
  });
});

describe('upgradeToVerifiedBadge', () => {
  const vendorDomains = new Set(['notion.com']);

  it('lifts community and registry to verified when a catalog vendor domain hosts the remote', () => {
    expect(upgradeToVerifiedBadge('community', ['api.notion.com'], vendorDomains)).toBe('verified');
    expect(upgradeToVerifiedBadge('registry', ['api.notion.com'], vendorDomains)).toBe('verified');
  });

  it('never lowers official or first-party', () => {
    expect(upgradeToVerifiedBadge('official', ['api.notion.com'], vendorDomains)).toBe('official');
    expect(upgradeToVerifiedBadge('first-party', ['api.notion.com'], vendorDomains)).toBe(
      'first-party',
    );
  });

  it('ignores hosting platforms and unknown domains', () => {
    expect(upgradeToVerifiedBadge('community', ['notion.workers.dev'], vendorDomains)).toBe(
      'community',
    );
    expect(upgradeToVerifiedBadge('community', ['other.example.com'], vendorDomains)).toBe(
      'community',
    );
  });
});

describe('strongerBadge', () => {
  it('ranks first-party over official over verified over registry over community', () => {
    expect(strongerBadge('community', 'registry')).toBe('registry');
    expect(strongerBadge('registry', 'verified')).toBe('verified');
    expect(strongerBadge('verified', 'official')).toBe('official');
    expect(strongerBadge('official', 'first-party')).toBe('first-party');
    expect(strongerBadge('first-party', 'community')).toBe('first-party');
  });
});
