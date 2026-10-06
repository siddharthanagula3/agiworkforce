import { render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ScrollFeatures, type ScrollFeature } from '../ScrollFeatures';

const features: readonly ScrollFeature[] = [
  {
    id: 'first-story',
    title: 'First story',
    body: 'First body',
    href: '/features/first',
    linkLabel: 'Read first story',
    visual: (
      <figure aria-label="First static preview">
        <p>First preview</p>
      </figure>
    ),
  },
  {
    id: 'second-story',
    title: 'Second story',
    body: 'Second body',
    href: '/features/second',
    linkLabel: 'Read second story',
    visual: (
      <figure aria-label="Second static preview">
        <p>Second preview</p>
      </figure>
    ),
  },
];

afterEach(() => vi.unstubAllGlobals());

describe('ScrollFeatures canonical heading ownership', () => {
  it('gives each article its one canonical heading and inline figure', () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    render(<ScrollFeatures features={features} label="Stories" />);
    for (const feature of features) {
      const article = screen.getByRole('article', { name: feature.title });
      const heading = within(article).getByRole('heading', { name: feature.title, level: 3 });
      expect(heading).toHaveAttribute('id', `${feature.id}-title`);
      expect(article).toHaveAttribute('aria-labelledby', heading.id);
      expect(document.querySelectorAll(`[id="${heading.id}"]`)).toHaveLength(1);
      expect(within(article).getAllByRole('figure', { hidden: true })).toHaveLength(1);
    }
  });

  it('names staged regions from those same headings without duplicating ownership', () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    const { container } = render(<ScrollFeatures features={features} label="Stories" />);
    const stage = container.querySelector('.agi-ds-scrollfeatures-stage');
    if (!stage) throw new Error('Missing authored stage');
    expect(stage.children).toHaveLength(features.length);
    for (const feature of features) {
      const heading = within(screen.getByRole('article', { name: feature.title })).getByRole(
        'heading',
        { name: feature.title, level: 3 },
      );
      const visual = stage.querySelector(`:scope > div[aria-labelledby="${heading.id}"]`);
      if (!visual) throw new Error('Missing canonical staged visual');
      expect(visual).toHaveAttribute('role', 'region');
      if (feature.id === features[0]?.id) {
        expect(visual).not.toHaveAttribute('aria-hidden');
        expect(visual).not.toHaveAttribute('inert');
      } else {
        expect(visual).toHaveAttribute('aria-hidden', 'true');
        expect(visual).toHaveAttribute('inert');
      }
      expect(visual.querySelectorAll('figure')).toHaveLength(1);
      expect(
        container.querySelectorAll(`article[aria-labelledby="${heading.id}"] figure`),
      ).toHaveLength(1);
      expect(
        container.querySelectorAll(`div[aria-labelledby="${heading.id}"] figure`),
      ).toHaveLength(1);
    }
    expect(
      within(stage as HTMLElement).getByRole('region', { name: 'First story' }),
    ).toHaveAttribute('data-active', 'true');
    expect(within(stage as HTMLElement).queryByRole('region', { name: 'Second story' })).toBeNull();
  });
});
