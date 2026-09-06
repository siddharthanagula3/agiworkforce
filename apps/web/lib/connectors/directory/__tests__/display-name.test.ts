import { describe, expect, it } from 'vitest';

const EM_DASH = String.fromCodePoint(0x2014);

import {
  caseTokens,
  cleanRegistryTitle,
  deriveDisplayName,
  deriveDisplayTitle,
  deriveNameFromRegistryId,
  splitRegistryTitle,
} from '@/lib/connectors/directory/display-name';

describe('deriveNameFromRegistryId', () => {
  it('drops the reverse-dns namespace and the mcp and server suffixes', () => {
    expect(deriveNameFromRegistryId('io.github.acme/weather-mcp-server')).toBe('Weather');
    expect(deriveNameFromRegistryId('io.github.acme/weather-mcp')).toBe('Weather');
    expect(deriveNameFromRegistryId('io.github.acme/weather-server')).toBe('Weather');
  });

  it('drops mcp tokens anywhere in the leaf', () => {
    expect(deriveNameFromRegistryId('io.github.acme/mcp-github-tools')).toBe('GitHub Tools');
    expect(deriveNameFromRegistryId('io.github.acme/weather-mcp-bridge')).toBe('Weather Bridge');
  });

  it('drops the author segment when the leaf repeats it', () => {
    expect(deriveNameFromRegistryId('io.github.acme/acme-linkedin_scraper')).toBe(
      'LinkedIn Scraper',
    );
    expect(deriveNameFromRegistryId('ai.smithery/smithery-ai-slack')).toBe('Slack');
  });

  it('splits kebab and snake case and applies brand casing', () => {
    expect(deriveNameFromRegistryId('io.github.acme/paypal_youtube-ios-macos')).toBe(
      'PayPal YouTube iOS macOS',
    );
    expect(deriveNameFromRegistryId('io.github.acme/openai-hubspot')).toBe('OpenAI HubSpot');
  });

  it('falls back to the publisher when the leaf is only generic tokens', () => {
    expect(deriveNameFromRegistryId('com.paypal/mcp')).toBe('PayPal');
    expect(deriveNameFromRegistryId('io.github.acme/server')).toBe('Acme');
    expect(deriveNameFromRegistryId('io.github.acme/api-tools')).toBe('Acme API Tools');
    expect(deriveNameFromRegistryId('ac.tandem/docs-mcp')).toBe('Tandem Docs');
  });

  it('drops hex-like build tokens from the leaf', () => {
    expect(deriveNameFromRegistryId('io.github.acme/weather-3f2a9c1e')).toBe('Weather');
  });

  it('keeps inner capitals a publisher chose', () => {
    expect(caseTokens('KnowBe4-reporting')).toBe('KnowBe4 Reporting');
  });
});

