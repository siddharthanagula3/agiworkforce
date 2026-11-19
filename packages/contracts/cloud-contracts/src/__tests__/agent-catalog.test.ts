import { describe, expect, it } from 'vitest';
import {
  AGENT_CATALOG,
  AgentCatalogEntrySchema,
  agentCatalogCreateRequest,
  findAgentCatalogCopy,
} from '../agent-catalog';
import { AgentCreateRequestSchema } from '../agents';

describe('agent catalog', () => {
  it('lists the six built-in agents once each', () => {
    expect(AGENT_CATALOG.map((entry) => entry.name)).toEqual([
      'Coding partner',
      'Brainstormer',
      'Writing editor',
      'Learning coach',
      'Career guide',
      'Research helper',
    ]);
    expect(new Set(AGENT_CATALOG.map((entry) => entry.id)).size).toBe(AGENT_CATALOG.length);
    expect(new Set(AGENT_CATALOG.map((entry) => entry.name)).size).toBe(AGENT_CATALOG.length);
  });

  it('gives every entry a valid description, icon, accent, instructions and starters', () => {
    for (const entry of AGENT_CATALOG) {
      expect(AgentCatalogEntrySchema.safeParse(entry).success).toBe(true);
      expect(entry.description.length).toBeGreaterThan(0);
      expect(entry.instructions.trim().length).toBeGreaterThan(0);
      expect(entry.conversationStarters.length).toBeGreaterThan(0);
    }
  });

  it('writes no em dashes in the product copy', () => {
    for (const entry of AGENT_CATALOG) {
      const copy = [
        entry.name,
        entry.description,
        entry.instructions,
        ...entry.conversationStarters,
      ].join('\n');
      // em-dash-allow: the character this assertion forbids in the catalog copy
      expect(copy).not.toContain('\u2014');
    }
  });

  it('builds a create request the agents route accepts', () => {
    for (const entry of AGENT_CATALOG) {
      const request = agentCatalogCreateRequest(entry);
      expect(AgentCreateRequestSchema.safeParse(request).success).toBe(true);
      expect(request).toEqual({
        name: entry.name,
        description: entry.description,
        icon: entry.icon,
        accentColor: entry.accentColor,
        instructions: entry.instructions,
        conversationStarters: entry.conversationStarters,
      });
    }
  });

  it('finds only an owned, unretired copy with the same name and instructions', () => {
    const [entry] = AGENT_CATALOG;
    if (!entry) throw new Error('the agent catalog is empty');
    const copy = {
      name: entry.name,
      instructions: entry.instructions,
      isOwner: true,
      status: 'active',
    };
    expect(findAgentCatalogCopy(entry, [copy])).toBe(copy);
    expect(findAgentCatalogCopy(entry, [{ ...copy, isOwner: false }])).toBeNull();
    expect(findAgentCatalogCopy(entry, [{ ...copy, status: 'retired' }])).toBeNull();
    expect(findAgentCatalogCopy(entry, [{ ...copy, instructions: 'Mine' }])).toBeNull();
    expect(findAgentCatalogCopy(entry, [{ ...copy, name: 'Mine' }])).toBeNull();
  });
});
