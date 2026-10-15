import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useAppModeStore } from '../../../stores/appModeStore';
import { CLOUD_OFFLINE_MESSAGE, LOCAL_OFFLINE_MESSAGE, OfflineIndicator } from '..';

describe('OfflineIndicator', () => {
  beforeEach(() => {
    useAppModeStore.setState({ mode: 'cloud', isOnline: true });
  });

  it('renders nothing while online', () => {
    render(<OfflineIndicator />);

    expect(screen.queryByTestId('offline-indicator')).toBeNull();
  });

  it('says a Cloud app cannot send while offline', () => {
    useAppModeStore.setState({ mode: 'cloud', isOnline: false });
    render(<OfflineIndicator />);

    expect(screen.getByRole('status')).toHaveTextContent(CLOUD_OFFLINE_MESSAGE);
  });

  it('says a Local app keeps its local models while offline', () => {
    useAppModeStore.setState({ mode: 'local', isOnline: false });
    render(<OfflineIndicator />);

    expect(screen.getByRole('status')).toHaveTextContent(LOCAL_OFFLINE_MESSAGE);
  });

  it('disappears on reconnect', () => {
    useAppModeStore.setState({ mode: 'cloud', isOnline: false });
    render(<OfflineIndicator />);
    expect(screen.getByTestId('offline-indicator')).toBeInTheDocument();

    act(() => useAppModeStore.getState().setOnline(true));

    expect(screen.queryByTestId('offline-indicator')).toBeNull();
  });
});
