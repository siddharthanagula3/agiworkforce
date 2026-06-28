import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

const dynamicState = vi.hoisted(() => ({
  renderCount: 0,
}));

vi.mock('next/dynamic', () => ({
  default: () =>
    function WebSettingsModalStub() {
      dynamicState.renderCount += 1;
      return <div data-testid="web-settings-modal" />;
    },
}));

import { SettingsModalProvider, useSettingsModal } from './SettingsModalProvider';

function Harness() {
  const { openSettings } = useSettingsModal();

  return (
    <button type="button" onClick={() => openSettings('billing')}>
      Open settings
    </button>
  );
}

describe('SettingsModalProvider', () => {
  it('does not mount the settings modal until it is opened', async () => {
    const user = userEvent.setup();

    render(
      <SettingsModalProvider>
        <Harness />
      </SettingsModalProvider>,
    );

    expect(dynamicState.renderCount).toBe(0);
    expect(screen.queryByTestId('web-settings-modal')).toBeNull();

    await user.click(screen.getByRole('button', { name: /open settings/i }));

    expect(screen.getByTestId('web-settings-modal')).toBeVisible();
    expect(dynamicState.renderCount).toBeGreaterThan(0);
  });
});
