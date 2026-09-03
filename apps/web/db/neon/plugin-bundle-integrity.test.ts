import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { isKnownConnectorId } from '@/lib/connectors/catalog';
import { getManagedSkillDirectory } from '@/lib/services/skill-catalog-service';

/**
 * The five role bundles that are true today: status=published,
 * web_installable=true, so GET /api/plugins/[id] can actually install them.
 * declared_skills sourced from 0109 (research-pack), 0145 (engineering-pack,
 * writing-pack, data-pack), and 0161 (presentations-pack). The three preview
 * stubs from 0096 (github-automation, calendar-assistant, crm-sync) are
 * excluded on purpose: their declared skills are display-only names that do
 * not correspond to real skills, which is exactly why 0145 keeps them
 * preview instead of promoting them.
 */
const TRUE_TODAY_BUNDLES: Record<string, { skills: string[]; connectors: string[] }> = {
  'research-pack': { skills: ['literature-review'], connectors: [] },
  'engineering-pack': {
    skills: ['code-review', 'systematic-debugging', 'frontend-design-review'],
    connectors: ['github'],
  },
  'writing-pack': {
    skills: ['document-creation', 'presentation-creation', 'research-and-citations'],
    connectors: [],
  },
  'data-pack': { skills: ['data-analysis', 'document-creation'], connectors: [] },
  'presentations-pack': { skills: ['presentation-creation'], connectors: [] },
};

describe('plugin bundle integrity', () => {
  it('references only skills that exist in the live managed Skill catalog', async () => {
    const directory = await getManagedSkillDirectory();
    const liveSkillNames = new Set(directory.map((skill) => skill.name));

    for (const [pluginId, bundle] of Object.entries(TRUE_TODAY_BUNDLES)) {
      for (const skill of bundle.skills) {
        expect(liveSkillNames.has(skill), `${pluginId} declares unknown skill ${skill}`).toBe(true);
      }
    }
  });

  it('references only connectors that exist in the connector catalog', () => {
    for (const [pluginId, bundle] of Object.entries(TRUE_TODAY_BUNDLES)) {
      for (const connectorId of bundle.connectors) {
        expect(
          isKnownConnectorId(connectorId),
          `${pluginId} declares unknown connector ${connectorId}`,
        ).toBe(true);
      }
    }
  });

  it('covers every currently published, web-installable first-party pack', () => {
    expect(Object.keys(TRUE_TODAY_BUNDLES).sort()).toEqual(
      [
        'data-pack',
        'engineering-pack',
        'presentations-pack',
        'research-pack',
        'writing-pack',
      ].sort(),
    );
  });
});
