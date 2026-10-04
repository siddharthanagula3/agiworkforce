import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ScrollFeatures, type ScrollFeature } from '../ScrollFeatures';

const FEATURES: readonly ScrollFeature[] = [
  {
    id: 'feature-one',
    title: 'First story',
    body: 'First body',
    href: '/features/one',
    linkLabel: 'Learn more about one',
    visual: <span>first visual</span>,
  },
  {
    id: 'feature-two',
    title: 'Second story',
    body: 'Second body',
    href: '/features/two',
    linkLabel: 'Learn more about two',
    visual: <span>second visual</span>,
  },
];

describe('ScrollFeatures', () => {
  it('renders exactly one detail link per story inside its article', () => {
    const { container } = render(<ScrollFeatures features={FEATURES} label="Stories" />);
    for (const feature of FEATURES) {
      const article = container.querySelector<HTMLElement>(`article#${feature.id}`)!;
      const links = within(article).getAllByRole('link');
      expect(links).toHaveLength(1);
      expect(links[0]).toHaveAttribute('href', feature.href);
      expect(links[0]).toHaveTextContent(feature.linkLabel);
    }
    expect(screen.getAllByRole('link')).toHaveLength(FEATURES.length);
  });

  it('keeps the aria-hidden stage free of links', () => {
    const { container } = render(<ScrollFeatures features={FEATURES} label="Stories" />);
    const stage = container.querySelector('.agi-ds-scrollfeatures-stage')!;
    expect(stage.querySelectorAll('a')).toHaveLength(0);
  });
});
