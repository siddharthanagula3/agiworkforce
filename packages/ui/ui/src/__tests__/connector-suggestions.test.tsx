import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { SettingsModal } from '../settings-modal/SettingsModal';
import type { SettingsConnector } from '../settings-modal/types';

function connector(id: string, name: string): SettingsConnector {
  return {
    id,
    name,
    description: `${name} connector`,
    category: 'Web',
    authType: 'oauth',
    actionCount: 3,
    phase: 1,
    iconBg: '#eee',
    iconText: '#111',
    canConnect: true,
  };
}

const CATALOG = [
  connector('linear', 'Linear'),
  connector('notion', 'Notion'),
  connector('slack', 'Slack'),
  connector('github', 'GitHub'),
];

function mount(workRole: string | null, connected: string[] = []) {
  return render(
    <SettingsModal
      open
      onClose={vi.fn()}
      activeSection="connectors"
      onSectionChange={vi.fn()}
      sectionContent={{}}
      workRole={workRole}
      adapter={
        {
          connectors: CATALOG,
          connectedConnectors: connected.map((connectorId) => ({ connectorId })),
          connectorsLoading: false,
        } as never
      }
    />,
  );
}

describe('connector suggestions', () => {
  it('suggests connectors for the stated role', () => {
    mount('Product management');

    const region = screen.getByRole('region', { name: /Suggested for Product management/i });
    expect(within(region).getByRole('button', { name: 'Linear' })).toBeTruthy();
  });

  it('shows nothing when the user never said what they do', () => {
    mount(null);

    expect(screen.queryByRole('heading', { name: /Suggested for/i })).toBeNull();
  });

  it('shows nothing for a role with no curated list, rather than a generic row', () => {
    mount('Underwater basket weaving');

    expect(screen.queryByRole('heading', { name: /Suggested for/i })).toBeNull();
  });

  it('never suggests something already connected', () => {
    mount('Product management', ['linear']);

    const region = screen.getByRole('region', { name: /Suggested for/i });
    expect(within(region).queryByRole('button', { name: 'Linear' })).toBeNull();
    expect(within(region).getByRole('button', { name: 'Notion' })).toBeTruthy();
  });

  it('never claims popularity it cannot measure', () => {
    mount('Product management');

    const region = screen.getByRole('region', { name: /Suggested for/i });
    expect(within(region).queryByText(/popular/i)).toBeNull();
    expect(within(region).queryByText(/installs?|downloads?/i)).toBeNull();
  });
});
