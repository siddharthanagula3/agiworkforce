import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

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

describe('SettingsModalProvider, background is hidden from assistive tech', () => {
  /**
   * Radix sets aria-modal and hides the dialog's body-level siblings, but
   * #main-content is not one it reaches: measured live, 1178 characters of the
   * chat surface stayed readable behind the open dialog. Focus is trapped, so
   * keyboard users were fine and only a screen reader's virtual cursor could
   * wander out, which is exactly the case a focus trap cannot cover.
   */
  function withMainContent(): HTMLElement {
    const main = document.createElement('div');
    main.id = 'main-content';
    main.setAttribute('role', 'main');
    main.textContent = 'chat surface behind the dialog';
    document.body.appendChild(main);
    return main;
  }

  it('hides #main-content while open and restores it on close', async () => {
    const user = userEvent.setup();
    const main = withMainContent();

    render(
      <SettingsModalProvider>
        <Harness />
      </SettingsModalProvider>,
    );

    expect(main.getAttribute('aria-hidden')).toBeNull();

    await user.click(screen.getByRole('button', { name: /open settings/i }));
    expect(await screen.findByTestId('web-settings-modal')).toBeInTheDocument();
    expect(main.getAttribute('aria-hidden')).toBe('true');

    main.remove();
  });

  it('does not fail when the layout landmark is absent', async () => {
    const user = userEvent.setup();
    render(
      <SettingsModalProvider>
        <Harness />
      </SettingsModalProvider>,
    );

    await user.click(screen.getByRole('button', { name: /open settings/i }));
    expect(await screen.findByTestId('web-settings-modal')).toBeInTheDocument();
  });
});

describe('SettingsModalProvider settings hash', () => {
  function setHash(hash: string) {
    window.history.replaceState(null, '', `/chat${hash}`);
  }

  afterEach(() => setHash(''));

  it('opens the customize section a deep link names', () => {
    setHash('#settings/customize-skills');
    render(
      <SettingsModalProvider>
        <Harness />
      </SettingsModalProvider>,
    );
    expect(screen.getByTestId('web-settings-modal')).toBeVisible();
  });

  it('opens from a browse deep link', () => {
    setHash('#settings/customize-connectors/browse/slack');
    render(
      <SettingsModalProvider>
        <Harness />
      </SettingsModalProvider>,
    );
    expect(screen.getByTestId('web-settings-modal')).toBeVisible();
  });

  it('stays closed for a hash the directory does not own', () => {
    setHash('#chat/thread-1');
    render(
      <SettingsModalProvider>
        <Harness />
      </SettingsModalProvider>,
    );
    expect(screen.queryByTestId('web-settings-modal')).toBeNull();
  });
});
