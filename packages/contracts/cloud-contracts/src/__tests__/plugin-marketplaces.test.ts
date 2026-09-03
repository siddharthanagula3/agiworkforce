import { describe, expect, it } from 'vitest';

import {
  PLUGIN_MARKETPLACE_MANIFEST_PATH,
  PluginInstallationSettingsPatchSchema,
  PluginMarketplaceManifestSchema,
  isPluginMarketplaceContentHash,
  isPluginMarketplaceSourceStatus,
  parsePluginMarketplaceManifest,
} from '../plugin-marketplaces';

const VALID_MANIFEST = {
  name: 'Acme internal tools',
  plugins: [
    {
      id: 'acme-support-bundle',
      name: 'Acme Support Bundle',
      description: 'Support triage skills and connectors for the Acme helpdesk.',
      version: '1.0.0',
      skills: ['research-and-citations'],
      connectors: ['slack'],
      agents: ['triage-agent'],
      examplePrompts: ['Summarize this ticket thread.'],
      permissions: ['network'],
    },
  ],
};

describe('PLUGIN_MARKETPLACE_MANIFEST_PATH', () => {
  it('is a repo-relative dotfile path', () => {
    expect(PLUGIN_MARKETPLACE_MANIFEST_PATH).toBe('.agiworkforce/marketplace.json');
  });
});

describe('PluginMarketplaceManifestSchema', () => {
  it('parses a well-formed manifest', () => {
    const result = PluginMarketplaceManifestSchema.safeParse(VALID_MANIFEST);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.plugins[0]?.id).toBe('acme-support-bundle');
      expect(result.data.plugins[0]?.skills).toEqual(['research-and-citations']);
    }
  });

  it('defaults array fields to empty when omitted', () => {
    const result = parsePluginMarketplaceManifest({
      name: 'Minimal',
      plugins: [
        {
          id: 'minimal-plugin',
          name: 'Minimal Plugin',
          description: 'Does nothing yet.',
          version: '0.1.0',
        },
      ],
    });
    expect(result.plugins[0]?.skills).toEqual([]);
    expect(result.plugins[0]?.connectors).toEqual([]);
    expect(result.plugins[0]?.agents).toEqual([]);
  });

  it('rejects a plugin id that is not a safe slug', () => {
    const result = PluginMarketplaceManifestSchema.safeParse({
      name: 'Acme',
      plugins: [{ ...VALID_MANIFEST.plugins[0], id: 'Not A Slug!' }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects a loose version string', () => {
    const result = PluginMarketplaceManifestSchema.safeParse({
      name: 'Acme',
      plugins: [{ ...VALID_MANIFEST.plugins[0], version: 'latest' }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects an empty plugin list', () => {
    const result = PluginMarketplaceManifestSchema.safeParse({ name: 'Acme', plugins: [] });
    expect(result.success).toBe(false);
  });
});

describe('isPluginMarketplaceContentHash', () => {
  it('accepts a lowercase hex sha-256 digest', () => {
    expect(isPluginMarketplaceContentHash('a'.repeat(64))).toBe(true);
  });

  it('rejects an uppercase or short digest', () => {
    expect(isPluginMarketplaceContentHash('A'.repeat(64))).toBe(false);
    expect(isPluginMarketplaceContentHash('a'.repeat(63))).toBe(false);
    expect(isPluginMarketplaceContentHash(null)).toBe(false);
  });
});

describe('isPluginMarketplaceSourceStatus', () => {
  it('accepts the two known statuses and rejects everything else', () => {
    expect(isPluginMarketplaceSourceStatus('active')).toBe(true);
    expect(isPluginMarketplaceSourceStatus('error')).toBe(true);
    expect(isPluginMarketplaceSourceStatus('pending')).toBe(false);
  });
});

describe('PluginInstallationSettingsPatchSchema', () => {
  it('accepts a partial patch of enabled skills', () => {
    const result = PluginInstallationSettingsPatchSchema.safeParse({
      enabledSkills: ['code-review'],
    });
    expect(result.success).toBe(true);
  });

  it('accepts clearing custom example prompts back to defaults with null', () => {
    const result = PluginInstallationSettingsPatchSchema.safeParse({
      customExamplePrompts: null,
    });
    expect(result.success).toBe(true);
  });

  it('rejects an unknown field', () => {
    const result = PluginInstallationSettingsPatchSchema.safeParse({ pluginId: 'x' });
    expect(result.success).toBe(false);
  });
});
