import React from 'react';
import { render, screen } from '@testing-library/react-native';

jest.mock('@/src/features/integrations/services/deviceIntegrations', () => ({
  requestCalendarPermission: jest.fn(async () => false),
  getCalendarPermissionStatus: jest.fn(async () => 'undetermined'),
}));

jest.mock('@/src/features/integrations/components/DeviceIntegrationStatus', () => ({
  DeviceIntegrationStatus: () => null,
}));

import IntegrationsScreen from '../app/(app)/settings/integrations';

describe('Device Integrations screen', () => {
  it('titles the screen with the Settings row that opens it', async () => {
    render(<IntegrationsScreen />);

    expect(await screen.findByText('Device Integrations')).toBeTruthy();
    expect(screen.queryByText('Integrations')).toBeNull();
    expect(screen.getByLabelText('Go back')).toBeTruthy();
  });
});
