
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { WaitlistForm } from './WaitlistForm';
import { clearCsrfToken } from '@/lib/client/csrf';

const authState = vi.hoisted(() => ({
  isLoaded: true,
  isSignedIn: true,
}));

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({ isLoaded: authState.isLoaded, isSignedIn: authState.isSignedIn }),
}));

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
  fireEvent.click(screen.getByRole('button', { name: /request early access/i }));
}

describe('WaitlistForm · CSRF error handling', () => {
  beforeEach(() => {
    clearCsrfToken();
    authState.isLoaded = true;
    authState.isSignedIn = true;
    vi.restoreAllMocks();
  });

  it('shows the sign-in message without creating a 401 fetch when signed out', async () => {
    authState.isSignedIn = false;
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    render(<WaitlistForm />);
    submitForm();

    await waitFor(() => {
      expect(screen.getByText('Sign in to save this early-access request.')).toBeInTheDocument();
    });
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute(
      'href',
      '/login?redirectTo=%2Fwaitlist',
    );
    expect(fetchMock).not.toHaveBeenCalled();
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

  it('renders an accessible email input and localized loading copy', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        if (url === '/api/csrf') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ token: 'csrf-token' }),
          } as Partial<Response>);
        }

        return new Promise(() => undefined);
      }),
    );

    render(<WaitlistForm />);

    const input = screen.getByLabelText('Email address');
    expect(input).toHaveAttribute('name', 'email');
    expect(input).toHaveAttribute('autocomplete', 'email');
    expect(input).toHaveAttribute('spellcheck', 'false');
    expect(input).toHaveAttribute('placeholder', 'you@example.com…');

    fireEvent.change(input, { target: { value: 'user@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /request early access/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Joining…' })).toBeDisabled();
    });
  });
});
