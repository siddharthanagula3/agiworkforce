import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { render, screen, within } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import {
  MANAGED_MEDIA_MAX_IMAGE_REFERENCES,
  supportsManagedMediaImageEdit,
} from '@agiworkforce/cloud-contracts';
import {
  BILLING_PLAN_PRICING,
  billingPlanCapabilityPlanLabels,
  billingPlanCapabilityWireTiers,
  canUseBillingPlanCapability,
  getBillingPlanPricing,
  interactionMode,
} from '@agiworkforce/types';

vi.mock('@shared/components/layout/Header', () => ({ Header: () => <div /> }));
vi.mock('@/features/marketing/components/MarketingFooter', () => ({
  MarketingFooter: () => <div />,
}));

import {
  getImageAspectOptionsForModel,
  IMAGE_STYLE_PRESETS,
} from '@/features/chat/lib/imageGenerationOptions';
import { PREVIEW_GEOMETRY } from '@/features/marketing/components/app-preview/AppPreviews';
import {
  IMAGE_SCENE_MODEL,
  IMAGE_SCENE_PROMPT,
  ImageScene,
} from '@/features/marketing/components/scenes/ImageScene';
import { FREE_MEDIA_LIMITED_LABEL } from '@/features/models/lib/free-media-offer';
import { APP_NAV_DESTINATIONS } from '@/shared/components/layout/app-nav-items';
import ImageGenerationPage from './page';

const WEB_ROOT = resolve(__dirname, '..', '..', '..');
const source = (path: string) => readFileSync(resolve(WEB_ROOT, path), 'utf8');

const PAGE_SOURCE = source('app/features/images/page.tsx');
const SCENE_SOURCE = source('features/marketing/components/scenes/ImageScene.tsx');
const SCENE_CSS = source('features/marketing/components/scenes/ImageScene.css');
const CARD_SOURCE = source('features/chat/components/ImageGenerationCard.tsx');
const COMPOSER_SOURCE = source('features/chat/components/Composer/ChatComposerNew.tsx');
const CHAT_PAGE_SOURCE = source('features/chat/pages/WebChatPage.tsx');

const UNSHIPPED_LANGUAGE =
  /rolling out|coming soon|on the roadmap|in preview|early access|when it lands/i;
const SECTION_HEADINGS = [
  'Image generation',
  'Start from the composer, or ask in a chat.',
  'Each request is checked before an image is made.',
  'Change the result without starting over.',
  'Choose a plan with image generation.',
];
const PLAN_SENTENCE = /Image generation is included on (.+?) plans\./u;
const MODEL_LABEL_CAP = 120;
const spaced = (value: string) => value.replaceAll(' ', ' ');

