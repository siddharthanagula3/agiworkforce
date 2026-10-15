import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { hostBridgeStub } from '@/test/host-bridge-stub';
import { BrowserHandoffNotice } from '../components/BrowserHandoffNotice';
import { continueInBrowser, finishBrowserHandoff } from '../lib/browser-handoff';

const DETAIL = 'Checkout opened in your browser.';

afterEach(() => {
  act(() => finishBrowserHandoff());
  delete window.agiHost;
});

describe('a step handed to the browser', () => {
  it('shows nothing until a step has left for the browser', () => {
    window.agiHost = hostBridgeStub();
    const { container } = render(<BrowserHandoffNotice />);
    expect(container).toBeEmptyDOMElement();
  });

  it('opens the address through the shell and says where the step went', async () => {
    const openExternal = vi.fn(async () => undefined);
    window.agiHost = hostBridgeStub({ openExternal });
    render(<BrowserHandoffNotice />);

    let outcome = '';
    act(() => {
      outcome = continueInBrowser('https://pay.example/session', {
        detail: DETAIL,
        refresh: vi.fn(),
      });
    });

    expect(outcome).toBe('handed-off');
    expect(openExternal).toHaveBeenCalledWith('https://pay.example/session');
    const notice = await screen.findByRole('status');
    expect(notice).toHaveTextContent('Continue in your browser');
    expect(notice).toHaveTextContent(DETAIL);
  });

  it('rereads when the window regains focus, and again on request', async () => {
    const user = userEvent.setup();
    const refresh = vi.fn(async () => undefined);
    window.agiHost = hostBridgeStub();
    render(<BrowserHandoffNotice />);
    act(() => {
      continueInBrowser('https://pay.example/session', { detail: DETAIL, refresh });
    });
    await screen.findByRole('status');
    expect(refresh).not.toHaveBeenCalled();

    act(() => {
      window.dispatchEvent(new Event('focus'));
    });
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));

    await user.click(await screen.findByRole('button', { name: 'Check again' }));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(2));
  });

  it('goes away when the user says they are done, and stops rereading', async () => {
    const user = userEvent.setup();
    const refresh = vi.fn();
    window.agiHost = hostBridgeStub();
    render(<BrowserHandoffNotice />);
    act(() => {
      continueInBrowser('https://pay.example/session', { detail: DETAIL, refresh });
    });

    await user.click(await screen.findByRole('button', { name: 'Done' }));

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    act(() => {
      window.dispatchEvent(new Event('focus'));
    });
    expect(refresh).not.toHaveBeenCalled();
  });
});
