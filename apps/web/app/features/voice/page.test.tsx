import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import {
  billingPlanCapabilityWireTiers,
  getBillingPlanPricing,
  getTierPolicy,
  isFreeBillingPlanTier,
  TOOL_APPROVAL_ACTION_LABELS,
} from '@agiworkforce/types';
import { LIVE_VOICES } from '@agiworkforce/types/live-voices';

vi.mock('@shared/components/layout/Header', () => ({ Header: () => <div /> }));
vi.mock('@/features/marketing/components/MarketingFooter', () => ({
  MarketingFooter: () => <div />,
}));

import { VOICE_SCENE_COPY } from '@/features/marketing/components/scenes/VoiceScene';
import VoiceFeaturePage from './page';

const WEB_ROOT = resolve(__dirname, '../../..');
const productSource = (path: string) => readFileSync(resolve(WEB_ROOT, path), 'utf8');

const PAGE_SOURCE = readFileSync(resolve(__dirname, 'page.tsx'), 'utf8');
const VOICE_HEADER_SOURCE = productSource('features/chat/components/Voice/VoiceHeaderLabel.tsx');
const VOICE_COMPOSER_SOURCE = productSource('features/chat/components/Voice/VoiceComposer.tsx');
const VOICE_DOCK_SOURCE = productSource('features/chat/components/Voice/VoiceChatDock.tsx');
const VOICE_SURFACE_SOURCE = productSource('features/chat/components/Voice/VoiceModeSurface.tsx');
const VOICE_SETTINGS_SOURCE = productSource(
  'features/chat/components/Voice/VoiceSettingsModal.tsx',
);
const CHAT_PAGE_SOURCE = productSource('features/chat/pages/WebChatPage.tsx');

const UNSHIPPED_LANGUAGE =
  /rolling out|coming soon|on the roadmap|in preview|early access|when it lands/i;
const VOICE_TIERS = billingPlanCapabilityWireTiers('managed_chat').filter(
  (plan) => getTierPolicy(plan).allowVoice,
);
const PLAN_LABELS = VOICE_TIERS.map((plan) => getBillingPlanPricing(plan).label);
const FREE_TIER = VOICE_TIERS.find(isFreeBillingPlanTier);

