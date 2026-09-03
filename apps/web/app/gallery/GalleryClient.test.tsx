import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { Artifact } from '@/features/chat/stores/artifacts-store';

const push = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true }),
}));

vi.mock('@/features/chat/hooks/use-artifact-index', () => ({
  useArtifactIndex: () => ({ artifacts: [], loaded: true }),
}));

let storeArtifacts: Artifact[] = [];

vi.mock('@/features/chat/stores/artifacts-store', () => ({
  isGeneratedFileArtifactId: (id: string) => id.startsWith('genfile-'),
  useArtifactsStore: (selector: (state: { artifacts: Artifact[] }) => unknown) =>
    selector({ artifacts: storeArtifacts }),
}));

vi.mock('@/features/chat/components/artifacts/ArtifactPreview', () => ({
  ArtifactPreview: () => <div data-testid="artifact-preview" />,
}));

import { GalleryClient } from './GalleryClient';

function makeArtifact(overrides: Partial<Artifact> & { id: string; title: string }): Artifact {
  return {
    type: 'code',
    language: 'python',
    content: 'print(1)',
    messageId: 'm1',
    conversationId: 'c1',
    createdAt: new Date(),
    ...overrides,
  } as Artifact;
}

const DAY_MS = 24 * 60 * 60 * 1000;

beforeEach(() => {
  push.mockReset();
  storeArtifacts = [
    makeArtifact({ id: 'a1', title: 'Budget dashboard', type: 'html', language: 'html' }),
    makeArtifact({ id: 'a2', title: 'Payroll script', type: 'code', language: 'python' }),
    makeArtifact({
      id: 'a3',
      title: 'Onboarding flow chart',
      type: 'mermaid',
      language: 'mermaid',
      createdAt: new Date(Date.now() - 45 * DAY_MS),
    }),
  ];
});

describe('GalleryClient search and filters', () => {
  it('narrows the grid to artifacts whose title matches the search text', async () => {
    const user = userEvent.setup();
    render(<GalleryClient />);

    expect(screen.getByText('Payroll script')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Search artifacts'), 'budget');

    expect(screen.getByText('Budget dashboard')).toBeInTheDocument();
    expect(screen.queryByText('Payroll script')).not.toBeInTheDocument();
    expect(screen.queryByText('Onboarding flow chart')).not.toBeInTheDocument();
  });

  it('filters by artifact type, offering only types the tab actually holds', async () => {
    const user = userEvent.setup();
    render(<GalleryClient />);

    const typeFilter = screen.getByLabelText('Filter by type');
    expect(
      [...typeFilter.querySelectorAll('option')].map((o) => (o as HTMLOptionElement).value),
    ).toEqual(['all', 'code', 'html', 'mermaid']);

    await user.selectOptions(typeFilter, 'mermaid');

    expect(screen.getByText('Onboarding flow chart')).toBeInTheDocument();
    expect(screen.queryByText('Budget dashboard')).not.toBeInTheDocument();
  });

  it('filters by recency', async () => {
    const user = userEvent.setup();
    render(<GalleryClient />);

    await user.selectOptions(screen.getByLabelText('Filter by date'), '30d');

    expect(screen.getByText('Budget dashboard')).toBeInTheDocument();
    expect(screen.queryByText('Onboarding flow chart')).not.toBeInTheDocument();
  });

  it('explains an empty result as a filter, not as an empty account, and clears it', async () => {
    const user = userEvent.setup();
    render(<GalleryClient />);

    await user.type(screen.getByLabelText('Search artifacts'), 'nothing matches this');

    expect(screen.getByText('No artifacts match your search.')).toBeInTheDocument();
    expect(
      screen.queryByText('Artifacts you create in conversations will appear here.'),
    ).not.toBeInTheDocument();

    await user.click(screen.getAllByRole('button', { name: 'Clear filters' })[0]!);

    expect(screen.getByText('Budget dashboard')).toBeInTheDocument();
    expect(screen.getByLabelText('Search artifacts')).toHaveValue('');
  });

  it('drops a type filter when switching tabs so the new tab is never silently empty', async () => {
    const user = userEvent.setup();
    render(<GalleryClient />);

    await user.selectOptions(screen.getByLabelText('Filter by type'), 'code');
    await user.click(screen.getByRole('button', { name: 'Inspiration' }));

    expect(screen.getByLabelText('Filter by type')).toHaveValue('all');
    expect(screen.getByText('Animated gradient button')).toBeInTheDocument();
  });
});
