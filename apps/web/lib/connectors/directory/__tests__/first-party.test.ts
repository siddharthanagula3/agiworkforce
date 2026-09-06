import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { FIRST_PARTY_MCP_TARGETS } from '@/lib/connectors/directory/first-party';
import { hostnameOf } from '@/lib/connectors/directory/hosts';
import { MAX_DESCRIPTION_LENGTH } from '@/lib/connectors/directory/summary';

const HTTPS = 'https:';
const TRANSPORTS = new Set(['streamable-http', 'sse']);
const AUTH_MODES = new Set(['oauth', 'api-key', 'none', 'unknown']);
const EM_DASH = String.fromCodePoint(0x2014);
const EN_DASH = '–';
const SENTENCE_END = /[.!?]$/u;

describe('first-party seeds', () => {
  it('use unique connector ids', () => {
    const ids = FIRST_PARTY_MCP_TARGETS.map((target) => target.connectorId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('point every remote and documentation link at an https origin', () => {
    for (const target of FIRST_PARTY_MCP_TARGETS) {
      expect(new URL(target.url).protocol).toBe(HTTPS);
      expect(new URL(target.documentationUrl).protocol).toBe(HTTPS);
      expect(hostnameOf(target.url)).not.toBeNull();
    }
  });

  it('declare a network transport and a known auth mode', () => {
    for (const target of FIRST_PARTY_MCP_TARGETS) {
      expect(TRANSPORTS.has(target.transport)).toBe(true);
      expect(AUTH_MODES.has(target.authMode ?? 'oauth')).toBe(true);
    }
  });

  it('carry one short sentence per card with no dashes', () => {
    for (const target of FIRST_PARTY_MCP_TARGETS) {
      expect(target.description.length).toBeLessThanOrEqual(MAX_DESCRIPTION_LENGTH);
      expect(SENTENCE_END.test(target.description)).toBe(true);
      expect(target.description).not.toContain(EM_DASH);
      expect(target.description).not.toContain(EN_DASH);
      expect(target.name).not.toContain(EM_DASH);
    }
  });

  it('seed the vendor endpoints verified against vendor documentation', () => {
    const byId = new Map(FIRST_PARTY_MCP_TARGETS.map((target) => [target.connectorId, target]));

    expect(byId.get('plaid')).toMatchObject({
      url: 'https://api.dashboard.plaid.com/mcp/',
      transport: 'streamable-http',
      authMode: 'api-key',
      documentationUrl: 'https://plaid.com/docs/resources/mcp/',
    });
    expect(byId.get('stripe')).toMatchObject({ url: 'https://mcp.stripe.com', authMode: 'oauth' });
    expect(byId.get('paypal')).toMatchObject({
      url: 'https://mcp.paypal.com/http',
      authMode: 'api-key',
    });
    expect(byId.get('zapier')).toMatchObject({ url: 'https://mcp.zapier.com/api/v1/connect' });
    expect(byId.get('asana')).toMatchObject({ url: 'https://mcp.asana.com/v2/mcp' });
    expect(byId.get('jira')).toMatchObject({ url: 'https://mcp.atlassian.com/v2/mcp' });
  });
});
