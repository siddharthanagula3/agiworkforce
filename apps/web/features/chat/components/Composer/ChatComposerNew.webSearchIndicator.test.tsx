import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useBillingStore } from '@shared/stores/web-auth-store';
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

function picker(): ComposerProjectPicker {
  return {
    projects: [],
    activeProjectId: null,
    onSelectProject: vi.fn(),
    onCreateProject: vi.fn(),
  };
}

describe('standing web-search indicator (UI-04)', () => {
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
  });

  it('says at a glance that this turn can search', () => {
    render(<ChatComposerNew onSend={vi.fn()} projectPicker={picker()} />);

    const indicator = screen.getByTestId('web-search-indicator');
    expect(indicator.getAttribute('data-active')).toBe('true');
    expect(indicator.textContent).toBe('Web search on');
  });

  it('says so when the deployment offers no search path at all', () => {
    useBillingStore.setState({
      featureFlags: { generic_web_search: false, advanced_model_access: true },
    });

    render(<ChatComposerNew onSend={vi.fn()} projectPicker={picker()} />);

    const indicator = screen.getByTestId('web-search-indicator');
    expect(indicator.getAttribute('data-active')).toBe('false');
    expect(indicator.textContent).toBe('Web search off');
  });
});
