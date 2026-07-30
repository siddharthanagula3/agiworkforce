import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { WebSidebar } from './WebSidebar';

// PER-3/PER-8: the mock used to carry `user_metadata.full_name`, a shape
// `/api/me` never emitted (and `useBillingStore.user` was structurally null
// anyway, so the sidebar always rendered 'Account'). It now mirrors the real
// resolved `/api/me` payload.
vi.mock('@shared/stores/web-auth-store', () => ({
  useBillingStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      user: {
        id: 'user_test',
        email: 'user@example.com',
        name: 'Test User',
        profile: {
          display_name: 'Test User',
          preferred_name: 'Test',
          work_description: null,
        },
      },
      subscription: { display_name: 'Pro' },
    }),
}));

describe('WebSidebar', () => {
  it('renders host-bridge recents and jumps to the selected conversation', () => {
    const onJumpConversation = vi.fn();

    render(
      <WebSidebar
        mode="chat"
        onModeChange={vi.fn()}
        onJumpConversation={onJumpConversation}
        conversations={[
          {
            id: 'conv-1',
            title: 'Host bridge recent',
            updatedAt: new Date(),
          },
        ]}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Host bridge recent' }));

    expect(onJumpConversation).toHaveBeenCalledWith('conv-1');
  });

  it('routes nav and account clicks through callbacks instead of no-op local state', () => {
    const onNavigateView = vi.fn();
    const onOpenAccountMenu = vi.fn();

    render(
      <WebSidebar
        mode="chat"
        onModeChange={vi.fn()}
        onNavigateView={onNavigateView}
        onOpenAccountMenu={onOpenAccountMenu}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Projects' }));
    fireEvent.click(screen.getByTitle('Account settings'));

    expect(onNavigateView).toHaveBeenCalledWith('projects');
    expect(onOpenAccountMenu).toHaveBeenCalled();
  });

  it('exposes the fully wired managed schedules screen from work navigation', () => {
    const onNavigateView = vi.fn();
    render(<WebSidebar mode="work" onModeChange={vi.fn()} onNavigateView={onNavigateView} />);

    fireEvent.click(screen.getByRole('button', { name: 'Schedules' }));
    expect(onNavigateView).toHaveBeenCalledWith('schedules');
  });

  it('surfaces Code as a top-level mode and names its primary action honestly', () => {
    const onModeChange = vi.fn();
    render(<WebSidebar mode="chat" onModeChange={onModeChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Code' }));
    expect(onModeChange).toHaveBeenCalledWith('code');

    const { unmount } = render(<WebSidebar mode="code" onModeChange={onModeChange} />);
    expect(screen.getByRole('button', { name: 'New Code session' })).toBeInTheDocument();
    unmount();
  });
});
