import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MANAGED_CLOUD_STATUS } from '@/lib/legal-constants';
import { useBillingStore, type SubscriptionPlan } from '@shared/stores/web-auth-store';
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

const PRO_SUBSCRIPTION: SubscriptionPlan = {
  tier: 'pro',
  display_name: 'Pro',
  status: 'active',
  current_period_end: null,
  plan_name: 'Pro',
};

function picker(): ComposerProjectPicker {
  return {
    projects: [{ id: 'proj-1', name: 'Launch' }],
    activeProjectId: null,
    onSelectProject: vi.fn(),
    onCreateProject: vi.fn(),
  };
}

describe('composer AGI Work maturity disclosure', () => {
  beforeEach(() => {
    useBillingStore.setState({ subscription: PRO_SUBSCRIPTION });
  });

  it('badges the AGI Work toggle without renaming the control', () => {
    render(<ChatComposerNew onSend={vi.fn()} projectPicker={picker()} />);

    const toggle = screen.getByRole('button', { name: 'AGI Work' });
    const badge = screen.getByTestId('agi-work-maturity-badge');

    expect(toggle).toContainElement(badge);
    expect(badge.textContent).toBe('Alpha');
    expect(badge.getAttribute('aria-hidden')).toBe('true');

    const describedBy = toggle.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy as string)?.textContent).toContain(
      MANAGED_CLOUD_STATUS,
    );
  });
});
