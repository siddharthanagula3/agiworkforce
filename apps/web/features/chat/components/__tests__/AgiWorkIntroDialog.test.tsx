import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useAuthStore } from '@shared/stores/authentication-store';
import {
  AGI_WORK_INTRO_CTA,
  AGI_WORK_INTRO_STORAGE_PREFIX,
  AGI_WORK_INTRO_TITLE,
  AgiWorkIntroDialog,
} from '../AgiWorkIntroDialog';

function signIn(id: string) {
  useAuthStore.setState({ user: { id } as never });
}

beforeEach(() => {
  window.localStorage.clear();
  signIn('user-1');
});

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
  useAuthStore.setState({ user: null });
});

describe('AgiWorkIntroDialog', () => {
  it('opens the first time an account reaches AGI Work and records that it was shown', async () => {
    render(<AgiWorkIntroDialog />);
    expect(await screen.findByRole('dialog', { name: AGI_WORK_INTRO_TITLE })).toBeInTheDocument();
    expect(window.localStorage.getItem(`${AGI_WORK_INTRO_STORAGE_PREFIX}user-1`)).toBe('1');
  });

  it('stays closed for an account that has already seen it', () => {
    window.localStorage.setItem(`${AGI_WORK_INTRO_STORAGE_PREFIX}user-1`, '1');
    render(<AgiWorkIntroDialog />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens again for a different account on the same browser', async () => {
    window.localStorage.setItem(`${AGI_WORK_INTRO_STORAGE_PREFIX}user-1`, '1');
    signIn('user-2');
    render(<AgiWorkIntroDialog />);
    expect(await screen.findByRole('dialog', { name: AGI_WORK_INTRO_TITLE })).toBeInTheDocument();
  });

  it('does not open before an account is known', () => {
    useAuthStore.setState({ user: null });
    render(<AgiWorkIntroDialog />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('Start a new task closes it and puts focus in the composer', async () => {
    const composer = document.createElement('textarea');
    composer.setAttribute('data-composer-textarea', '');
    document.body.appendChild(composer);
    render(<AgiWorkIntroDialog />);

    fireEvent.click(await screen.findByRole('button', { name: AGI_WORK_INTRO_CTA }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(document.activeElement).toBe(composer);
  });

  it('the close button dismisses it without reopening', async () => {
    const { rerender } = render(<AgiWorkIntroDialog />);
    fireEvent.click(await screen.findByRole('button', { name: 'Close dialog' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    rerender(<AgiWorkIntroDialog />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
