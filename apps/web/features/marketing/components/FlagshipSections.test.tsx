import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import * as landingSections from './FlagshipSections';
import { LandingHero } from './FlagshipSections';
import * as surfaceSections from './SurfaceSections';

describe('landing section ownership', () => {
  it('keeps landing-only exports distinct from reusable surface sections', () => {
    const sharedNames = Object.keys(landingSections).filter((name) => name in surfaceSections);

    expect(sharedNames).toEqual([]);
  });

  it('retains the accessible title, identity, action and product preview', () => {
    render(
      <LandingHero
        brand="AGIWORKFORCE"
        titleLines={['One AI workspace.', 'You choose where it runs.']}
        em="You choose where it runs."
        lede="Run each request where it belongs."
        ctas={[{ href: '/chat', label: 'Try chat' }]}
        visual={<div>Product preview</div>}
      />,
    );

    const headings = screen.getAllByRole('heading', { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent('One AI workspace. You choose where it runs.');
    expect(screen.getByRole('img', { name: 'AGIWORKFORCE' })).toBeInTheDocument();
    expect(screen.queryByText(/the AI application suite/i)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Try chat' })).toHaveAttribute('href', '/chat');
    expect(screen.getByText('Product preview')).toBeInTheDocument();
    expect(screen.getByText('Run each request where it belongs.')).toBeVisible();
  });
});
