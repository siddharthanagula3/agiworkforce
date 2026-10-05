import { describe, expect, it } from 'vitest';
import { FREE_MEDIA_LIMITED_LABEL } from '@/features/models/lib/free-media-offer';
import type { FlagshipAnnouncement } from './FlagshipSections';
import { landingAnnouncement } from './landing-announcement';

const STANDING: FlagshipAnnouncement = {
  tag: 'New',
  label: '100+ models across 30+ providers',
  href: '/providers',
};
const DATED = { lastDay: '2026-10-20' };
const UNDATED = { lastDay: null };

describe('landingAnnouncement', () => {
  it('announces both kinds while image and video are ready', () => {
    expect(landingAnnouncement({ image: DATED, video: UNDATED }, STANDING)).toEqual({
      tag: FREE_MEDIA_LIMITED_LABEL,
      label: 'Free image and video',
      href: '/pricing',
    });
  });

  it('announces image alone while only image is ready', () => {
    expect(landingAnnouncement({ image: DATED, video: null }, STANDING)).toEqual({
      tag: FREE_MEDIA_LIMITED_LABEL,
      label: 'Free image generation',
      href: '/pricing',
    });
  });

  it('announces video alone while only video is ready', () => {
    expect(landingAnnouncement({ image: null, video: DATED }, STANDING)).toEqual({
      tag: FREE_MEDIA_LIMITED_LABEL,
      label: 'Free video generation',
      href: '/pricing',
    });
  });

  it('keeps the standing announcement while neither kind is ready', () => {
    expect(landingAnnouncement({ image: null, video: null }, STANDING)).toBe(STANDING);
  });

  it('keeps the standing announcement while the offer cannot be read', () => {
    expect(landingAnnouncement(null, STANDING)).toBe(STANDING);
  });

  it('carries no date and no number, which the pricing page owns', () => {
    for (const offer of [
      { image: DATED, video: DATED },
      { image: DATED, video: null },
      { image: null, video: DATED },
    ]) {
      const { tag, label } = landingAnnouncement(offer, STANDING);
      expect(`${tag} ${label}`).not.toMatch(/\d/u);
    }
  });
});
