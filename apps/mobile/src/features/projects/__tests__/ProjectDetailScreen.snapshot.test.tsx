/* eslint-disable @typescript-eslint/no-require-imports */

import React from 'react';
import { View } from 'react-native';
import { render } from '@testing-library/react-native';
import { summarizeProjectHeader } from '@agiworkforce/types';
import type { ProjectRecord } from '@agiworkforce/types';

jest.mock('@/src/ui/theme', () => {
  const actual = jest.requireActual('@/src/ui/theme/tokens');
  return {
    ...actual,
    useThemeColors: () => actual.colors,
  };
});

jest.mock('@/components/ui/text', () => {
  const RN = require('react-native');
  const Text = (props: Record<string, unknown>) => <RN.Text {...props} />;
  Text.displayName = 'Text';
  return { Text };
});

jest.mock('lucide-react-native', () => {
  const RN = require('react-native');
  const factory = (name: string) => (props: Record<string, unknown>) => (
    <RN.View testID={`icon-${name}`} {...props} />
  );
  return {
    Cloud: factory('cloud'),
    Folder: factory('folder'),
    KeyRound: factory('key-round'),
    Lock: factory('lock'),
    Users: factory('users'),
    ArrowLeft: factory('arrow-left'),
    LogIn: factory('log-in'),
    Menu: factory('menu'),
  };
});

import { ProjectHeader } from '@/src/features/projects/components/ProjectHeader';
import { Text } from '@/components/ui/text';

function buildProject(overrides: Partial<ProjectRecord> = {}): ProjectRecord {
  return {
    id: 'proj_detail_test',
    ownerUserId: 'user_1',
    name: 'My Detail Project',
    description: 'A project rendered in the detail screen.',
    defaultPrivacyMode: 'local',
    defaultProviderMode: 'Local',
    allowedSurfaces: ['web', 'desktop', 'mobile'],
    knowledgeFileCount: 3,
    memberCount: 2,
    iconEmoji: '🗂',
    accentColor: 'sky',
    importedFrom: null,
    createdAt: '2026-05-01T00:00:00Z',
    updatedAt: '2026-05-21T00:00:00Z',
    ...overrides,
  };
}

describe('ProjectDetailScreen, unit snapshots', () => {
  it('locks ProjectHeader tree for a sky-accent local project with last-used label', () => {
    const presentation = summarizeProjectHeader({
      project: buildProject(),
      lastUsedRelativeLabel: '3h ago',
    });
    const { toJSON } = render(<ProjectHeader presentation={presentation} />);
    expect(toJSON()).toMatchSnapshot();
  });

  it('locks ProjectHeader tree for a managed project with no emoji', () => {
    const presentation = summarizeProjectHeader({
      project: buildProject({
        defaultPrivacyMode: 'managed',
        defaultProviderMode: 'ManagedGateway',
        iconEmoji: null,
        accentColor: 'rose',
      }),
    });
    const { toJSON } = render(<ProjectHeader presentation={presentation} />);
    expect(toJSON()).toMatchSnapshot();
  });

  it('locks local-only fallback container shape', () => {
    const { toJSON } = render(
      <View testID="project-detail-local-fallback">
        <Text>proj_detail_test</Text>
        <Text>local_only, project details sync when you join Cloud.</Text>
      </View>,
    );
    expect(toJSON()).toMatchSnapshot();
  });
});
