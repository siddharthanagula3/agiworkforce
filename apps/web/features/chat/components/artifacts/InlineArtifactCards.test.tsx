import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';

import { usePublishedSitesStore } from '@features/sites/stores/published-sites-store';
import { useArtifactsStore } from '../../stores/artifacts-store';
import type { ArtifactData } from './ArtifactPreview';
import { InlineArtifactCards } from './InlineArtifactCards';

const CALCULATOR: ArtifactData = {
  id: 'artifact-calculator',
  type: 'html',
  title: 'Desk Calculator',
  language: 'html',
  content:
    '<!-- @artifact -->\n<!doctype html><html><head><title>Desk Calculator</title></head><body><main>0</main></body></html>',
};

const BRIEF: ArtifactData = {
  id: 'artifact-brief',
  type: 'document',
  title: 'Launch brief',
  language: 'markdown',
  content: '# Launch brief\n\nShip it.',
};

beforeEach(() => {
  useArtifactsStore.getState().reset();
  useArtifactsStore.getState().setPanelOpen(false);
  usePublishedSitesStore.setState({ byArtifactId: {}, status: 'ready' });
});

describe('InlineArtifactCards: the compact artifact card', () => {
  it('names an HTML artifact in a card and runs nothing in the message', () => {
    render(<InlineArtifactCards artifacts={[CALCULATOR]} />);

    const card = screen.getByTestId('artifact-card');
    expect(within(card).getByText('Desk Calculator')).toBeVisible();
    expect(within(card).getByText('Artifact')).toBeVisible();
    expect(within(card).getByRole('button', { name: 'Download Desk Calculator' })).toBeVisible();
    expect(card.querySelector('iframe')).toBeNull();
  });

  it('opens the artifact in the panel, then offers Hide while it is the one open', () => {
    render(<InlineArtifactCards artifacts={[CALCULATOR]} />);

    const open = screen.getByRole('button', { name: 'Open artifact: Desk Calculator' });
    expect(open).toHaveTextContent('Open');
    expect(open).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(open);

    expect(useArtifactsStore.getState().panelOpen).toBe(true);
    expect(useArtifactsStore.getState().selectedArtifactId).toBe(CALCULATOR.id);
    const hide = screen.getByRole('button', { name: 'Hide artifact: Desk Calculator' });
    expect(hide).toHaveTextContent('Hide');
    expect(hide).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(hide);
    expect(useArtifactsStore.getState().panelOpen).toBe(false);
  });

  it('describes a document by kind and extension, with the same card and panel', () => {
    render(<InlineArtifactCards artifacts={[BRIEF]} />);

    const open = screen.getByRole('button', { name: 'Open artifact: Launch brief' });
    expect(open).toHaveAccessibleDescription('Document · MD');
    fireEvent.click(open);
    expect(useArtifactsStore.getState().selectedArtifactId).toBe(BRIEF.id);
  });

  it('says a published artifact is published, to whom, and links to its site page', () => {
    usePublishedSitesStore.setState({
      status: 'ready',
      byArtifactId: {
        [CALCULATOR.id]: {
          token: 'tok123',
          shareUrl: 'https://agiworkforce.com/a/tok123',
          visibility: 'public',
          sitePath: '/chat/sites/tok123',
        },
      },
    });
    render(<InlineArtifactCards artifacts={[CALCULATOR]} />);

    expect(screen.getByText('Artifact · Published · Public')).toBeVisible();
    expect(
      screen.getByRole('link', { name: 'Open the published site for Desk Calculator' }),
    ).toHaveAttribute('href', '/chat/sites/tok123');
  });

  it('draws every card from theme role tokens, never a fixed hue that fails in one theme', () => {
    const { container } = render(<InlineArtifactCards artifacts={[CALCULATOR, BRIEF]} />);

    const classes = Array.from(container.querySelectorAll('[class]'), (node) =>
      node.getAttribute('class'),
    ).join(' ');
    expect(classes).not.toMatch(
      /\b(?:text|bg|border)-(?:orange|sky|violet|fuchsia|emerald|amber)-\d{2,3}\b/u,
    );
  });

  it('caps the message at three cards and opens the rest from one row', () => {
    const many = Array.from({ length: 5 }, (_, index) => ({
      ...BRIEF,
      id: `artifact-${index}`,
      title: `File ${index}`,
    }));
    render(<InlineArtifactCards artifacts={many} />);

    expect(screen.getAllByTestId('artifact-card')).toHaveLength(3);
    fireEvent.click(screen.getByRole('button', { name: 'View 2 more artifacts' }));
    expect(useArtifactsStore.getState().selectedArtifactId).toBe('artifact-3');
    expect(screen.getByRole('button', { name: 'Download all' })).toBeVisible();
  });
});
