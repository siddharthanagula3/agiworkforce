import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import AdminConsolePage from './AdminConsolePage';

vi.mock('../components/SecurityOperationsPanel', () => ({
  default: () => <div data-testid="security-operations-panel">Live security operations</div>,
}));

const FORBIDDEN_PATTERNS = [/waitlist/i, /private beta/i, /launch gate/i, /public_launch_blocked/i];

afterEach(() => {
  vi.unstubAllEnvs();
});

function expectNoForbiddenLanguage(text: string): void {
  for (const pattern of FORBIDDEN_PATTERNS) {
    expect(text).not.toMatch(pattern);
  }
}

describe('AdminConsolePage — managed compute status honesty', () => {
  it('includes the live security operations surface', () => {
    render(<AdminConsolePage />);
    expect(screen.getByTestId('security-operations-panel')).toBeInTheDocument();
  });

  it('states public alpha / open by default (env unset), with no waitlist/private-beta/launch-gate language', () => {
    vi.stubEnv('AGI_MANAGED_COMPUTE_PRIVATE_BETA', '');
    const { container } = render(<AdminConsolePage />);

    expectNoForbiddenLanguage(container.textContent ?? '');
    expect(screen.getByText('Managed compute: public alpha, open by default')).toBeInTheDocument();
    expect(screen.getByText('Managed Compute Access')).toBeInTheDocument();
    expect(screen.getByText('Open (public alpha)')).toBeInTheDocument();
    expect(screen.getByText('Public alpha')).toBeInTheDocument();
  });

  it.each([['0'], ['false'], ['off']])(
    'renders "temporarily disabled (incident kill-switch)" — never waitlist/private-beta language — when the kill-switch is engaged (env=%s)',
    (envValue) => {
      vi.stubEnv('AGI_MANAGED_COMPUTE_PRIVATE_BETA', envValue);
      const { container } = render(<AdminConsolePage />);

      expectNoForbiddenLanguage(container.textContent ?? '');
      expect(
        screen.getByText('Managed compute temporarily disabled (incident kill-switch)'),
      ).toBeInTheDocument();
      expect(screen.getByText('Temporarily disabled (incident kill-switch)')).toBeInTheDocument();
      expect(screen.getByText('Managed Compute Access')).toBeInTheDocument();
    },
  );

  it('does not describe implemented identity capabilities as deferred', () => {
    const { container } = render(<AdminConsolePage />);
    const text = container.textContent ?? '';

    expect(text).not.toMatch(/deferred/i);
    expect(text).toMatch(/SCIM 2\.0 provisioning/);
    expect(text).toMatch(/enterprise_controls/);
  });

  it('treats any other env value (including "1", the retired opt-in value) as open/public-alpha', () => {
    vi.stubEnv('AGI_MANAGED_COMPUTE_PRIVATE_BETA', '1');
    const { container } = render(<AdminConsolePage />);

    expectNoForbiddenLanguage(container.textContent ?? '');
    expect(screen.getByText('Managed compute: public alpha, open by default')).toBeInTheDocument();
  });
});
