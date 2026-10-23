import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { render, screen, within } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import {
  billingPlanCapabilityPlanLabels,
  billingPlanCapabilityWireTiers,
  getBillingPlanPricing,
  getModelMetadataById,
  getRoutingSlotModel,
  getTierPolicy,
  interactionMode,
} from '@agiworkforce/types';

vi.mock('@shared/components/layout/Header', () => ({ Header: () => <div /> }));
vi.mock('@/features/marketing/components/MarketingFooter', () => ({
  MarketingFooter: () => <div />,
}));

import VideoFeaturePage from './page';

const WEB_ROOT = resolve(__dirname, '..', '..', '..');
const source = (path: string) => readFileSync(resolve(WEB_ROOT, path), 'utf8');

const PAGE_SOURCE = source('app/features/video/page.tsx');
const SCENE_SOURCE = source('features/marketing/components/scenes/VideoScene.tsx');

const UNSHIPPED_LANGUAGE =
  /rolling out|coming soon|on the roadmap|in preview|early access|when it lands/i;
const PLAN_NAME_LITERAL = /\b(Free|Basic|Pro|Max|Max 20x|Team|Enterprise)\b plans?/;
const SECTION_HEADINGS = [
  'Start a video, then leave the chat.',
  'From the prompt to the player.',
  'What bounds a video request.',
  'Choose a plan with video generation.',
];
const TYPED_SECONDS = /\d+\s+seconds/;
const spaced = (text: string) => text.replaceAll('\u00a0', ' ');
const PLUS_MENU = 'features/chat/components/Composer/ComposerPlusMenu.tsx';
const PRODUCT_STRINGS: ReadonlyArray<readonly [string, string]> = [
  ['Upgrade', PLUS_MENU],
  ['Describe the video you want', 'features/chat/components/Composer/ChatComposerNew.tsx'],
  ['Creating your video', 'features/chat/components/messages/MediaGenerationPlaceholder.tsx'],
  ['Stop generating', 'features/chat/components/messages/MediaGenerationPlaceholder.tsx'],
  ['Your video is ready.', 'features/chat/components/messages/MessageBubble.tsx'],
  ['Resume checking', 'features/chat/components/messages/MessageBubble.tsx'],
  ['Video generation', 'features/chat/pages/WebChatPage.tsx'],
  ['AGI-managed cloud compute', 'features/settings/sections/WorkspacePolicySection.tsx'],
];

beforeAll(() => {
  if (!window.matchMedia) {
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      onchange: null,
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
  }
});

describe('VideoFeaturePage', () => {
  it('renders the hero heading for assistive technology and every section heading', () => {
    render(<VideoFeaturePage />);

    const hero = screen.getByRole('heading', { level: 1, name: 'Video generation' });
    expect(hero).toHaveClass('sr-only');
    for (const heading of SECTION_HEADINGS) {
      expect(
        screen.getByRole('heading', { level: 2, name: (name) => spaced(name) === heading }),
      ).toBeInTheDocument();
    }
    const stages = screen.getByRole('list', { name: 'Stages of a video generation turn' });
    expect(within(stages).getAllByRole('listitem')).toHaveLength(6);
  });

  it('reads the plans that include video generation from the billing catalog', () => {
    const { container } = render(<VideoFeaturePage />);

    const plans = billingPlanCapabilityPlanLabels('video_generation');
    expect(plans).not.toBe('');
    expect(container.textContent ?? '').toContain(
      `Video generation is included on ${plans} plans, up to any monthly allowance the plan sets.`,
    );
    expect(PAGE_SOURCE).not.toMatch(PLAN_NAME_LITERAL);
    expect(PAGE_SOURCE).toContain("billingPlanCapabilityPlanLabels('video_generation')");
  });

  it('states each monthly video allowance the tier policy sets, and no other', () => {
    const { container } = render(<VideoFeaturePage />);

    const allowances = billingPlanCapabilityWireTiers('video_generation').flatMap((tier) => {
      const seconds = getTierPolicy(tier).videoSecondsPerMonth;
      return seconds == null
        ? []
        : [
            `${getBillingPlanPricing(tier).label} includes ${seconds} seconds of video per calendar month; a request that would exceed it is refused.`,
          ];
    });
    const bounds = Array.from(
      container.querySelectorAll('.agi-lp-factline-list li'),
      (item) => item.textContent ?? '',
    );
    expect(bounds.filter((fact) => fact.includes('per calendar month'))).toEqual(allowances);
    expect(bounds).toHaveLength(4 + allowances.length);
    expect(PAGE_SOURCE).not.toMatch(TYPED_SECONDS);
  });

  it('names the composer row and its badges the way the product does', () => {
    const { container } = render(<VideoFeaturePage />);

    const createVideo = interactionMode('video').label;
    const text = container.textContent ?? '';
    expect(source(PLUS_MENU)).toContain(`'${createVideo}'`);
    expect(text).toContain(`choose ${createVideo}.`);
    expect(text).toContain(`the ${createVideo} row shows Upgrade.`);
    expect(text).not.toMatch(/free video|temporary free|limited free/iu);
    expect(PAGE_SOURCE).not.toContain(createVideo);
  });

  it('sends plan questions to pricing instead of promising a purchase', () => {
    const { container } = render(<VideoFeaturePage />);

    const pricingLinks = screen
      .getAllByRole('link')
      .filter((link) => link.getAttribute('href') === '/pricing#pricing-compare-title');
    expect(pricingLinks.length).toBeGreaterThanOrEqual(2);
    expect(container.textContent ?? '').not.toMatch(/buy now|subscribe now|checkout/i);
  });

  it('labels nothing on the page as unshipped', () => {
    const { container } = render(<VideoFeaturePage />);

    expect(container.textContent ?? '').not.toMatch(UNSHIPPED_LANGUAGE);
  });
});

describe('VideoFeaturePage coded previews', () => {
  it('shows the generating state in the hero and the finished state beside the copy', () => {
    const { container } = render(<VideoFeaturePage />);

    const generating = container.querySelector('figure[data-scene="video-generating"]');
    const ready = container.querySelector('figure[data-scene="video-ready"]');
    expect(generating?.closest('.agi-lp-hero-stage')).not.toBeNull();
    expect(ready?.closest('.agi-lp-moment')).not.toBeNull();
    expect(generating?.textContent ?? '').toContain('Creating your video');
    expect(generating?.textContent ?? '').toContain('Stop generating');
    expect(ready?.textContent ?? '').toContain('Your video is ready.');
    expect(ready?.textContent ?? '').toContain('Describe the video you want');
  });

  it('names the video model the catalog routes to, never a literal', () => {
    const { container } = render(<VideoFeaturePage />);

    const model = getModelMetadataById(getRoutingSlotModel('video_generation'));
    expect(model?.modelType).toBe('video');
    expect(container.querySelector('figure[data-scene="video-generating"]')?.textContent).toContain(
      model?.name,
    );
    expect(SCENE_SOURCE).not.toContain(`'${model?.name}'`);
    expect(SCENE_SOURCE).not.toContain(`'${model?.id}'`);
  });

  it('quotes strings that exist in the product source', () => {
    for (const [text, file] of PRODUCT_STRINGS) {
      expect(source(file), `${text} in ${file}`).toContain(text);
      expect(`${PAGE_SOURCE}\n${SCENE_SOURCE}`, text).toContain(text);
    }
  });
});
