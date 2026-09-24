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

  it('renders one headline with the signature emphasis and trust-mode ribbon', () => {
    render(
      <LandingHero
        brand="AGI"
        eyebrow="the AI application suite"
        titleLines={['One AI workspace.', 'You choose where it runs.']}
        em="You choose where it runs."
        lede="Run each request where it belongs."
        ctas={[{ href: '/chat', label: 'Try AGI Web' }]}
        modeRibbon={['Local · on-device', 'BYOK · your keys', 'Cloud · public alpha']}
        visual={<div>Product preview</div>}
      />,
    );

    const headings = screen.getAllByRole('heading', { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent('One AI workspace. You choose where it runs.');
    expect(headings[0]?.querySelector('em.agi-fl-h1-em')).toHaveTextContent(
      'You choose where it runs.',
    );
    expect(screen.getByRole('list', { name: 'Trust modes' })).toHaveTextContent(
      'Local · on-deviceBYOK · your keysCloud · public alpha',
    );
  });
});
