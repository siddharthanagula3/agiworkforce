import { describe, expect, it } from 'vitest';

import {
  hostnameOf,
  isCodeForgeHost,
  isHostingPlatformHost,
  originOf,
  registrableDomain,
  repositoryOwnerOf,
  repositoryOwnerUrl,
  secondLevelLabel,
} from '@/lib/connectors/directory/hosts';

describe('hostnameOf', () => {
  it('lowercases the hostname of a parseable url', () => {
    expect(hostnameOf('https://MCP.Notion.com/mcp')).toBe('mcp.notion.com');
  });

  it('rejects template placeholders that the url parser accepts as hosts', () => {
    expect(hostnameOf('https://{host}/mcp')).toBeNull();
    expect(hostnameOf('https://{site_domain}/api/mcp')).toBeNull();
  });

  it('returns null for text that is not a url', () => {
    expect(hostnameOf('not a url')).toBeNull();
  });
});

describe('originOf', () => {
  it('returns the origin of a url and null otherwise', () => {
    expect(originOf('https://developers.notion.com/guides/mcp')).toBe(
      'https://developers.notion.com',
    );
    expect(originOf('')).toBeNull();
  });
});

describe('registrableDomain', () => {
  it('keeps the last two labels of an ordinary host', () => {
    expect(registrableDomain('mcp.notion.com')).toBe('notion.com');
    expect(registrableDomain('notion.com')).toBe('notion.com');
  });

  it('keeps three labels under a multi-label public suffix', () => {
    expect(registrableDomain('api.acme.co.uk')).toBe('acme.co.uk');
  });

  it('exposes the second-level label on its own', () => {
    expect(secondLevelLabel('server.smithery.ai')).toBe('smithery');
  });
});

describe('host classes', () => {
  it('recognises hosting platforms by suffix', () => {
    expect(isHostingPlatformHost('weather.acme.workers.dev')).toBe(true);
    expect(isHostingPlatformHost('meinlem.netlify.app')).toBe(true);
    expect(isHostingPlatformHost('mcp.notion.com')).toBe(false);
  });

  it('recognises code forges and package registries', () => {
    expect(isCodeForgeHost('github.com')).toBe(true);
    expect(isCodeForgeHost('www.npmjs.com')).toBe(true);
    expect(isCodeForgeHost('tandem.ac')).toBe(false);
  });
});

describe('repository owner', () => {
  it('reads the owner segment from a forge url', () => {
    expect(repositoryOwnerOf('https://github.com/frumu-ai/tandem')).toBe('frumu-ai');
    expect(repositoryOwnerUrl('https://gitlab.com/acme/tool')).toBe('https://gitlab.com/acme');
  });

  it('gives no owner for a repository that is not on a known forge', () => {
    expect(repositoryOwnerOf('https://example.com/acme/tool')).toBeNull();
    expect(repositoryOwnerUrl('https://example.com/acme/tool')).toBeNull();
  });
});
