import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { IndexedArtifact } from '@/features/chat/hooks/use-artifact-index';
import type { Artifact } from '@/features/chat/stores/artifacts-store';
import type { MermaidDiagramProps, MermaidRenderResult } from '@agiworkforce/unified-chat';

type UnifiedChatModule = typeof import('@agiworkforce/unified-chat');

const push = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true }),
}));

let indexedArtifacts: IndexedArtifact[] = [];

vi.mock('@/features/chat/hooks/use-artifact-index', () => ({
  useArtifactIndex: () => ({ artifacts: indexedArtifacts, loaded: true }),
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

let mermaidResult: MermaidRenderResult = null;

vi.mock('@agiworkforce/unified-chat', async (importOriginal) => {
  const actual = await importOriginal<UnifiedChatModule>();
  const { useEffect } = await import('react');
  return {
    ...actual,
    MermaidDiagram: ({ source, interactive, onRenderResult }: MermaidDiagramProps) => {
      useEffect(() => {
        onRenderResult?.(mermaidResult);
      }, [onRenderResult]);
      return (
        <pre data-testid="mermaid-diagram" data-interactive={String(interactive)}>
          {source}
        </pre>
      );
    },
  };
});

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
const DIAGRAM_SOURCE = 'graph TD\n  A[Offer signed] --> B[Laptop shipped]';
const SCRIPT_SOURCE = 'rate = hours < 40\nprint("<script>alert(1)</script>")';

beforeEach(() => {
  push.mockReset();
  indexedArtifacts = [];
  mermaidResult = { svg: '<svg></svg>' };
  storeArtifacts = [
    makeArtifact({ id: 'a1', title: 'Budget dashboard', type: 'html', language: 'html' }),
    makeArtifact({
      id: 'a2',
      title: 'Payroll script',
      type: 'code',
      language: 'python',
      content: SCRIPT_SOURCE,
    }),
    makeArtifact({
      id: 'a3',
      title: 'Onboarding flow chart',
      type: 'mermaid',
      language: 'mermaid',
      content: DIAGRAM_SOURCE,
      createdAt: new Date(Date.now() - 45 * DAY_MS),
    }),
  ];
});

function thumbnailOf(title: string): HTMLElement {
  return within(screen.getByRole('button', { name: new RegExp(title) })).getByTestId(
    'artifact-card-thumbnail',
  );
}

function openFilterMenu() {
  fireEvent.pointerDown(screen.getByRole('button', { name: /^Filter by/ }), {
    button: 0,
    ctrlKey: false,
    pointerType: 'mouse',
  });
}

function inspirationSection(): HTMLElement {
  return screen.getByRole('region', { name: 'Inspiration' });
}

describe('GalleryClient header', () => {
  it('puts the filter menu before a primary New artifact button', () => {
    render(<GalleryClient />);

    const filter = screen.getByRole('button', { name: 'Filter by: All' });
    const create = screen.getByRole('button', { name: 'New artifact' });

    expect(create).toHaveAttribute('data-variant', 'primary');
    expect(filter.compareDocumentPosition(create) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('shows the search placeholder with an ellipsis', () => {
    render(<GalleryClient />);

    expect(screen.getByLabelText('Search artifacts')).toHaveAttribute(
      'placeholder',
      'Search artifacts...',
    );
  });

  it('focuses the search on load in the app on a fine pointer, never on the public page', () => {
    const original = window.matchMedia;
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query === '(pointer: fine)',
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })) as unknown as typeof window.matchMedia;
    try {
      const { unmount } = render(<GalleryClient />);
      expect(screen.getByLabelText('Search artifacts')).not.toHaveFocus();
      unmount();

      render(<GalleryClient chrome="app" />);
      expect(screen.getByLabelText('Search artifacts')).toHaveFocus();
    } finally {
      window.matchMedia = original;
    }
  });
});

describe('GalleryClient scope', () => {
  it('starts on All, which shows your artifacts and the inspiration examples', () => {
    render(<GalleryClient />);

    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Yours' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText('Payroll script')).toBeInTheDocument();
    expect(within(inspirationSection()).getByText('Animated gradient button')).toBeInTheDocument();
  });

  it('narrows to your own artifacts when Yours is selected', async () => {
    const user = userEvent.setup();
    render(<GalleryClient />);

    await user.click(screen.getByRole('button', { name: 'Yours' }));

    expect(screen.getByRole('button', { name: 'Yours' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Payroll script')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Inspiration' })).not.toBeInTheDocument();
    expect(screen.queryByText('Animated gradient button')).not.toBeInTheDocument();
  });

  it('shows the empty state with a pill New artifact button above the examples', async () => {
    const user = userEvent.setup();
    storeArtifacts = [];
    render(<GalleryClient />);

    expect(
      screen.getByText('Artifacts you create in conversations will appear here.'),
    ).toBeInTheDocument();
    const cta = screen.getByTestId('gallery-empty-new-artifact');
    expect(cta).toHaveTextContent('New artifact');
    expect(cta).toHaveClass('agi-ds-btn');
    expect(cta.style.textDecoration).toBe('');
    expect(cta.style.borderRadius).toBe('var(--agi-radius-pill)');
    expect(within(inspirationSection()).getByText('Animated gradient button')).toBeInTheDocument();

    await user.click(cta);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
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

  it('filters by type from the Filter by menu, offering only types the scope holds', async () => {
    const user = userEvent.setup();
    render(<GalleryClient />);
    await user.click(screen.getByRole('button', { name: 'Yours' }));

    openFilterMenu();
    const typeOptions = screen
      .getAllByRole('menuitemradio')
      .map((item) => item.textContent)
      .filter((label) => !['Any time', 'Last 7 days', 'Last 30 days'].includes(label ?? ''));
    expect(typeOptions).toEqual(['All types', 'Code', 'HTML', 'Mermaid']);

    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Mermaid' }));

    expect(screen.getByRole('button', { name: 'Filter by: Mermaid' })).toBeInTheDocument();
    expect(screen.getByText('Onboarding flow chart')).toBeInTheDocument();
    expect(screen.queryByText('Budget dashboard')).not.toBeInTheDocument();
  });

  it('filters by recency and hides the undated examples', () => {
    render(<GalleryClient />);

    openFilterMenu();
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Last 30 days' }));

    expect(screen.getByRole('button', { name: 'Filter by: Last 30 days' })).toBeInTheDocument();
    expect(screen.getByText('Budget dashboard')).toBeInTheDocument();
    expect(screen.queryByText('Onboarding flow chart')).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Inspiration' })).not.toBeInTheDocument();
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

  it('drops a type filter that Yours does not hold so the grid is never silently empty', async () => {
    const user = userEvent.setup();
    render(<GalleryClient />);

    openFilterMenu();
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'SVG' }));
    expect(screen.getByRole('button', { name: 'Filter by: SVG' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Yours' }));

    expect(screen.getByRole('button', { name: 'Filter by: All' })).toBeInTheDocument();
    expect(screen.getByText('Payroll script')).toBeInTheDocument();
  });
});

describe('GalleryClient card thumbnails', () => {
  it('draws a mermaid card as a diagram and never frames its source', () => {
    const { container } = render(<GalleryClient />);

    const thumbnail = thumbnailOf('Onboarding flow chart');
    const diagram = within(thumbnail).getByTestId('mermaid-diagram');

    expect(diagram).toHaveTextContent('Offer signed');
    expect(diagram).toHaveAttribute('data-interactive', 'false');
    expect(diagram).toBeVisible();
    expect(within(thumbnail).queryByTestId('artifact-card-thumbnail-icon')).not.toBeInTheDocument();
    expect(thumbnail.querySelector('iframe')).toBeNull();
    for (const frame of container.querySelectorAll('iframe')) {
      expect(frame.getAttribute('srcdoc')).not.toContain('graph TD');
    }
  });

  it('keeps the type icon and hides the source when a diagram cannot be drawn', () => {
    mermaidResult = { error: 'Parse error on line 2' };
    render(<GalleryClient />);

    const thumbnail = thumbnailOf('Onboarding flow chart');

    expect(within(thumbnail).getByTestId('artifact-card-thumbnail-icon')).toBeInTheDocument();
    expect(within(thumbnail).getByTestId('mermaid-diagram')).not.toBeVisible();
  });

  it('shows a code card its source excerpt in a frame that can run nothing', () => {
    render(<GalleryClient />);

    const frame = thumbnailOf('Payroll script').querySelector('iframe');

    expect(frame).not.toBeNull();
    expect(frame).toHaveAttribute('sandbox', '');
    expect(frame!.getAttribute('srcdoc')).toContain('rate = hours &lt; 40');
  });

  it('escapes markup in a code excerpt so the frame shows it as text', () => {
    render(<GalleryClient />);

    const srcdoc = thumbnailOf('Payroll script').querySelector('iframe')!.getAttribute('srcdoc');

    expect(srcdoc).toContain('&lt;script&gt;alert(1)&lt;&#x2F;script&gt;');
    expect(srcdoc).not.toContain('<script');
  });

  it('gives a card whose content is on another device the same thumbnail box with a type icon', () => {
    indexedArtifacts = [
      {
        id: 'remote-1',
        conversationId: 'c9',
        messageId: 'm9',
        title: 'Quarterly forecast',
        type: 'code',
        language: 'sql',
        projectId: null,
        createdAt: new Date().toISOString(),
      },
    ];
    render(<GalleryClient />);
    fireEvent.click(screen.getByRole('button', { name: 'Yours' }));

    const remote = thumbnailOf('Quarterly forecast');

    expect(within(remote).getByTestId('artifact-card-thumbnail-icon')).toBeInTheDocument();
    expect(remote.querySelector('iframe')).toBeNull();
    expect(screen.getAllByTestId('artifact-card-thumbnail')).toHaveLength(4);
    for (const thumbnail of screen.getAllByTestId('artifact-card-thumbnail')) {
      expect(thumbnail).toHaveAttribute('aria-hidden', 'true');
      expect(thumbnail.style.height).toBe(remote.style.height);
      expect(thumbnail.style.pointerEvents).toBe('none');
    }
  });

  it('leaves border emphasis on hover and focus to the stylesheet', () => {
    const { container } = render(<GalleryClient />);

    const card = screen.getByRole('button', { name: /Payroll script/ });
    const styles = [...container.querySelectorAll('style')].map((s) => s.textContent).join('\n');

    expect(card).toHaveClass('agi-gallery-card');
    expect(card.style.transition).toBe('');
    expect(styles).toMatch(
      /\.agi-gallery-card\s*\{[^}]*transition:\s*border-color var\(--agi-dur-hover\) var\(--curve-standard\)/,
    );
    expect(styles).toMatch(
      /\.agi-gallery-card:hover,\s*\.agi-gallery-card:focus-visible\s*\{\s*border-color:\s*var\(--agi-rule-strong\)/,
    );
  });
});
