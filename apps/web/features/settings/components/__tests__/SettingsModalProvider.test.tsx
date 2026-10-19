import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/dynamic', () => ({
  default: () =>
    function SettingsStub({ initialSection }: { initialSection: string }) {
      return <div role="dialog">{initialSection}</div>;
    },
}));

import { SettingsModalProvider, useSettingsModal } from '../SettingsModalProvider';

function Opener({ section }: { section: string }) {
  const { openSettings, closeSettings } = useSettingsModal();
  return (
    <>
      <button type="button" onClick={() => openSettings(section)}>
        open
      </button>
      <button type="button" onClick={closeSettings}>
        close
      </button>
    </>
  );
}

beforeEach(() => {
  window.history.replaceState(null, '', '/chat');
});

describe('SettingsModalProvider', () => {
  it('names the open section in the URL so a reload or a shared link returns to it', () => {
    render(
      <SettingsModalProvider>
        <Opener section="usage" />
      </SettingsModalProvider>,
    );

    act(() => screen.getByRole('button', { name: 'open' }).click());

    expect(window.location.pathname).toBe('/chat');
    expect(window.location.hash).toBe('#settings/usage');
    expect(screen.getByRole('dialog')).toHaveTextContent('usage');

    act(() => screen.getByRole('button', { name: 'close' }).click());

    expect(window.location.hash).toBe('');
  });

  it('opens the section a URL names', () => {
    window.history.replaceState(null, '', '/chat#settings/billing');

    render(
      <SettingsModalProvider>
        <Opener section="usage" />
      </SettingsModalProvider>,
    );

    expect(screen.getByRole('dialog')).toHaveTextContent('billing');
  });
});
