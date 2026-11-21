import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';

import {
  SESSION_RECOVERY_BUDGET_WINDOW_MS,
  SESSION_RECOVERY_STORAGE_KEY,
  SESSION_RECOVERY_WINDOW_MS,
  SessionRecovery,
} from '../SessionRecovery';
import { sameOriginReturnPath } from '../sameOriginReturnPath';
import SessionExpiredPage from '../page';

const EXPIRED_HEADING = { name: 'Your session expired.' } as const;
const RETURN_PATH = '/chat/abc';
const SIGN_IN_AGAIN_HREF = `/login/complete?redirectTo=${encodeURIComponent(RETURN_PATH)}`;

const replace = vi.fn();
const originalLocation = window.location;

beforeEach(() => {
  window.sessionStorage.clear();
  replace.mockReset();
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...originalLocation, replace },
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
  Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
});

function arrive(redirectTo: unknown) {
  return render(<SessionRecovery returnPath={sameOriginReturnPath(redirectTo)} />);
}

function recordedAttempts(): unknown {
  return JSON.parse(window.sessionStorage.getItem(SESSION_RECOVERY_STORAGE_KEY) ?? 'null');
}

function leaveAttemptsAt(...ages: number[]): void {
  const now = Date.now();
  window.sessionStorage.setItem(
    SESSION_RECOVERY_STORAGE_KEY,
    JSON.stringify(ages.map((age) => ({ path: RETURN_PATH, at: now - age }))),
  );
}

function expectTheMessage(): void {
  expect(replace).not.toHaveBeenCalled();
  expect(screen.getByRole('heading', EXPIRED_HEADING)).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Sign in again' })).toBeInTheDocument();
}

describe('arriving on the session-expired page', () => {
  it('reloads the requested page once, as a full document load, without saying the session expired', () => {
    arrive(RETURN_PATH);

    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith(RETURN_PATH);
    expect(screen.queryByRole('heading', EXPIRED_HEADING)).toBeNull();
    expect(screen.getByRole('status', { name: 'Restoring your session' })).toBeInTheDocument();
    expect(recordedAttempts()).toEqual([{ path: RETURN_PATH, at: expect.any(Number) }]);
  });

  it('says the session expired, and navigates nowhere, when it is reached again soon after an attempt', () => {
    arrive(RETURN_PATH);
    cleanup();
    replace.mockReset();

    arrive(RETURN_PATH);

    expectTheMessage();
    expect(screen.getByRole('link', { name: 'Sign in again' })).toHaveAttribute(
      'href',
      SIGN_IN_AGAIN_HREF,
    );
  });

  it('tries again once the last attempt is older than the short window and the budget allows', () => {
    leaveAttemptsAt(SESSION_RECOVERY_WINDOW_MS + 1);

    arrive(RETURN_PATH);

    expect(replace).toHaveBeenCalledWith(RETURN_PATH);
    expect(recordedAttempts()).toHaveLength(2);
  });

  it('stops after two attempts in ten minutes, however far apart they were', () => {
    leaveAttemptsAt(5 * 60_000, SESSION_RECOVERY_WINDOW_MS + 1);

    arrive(RETURN_PATH);

    expectTheMessage();
  });

  it('forgets attempts older than ten minutes', () => {
    leaveAttemptsAt(SESSION_RECOVERY_BUDGET_WINDOW_MS + 1, SESSION_RECOVERY_BUDGET_WINDOW_MS + 2);

    arrive(RETURN_PATH);

    expect(replace).toHaveBeenCalledWith(RETURN_PATH);
    expect(recordedAttempts()).toEqual([{ path: RETURN_PATH, at: expect.any(Number) }]);
  });

  it.each([
    ['a missing return path', undefined],
    ['an absolute URL', 'https://evil.example/steal'],
    ['a protocol-relative URL', '//evil.example'],
    ['a repeated parameter', [RETURN_PATH, '/settings']],
    ['a value that is not text', 42],
    ['an API path', '/api/me'],
    ['the API root', '/api'],
    ['this page itself', '/session-expired?redirectTo=%2Fchat'],
  ])('says the session expired, and navigates nowhere, for %s', (_case, redirectTo) => {
    arrive(redirectTo);

    expectTheMessage();
    expect(window.sessionStorage.getItem(SESSION_RECOVERY_STORAGE_KEY)).toBeNull();
  });

  it('says the session expired, and navigates nowhere, when session storage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage disabled');
    });

    arrive(RETURN_PATH);

    expectTheMessage();
  });

  it('says the session expired, and navigates nowhere, when the stored record is unreadable', () => {
    window.sessionStorage.setItem(SESSION_RECOVERY_STORAGE_KEY, '{not json');

    arrive(RETURN_PATH);

    expectTheMessage();
  });

  it('shows only the heading and the sign-in button', () => {
    arrive(undefined);

    expect(screen.getAllByRole('heading')).toHaveLength(1);
    expect(screen.getAllByRole('link')).toHaveLength(1);
    expect(screen.queryByRole('paragraph')).toBeNull();
  });

  it('gives a browser without JavaScript the heading and the sign-in link', () => {
    const html = renderToString(<SessionRecovery returnPath={RETURN_PATH} />);

    expect(html).toContain('<noscript>');
    const noscript = html.slice(html.indexOf('<noscript>'));
    expect(noscript).toContain('Your session expired.');
    expect(noscript).toContain('Sign in again');
    expect(noscript).toContain(SIGN_IN_AGAIN_HREF.replaceAll('&', '&amp;'));
  });

  it('renders the page for a repeated parameter instead of throwing', async () => {
    render(
      await SessionExpiredPage({
        searchParams: Promise.resolve({ redirectTo: [RETURN_PATH, '/settings'] }),
      }),
    );

    expectTheMessage();
  });
});
