import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Header } from './Header';

function clearCookies() {
  document.cookie.split(';').forEach((entry) => {
    const name = entry.split('=')[0]?.trim();
    if (name) document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
  });
}

describe('Header', () => {
  afterEach(clearCookies);

  it('renders the system marketing header with primary navigation and sign-in actions', () => {
    render(<Header />);

    expect(screen.getByRole('navigation', { name: 'Primary' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login');
    expect(screen.getByRole('link', { name: 'Try AGI Web' })).toHaveAttribute(
      'href',
      '/login?redirectTo=%2F',
    );
  });

  it('shows no navigation in the minimal variant', () => {
    render(<Header minimal />);

    expect(screen.queryByRole('navigation', { name: 'Primary' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Sign in' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Try AGI Web' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'AGI' })).toHaveAttribute('href', '/');
  });

  it('flips the actions to Open AGI once a signed-in session cookie is read', async () => {
    document.cookie = '__client_uat=1700000000';

    render(<Header />);

    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'Open AGI' })).toHaveAttribute('href', '/chat');
    });
    expect(screen.queryByRole('link', { name: 'Sign in' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Try AGI Web' })).not.toBeInTheDocument();
  });

  it('does not treat an anonymous clerk dev-browser cookie as signed in', async () => {
    document.cookie = '__clerk_db_jwt=anonymous-dev-browser-token';

    render(<Header />);

    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'Sign in' })).toBeInTheDocument();
    });
    expect(screen.queryByRole('link', { name: 'Open AGI' })).not.toBeInTheDocument();
  });
});