function wholeWord(label: string): RegExp {
  return new RegExp(`\\b${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
}

function pageText(): string {
  return spaced(render(<ImageGenerationPage />).container.textContent ?? '');
}

function drawScene(): HTMLElement {
  const root = render(<ImageScene />).container.querySelector<HTMLElement>('figure.agi-app');
  if (!root) throw new Error('The image preview did not render');
  return root;
}

const sceneTexts = (root: HTMLElement, selector: string) =>
  Array.from(root.querySelectorAll(selector), (node) => node.textContent);
const sceneText = (root: HTMLElement, selector: string) =>
  root.querySelector(selector)?.textContent;

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

describe('ImageGenerationPage sections', () => {
  it('renders the hero, both ledgers, the limits and the closing section', () => {
    render(<ImageGenerationPage />);

    for (const heading of SECTION_HEADINGS) {
      expect(
        screen.getByRole('heading', { name: (name) => spaced(name) === heading }),
      ).toBeTruthy();
    }
    const create = screen.getByRole('list', { name: 'Ways to create an image' });
    const revise = screen.getByRole('list', { name: 'Ways to revise and keep an image' });
    expect(within(create).getAllByRole('listitem')).toHaveLength(6);
    expect(within(revise).getAllByRole('listitem')).toHaveLength(6);
  });

  it('keeps the hero to the label, the preview and the buttons', () => {
    const { container } = render(<ImageGenerationPage />);

    const hero = container.querySelector('section.agi-lp-hero');
    const copy = hero?.querySelector('.agi-lp-hero-copy');
    expect(copy?.querySelector('h1')?.className).toBe('sr-only');
    expect(copy?.querySelectorAll('p')).toHaveLength(1);
    expect(copy?.querySelectorAll('a')).toHaveLength(2);
    expect(hero?.querySelector('figure.agi-dev.agi-app[data-scene="image"]')).toBeTruthy();
  });

  it('sends every plans link to the comparison section', () => {
    const { container } = render(<ImageGenerationPage />);

    const pricing = [...container.querySelectorAll('a')]
      .map((link) => link.getAttribute('href') ?? '')
      .filter((href) => href.startsWith('/pricing'));
    expect(pricing).toEqual(['/pricing#pricing-compare-title', '/pricing#pricing-compare-title']);
  });
});

describe('ImageGenerationPage claims', () => {
  it('names the plans through the catalog and never as literals', () => {
    expect(pageText()).toContain(
      `Image generation is included on ${billingPlanCapabilityPlanLabels('image_generation')} plans.`,
    );
    expect(PAGE_SOURCE).toContain("billingPlanCapabilityPlanLabels('image_generation')");
    for (const plan of Object.values(BILLING_PLAN_PRICING)) {
      expect(PAGE_SOURCE, `${plan.label} is typed by hand`).not.toMatch(wholeWord(plan.label));
    }
  });

  it('names in the rendered sentence only plans that include image generation', () => {
    const named = (PLAN_SENTENCE.exec(pageText())?.[1] ?? '').split(/, and |, | and /u);
    const included = billingPlanCapabilityWireTiers('image_generation');
    const tierByLabel = new Map(included.map((tier) => [getBillingPlanPricing(tier).label, tier]));

    expect(named).toHaveLength(included.length);
    for (const label of named) {
      expect(
        canUseBillingPlanCapability(tierByLabel.get(label), 'image_generation'),
        `${label} is named but does not include image generation`,
      ).toBe(true);
    }
  });

  it('takes the menu label, the reference limit and the offer badge from their owners', () => {
    const text = pageText();

    expect(text).toContain(`choose ${interactionMode('image').label}.`);
    expect(text).toContain(`up to ${MANAGED_MEDIA_MAX_IMAGE_REFERENCES} more images`);
    expect(text).toContain(`carries a ${FREE_MEDIA_LIMITED_LABEL} badge`);
    expect(text).toContain(`one of ${IMAGE_STYLE_PRESETS.length} preset phrases`);
  });

  it('describes the revision panel where the product opens it and for the images that have it', () => {
    const text = pageText();

    expect(text).toContain('On an image made in image mode, New version opens a revision panel.');
    expect(text).not.toMatch(/beside the (chat|conversation)/iu);
    expect(CARD_SOURCE).not.toContain('createPortal');
    expect(CARD_SOURCE).toContain('{...(onRegenerate ? { onEdit: () => setShowEdit(true) } : {})}');
    expect(source('features/chat/components/messages/cards/ImageToolCard.tsx')).not.toContain(
      'onRegenerate',
    );
  });

  it('does not promise an image studio, instant purchase or unshipped work', () => {
    const text = pageText();

    expect(text).not.toMatch(UNSHIPPED_LANGUAGE);
    expect(text).not.toMatch(/image studio|buy now|subscribe now|upgrade instantly/i);
  });
});

describe('ImageScene preview', () => {
  it('draws the catalog image model and a prompt built from a real style preset', () => {
    const preview = drawScene();

    expect(IMAGE_SCENE_MODEL).toBeDefined();
    expect(within(preview).getByText(IMAGE_SCENE_PROMPT)).toBeTruthy();
    expect(IMAGE_STYLE_PRESETS.some((preset) => IMAGE_SCENE_PROMPT.endsWith(preset.phrase))).toBe(
      true,
    );
    expect(sceneText(preview, '.agi-image-caption')).toBe(
      `Generated with ${IMAGE_SCENE_MODEL?.label}`,
    );
    expect(sceneText(preview, '.agi-image-model')).toBe(IMAGE_SCENE_MODEL?.label);
    expect(SCENE_SOURCE).not.toContain(`'${IMAGE_SCENE_MODEL?.label}'`);
    expect(SCENE_SOURCE).not.toContain(`'${IMAGE_SCENE_MODEL?.id}'`);
  });

  it('carries the web geometry, its scene name and a label', () => {
    const root = drawScene();
    const geometry = PREVIEW_GEOMETRY.web;

    expect([...root.classList]).toEqual(['agi-dev', 'agi-dev--web', 'agi-app', 'agi-app--web']);
    expect(root).toHaveAttribute('data-device', 'web');
    expect(root).toHaveAttribute('data-scene', 'image');
    expect(root).toHaveAttribute('data-geometry', `${geometry.width}x${geometry.height}`);
    expect(root.getAttribute('aria-label')).toMatch(/^Authored example of /u);
    expect(root.style.getPropertyValue('--app-w')).toBe(String(geometry.width));
    expect(root.style.getPropertyValue('--app-h')).toBe(String(geometry.height));
  });

  it('exposes no control a visitor could try to use', () => {
    const root = drawScene();

    expect(root.firstElementChild).toHaveAttribute('aria-hidden', 'true');
    expect(
      root.querySelectorAll(
        'button,a,input,textarea,select,[tabindex],[contenteditable],[role="button"]',
      ),
    ).toHaveLength(0);
  });

  it('sits in a browser window inside the signed-in chat shell', () => {
    const root = drawScene();
    const destinations = APP_NAV_DESTINATIONS.filter(
      (item) => !item.adminOnly && !item.requiresHealthSpace && !item.feature,
    ).map((item) => item.label);

    expect(root.querySelectorAll('.agi-app-chrome .agi-app-lights i')).toHaveLength(3);
    expect(sceneText(root, '.agi-app-url')).toBe('agiworkforce.com/chat');
    expect(sceneTexts(root, '.agi-app-navrow')).toEqual(destinations);
    expect(sceneTexts(root, '.agi-app-navrow[data-active]')).toEqual([destinations[0]]);
    expect(sceneText(root, '.agi-app-session[data-active]')).toBe('Image generation');
    expect(CHAT_PAGE_SOURCE).toContain("const IMAGE_GENERATION_TITLE = 'Image generation';");
  });

  it('draws the card in the transcript and no revision panel beside the chat', () => {
    const root = drawScene();

    expect(root.querySelector('.agi-app-thread .agi-app-reply .agi-image-card')).not.toBeNull();
    expect(root.querySelector('.agi-app-main')?.nextElementSibling).toBeNull();
    expect(root.querySelector('[class*="agi-image-panel"]')).toBeNull();
    expect(root.textContent).not.toMatch(/Variation|Select area|Add mask/u);
  });

  it('copies the card strings from the product card', () => {
    const root = drawScene();

    expect(sceneTexts(root, '.agi-image-chip')).toEqual(['New version', '']);
    expect(CARD_SOURCE).toMatch(/<Pencil className="h-3 w-3" \/>\s+New version\s+<\/button>/u);
    expect(CARD_SOURCE).toContain('aria-label="Share image"');
    expect(sceneTexts(root, '.agi-image-action')).toEqual(['Copy', '', '', '']);
    expect(CARD_SOURCE).toContain("{copyFailed ? 'Copy failed' : copied ? 'Copied' : 'Copy'}");
    expect(CARD_SOURCE).toContain('aria-label="More actions"');
    expect(sceneText(root, '.agi-image-count')).toMatch(/^\d+ \/ \d+$/u);
    expect(CARD_SOURCE).toContain('{version.index + 1} / {version.total}');
    expect(CARD_SOURCE).toContain('disabled={version.index === version.total - 1}');
    expect(root.querySelectorAll('.agi-image-versions .agi-image-action[data-idle]')).toHaveLength(
      1,
    );
    expect(CARD_SOURCE).toContain('`Generated with ${modelLabel}${');
  });

  it('copies the image-mode composer from the product composer', () => {
    const root = drawScene();
    const composer = root.querySelector<HTMLElement>('.agi-image-composer');
    if (!composer) throw new Error('The image composer did not render');
    const edits = supportsManagedMediaImageEdit(IMAGE_SCENE_MODEL?.imageApi);
    const aspect = getImageAspectOptionsForModel(IMAGE_SCENE_MODEL?.id)[0]?.label;

    expect(sceneText(composer, '.agi-app-placeholder')).toBe('Describe or edit an image');
    expect(COMPOSER_SOURCE).toContain("? 'Describe or edit an image'");
    expect(sceneTexts(composer, '.agi-image-pills .agi-image-pill')).toEqual(
      ['Image', aspect, 'Style', ...(edits ? ['Transparent'] : [])].filter(Boolean),
    );
    expect(COMPOSER_SOURCE).toContain('<span>Image</span>');
    expect(COMPOSER_SOURCE).toMatch(/>\s+Style\s+<ChevronDown className="h-4 w-4" \/>/u);
    expect(COMPOSER_SOURCE).toMatch(/>\s+Transparent\s+<\/button>/u);
    expect(COMPOSER_SOURCE).toContain('{imageModelSupportsEdit && (');
    expect(COMPOSER_SOURCE).toContain(
      'projectPicker && canUseAgiWork && !imageMode && !videoMode && (',
    );
    expect(composer.querySelector('.agi-app-seg')).toBeNull();
    expect(COMPOSER_SOURCE).toContain(`<span className="max-w-[${MODEL_LABEL_CAP}px] truncate">`);
    expect(SCENE_CSS).toMatch(
      new RegExp(
        `\\.agi-image-model \\{\\s+max-inline-size: calc\\(var\\(--u\\) \\* ${MODEL_LABEL_CAP}\\);`,
        'u',
      ),
    );
    expect(composer.querySelector('.agi-app-composer-row > .lucide-mic')).not.toBeNull();
    expect(composer.querySelector('.agi-app-send > .lucide-audio-lines')).not.toBeNull();
    expect(COMPOSER_SOURCE).toContain('<VoiceInputButton');
    expect(COMPOSER_SOURCE).toContain(
      "onEnterVoiceMode && canUseVoice && sendButtonMode !== 'stop' && !hasContent ? (",
    );
  });
});