function wholeWord(label: string): RegExp {
  return new RegExp(`\\b${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'u');
}

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

describe('VoiceFeaturePage sections', () => {
  it('renders the hero, dictation, voice mode, settings and plan sections', () => {
    render(<VoiceFeaturePage />);

    expect(screen.getByRole('heading', { level: 1, name: 'Voice' })).toBeTruthy();
    for (const name of [
      'Dictate a message into the composer.',
      'A spoken conversation that stays in the chat.',
      'Voice settings sit in the chat header.',
      'Voice on your plan.',
    ]) {
      expect(screen.getByRole('heading', { level: 2, name })).toBeTruthy();
    }
    expect(screen.getByRole('list', { name: 'Controls in a voice session' })).toBeTruthy();
  });

  it('keeps the hero to the label, the preview and the buttons', () => {
    const { container } = render(<VoiceFeaturePage />);

    const hero = container.querySelector('section.agi-lp-hero');
    const copy = hero?.querySelector('.agi-lp-hero-copy');
    expect(copy?.querySelector('h1')?.className).toBe('sr-only');
    expect(copy?.querySelectorAll('p')).toHaveLength(1);
    expect(copy?.querySelectorAll('a')).toHaveLength(2);
    expect(
      hero?.querySelector('.agi-lp-hero-stage figure.agi-dev.agi-app[data-scene="voice-session"]'),
    ).toBeTruthy();
    expect(
      container.querySelector('.agi-lp-moment figure[data-scene="voice-dictation"]'),
    ).toBeTruthy();
  });

  it('sends every plans link to the comparison section without promising a purchase', () => {
    const { container } = render(<VoiceFeaturePage />);

    const pricing = [...container.querySelectorAll('a')]
      .map((link) => link.getAttribute('href') ?? '')
      .filter((href) => href.startsWith('/pricing'));
    expect(pricing).toEqual(['/pricing#pricing-compare-title', '/pricing#pricing-compare-title']);
    expect(container.textContent ?? '').not.toMatch(/buy now|subscribe now|instant(ly)? upgrade/iu);
  });
});

describe('VoiceFeaturePage claims', () => {
  it('names the plans and the free allowance from the catalog', () => {
    const { container } = render(<VoiceFeaturePage />);
    const text = container.textContent ?? '';

    expect(PLAN_LABELS.length).toBeGreaterThan(1);
    for (const label of PLAN_LABELS) expect(text).toContain(label);
    expect(FREE_TIER).toBeDefined();
    const freeLabel = getBillingPlanPricing(FREE_TIER).label;
    const freeMinutes = getTierPolicy(FREE_TIER).voiceMinutesPerMonth;
    expect(freeMinutes).toBeGreaterThan(0);
    expect(text).toContain(
      `On the ${freeLabel} plan, voice mode and dictation share ${freeMinutes} minutes each calendar month.`,
    );
    expect(text).toContain(`Pick one of ${LIVE_VOICES.length} voices`);
    expect(text).toContain(
      `${TOOL_APPROVAL_ACTION_LABELS.approve} and ${TOOL_APPROVAL_ACTION_LABELS.deny}`,
    );
  });

  it('types no plan name, minute count or voice count by hand', () => {
    for (const label of PLAN_LABELS) {
      expect(PAGE_SOURCE, `${label} is typed by hand`).not.toMatch(wholeWord(label));
    }
    expect(PAGE_SOURCE).not.toMatch(/\d+\s+(voice\s+)?(minutes|voices)/iu);
    expect(PAGE_SOURCE).not.toMatch(/\$\s?\d/u);
  });

  it('uses the labels the voice controls carry in the product', () => {
    const { container } = render(<VoiceFeaturePage />);
    const text = container.textContent ?? '';

    expect(VOICE_COMPOSER_SOURCE).toContain('onClick={onToggleDock}');
    expect(VOICE_DOCK_SOURCE).toContain("captions: 'Captions'");
    expect(VOICE_DOCK_SOURCE).toContain("pause: 'Pause call'");
    expect(VOICE_SURFACE_SOURCE).toContain('The call is closed and nothing is being used.');
    expect(text).toContain('Captions, in the plus button’s menu,');
    expect(text).toContain('Pause call in that menu closes the call, so nothing is used');

    expect(VOICE_SETTINGS_SOURCE).toContain("reasoning: 'Voice reasoning'");
    expect(VOICE_SETTINGS_SOURCE).toContain("label: 'Thinking'");
    expect(VOICE_SETTINGS_SOURCE).toContain('Paid plans, from your next voice session');
    expect(VOICE_SETTINGS_SOURCE).toContain("autoDetect: 'Auto-detect'");
    expect(text).toContain(
      'Under Voice reasoning, Thinking is for paid plans, from your next voice session.',
    );
    expect(text).toContain('a language or Auto-detect.');
  });

  it('limits the Space shortcut to the Type field, as the voice bar does', () => {
    const { container } = render(<VoiceFeaturePage />);

    expect(VOICE_COMPOSER_SOURCE).toContain('onKeyDown={handleKeyDown}');
    expect(VOICE_COMPOSER_SOURCE).toContain('if (value.trim()) return;');
    expect(container.textContent ?? '').toContain(
      `Space in the empty ${VOICE_SCENE_COPY.placeholder} field, mutes and unmutes you.`,
    );
    expect(container.textContent ?? '').not.toMatch(/Space does the same while/u);
  });

  it('describes nothing as unshipped', () => {
    const { container } = render(<VoiceFeaturePage />);

    expect(container.textContent ?? '').not.toMatch(UNSHIPPED_LANGUAGE);
  });
});

describe('VoiceScene preview', () => {
  it('draws the session with the strings the product source carries', () => {
    const { container } = render(<VoiceFeaturePage />);
    const preview = container.querySelector<HTMLElement>('figure[data-scene="voice-session"]');
    if (!preview) throw new Error('The voice session preview did not render');

    expect(VOICE_HEADER_SOURCE).toContain(`mode: '${VOICE_SCENE_COPY.mode}'`);
    expect(VOICE_COMPOSER_SOURCE).toContain(`placeholder: '${VOICE_SCENE_COPY.placeholder}'`);
    expect(CHAT_PAGE_SOURCE).toContain(`NEW_CHAT_TITLE = '${VOICE_SCENE_COPY.newChat}'`);
    expect(preview.querySelector('.agi-voice-head-mode')?.textContent).toBe(VOICE_SCENE_COPY.mode);
    expect(preview.querySelector('.agi-voice-field')?.textContent).toBe(
      VOICE_SCENE_COPY.placeholder,
    );
    expect(preview.querySelector('.agi-app-session[data-active]')?.textContent).toBe(
      VOICE_SCENE_COPY.newChat,
    );
  });

  it('opens the session without captions, which start switched off', () => {
    const { container } = render(<VoiceFeaturePage />);
    const preview = container.querySelector<HTMLElement>('figure[data-scene="voice-session"]');

    expect(VOICE_SURFACE_SOURCE).toContain(
      'const [captionsOpen, setCaptionsOpen] = useState(false);',
    );
    expect(preview?.textContent ?? '').not.toMatch(/captions/iu);
  });
});
