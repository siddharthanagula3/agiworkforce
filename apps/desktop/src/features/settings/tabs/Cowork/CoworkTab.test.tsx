import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { useConnectionStore } from '@/stores/connectionStore';
import { useCoworkDispatchStore } from '@/stores/coworkDispatchStore';
import { useSettingsDialogStore } from '@/stores/settingsDialogStore';
import { CoworkTab } from '.';

describe('Cowork settings', () => {
  beforeEach(() => {
    useCoworkDispatchStore.setState({ enabled: false });
    useConnectionStore.setState({
      status: 'idle',
      peerConnected: false,
    });
    useSettingsDialogStore.setState({
      settingsOpen: true,
      settingsInitialTab: 'cowork',
    });
  });

  it('persists explicit Dispatch authority and exposes the real pairing destination', () => {
    render(<CoworkTab />);

    const dispatchSwitch = screen.getByRole('switch', {
      name: 'Allow new tasks from a paired mobile device',
    });
    expect(dispatchSwitch).not.toBeChecked();

    fireEvent.click(dispatchSwitch);
    expect(useCoworkDispatchStore.getState().enabled).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Manage pairing' }));
    expect(useSettingsDialogStore.getState().settingsInitialTab).toBe('connections');
  });

  it('reports live companion connection state', () => {
    useConnectionStore.setState({ status: 'streaming', peerConnected: true });
    render(<CoworkTab />);
    expect(screen.getByText('Connected')).toBeInTheDocument();
  });
});
