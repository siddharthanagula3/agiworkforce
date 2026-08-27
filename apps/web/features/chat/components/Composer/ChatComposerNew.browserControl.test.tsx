import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BROWSER_CONTROL_COPY,
  BROWSER_CONTROL_MENU,
  BROWSER_CONTROL_TEST_IDS,
  COMPUTER_USE_ON_WEB,
} from '@features/chat/components/computer-use';
import { API_HOST_REWRITE_ROUTES } from '@/lib/api-host-route-contract';
import { useBillingStore, type SubscriptionPlan } from '@shared/stores/web-auth-store';
import { ChatComposerNew } from './ChatComposerNew';

const METERED_COMPLETIONS_ROUTE = API_HOST_REWRITE_ROUTES.find(
  (route) => route.source === '/v1/chat/completions',
)!.destination;

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

const MAX_SUBSCRIPTION: SubscriptionPlan = {
  tier: 'max_15x',
  display_name: 'Max',
  status: 'active',
  current_period_end: null,
  plan_name: 'Max',
};

let fetchSpy: ReturnType<typeof vi.fn>;

function meteredRequests(): unknown[] {
  return fetchSpy.mock.calls.filter(([input]) => String(input).includes(METERED_COMPLETIONS_ROUTE));
}

function openBrowserControl() {
  fireEvent.click(screen.getByRole('button', { name: 'More options' }));
  fireEvent.click(screen.getByTestId(BROWSER_CONTROL_TEST_IDS.menuRow));
}

beforeEach(() => {
  useBillingStore.setState({ subscription: MAX_SUBSCRIPTION });
  fetchSpy = vi.fn();
  vi.stubGlobal('fetch', fetchSpy);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('composer computer-use affordance', () => {
  it('marks the menu row as belonging to another client', () => {
    render(<ChatComposerNew onSend={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'More options' }));
    const row = screen.getByTestId(BROWSER_CONTROL_TEST_IDS.menuRow);

    expect(row.textContent).toContain(COMPUTER_USE_ON_WEB.label);
    expect(row.textContent).toContain(BROWSER_CONTROL_MENU.badge);
    expect(row.getAttribute('title')).toBe(COMPUTER_USE_ON_WEB.tooltip);
  });

  it('opens the requirement instead of starting anything', () => {
    render(<ChatComposerNew onSend={vi.fn()} />);

    openBrowserControl();

    expect(screen.getByTestId(BROWSER_CONTROL_TEST_IDS.dialog)).toBeTruthy();
    expect(screen.getByText(BROWSER_CONTROL_COPY.lead)).toBeTruthy();
    expect(meteredRequests()).toHaveLength(0);
  });

  it('never becomes an active composer option', () => {
    render(<ChatComposerNew onSend={vi.fn()} />);

    openBrowserControl();

    expect(screen.queryByRole('button', { name: /More options — \d+ active/u })).toBeNull();
  });

  it('leaves the sent turn untouched, so no computer-use unit can be reserved', () => {
    const onSend = vi.fn();
    render(<ChatComposerNew onSend={onSend} />);

    openBrowserControl();
    fireEvent.click(screen.getByRole('button', { name: BROWSER_CONTROL_COPY.dismiss }));

    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: 'book me a flight' } });
    fireEvent.keyDown(textarea, { key: 'Enter' });

    expect(onSend).toHaveBeenCalledTimes(1);
    const meta = onSend.mock.calls[0]?.[3] ?? {};
    expect(Object.keys(meta).some((key) => /computer|browserControl/iu.test(key))).toBe(false);
    expect(meteredRequests()).toHaveLength(0);
  });
});
