import { hostBridgeStub } from '@/test/host-bridge-stub';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { emitAppCommand } from '@shared/lib/app-commands';
import { SideChatPane } from '../components/SideChatPane';

const pathname = vi.hoisted(() => ({ current: '/chat' }));

vi.mock('next/navigation', () => ({
  usePathname: () => pathname.current,
}));

describe('Show Side Chat on the public window', () => {
  beforeEach(() => {
    pathname.current = '/chat';
    delete window.agiHost;
  });

  it('stays closed on a new chat', () => {
    const setSideChatState = vi.fn();
    window.agiHost = hostBridgeStub({ setSideChatState });
    render(<SideChatPane />);

    expect(screen.queryByRole('complementary', { name: 'Side chat' })).toBeNull();
    expect(setSideChatState).toHaveBeenCalledWith({ available: false, open: false });
    act(() => {
      emitAppCommand('toggle-side-chat');
    });
    expect(screen.queryByRole('complementary', { name: 'Side chat' })).toBeNull();
  });

  it('opens beside the current conversation and keeps a draft there', () => {
    pathname.current = '/chat/thread-1';
    const setSideChatState = vi.fn();
    window.agiHost = hostBridgeStub({ setSideChatState });
    render(<SideChatPane />);

    expect(setSideChatState).toHaveBeenCalledWith({ available: true, open: false });
    act(() => {
      emitAppCommand('toggle-side-chat');
    });

    const pane = screen.getByRole('complementary', { name: 'Side chat' });
    const field = screen.getByRole('textbox', { name: 'Message' });
    fireEvent.change(field, { target: { value: 'A note beside this chat' } });
    expect(pane).toBeTruthy();
    expect(field).toHaveValue('A note beside this chat');
    expect(setSideChatState).toHaveBeenCalledWith({ available: true, open: true });

    act(() => {
      emitAppCommand('toggle-side-chat');
    });
    expect(screen.queryByRole('complementary', { name: 'Side chat' })).toBeNull();
  });

  it('starts a fresh side chat from the open conversation and clears the previous draft', () => {
    pathname.current = '/chat/thread-1';
    const setSideChatState = vi.fn();
    window.agiHost = hostBridgeStub({ setSideChatState });
    render(<SideChatPane />);

    fireEvent.click(screen.getByRole('button', { name: 'New side chat' }));
    const field = screen.getByRole('textbox', { name: 'Message' });
    fireEvent.change(field, { target: { value: 'A note beside this chat' } });
    expect(field).toHaveValue('A note beside this chat');

    fireEvent.click(screen.getByRole('button', { name: 'New side chat' }));
    expect(screen.getByRole('complementary', { name: 'Side chat' })).toBeTruthy();
    expect(screen.getByRole('textbox', { name: 'Message' })).toHaveValue('');
    expect(setSideChatState).toHaveBeenCalledWith({ available: true, open: true });
  });

  it('closes the side chat from the open conversation and drops its draft', () => {
    pathname.current = '/chat/thread-1';
    const setSideChatState = vi.fn();
    window.agiHost = hostBridgeStub({ setSideChatState });
    render(<SideChatPane />);

    fireEvent.click(screen.getByRole('button', { name: 'New side chat' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Message' }), {
      target: { value: 'A note beside this chat' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Close side chat' }));

    expect(screen.queryByRole('complementary', { name: 'Side chat' })).toBeNull();
    expect(setSideChatState).toHaveBeenCalledWith({ available: true, open: false });

    fireEvent.click(screen.getByRole('button', { name: 'New side chat' }));
    expect(screen.getByRole('textbox', { name: 'Message' })).toHaveValue('');
  });
});
