import { QueryClient } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  applyCacheScope: vi.fn(async () => true),
  getState: vi.fn(() => ({ user: { id: 'user_1' } })),
}));

vi.mock('@shared/stores/authentication-store', () => ({
  applyCacheScope: mocks.applyCacheScope,
  useAuthStore: { getState: mocks.getState },
}));

import { finalizeWorkspaceSwitch, workspaceSwitchDestination } from './workspace-cache-scope';

beforeEach(() => vi.clearAllMocks());

describe('finalizeWorkspaceSwitch', () => {
  it.each([
    ['organization', 'org_a'],
    ['personal', null],
  ])('removes cached data before reloading into the %s scope', async (_scope, workspaceId) => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(['workspace', 'usage-analytics', 30], { cents: 4200 });
    queryClient.setQueryData(['workspace', 'enterprise-contract'], { plan: 'enterprise' });
    const navigate = vi.fn();

    await finalizeWorkspaceSwitch(queryClient, workspaceId, navigate);

    expect(mocks.applyCacheScope).toHaveBeenCalledWith({
      accountId: 'user_1',
      workspaceId,
    });
    expect(queryClient.getQueryData(['workspace', 'usage-analytics', 30])).toBeUndefined();
    expect(queryClient.getQueryData(['workspace', 'enterprise-contract'])).toBeUndefined();
    expect(navigate).toHaveBeenCalledWith(null);
  });

  it('cancels old-scope requests before recording the new scope and clearing cached data', async () => {
    const events: string[] = [];
    const queryClient = new QueryClient();
    vi.spyOn(queryClient, 'cancelQueries').mockImplementation(async () => {
      events.push('cancel');
    });
    vi.spyOn(queryClient, 'clear').mockImplementation(() => {
      events.push('clear');
    });
    mocks.applyCacheScope.mockImplementationOnce(async () => {
      events.push('scope');
      return true;
    });

    await finalizeWorkspaceSwitch(queryClient, 'org_b', () => events.push('navigate'));

    expect(events).toEqual(['cancel', 'scope', 'clear', 'navigate']);
  });
});

describe('workspaceSwitchDestination', () => {
  it.each([
    ['/chat/projects/personal-project', '/chat/projects'],
    ['/chat/conversation-from-another-workspace', '/chat'],
    ['/code/session-from-another-workspace', '/code'],
    ['/chat/projects', null],
    ['/settings/team', null],
  ])('maps %s to %s after the scope changes', (pathname, destination) => {
    expect(workspaceSwitchDestination(pathname)).toBe(destination);
  });
});
