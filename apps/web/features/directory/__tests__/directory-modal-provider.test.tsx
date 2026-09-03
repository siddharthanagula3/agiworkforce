import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const modalState = vi.hoisted(() => ({ mounts: 0 }));

vi.mock('next/dynamic', () => ({
  default: () =>
    function WebDirectoryModalStub(props: {
      initialSection?: string;
      initialEntryId?: string | null;
      onRouteChange?: (section: string, entryId: string | null) => void;
    }) {
      modalState.mounts += 1;
      return (
        <div data-testid="web-directory-modal" data-section={props.initialSection} data-entry={props.initialEntryId ?? ''}>
          <button type="button" onClick={() => props.onRouteChange?.('connectors', 'slack')}>
            Report route
          </button>
        </div>
      );
    },
}));

import { DirectoryModalProvider, useDirectoryModal } from '../components/DirectoryModalProvider';

function Harness() {
  const { openDirectory, closeDirectory, isOpen } = useDirectoryModal();
  return (
    <>
      <button type="button" onClick={() => openDirectory('plugins')}>
        Open plugins
      </button>
      <button type="button" onClick={closeDirectory}>
        Close directory
      </button>
      <span data-testid="state">{isOpen ? 'open' : 'closed'}</span>
    </>
  );
}

function renderProvider() {
  return render(
    <DirectoryModalProvider>
      <Harness />
    </DirectoryModalProvider>,
  );
}

function setHash(hash: string) {
  window.history.replaceState(null, '', `/chat${hash}`);
}

beforeEach(() => {
  modalState.mounts = 0;
  setHash('');
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('DirectoryModalProvider', () => {
  it('does not mount the directory until it is opened', async () => {
    const user = userEvent.setup();
    renderProvider();

    expect(modalState.mounts).toBe(0);
    expect(screen.queryByTestId('web-directory-modal')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Open plugins' }));

    expect(screen.getByTestId('web-directory-modal').getAttribute('data-section')).toBe('plugins');
    expect(screen.getByTestId('state').textContent).toBe('open');
  });

  it('opens from a section deep link present on first render', () => {
    setHash('#directory/connectors');
    renderProvider();
    const modal = screen.getByTestId('web-directory-modal');
    expect(modal.getAttribute('data-section')).toBe('connectors');
    expect(modal.getAttribute('data-entry')).toBe('');
  });

  it('opens the entry named by a detail deep link', () => {
    setHash('#directory/connectors/io.github%2Fslack');
    renderProvider();
    expect(screen.getByTestId('web-directory-modal').getAttribute('data-entry')).toBe(
      'io.github/slack',
    );
  });

  it('ignores a hash that belongs to another surface', () => {
    setHash('#settings/skills');
    renderProvider();
    expect(screen.queryByTestId('web-directory-modal')).toBeNull();
  });

  it('opens when the hash changes after mount', async () => {
    renderProvider();
    expect(screen.queryByTestId('web-directory-modal')).toBeNull();
    setHash('#directory/skills');
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    const modal = await screen.findByTestId('web-directory-modal');
    expect(modal.getAttribute('data-section')).toBe('skills');
  });

  it('keeps the url in step with a route the modal reports', async () => {
    const user = userEvent.setup();
    setHash('#directory/skills');
    renderProvider();
    await user.click(screen.getByRole('button', { name: 'Report route' }));
    expect(window.location.hash).toBe('#directory/connectors/slack');
    expect(screen.getByTestId('web-directory-modal').getAttribute('data-section')).toBe(
      'connectors',
    );
  });

  it('does not add a directory hash when the modal was opened without one', async () => {
    const user = userEvent.setup();
    renderProvider();
    await user.click(screen.getByRole('button', { name: 'Open plugins' }));
    await user.click(screen.getByRole('button', { name: 'Report route' }));
    expect(window.location.hash).toBe('');
  });

  it('strips the directory hash on close', async () => {
    const user = userEvent.setup();
    setHash('#directory/skills');
    renderProvider();

    await user.click(screen.getByRole('button', { name: 'Close directory' }));

    expect(screen.queryByTestId('web-directory-modal')).toBeNull();
    expect(window.location.hash).toBe('');
  });

  it('leaves another surface hash alone on close', async () => {
    const user = userEvent.setup();
    renderProvider();
    await user.click(screen.getByRole('button', { name: 'Open plugins' }));
    setHash('#settings/general');

    await user.click(screen.getByRole('button', { name: 'Close directory' }));

    expect(window.location.hash).toBe('#settings/general');
  });

  it('hides the page behind the directory from assistive technology', async () => {
    const user = userEvent.setup();
    const main = document.createElement('div');
    main.id = 'main-content';
    document.body.appendChild(main);
    try {
      renderProvider();
      expect(main.getAttribute('aria-hidden')).toBeNull();
      await user.click(screen.getByRole('button', { name: 'Open plugins' }));
      expect(main.getAttribute('aria-hidden')).toBe('true');
      await user.click(screen.getByRole('button', { name: 'Close directory' }));
      expect(main.getAttribute('aria-hidden')).toBeNull();
    } finally {
      main.remove();
    }
  });
});
