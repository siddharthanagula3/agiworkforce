/**
 * WaitlistForm — CSRF 429 error path
 *
 * Regression test: /api/csrf returning 429 must show a rate-limit message,
 * not the generic "Network error. Please try again." string.
 *
 * The test verifies:
 *   - FAILS without the fix (bare catch yields "Network error.")
 *   - PASSES with the fix (CsrfTokenError.status===429 yields the rate-limit copy)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { WaitlistForm } from './WaitlistForm';
import { clearCsrfToken } from '@/lib/client/csrf';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCsrfFetch(status: number, statusText: string) {
  return vi.fn().mockResolvedValue({
    ok: false,
    status,
    statusText,
    json: () => Promise.resolve({}),
  } as Partial<Response>);
}

function submitForm() {
  fireEvent.change(screen.getByRole('textbox'), {
    target: { value: 'user@example.com' },
  });
  fireEvent.click(screen.getByRole('button', { name: /request cloud access/i }));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WaitlistForm — CSRF error handling', () => {
  beforeEach(() => {
    // Clear the module-level token cache so each test starts fresh.
    clearCsrfToken();
    vi.restoreAllMocks();
  });

  it('shows a rate-limit message when /api/csrf returns 429', async () => {
    vi.stubGlobal('fetch', makeCsrfFetch(429, 'Too Many Requests'));

    render(<WaitlistForm />);
    submitForm();

    await waitFor(() => {
      expect(
        screen.getByText('Too many requests. Please wait a moment and try again.'),
      ).toBeInTheDocument();
    });

    // Must NOT fall back to the generic network error copy
    expect(screen.queryByText('Network error. Please try again.')).not.toBeInTheDocument();
  });

  it('shows the generic network error for non-429 failures (e.g. 503)', async () => {
    vi.stubGlobal('fetch', makeCsrfFetch(503, 'Service Unavailable'));

    render(<WaitlistForm />);
    submitForm();

    await waitFor(() => {
      expect(screen.getByText('Network error. Please try again.')).toBeInTheDocument();
    });

    expect(
      screen.queryByText('Too many requests. Please wait a moment and try again.'),
    ).not.toBeInTheDocument();
  });

  it('shows the generic network error when fetch itself throws (true network failure)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    render(<WaitlistForm />);
    submitForm();

    await waitFor(() => {
      expect(screen.getByText('Network error. Please try again.')).toBeInTheDocument();
    });
  });
});
