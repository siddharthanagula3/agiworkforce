/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Mobile shared-primitive snapshot tests.
 *
 * Mirrors `packages/ui/unified-chat/src/components/__tests__/SharedPrimitives.snapshot.test.tsx`
 * for the RN-native ProjectHeader. Locks the rendered RN tree so any future
 * layout drift fires a diff. Structural visual-verification step — not
 * pixel parity. Discharges part of the Stop-hook visual-verification debt
 * for the Mobile surface.
 *
 * Round-10 autonomous suite-transformation slice, 2026-05-21.
 */

import React from 'react';
import { render } from '@testing-library/react-native';
import { summarizeProjectHeader, type ProjectHeaderPresentation } from '@agiworkforce/types';

jest.mock('@/src/ui/theme', () => ({
  colors: {
    textPrimary: '#fff',
    textSecondary: '#aaa',
    textMuted: '#777',
    border: '#333',
    surfaceElevated: '#1a1a1a',
    surfaceOverlay: '#0e0e0e',
  },
}));

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
    Folder: factory('folder'),
    Cloud: factory('cloud'),
    Lock: factory('lock'),
    Users: factory('users'),
  };
});

import { ProjectHeader } from '@/src/features/projects/components/ProjectHeader';

type ProjectFixture = Parameters<typeof summarizeProjectHeader>[0]['project'];

function buildProject(overrides: Partial<ProjectFixture> = {}): ProjectFixture {
  return {
    id: 'proj_snapshot',
    ownerUserId: 'user_1',
    name: 'Snapshot project',
    description: 'Stays on this device.',
    defaultPrivacyMode: 'local',
    defaultProviderMode: 'Local',
    allowedSurfaces: ['web', 'desktop', 'mobile'],
    knowledgeFileCount: 2,
    memberCount: 1,
    importedFrom: 'manual',
    accentColor: 'emerald',
    createdAt: '2026-05-01T00:00:00Z',
    updatedAt: '2026-05-20T00:00:00Z',
    ...overrides,
  };
}

function buildPresentation(
  overrides: Partial<ProjectFixture> = {},
  defaultModelLabel?: string,
): ProjectHeaderPresentation {
  return summarizeProjectHeader({
    project: buildProject(overrides),
    defaultModelLabel,
  });
}

describe('Mobile shared-primitive snapshots', () => {
  it('locks the RN-native ProjectHeader tree for a Local project', () => {
    const { toJSON } = render(<ProjectHeader presentation={buildPresentation()} />);
    expect(toJSON()).toMatchSnapshot();
  });

  it('locks the RN-native ProjectHeader tree for Cloud invite rendering', () => {
    const { toJSON } = render(
      <ProjectHeader
        presentation={buildPresentation({
          defaultPrivacyMode: 'byok',
          defaultProviderMode: 'DirectByok',
        })}
      />,
    );
    expect(toJSON()).toMatchSnapshot();
  });

  it('locks the RN-native ProjectHeader tree with denormalized counts + last-used + model', () => {
    const presentation = summarizeProjectHeader({
      project: buildProject({
        knowledgeFileCount: 4,
        memberCount: 3,
        lastUsedAt: '2026-05-20T00:00:00Z',
      }),
      lastUsedRelativeLabel: '2h ago',
      defaultModelLabel: 'Llama 3.2 8B',
    });
    const { toJSON } = render(<ProjectHeader presentation={presentation} />);
    expect(toJSON()).toMatchSnapshot();
  });
});