describe('the image scene stylesheet keeps to the web app palette and to scale', () => {
  it('uses only the chat tokens the shared scenes allow', () => {
    const allowed =
      /^--(?:u|app-w|corner-pill|agi-image-text-[a-z]+|chat-(?:bg|sidebar-bg|input-bg|surface-hover|border|border-strong|text-primary|text-secondary|text-muted|text-placeholder|user-bubble-bg))$/u;
    const used = new Set(
      Array.from(SCENE_CSS.matchAll(/var\((--[a-z0-9-]+)/gu), (match) => match[1] ?? ''),
    );

    expect(used.size).toBeGreaterThan(4);
    for (const token of used) expect(token).toMatch(allowed);
  });

  it('takes every type size from its own type steps, each the design unit times a size', () => {
    const sizes = Array.from(
      SCENE_CSS.matchAll(/font-size:\s*([^;]+);/gu),
      (match) => match[1] ?? '',
    );
    const steps = new Map(
      Array.from(SCENE_CSS.matchAll(/(--agi-image-text-[a-z]+):\s*([^;]+);/gu), (match) => [
        match[1] ?? '',
        match[2] ?? '',
      ]),
    );

    expect(sizes.length).toBeGreaterThan(0);
    expect(steps.size).toBeGreaterThan(0);
    for (const [step, value] of steps) {
      expect(value, step).toMatch(/^calc\(var\(--u\) \* \d+\)$/u);
    }
    for (const size of sizes) {
      const step = /^var\((--agi-image-text-[a-z]+)\)$/u.exec(size)?.[1];
      expect(step, size).toBeDefined();
      expect(steps.has(step ?? ''), size).toBe(true);
    }
  });

  it('paints no amber, accent or warning colour and no raw colour value', () => {
    expect(SCENE_CSS).not.toMatch(/amber|brown|orange|yellow|warning|accent/iu);
    expect(SCENE_CSS).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/iu);
  });

  it('sizes everything from the design unit', () => {
    const lengths = Array.from(SCENE_CSS.matchAll(/(?<![\w.-])(\d*\.?\d+)(px|rem|vw|vh|pt)\b/gu));

    expect(lengths.map((match) => match[0]).filter((length) => length !== '1px')).toEqual([]);
    expect(SCENE_CSS).not.toMatch(/@media|@container/u);
  });

  it('scopes every rule to the design root and to image or shared preview classes', () => {
    const selectors = Array.from(SCENE_CSS.matchAll(/^([^\s@{}][^{}]*)\{/gmu), (match) =>
      (match[1] ?? '').trim(),
    );

    expect(selectors.length).toBeGreaterThan(10);
    for (const selector of selectors.flatMap((group) => group.split(','))) {
      expect(selector.trim()).toMatch(/^\[data-design='agi'\] \.agi-(?:image|app)-/u);
    }
  });
});
