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

const WEATHER_ENTRY: RegistryEntry = {
  server: {
    name: 'io.github.acme/weather',
    title: 'Weather Server MCP',
    description: 'Weather forecasts over MCP. See https://weather.example.com/docs for details.',
    version: '2.0.0',
    remotes: [{ type: 'streamable-http', url: 'https://weather.example.com/mcp' }],
    websiteUrl: 'https://weather.example.com/docs',
    icons: [{ src: 'https://weather.example.com/icon.png', mimeType: 'image/png' }],
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
    expect(record).toMatchObject({
      authMode: 'none',
      connectable: 'desktop-and-cli',
      remotes: [],
      websiteUrl: null,
      iconSource: 'monogram',
    });
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

  it('keeps the raw registry name as the id and derives a clean display name', () => {
    expect(normalizeRegistryEntry(SMITHERY_SLACK_ENTRY)).toMatchObject({
      id: 'ai.smithery/smithery-ai-slack',
      name: 'Slack',
      monogram: 'S',
    });
    expect(normalizeRegistryEntry(TANDEM_DOCS_ENTRY)?.name).toBe('Tandem Docs');
    expect(normalizeRegistryEntry(WEATHER_ENTRY)).toMatchObject({
      name: 'Weather Server',
      monogram: 'WS',
    });
  });

  it('summarises the description to one clean sentence', () => {
    expect(normalizeRegistryEntry(SMITHERY_SLACK_ENTRY)?.description).toBe(
      'Enable interaction with Slack workspaces.',
    );
    expect(normalizeRegistryEntry(WEATHER_ENTRY)?.description).toBe('Weather forecasts over MCP.');
  });

  it('never leaves a description empty', () => {
    const record = normalizeRegistryEntry({
      server: {
        name: 'io.github.acme/postgres-tools',
        description: '',
        version: '1.0.0',
        remotes: [{ type: 'streamable-http', url: 'https://tools.acme.dev/mcp' }],
      },
    });
    expect(record?.description).toBe('Postgres Tools is a connector for data and search.');
  });

  it('derives categories and the monogram hue from description, id and hosts', () => {
    const slack = normalizeRegistryEntry(SMITHERY_SLACK_ENTRY);
    expect(slack?.categories[0]).toBe('Communication');
    expect(slack?.monogramHue).toBe('communication');

    const stripe = normalizeRegistryEntry({
      server: {
        name: 'com.stripe/mcp',
        description: 'Tools.',
        version: '1.0.0',
        remotes: [{ type: 'streamable-http', url: 'https://mcp.stripe.com' }],
      },
    });
    expect(stripe?.categories[0]).toBe('Financial services');
    expect(stripe?.monogramHue).toBe('financial-services');
  });

  it('badges an aggregator namespace as community', () => {
    expect(normalizeRegistryEntry(SMITHERY_SLACK_ENTRY)?.badge).toBe('community');
  });

  it('badges a domain-verified publisher that is not a recognised vendor as registry', () => {
    expect(normalizeRegistryEntry(TANDEM_DOCS_ENTRY)?.badge).toBe('registry');
  });

  it('badges a recognised vendor publishing its own product as official', () => {
    const stripe = normalizeRegistryEntry({
      server: {
        name: 'com.stripe/mcp',
        description: 'Stripe tools.',
        version: '1.0.0',
        remotes: [{ type: 'streamable-http', url: 'https://mcp.stripe.com' }],
      },
    });
    expect(stripe?.badge).toBe('official');
  });

  it('moves a title tagline into the description when the registry description repeats the name', () => {
    const record = normalizeRegistryEntry({
      server: {
        name: 'io.github.acme/cathedral-mcp',
        title: 'Cathedral - Persistent memory for AI coding agents',
        description: 'Cathedral MCP server',
        version: '1.0.0',
        remotes: [{ type: 'streamable-http', url: 'https://cathedral.example.com/mcp' }],
      },
    });
    expect(record).toMatchObject({
      name: 'Cathedral',
      description: 'Persistent memory for AI coding agents.',
    });
  });

  it('badges a GitHub namespace with a remote on another domain as community', () => {
    expect(normalizeRegistryEntry(WEATHER_ENTRY)?.badge).toBe('community');
  });

  it('carries the registry icon and website url and prefers the registry icon', () => {
    expect(normalizeRegistryEntry(WEATHER_ENTRY)).toMatchObject({
      iconUrl: 'https://weather.example.com/icon.png',
      websiteUrl: 'https://weather.example.com/docs',
      documentationUrl: null,
      iconSource: 'registry',
    });
  });

  it('falls back to the remote origin as the website and probes it for a favicon', () => {
    expect(normalizeRegistryEntry(TANDEM_DOCS_ENTRY)).toMatchObject({
      iconUrl: null,
      websiteUrl: 'https://tandem.ac',
      iconSource: 'site',
    });
  });

  it('never probes a code forge or hosting platform for a favicon', () => {
    const forge = normalizeRegistryEntry({
      server: {
        name: 'io.github.acme/tool',
        description: 'A tool.',
        version: '1.0.0',
        packages: [{ registryType: 'npm', identifier: '@acme/tool' }],
        repository: { url: 'https://github.com/acme/tool', source: 'github' },
      },
    });
    expect(forge).toMatchObject({
      websiteUrl: 'https://github.com/acme/tool',
      iconSource: 'monogram',
    });

    const hosted = normalizeRegistryEntry({
      server: {
        name: 'io.github.acme/tool',
        description: 'A tool.',
        version: '1.0.0',
        remotes: [{ type: 'streamable-http', url: 'https://tool.acme.workers.dev/mcp' }],
      },
    });
    expect(hosted?.iconSource).toBe('monogram');
  });

  it('names the author from the repository owner and links the owner page', () => {
    const record = normalizeRegistryEntry(SMITHERY_SLACK_ENTRY);
    expect(record?.authorName).toBe('smithery-ai');
    expect(record?.authorUrl).toBe('https://github.com/smithery-ai');
  });

  it('links the owner page on any known forge and falls back to the publisher otherwise', () => {
    const gitlab = normalizeRegistryEntry({
      server: {
        name: 'io.github.acme/tool',
        description: 'A tool.',
        version: '1.0.0',
        remotes: [{ type: 'streamable-http', url: 'https://tool.example.com/mcp' }],
        repository: { url: 'https://gitlab.com/acme/tool', source: 'gitlab' },
      },
    });
    expect(gitlab?.authorUrl).toBe('https://gitlab.com/acme');
    expect(normalizeRegistryEntry(WEATHER_ENTRY)).toMatchObject({
      authorName: 'acme',
      authorUrl: null,
    });
  });

  it('resolves iconSource to brand from the namespace owner or the remote host', () => {
    const owner = normalizeRegistryEntry({
      server: {
        name: 'io.github.notion/community-tool',
        description: 'A community tool published under the notion GitHub org.',
        version: '1.0.0',
        remotes: [{ type: 'streamable-http', url: 'https://notion-tool.example.com/mcp' }],
      },
    });
    expect(owner).toMatchObject({ publisher: 'notion', iconSource: 'brand', brandSlug: 'notion' });

    const host = normalizeRegistryEntry({
      server: {
        name: 'io.github.someone/linear-mirror',
        description: 'Mirror.',
        version: '1.0.0',
        remotes: [{ type: 'streamable-http', url: 'https://mcp.linear.app/mcp' }],
      },
    });
    expect(host).toMatchObject({ iconSource: 'brand', brandSlug: 'linear' });
  });
});
