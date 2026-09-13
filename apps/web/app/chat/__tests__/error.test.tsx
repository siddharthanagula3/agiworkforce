import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';

import ChatError from '../error';

/**
 * A send with the connection down navigated into this boundary, which told the
 * user "something went wrong while rendering this conversation" and offered a
 * retry of a render that was never the failure.
 */

function setOnline(value: boolean) {
  Object.defineProperty(window.navigator, 'onLine', { value, configurable: true });
}

afterEach(() => {
  setOnline(true);
  vi.restoreAllMocks();
});

describe('chat error boundary', () => {
  it('names the connection when the browser is offline', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    setOnline(false);

    render(<ChatError error={new Error('Failed to fetch')} reset={vi.fn()} />);

    expect(screen.getByText('You are offline')).toBeInTheDocument();
    expect(screen.getByRole('alert').textContent).toContain('connection is down');
    expect(screen.getByRole('alert').textContent).not.toContain('rendering this conversation');
  });

  it('names the server when the request failed while online', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    render(<ChatError error={new TypeError('Failed to fetch')} reset={vi.fn()} />);

    expect(screen.getByRole('alert').textContent).toContain('Could not reach the server.');
  });

  it('keeps the render wording for a genuine render failure', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    render(<ChatError error={new Error('Cannot read properties of undefined')} reset={vi.fn()} />);

    expect(screen.getByText('Chat could not be displayed')).toBeInTheDocument();
    expect(screen.getByRole('alert').textContent).toContain('rendering this conversation');
  });

  it('offers a retry and a route back to chat in every case', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const reset = vi.fn();
    setOnline(false);

    render(<ChatError error={new Error('boom')} reset={reset} />);

    screen.getByRole('button', { name: 'Try again' }).click();
    expect(reset).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('link', { name: 'Back to chat' })).toHaveAttribute('href', '/chat');
  });
});