describe('cleanRegistryTitle', () => {
  it('drops mcp, mcp server and mcp for ai agents tokens anywhere in the title', () => {
    expect(cleanRegistryTitle('Weather Server MCP')).toBe('Weather Server');
    expect(cleanRegistryTitle('Notion (MCP)')).toBe('Notion');
    expect(cleanRegistryTitle('Weather MCP Server')).toBe('Weather');
    expect(cleanRegistryTitle('MCP Toolbox for Databases')).toBe('Toolbox for Databases');
    expect(cleanRegistryTitle('YouTube Transcript + YouTube Search MCP for AI Agents')).toBe(
      'YouTube Transcript + YouTube Search',
    );
    expect(cleanRegistryTitle('FastMCP Bridge')).toBe('FastMCP Bridge');
  });

  it('strips leading emoji, symbols and parentheticals but keeps a dotted brand', () => {
    expect(cleanRegistryTitle('💯 YouTube Transcript')).toBe('YouTube Transcript');
    expect(cleanRegistryTitle('$THREE Token')).toBe('THREE Token');
    expect(cleanRegistryTitle('.FAF Context')).toBe('FAF Context');
    expect(cleanRegistryTitle('(WiP) An everything app')).toBe('An everything app');
    expect(cleanRegistryTitle('@imqueue')).toBe('Imqueue');
    expect(cleanRegistryTitle('.NET Debugger')).toBe('.NET Debugger');
  });

  it('keeps only the head before a dash, pipe or colon separator and returns the tagline', () => {
    expect(cleanRegistryTitle('Cathedral - Persistent Memory for AI Agents')).toBe('Cathedral');
    expect(cleanRegistryTitle('MCP Observatory: one read only walk over endpoints')).toBe(
      'Observatory',
    );
    expect(cleanRegistryTitle('Linear | Issues')).toBe('Linear');
    expect(splitRegistryTitle('0nMCP - Universal AI API Orchestrator')).toEqual({
      name: '0nMCP',
      tagline: 'Universal AI API Orchestrator',
    });
    expect(splitRegistryTitle('Notion').tagline).toBe('');
  });

  it('caps a name at forty characters on a word boundary', () => {
    expect(cleanRegistryTitle('emem, the verifiable memory protocol for the physical world')).toBe(
      'emem, the verifiable memory protocol',
    );
    expect(cleanRegistryTitle('Australian Economic Data (ABS, RBA & APRA)')).toBe(
      'Australian Economic Data',
    );
    expect(cleanRegistryTitle('Contractor License Verification (TradesAPI)')).toBe(
      'Contractor License Verification',
    );
  });

  it('normalises em dashes, including mojibake, before splitting', () => {
    expect(cleanRegistryTitle(`Delx Protocol ${EM_DASH} Agent Recovery`)).toBe('Delx Protocol');
    expect(cleanRegistryTitle('Delx Protocol â€” Agent Recovery')).toBe('Delx Protocol');
  });

  it('never leaves a dangling separator after stripping a suffix', () => {
    expect(cleanRegistryTitle('Execute 3d-pallet-packing-mcp')).toBe('Execute 3D Pallet Packing');
    expect(cleanRegistryTitle('1c-rest-mcp')).toBe('1c Rest');
  });

  it('title-cases a title that is only lowercase slug words', () => {
    expect(cleanRegistryTitle('agent-godmode')).toBe('Agent Godmode');
    expect(cleanRegistryTitle('adb-mcp: Android emulator control')).toBe('ADB');
  });

  it('leaves mixed-case product names and dotted names alone', () => {
    expect(cleanRegistryTitle('e-Stat')).toBe('e-Stat');
    expect(cleanRegistryTitle('Chess.com MCP by UnClick')).toBe('Chess.com by UnClick');
    expect(cleanRegistryTitle('arXiv')).toBe('arXiv');
  });

  it('rejects a title long enough to be a sentence', () => {
    expect(
      cleanRegistryTitle(
        'FastMCP server for Obsidian wikilink suggestions from a pre-computed knowledge graph',
      ),
    ).toBe('');
  });
});

describe('deriveDisplayTitle', () => {
  it('returns the tagline alongside the name and none for an id-derived name', () => {
    expect(deriveDisplayTitle('io.github.acme/cathedral', 'Cathedral - Persistent memory')).toEqual(
      {
        name: 'Cathedral',
        tagline: 'Persistent memory',
      },
    );
    expect(deriveDisplayTitle('io.github.acme/weather-mcp', undefined)).toEqual({
      name: 'Weather',
      tagline: '',
    });
  });
});

describe('deriveDisplayName', () => {
  it('prefers a usable registry title', () => {
    expect(deriveDisplayName('io.github.acme/weather', 'Weather Server MCP')).toBe(
      'Weather Server',
    );
  });

  it('derives from the id when the title is missing, is the id, or is unusable', () => {
    expect(deriveDisplayName('io.github.acme/weather-mcp', undefined)).toBe('Weather');
    expect(deriveDisplayName('io.github.acme/weather-mcp', 'io.github.acme/weather-mcp')).toBe(
      'Weather',
    );
    expect(
      deriveDisplayName(
        'io.github.acme/graph-autotagger-mcp',
        'FastMCP server for Obsidian wikilink suggestions from a pre-computed knowledge graph',
      ),
    ).toBe('Graph Autotagger');
  });
});
