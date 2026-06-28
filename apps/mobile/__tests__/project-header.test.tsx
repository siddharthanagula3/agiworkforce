/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Mobile ProjectHeader tests.
 *
 * Pin the RN-native mirror's contract: accent palette mapping, privacy +
 * provider chip surfacing, imported-from chip surfacing, surface chip
 * canonical order (enforced upstream by summarizeProjectHeader).
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
    id: 'proj_local_1',
    ownerUserId: 'user_1',
    name: 'On-device research',
    description: 'Stays on this phone.',
    defaultPrivacyMode: 'local',
    defaultProviderMode: 'Local',
    allowedSurfaces: ['web', 'desktop', 'mobile'],
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

describe('Mobile ProjectHeader', () => {
  it('renders the title and description for Local projects', () => {
    const { getByText } = render(<ProjectHeader presentation={buildPresentation()} />);
    expect(getByText('On-device research')).toBeTruthy();
    expect(getByText('Stays on this phone.')).toBeTruthy();
  });

  it('uses the Lock icon for Local privacy chip', () => {
    const { getAllByTestId } = render(<ProjectHeader presentation={buildPresentation()} />);
    expect(getAllByTestId('icon-lock').length).toBeGreaterThanOrEqual(1);
  });

  it('maps legacy direct-provider privacy to a cloud chip on Mobile', () => {
    const presentation = buildPresentation({
      defaultPrivacyMode: 'byok',
      defaultProviderMode: 'DirectByok',
    });
    const { getAllByTestId, queryByText, getByText } = render(
      <ProjectHeader presentation={presentation} />,
    );
    expect(getAllByTestId('icon-cloud').length).toBeGreaterThanOrEqual(1);
    expect(getByText('Cloud sign-in')).toBeTruthy();
    expect(queryByText(/byok/i)).toBeNull();
  });

  it('surfaces the imported-from chip when provenance is present', () => {
    const presentation = buildPresentation({ importedFrom: 'claude' });
    const { getByTestId } = render(<ProjectHeader presentation={presentation} />);
    expect(getByTestId('project-header-imported-from')).toBeTruthy();
  });

  it('renders denormalized counts when host provides them', () => {
    const presentation = summarizeProjectHeader({
      project: buildProject({
        knowledgeFileCount: 4,
        memberCount: 3,
        lastUsedAt: '2026-05-20T00:00:00Z',
      }),
      lastUsedRelativeLabel: '2h ago',
      defaultModelLabel: 'Claude Sonnet 4.6',
    });
    const { getByTestId, getByText } = render(<ProjectHeader presentation={presentation} />);
    expect(getByTestId('project-header-meta-row')).toBeTruthy();
    expect(getByText('4 files')).toBeTruthy();
    expect(getByText('3 members')).toBeTruthy();
    expect(getByText('Last used 2h ago')).toBeTruthy();
    expect(getByText('Default model: Claude Sonnet 4.6')).toBeTruthy();
  });

  it('omits the meta row when no counts / model / last-used are provided', () => {
    const presentation = buildPresentation();
    const { queryByTestId } = render(<ProjectHeader presentation={presentation} />);
    expect(queryByTestId('project-header-meta-row')).toBeNull();
  });

  it('renders surface chips in canonical order regardless of input order', () => {
    const presentation = buildPresentation({
      allowedSurfaces: ['mobile', 'web', 'desktop'],
    });
    const { getByTestId, getByText } = render(<ProjectHeader presentation={presentation} />);
    const chips = getByTestId('project-header-surface-chips');
    expect(chips).toBeTruthy();
    expect(getByText('Web')).toBeTruthy();
    expect(getByText('Desktop')).toBeTruthy();
    expect(getByText('Mobile')).toBeTruthy();
  });

  it('omits the surface-chips row when no surfaces are allowed', () => {
    const presentation = buildPresentation({ allowedSurfaces: [] });
    const { queryByTestId } = render(<ProjectHeader presentation={presentation} />);
    expect(queryByTestId('project-header-surface-chips')).toBeNull();
  });
});
