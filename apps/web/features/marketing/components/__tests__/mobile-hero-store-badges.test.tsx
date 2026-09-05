import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { COMING_SOON_LABEL, SURFACE_STATUS } from '@/lib/marketing-constants';
import { MobileHeroVisual } from '../MobileHeroVisual';

const source = readFileSync(join(__dirname, '..', 'MobileHeroVisual.tsx'), 'utf8');

describe('MobileHeroVisual store badges', () => {
  it('prints the availability chip from the release-state registry', () => {
    const { container } = render(<MobileHeroVisual />);
    const chip = container.querySelector('.agi-store-soon');

    expect(chip?.textContent).toBe(SURFACE_STATUS.mobile);
  });

  it('hardcodes no availability label of its own', () => {
    expect(source).not.toMatch(/>\s*Coming [Ss]oon\s*</);
  });

  it('renders no store badge as a link', () => {
    const { container } = render(<MobileHeroVisual />);

    expect(container.querySelectorAll('a')).toHaveLength(0);
    expect(container.querySelectorAll('[href]')).toHaveLength(0);
    expect(source).not.toMatch(/href=/);
  });

  it('shows the badges only while the registry reports mobile unreleased', () => {
    const { container } = render(<MobileHeroVisual />);
    const badges = container.querySelectorAll('.agi-store-btn');

    if (SURFACE_STATUS.mobile === COMING_SOON_LABEL) {
      expect(badges).toHaveLength(2);
      expect(screen.getByText('App Store')).toBeDefined();
      expect(screen.getByText('Google Play')).toBeDefined();
      return;
    }

    expect(badges).toHaveLength(0);
  });
});
