/**
 * mobile-hero-store-badges.test.tsx
 *
 * The home hero is the only surface on the site that draws App Store / Google
 * Play badges, so it is the only place a false distribution claim can be made
 * by accident. It has been made before: `/mobile` shipped live badge links to
 * `apps.apple.com/app/agi/id6742817665` and
 * `play.google.com/store/apps/details?id=com.agiworkforce.app` for an app that
 * was never published (stripped in 35653e948).
 *
 * These are the contracts that keep it honest:
 *   1. the availability chip prints `SURFACE_STATUS.mobile` verbatim, so the
 *      home page cannot disagree with the registry `/download` reads;
 *   2. no badge is a link, because there is no listing to link to;
 *   3. the badges only exist while the registry reports mobile unreleased.
 */
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
    // A second copy of the status is how the home page drifts away from
    // /download. The only mention of the label must be the registry import.
    expect(source).not.toMatch(/>\s*Coming [Ss]oon\s*</);
  });

  it('renders no store badge as a link', () => {
    const { container } = render(<MobileHeroVisual />);

    // An <a> with no href is a dead control; a real href would be a live
    // distribution claim for an app with no published listing. Neither.
    // (The prose above deliberately cites the two URLs that were removed, so
    // this asserts on markup — no anchor, no href — not on the raw text.)
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

    // Mobile has shipped: unclickable badges under a "Released" chip would be
    // furniture. Restoring them requires verified store URLs, on purpose.
    expect(badges).toHaveLength(0);
  });
});
