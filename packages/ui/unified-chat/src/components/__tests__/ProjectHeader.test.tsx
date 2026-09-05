import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { summarizeProjectHeader, type ProjectHeaderPresentation } from '@agiworkforce/types';
import { ProjectHeader } from '../ProjectHeader';

type ProjectFixture = Parameters<typeof summarizeProjectHeader>[0]['project'];

function buildProject(overrides: Partial<ProjectFixture> = {}): ProjectFixture {
  return {
    id: 'proj_local_1',
    ownerUserId: 'user_1',
    name: 'On-device research',
    description: 'Stays on this Mac.',
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

describe('ProjectHeader', () => {
  it('renders title + description and marks Local projects as staysLocal', () => {
    render(<ProjectHeader presentation={buildPresentation()} />);
    expect(screen.getByText('On-device research')).toBeDefined();
    expect(screen.getByText('Stays on this Mac.')).toBeDefined();
    const root = screen.getByTestId('project-header');
    expect(root.getAttribute('data-stays-local')).toBe('true');
  });

  it('emits the accent-color data attribute from the presentation', () => {
    const presentation = buildPresentation({ accentColor: 'amber' });
    render(<ProjectHeader presentation={presentation} />);
    const root = screen.getByTestId('project-header');
    expect(root.getAttribute('data-accent-color')).toBe('amber');
  });

  it('falls back to zinc accent for unknown values via the canonical summarizer', () => {
    const presentation = buildPresentation({ accentColor: 'fuchsia' as never });
    render(<ProjectHeader presentation={presentation} />);
    const root = screen.getByTestId('project-header');
    expect(root.getAttribute('data-accent-color')).toBe('zinc');
  });

  it('flags BYOK projects on the privacy + provider chip data attributes', () => {
    const presentation = buildPresentation({
      defaultPrivacyMode: 'byok',
      defaultProviderMode: 'DirectByok',
    });
    render(<ProjectHeader presentation={presentation} />);
    const privacy = screen.getByTestId('project-header-privacy-chip');
    expect(privacy.getAttribute('data-stays-local')).toBe('false');
    const provider = screen.getByTestId('project-header-provider-chip');
    expect(provider.getAttribute('data-provider-mode')).toBe('DirectByok');
  });

  it('flags Managed projects on the provider chip', () => {
    const presentation = buildPresentation({
      defaultPrivacyMode: 'managed',
      defaultProviderMode: 'ManagedGateway',
    });
    render(<ProjectHeader presentation={presentation} />);
    const provider = screen.getByTestId('project-header-provider-chip');
    expect(provider.getAttribute('data-provider-mode')).toBe('ManagedGateway');
  });

  it('surfaces the imported-from chip when present', () => {
    const presentation = buildPresentation({ importedFrom: 'claude' });
    render(<ProjectHeader presentation={presentation} />);
    expect(screen.getByTestId('project-header-imported-from').textContent).toContain(
      'Imported from Claude',
    );
  });

  it('omits the imported-from chip when the project is manual', () => {
    const presentation = buildPresentation({ importedFrom: 'manual' });
    render(<ProjectHeader presentation={presentation} />);
    expect(screen.getByTestId('project-header-imported-from').textContent).toContain(
      'Created in AGI',
    );
  });

  it('renders denormalized counts and last-used label when host supplies them', () => {
    const presentation = summarizeProjectHeader({
      project: buildProject({
        knowledgeFileCount: 4,
        memberCount: 3,
        lastUsedAt: '2026-05-20T00:00:00Z',
      }),
      lastUsedRelativeLabel: '2h ago',
      defaultModelLabel: 'Default Model Fixture',
    });
    render(<ProjectHeader presentation={presentation} />);
    const meta = screen.getByTestId('project-header-meta-row');
    expect(meta.textContent).toContain('4 files');
    expect(meta.textContent).toContain('3 members');
    expect(meta.textContent).toContain('Last used 2h ago');
    expect(meta.textContent).toContain('Default model: Default Model Fixture');
  });

  it('omits the meta row entirely when host has no counts / model / last-used', () => {
    const presentation = buildPresentation();
    render(<ProjectHeader presentation={presentation} />);
    expect(screen.queryByTestId('project-header-meta-row')).toBeNull();
  });

  it('renders surface chips in the order produced by the summarizer', () => {
    const presentation = buildPresentation({
      allowedSurfaces: ['mobile', 'web', 'desktop'],
    });
    render(<ProjectHeader presentation={presentation} />);
    const chips = screen.getByTestId('project-header-surface-chips');
    const labels = Array.from(chips.children).map((node) => node.textContent ?? '');
    expect(labels).toEqual(['Web', 'Desktop', 'Mobile']);
  });

  it('omits the surface-chips row when no surfaces are allowed', () => {
    const presentation = buildPresentation({ allowedSurfaces: [] });
    render(<ProjectHeader presentation={presentation} />);
    expect(screen.queryByTestId('project-header-surface-chips')).toBeNull();
  });

  it('renders only the description in compact mode, without host identity or provenance chips', () => {
    render(<ProjectHeader compact presentation={buildPresentation({ importedFrom: 'manual' })} />);

    expect(screen.queryByRole('heading', { name: 'On-device research' })).toBeNull();
    expect(screen.queryByText('On-device research')).toBeNull();
    expect(screen.getByText('Stays on this Mac.')).toBeDefined();
    expect(screen.queryByTestId('project-header-imported-from')).toBeNull();
    expect(screen.queryByTestId('project-header-privacy-chip')).toBeNull();
    expect(screen.queryByTestId('project-header-provider-chip')).toBeNull();
    expect(screen.queryByTestId('project-header-meta-row')).toBeNull();
    expect(screen.queryByTestId('project-header-surface-chips')).toBeNull();
  });

  it('renders nothing in compact mode for a project with no description, not an empty bordered box', () => {
    const { container } = render(
      <ProjectHeader compact presentation={buildPresentation({ description: undefined })} />,
    );

    expect(container.firstChild).toBeNull();
  });
});
