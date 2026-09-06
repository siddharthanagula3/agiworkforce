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

// The founder removed the footer line on 2026-09-05, so there is no longer a
// quiet row under the card to collapse at a breakpoint: the accuracy caveat
// and the resolved-model summary are both gone and nothing replaced them.
// What still has to hold is that every entry point the footer used to own has
// a home elsewhere, which for the send route is the "+" menu at every width.
describe('composer carries no footer line under the card', () => {
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

  it('renders no footer entry at any width', () => {
    const { container } = renderComposer();

    expect(container.querySelectorAll(FOOTER_ENTRY_SELECTOR)).toHaveLength(0);
  });

  it('drops the accuracy caveat and the resolved-model summary with the line', () => {
    renderComposer();

    expect(screen.queryByTestId('ai-accuracy-disclaimer')).not.toBeInTheDocument();
    expect(screen.queryByText(AI_ACCURACY_DISCLAIMER)).not.toBeInTheDocument();
    expect(screen.queryByTestId('composer-model-summary')).not.toBeInTheDocument();
  });
});
