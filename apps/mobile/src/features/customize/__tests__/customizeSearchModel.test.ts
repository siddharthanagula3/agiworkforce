import { Bot, Sparkles } from 'lucide-react-native';

import type { ConnectedConnector, ConnectorListing } from '@/services/connectors';

import {
  type CustomizeSearchDestination,
  connectorSearchRows,
  destinationSearchRows,
  skillSearchRows,
} from '../customizeSearchModel';

function listing(id: string, name: string): ConnectorListing {
  return { id, name, description: `About ${name}` } as ConnectorListing;
}

function connection(connectorId: string, name: string, directoryId?: string): ConnectedConnector {
  return { connectorId, directoryId, name } as ConnectedConnector;
}

describe('connectorSearchRows', () => {
  it('labels a connector that is not released yet instead of hiding it', () => {
    const rows = connectorSearchRows({
      listings: [listing('google-calendar', 'Google Calendar')],
      connections: [],
      term: 'calendar',
      bankLinking: false,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.description).toBe('Coming soon');
  });

  it('opens a connected connector through its connection id', () => {
    const rows = connectorSearchRows({
      listings: [listing('notion', 'Notion')],
      connections: [connection('notion-work', 'Notion', 'notion')],
      term: 'notion',
      bankLinking: false,
    });
    expect(rows).toEqual([expect.objectContaining({ routeId: 'notion-work' })]);
  });

  it('adds a connected connector the directory does not list when its name matches', () => {
    const rows = connectorSearchRows({
      listings: [],
      connections: [connection('custom-1', 'Team wiki'), connection('custom-2', 'Other')],
      term: 'wiki',
      bankLinking: false,
    });
    expect(rows.map((row) => row.routeId)).toEqual(['custom-1']);
  });
});

describe('skillSearchRows', () => {
  it('matches the title and leaves out skills that are not out yet', () => {
    const rows = skillSearchRows(
      [
        { name: 'a', title: 'Calendar helper', description: '', lifecycle: 'included' },
        { name: 'b', description: 'calendar', lifecycle: 'planned' },
      ] as never,
      'calendar',
    );
    expect(rows.map((row) => row.title)).toEqual(['Calendar helper']);
  });
});

describe('destinationSearchRows', () => {
  it('matches a page by its title or its description', () => {
    const destinations: CustomizeSearchDestination[] = [
      { key: 'skills', title: 'Skills', body: 'Instructions', route: '/a', Icon: Sparkles },
      {
        key: 'agents',
        title: 'Agents',
        body: 'Assistants with tools',
        route: '/b',
        Icon: Bot,
      },
    ];
    expect(destinationSearchRows(destinations, 'skill').map((row) => row.key)).toEqual(['skills']);
    expect(destinationSearchRows(destinations, 'TOOLS').map((row) => row.key)).toEqual(['agents']);
  });
});
