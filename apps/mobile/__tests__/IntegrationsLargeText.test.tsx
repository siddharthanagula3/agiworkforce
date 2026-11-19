import React from 'react';
import { render, screen } from '@testing-library/react-native';

jest.mock('@/src/features/integrations/services/deviceIntegrations', () => ({
  requestCalendarPermission: jest.fn(async () => false),
  getCalendarPermissionStatus: jest.fn(async () => 'denied'),
}));

jest.mock('@/src/features/integrations/components/DeviceIntegrationStatus', () => ({
  DeviceIntegrationStatus: () => null,
}));

import IntegrationsScreen from '../app/(app)/settings/integrations';
import { HEADER_TEXT_SCALE_LIMIT } from '../src/ui/theme/tokens';

describe('Device Integrations screen at large text sizes', () => {
  it('gives the calendar text the free width, with the status wrapping under the title', async () => {
    render(<IntegrationsScreen />);

    const text = await screen.findByTestId('integrations-calendar-text');
    expect(String(text.props.className)).toMatch(/\bflex-1\b/);
    expect(String(screen.getByTestId('integrations-calendar-status').props.className)).toMatch(
      /\bflex-wrap\b/,
    );
  });

  it('caps the status badge text so it cannot take the row', async () => {
    render(<IntegrationsScreen />);

    await screen.findByTestId('integrations-calendar-text');
    const badge = screen.getByText('Denied');
    expect(badge.props.maxFontSizeMultiplier).toBe(HEADER_TEXT_SCALE_LIMIT);
  });
});
