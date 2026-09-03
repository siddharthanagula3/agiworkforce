import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { summarizeSendPreview } from '@agiworkforce/types';
import { useBillingStore } from '@shared/stores/web-auth-store';
import { AI_ACCURACY_DISCLAIMER } from '@/lib/compliance/ai-act';
import { ChatComposerNew, type ComposerProjectPicker } from './ChatComposerNew';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
}));

vi.mock('@features/settings/components/SettingsModalProvider', () => ({
  useSettingsModal: () => ({ isOpen: false, openSettings: vi.fn(), closeSettings: vi.fn() }),
}));

vi.mock('@features/chat/hooks/use-skills-list', () => ({
  useSkillsList: () => ({ skills: [], loading: false, error: null }),
}));

vi.mock('@features/chat/hooks/use-media-model-availability', () => ({
  useMediaModelAvailability: () => ({
    status: 'ready',
    error: null,
    admissionFor: vi.fn(),
    retry: vi.fn(),
  }),
}));

vi.mock('@features/connectors/hooks/use-connectors', () => ({
  useConnectors: () => ({
    connectedIds: new Set<string>(),
    sources: {} as Record<string, string>,
    customNames: {} as Record<string, string>,
  }),
}));

/** Both shells gate their narrow layout on this query; `md:` is its complement. */
const MOBILE_MEDIA_QUERY = '(max-width: 768px)';
const FOOTER_ENTRY_SELECTOR = '[data-testid^="composer-footer-entry-"]';
const FOOTER_ENTRY_TESTID_PREFIX = 'composer-footer-entry-';
const ACCURACY_ENTRY_TESTID = `${FOOTER_ENTRY_TESTID_PREFIX}accuracy`;
const MENU_SEND_ROUTE_TESTID = 'composer-menu-send-route';
const DESTINATION_HOST = 'AGI managed cloud';

function picker(): ComposerProjectPicker {
  return {
    projects: [],
    activeProjectId: null,
    onSelectProject: vi.fn(),
    onCreateProject: vi.fn(),
  };
}

function sendPreview() {
  return summarizeSendPreview({
    providerMode: 'ManagedGateway',
    destinationHost: DESTINATION_HOST,
  });
}

function renderComposer() {
  return render(
    <ChatComposerNew
      onSend={vi.fn()}
      projectPicker={picker()}
      sendPreviewPresentation={sendPreview()}
    />,
  );
}

/** Entries the phone actually paints: everything without the `hidden` gate. */
function mobileVisibleEntryKeys(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOOTER_ENTRY_SELECTOR))
    .filter((entry) => !entry.className.split(/\s+/).includes('hidden'))
    .map((entry) => entry.dataset['testid']?.slice(FOOTER_ENTRY_TESTID_PREFIX.length) ?? '');
}

// M11. Measured 2026-08-30: this footer ran to three rows at 390px and made the
// resting composer 136px against ChatGPT's 87px. jsdom does not evaluate media
// queries, so what is asserted here is the responsive CLASS contract — which is
// the layer the defect lived in. The pixel outcome belongs to a browser run.
describe('composer footer collapses at the mobile breakpoint (M11)', () => {
  beforeEach(() => {
    useBillingStore.setState({
      subscription: {
        tier: 'pro',
        display_name: 'Pro',
        status: 'active',
        current_period_end: null,
        plan_name: 'Pro',
      },
      featureFlags: { generic_web_search: true, advanced_model_access: true },
    });

    window.matchMedia = vi.fn((query: string) => ({
      matches: query === MOBILE_MEDIA_QUERY,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
  });

  it('leaves the accuracy disclaimer as the only footer entry a phone paints', () => {
    const { container } = renderComposer();

    expect(mobileVisibleEntryKeys(container)).toEqual(['accuracy']);
    expect(screen.getByTestId('ai-accuracy-disclaimer').textContent).toBe(AI_ACCURACY_DISCLAIMER);
  });

  it('gates every dropped entry on the same breakpoint the shells use', () => {
    const { container } = renderComposer();

    const gated = Array.from(container.querySelectorAll<HTMLElement>(FOOTER_ENTRY_SELECTOR)).filter(
      (entry) => entry.className.split(/\s+/).includes('hidden'),
    );

    expect(gated.map((entry) => entry.dataset['testid'])).toEqual([
      `${FOOTER_ENTRY_TESTID_PREFIX}web-search`,
      `${FOOTER_ENTRY_TESTID_PREFIX}send-preview`,
      `${FOOTER_ENTRY_TESTID_PREFIX}privacy`,
      `${FOOTER_ENTRY_TESTID_PREFIX}feedback`,
    ]);
    for (const entry of gated) {
      expect(entry.className).toContain('md:inline-flex');
    }
  });

  it('opens the phone row on the disclaimer instead of a dangling separator', () => {
    renderComposer();

    const separator = screen
      .getByTestId(ACCURACY_ENTRY_TESTID)
      .querySelector<HTMLElement>('[aria-hidden="true"]');

    expect(separator).not.toBeNull();
    expect(separator?.className).toContain('hidden');
    expect(separator?.className).toContain('md:inline');
  });

  it('keeps the send route reachable from the "+" menu once the footer drops it', () => {
    renderComposer();

    fireEvent.click(screen.getByRole('button', { name: /add attachments and tools/i }));

    const route = screen.getByTestId(MENU_SEND_ROUTE_TESTID);
    expect(route.className).toContain('md:hidden');
    expect(within(route).getByText(`Sent to ${DESTINATION_HOST}`)).toBeTruthy();
  });

  it('still renders the whole line for a desktop viewport to reveal', () => {
    const { container } = renderComposer();

    expect(
      Array.from(container.querySelectorAll<HTMLElement>(FOOTER_ENTRY_SELECTOR)).map(
        (entry) => entry.dataset['testid'],
      ),
    ).toEqual([
      `${FOOTER_ENTRY_TESTID_PREFIX}web-search`,
      `${FOOTER_ENTRY_TESTID_PREFIX}send-preview`,
      `${FOOTER_ENTRY_TESTID_PREFIX}accuracy`,
      `${FOOTER_ENTRY_TESTID_PREFIX}privacy`,
      `${FOOTER_ENTRY_TESTID_PREFIX}feedback`,
    ]);
  });
});
