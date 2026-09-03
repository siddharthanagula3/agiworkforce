import { describe, expect, it } from 'vitest';

import {
  derivePublisherFromNamespace,
  normalizeRegistryEntry,
} from '@/lib/connectors/directory/normalize';
import type { RegistryEntry } from '@/lib/connectors/directory/registry-client';

const SMITHERY_SLACK_ENTRY: RegistryEntry = {
  server: {
    name: 'ai.smithery/smithery-ai-slack',
    description:
      'Enable interaction with Slack workspaces. Supports subscribing to Slack events through Resources.',
    version: '1.0.0',
    repository: {
      url: 'https://github.com/smithery-ai/mcp-servers',
      source: 'github',
    },
    remotes: [
      {
        type: 'streamable-http',
        url: 'https://server.smithery.ai/@smithery-ai/slack/mcp',
        headers: [
          {
            name: 'Authorization',
            description: 'Bearer token for Smithery authentication',
            isRequired: true,
            isSecret: true,
            value: 'Bearer {smithery_api_key}',
          },
        ],
      },
    ],
  },
};

const TANDEM_DOCS_ENTRY: RegistryEntry = {
  server: {
    name: 'ac.tandem/docs-mcp',
    description:
      'Remote MCP server for Tandem docs, install guides, SDKs, workflows, and agent setup help.',
    version: '0.3.0',
    repository: {
      url: 'https://github.com/frumu-ai/tandem',
      source: 'github',
    },
    remotes: [{ type: 'streamable-http', url: 'https://tandem.ac/mcp' }],
  },
};

describe('derivePublisherFromNamespace', () => {
  it('unwraps the GitHub owner from an io.github.* namespace', () => {
    expect(derivePublisherFromNamespace('io.github.acme/weather')).toBe('acme');
  });

  it('reverses a dotted namespace into a domain-shaped label', () => {
    expect(derivePublisherFromNamespace('ai.smithery/smithery-ai-slack')).toBe('smithery.ai');
  });

  it('falls back to the bare namespace when it has no dots', () => {
    expect(derivePublisherFromNamespace('acme/weather')).toBe('acme');
  });
});

describe('normalizeRegistryEntry', () => {
  it('reads a secret header as api-key auth routed to the credential form', () => {
    const record = normalizeRegistryEntry(SMITHERY_SLACK_ENTRY);
    expect(record).toMatchObject({
      id: 'ai.smithery/smithery-ai-slack',
      publisher: 'smithery.ai',
      authMode: 'api-key',
      connectable: 'api-key-form',
      repositoryUrl: 'https://github.com/smithery-ai/mcp-servers',
      version: '1.0.0',
    });
    expect(record?.remotes).toEqual([
      { url: 'https://server.smithery.ai/@smithery-ai/slack/mcp', transport: 'streamable-http' },
    ]);
  });

  it('leaves a headerless remote as unknown auth needing setup', () => {
    const record = normalizeRegistryEntry(TANDEM_DOCS_ENTRY);
    expect(record).toMatchObject({
      id: 'ac.tandem/docs-mcp',
      authMode: 'unknown',
      connectable: 'needs-setup',
      repositoryUrl: 'https://github.com/frumu-ai/tandem',
    });
  });

  it('labels a packages-only server as desktop-and-cli with no auth concept', () => {
    const record = normalizeRegistryEntry({
      server: {
        name: 'io.github.acme/local-tool',
        description: 'Runs entirely on the caller machine via stdio.',
        version: '1.0.0',
        packages: [{ registryType: 'npm', identifier: '@acme/local-tool' }],
      },
    });
    expect(record).toMatchObject({ authMode: 'none', connectable: 'desktop-and-cli', remotes: [] });
  });

  it('drops an entry with neither remotes nor packages', () => {
    const record = normalizeRegistryEntry({
      server: {
        name: 'io.github.acme/empty',
        description: 'Nothing runnable declared.',
        version: '1.0.0',
      },
    });
    expect(record).toBeNull();
  });

  it('derives categories from the description when the registry has no category field', () => {
    const record = normalizeRegistryEntry(SMITHERY_SLACK_ENTRY);
    expect(record?.categories).toContain('Communication');
  });

  it('badges a custom-domain namespace as community', () => {
    const record = normalizeRegistryEntry(SMITHERY_SLACK_ENTRY);
    expect(record?.badge).toBe('community');
  });

  it('badges a GitHub-verified namespace as registry and carries its icon and docs url', () => {
    const record = normalizeRegistryEntry({
      server: {
        name: 'io.github.acme/weather',
        title: 'Weather Server',
        description: 'Weather forecasts over MCP.',
        version: '2.0.0',
        remotes: [{ type: 'streamable-http', url: 'https://weather.example.com/mcp' }],
        websiteUrl: 'https://weather.example.com/docs',
        icons: [{ src: 'https://weather.example.com/icon.png', mimeType: 'image/png' }],
      },
    });
    expect(record).toMatchObject({
      badge: 'registry',
      iconUrl: 'https://weather.example.com/icon.png',
      docsUrl: 'https://weather.example.com/docs',
      monogram: 'WS',
    });
  });

  it('has no icon or docs url when the registry entry declares neither', () => {
    const record = normalizeRegistryEntry(TANDEM_DOCS_ENTRY);
    expect(record?.iconUrl).toBeNull();
    expect(record?.docsUrl).toBeNull();
  });
});
