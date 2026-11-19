import type { ConnectedConnector, ConnectorListing } from '@/services/connectors';
import type { ManagedSkillSummary } from '@/src/features/skills/service';

import {
  buildDiscoverGroups,
  DISCOVER_GROUP_LIMIT,
  workCategoriesFrom,
  type DiscoverSources,
} from '../discoverSuggestions';

function listing(id: string, overrides: Partial<ConnectorListing> = {}): ConnectorListing {
  return {
    id,
    name: id,
    description: `${id} description`,
    categories: ['Productivity'],
    connectable: 'connect',
    ...overrides,
  } as ConnectorListing;
}

function connection(
  connectorId: string,
  overrides: Partial<ConnectedConnector> = {},
): ConnectedConnector {
  return {
    id: `c-${connectorId}`,
    connectorId,
    source: 'managed',
    ...overrides,
  } as ConnectedConnector;
}

function skill(name: string, overrides: Partial<ManagedSkillSummary> = {}): ManagedSkillSummary {
  return {
    name,
    description: `${name} description`,
    source: 'bundled',
    lifecycle: 'included',
    downloadable: true,
    installs: 1,
    ...overrides,
  } as ManagedSkillSummary;
}

function sources(overrides: Partial<DiscoverSources> = {}): DiscoverSources {
  return {
    listings: [],
    connections: [],
    workCategories: ['Productivity', 'Data'],
    skills: [],
    installed: new Set(),
    ...overrides,
  };
}

const RELEASED = ['notion', 'linear', 'jira', 'airtable', 'canva', 'clickup', 'monday'];

describe('discover groups', () => {
  it('lists featured and personal connectors under Everyday tools', () => {
    const groups = buildDiscoverGroups(
      sources({
        listings: [
          listing('notion', { featured: true }),
          listing('linear', { personalSources: ['calendar'] }),
          listing('jira'),
        ],
      }),
    );
    expect(groups.everyday.map((row) => row.routeId)).toEqual(['notion', 'linear']);
    expect(groups.business.map((row) => row.routeId)).toEqual(['jira']);
  });

  it('keeps a connector that is not released out of both groups', () => {
    const groups = buildDiscoverGroups(
      sources({
        listings: [listing('gmail', { featured: true }), listing('mystery-server')],
      }),
    );
    expect(groups).toEqual({ everyday: [], business: [] });
  });

  it('keeps out a connector that cannot be connected from the phone', () => {
    const groups = buildDiscoverGroups(
      sources({ listings: [listing('notion', { featured: true, connectable: 'needs-setup' })] }),
    );
    expect(groups.everyday).toEqual([]);
  });

  it('puts only connectors in the work categories under Business essentials', () => {
    const groups = buildDiscoverGroups(
      sources({
        listings: [
          listing('notion', { categories: ['Design'] }),
          listing('linear', { categories: ['Data'] }),
        ],
      }),
    );
    expect(groups.business.map((row) => row.routeId)).toEqual(['linear']);
  });

  it('caps each group at five rows and keeps popular order', () => {
    const groups = buildDiscoverGroups(sources({ listings: RELEASED.map((id) => listing(id)) }));
    expect(groups.business.map((row) => row.routeId)).toEqual(
      RELEASED.slice(0, DISCOVER_GROUP_LIMIT),
    );
  });

  it('fills Everyday tools with the most installed skills after at most three connectors', () => {
    const groups = buildDiscoverGroups(
      sources({
        listings: RELEASED.slice(0, 4).map((id) => listing(id, { featured: true })),
        skills: [
          skill('a', { installs: 3 }),
          skill('b', { installs: 9 }),
          skill('c', { installs: 5 }),
        ],
      }),
    );
    expect(groups.everyday.map((row) => row.key)).toEqual([
      'connector:notion',
      'connector:linear',
      'connector:jira',
      'skill:b',
      'skill:c',
    ]);
  });

  it('gives skills the free slots when few connectors qualify', () => {
    const groups = buildDiscoverGroups(
      sources({
        skills: ['a', 'b', 'c', 'd', 'e', 'f'].map((name, index) =>
          skill(name, { installs: 10 - index }),
        ),
      }),
    );
    expect(groups.everyday.map((row) => row.routeId)).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('shows only skills that carry an install count, so a server without the count adds none', () => {
    const groups = buildDiscoverGroups(
      sources({
        skills: [skill('plain', { installs: undefined } as Partial<ManagedSkillSummary>)],
      }),
    );
    expect(groups.everyday).toEqual([]);
  });

  it('leaves out skills the person wrote, plugin skills and drafts', () => {
    const groups = buildDiscoverGroups(
      sources({
        skills: [
          skill('mine', { source: 'personal' }),
          skill('bundle', { source: 'extra' }),
          skill('later', { lifecycle: 'draft' }),
          skill('ok'),
        ],
      }),
    );
    expect(groups.everyday.map((row) => row.routeId)).toEqual(['ok']);
  });

  it('marks an installed skill and a connected connector as added', () => {
    const groups = buildDiscoverGroups(
      sources({
        listings: [listing('notion', { featured: true })],
        connections: [connection('notion')],
        skills: [skill('writer', { installs: 5 }), skill('coder')],
        installed: new Set(['writer']),
      }),
    );
    expect(groups.everyday.map((row) => [row.key, row.state])).toEqual([
      ['connector:notion', 'added'],
      ['skill:writer', 'added'],
      ['skill:coder', 'add'],
    ]);
  });

  it('offers the plus again for a connection that needs to be authorized again', () => {
    const groups = buildDiscoverGroups(
      sources({
        listings: [listing('notion', { featured: true })],
        connections: [connection('notion', { needsReauthorization: true })],
      }),
    );
    expect(groups.everyday[0]?.state).toBe('add');
  });

  it('uses the skill title when there is one', () => {
    const groups = buildDiscoverGroups(
      sources({ skills: [skill('docx-writer', { title: 'Word documents' })] }),
    );
    expect(groups.everyday[0]?.title).toBe('Word documents');
  });

  it('shows no connector row when the connections could not be read', () => {
    const groups = buildDiscoverGroups(
      sources({ listings: [listing('notion', { featured: true })], connections: null }),
    );
    expect(groups.everyday).toEqual([]);
  });

  it('keeps only the work categories the directory returned', () => {
    expect(workCategoriesFrom(['Code', 'Data', 'Legal'])).toEqual(['Data', 'Legal']);
  });
});
