import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatComposerNew, resetSendPendingFlagForTests } from './ChatComposerNew';
import { COMPOSER_INPUT_ROW_CLASS } from './ComposerInput';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
}));

vi.mock('@features/settings/components/SettingsModalProvider', () => ({
  useSettingsModal: () => ({ isOpen: false, openSettings: vi.fn(), closeSettings: vi.fn() }),
}));

vi.mock('@features/chat/hooks/use-skills-list', () => ({
  useSkillsList: () => ({ skills: [], loading: false, error: null }),
}));

vi.mock('@features/chat/hooks/use-media-model-availability', () => ({
  useMediaModelAvailability: () => ({
    status: 'ready',
    error: null,
    admissionFor: vi.fn(),
    retry: vi.fn(),
  }),
}));

vi.mock('@features/connectors/hooks/use-connectors', () => ({
  useConnectors: () => ({
    connectedIds: new Set<string>(),
    sources: {} as Record<string, string>,
    customNames: {} as Record<string, string>,
    toolConnectorIds: {} as Record<string, string>,
  }),
}));

/** The smallest control a finger can reliably hit, in CSS pixels. */
const MINIMUM_TARGET_PX = 24;
const TAILWIND_STEP_PX = 4;

function input() {
  return screen.getByRole('textbox', { name: /message input/i });
}

function sendControl() {
  return screen.getByRole('button', { name: /send message/i });
}

function sizeFromClass(className: string, prefix: string): number {
  const match = new RegExp(`(?:^|\\s)${prefix}-(\\d+(?:\\.\\d+)?)`).exec(className);
  expect(match, `${prefix} size in "${className}"`).not.toBeNull();
  return Number(match?.[1]) * TAILWIND_STEP_PX;
}

function arbitraryFromClass(className: string, prefix: string): number {
  const match = new RegExp(`${prefix}-\\[(\\d+)px\\]`).exec(className);
  expect(match, `${prefix} value in "${className}"`).not.toBeNull();
  return Number(match?.[1]);
}

beforeEach(() => {
  resetSendPendingFlagForTests();
});

afterEach(() => {
  resetSendPendingFlagForTests();
});

describe('composer send contract', () => {
  it('refuses a second send while the first is still in flight', async () => {
    const onSend = vi.fn();
    render(<ChatComposerNew onSend={onSend} />);
    await userEvent.type(input(), 'only once');

    fireEvent.keyDown(input(), { key: 'Enter' });
    fireEvent.keyDown(input(), { key: 'Enter' });

    await waitFor(() => {
      expect(onSend).toHaveBeenCalledTimes(1);
    });
  });

  it('leaves no clickable send control behind once the message is handed off', async () => {
    const onSend = vi.fn();
    render(<ChatComposerNew onSend={onSend} />);
    await userEvent.type(input(), 'only once');

    fireEvent.keyDown(input(), { key: 'Enter' });
    await waitFor(() => {
      expect(onSend).toHaveBeenCalledTimes(1);
    });

    const control = screen.getByRole('button', { name: /sending message|send message/i });
    expect(control).toBeDisabled();
    fireEvent.click(control);
    expect(onSend).toHaveBeenCalledTimes(1);
  });

  it('sends on Enter and breaks a line on Shift+Enter', async () => {
    const onSend = vi.fn();
    render(<ChatComposerNew onSend={onSend} />);
    await userEvent.type(input(), 'first line');

    fireEvent.keyDown(input(), { key: 'Enter', shiftKey: true });
    expect(onSend).not.toHaveBeenCalled();

    fireEvent.keyDown(input(), { key: 'Enter' });
    await waitFor(() => {
      expect(onSend).toHaveBeenCalledTimes(1);
    });
  });

  it('keeps the send control unusable until there is something to send', async () => {
    render(<ChatComposerNew onSend={vi.fn()} />);
    expect(sendControl()).toBeDisabled();

    await userEvent.type(input(), 'now there is');
    expect(sendControl()).toBeEnabled();
  });

  it('names the send control for a screen reader in both of its states', async () => {
    render(<ChatComposerNew onSend={vi.fn()} />);
    expect(sendControl()).toHaveAttribute('aria-label');
    expect(sendControl().getAttribute('aria-label')?.trim().length).toBeGreaterThan(0);
  });

  it('gives the send control a target no smaller than a fingertip', () => {
    render(<ChatComposerNew onSend={vi.fn()} />);
    const className = sendControl().className;
    expect(sizeFromClass(className, 'h')).toBeGreaterThanOrEqual(MINIMUM_TARGET_PX);
    expect(sizeFromClass(className, 'w')).toBeGreaterThanOrEqual(MINIMUM_TARGET_PX);
  });

  it('keeps the send control in the document while the field grows', async () => {
    render(<ChatComposerNew onSend={vi.fn()} />);
    await userEvent.type(input(), 'one\ntwo\nthree\nfour\nfive\nsix\nseven\neight');
    expect(sendControl()).toBeInTheDocument();
  });

  it('stops growing at a maximum height and scrolls inside it', () => {
    render(<ChatComposerNew onSend={vi.fn()} />);
    const className = input().className;
    expect(arbitraryFromClass(className, 'max-h')).toBeGreaterThan(
      arbitraryFromClass(COMPOSER_INPUT_ROW_CLASS, 'min-h'),
    );
    expect(className).toContain('overflow-y-auto');
  });

  it('starts at the resting row height rather than the maximum', () => {
    render(<ChatComposerNew onSend={vi.fn()} />);
    expect(input().className).toContain('min-h-[36px]');
  });

  it('leaves the text where it is when the send is refused for want of content', () => {
    const onSend = vi.fn();
    render(<ChatComposerNew onSend={onSend} />);
    fireEvent.keyDown(input(), { key: 'Enter' });
    expect(onSend).not.toHaveBeenCalled();
    expect((input() as HTMLTextAreaElement).value).toBe('');
  });

  it('does not send whitespace alone', async () => {
    const onSend = vi.fn();
    render(<ChatComposerNew onSend={onSend} />);
    await userEvent.type(input(), '   ');
    fireEvent.keyDown(input(), { key: 'Enter' });
    expect(onSend).not.toHaveBeenCalled();
  });
});
