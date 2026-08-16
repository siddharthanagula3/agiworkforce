import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WebAppShell } from './WebAppShell';

/**
 * WEB-APPSHELL-MOBILE-SIDEBAR-01 — at narrow viewports the shell must not
 * keep the persistent ~260px sidebar beside the content (it reduced every
 * secondary route to a clipped strip on phones). Narrow viewports get a
 * compact header with an "Open navigation" control and a modal drawer;
 * desktop keeps the persistent sidebar.
 */

const routerState = vi.hoisted(() => ({
  push: vi.fn(),
  pathname: '/chat/projects',
}));

const shellState = vi.hoisted(() => ({
  auth: {
    user: { name: 'Sid', email: 'sid@example.com' } as {
      name: string;
      email: string;
    } | null,
    isLoading: false,
    initialized: true,
  },
  billing: {
    subscription: { tier: 'free' } as { tier: string } | null,
    isLoading: false,
    initialized: true,
  },
  conversationsLoading: false,
}));

/** Stable stub for the shared `useConfirm` destructive-confirm hook. */
const confirmStub = vi.hoisted(() => ({
  confirm: vi.fn(async () => true),
  dialog: null as React.ReactNode,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerState.push }),
  usePathname: () => routerState.pathname,
}));

vi.mock('@clerk/nextjs', () => ({
  useClerk: () => ({ signOut: vi.fn() }),
  // The rail asks whether the signed-in user is an admin before offering the
  // /admin destination; an ordinary user is the right default here.
  useUser: () => ({ isLoaded: true, user: { publicMetadata: {} } }),
}));

// Rendering the account menu's real contents (see the DropdownMenu mock below)
// pulls this in, and it needs a react-query provider the shell test does not
// stand up. Stubbed so the menu can be asserted on without dragging the whole
// workspace stack into a layout test.
vi.mock('@/features/workspaces/components/WorkspaceMenuItems', () => ({
  WorkspaceMenuItems: () => null,
}));

vi.mock('@agiworkforce/ui', () => ({
  Sidebar: (props: { collapsed?: boolean; isLoading?: boolean; footerSlot?: React.ReactNode }) => (
    <div
      data-testid="app-sidebar"
      data-collapsed={String(props.collapsed ?? false)}
      data-loading={String(props.isLoading ?? false)}
    >
      {props.footerSlot}
    </div>
  ),
  DropdownMenu: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  DropdownMenuTrigger: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  // Content and items render their children rather than returning null. The
  // stub used to swallow both, which meant nothing inside the account menu
  // could be asserted on — including whether the product offers any route to
  // its own policies. `asChild` is accepted and ignored; the child is already
  // the element we want in the tree.
  DropdownMenuContent: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  DropdownMenuItem: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  DropdownMenuLabel: () => null,
  DropdownMenuSeparator: () => null,
  // shell-nav-ia-gap-01: the shell's destructive confirms (delete conversation,
  // delete project) go through the shared AlertDialog wrapper instead of
  // window.confirm. Stable identity so the shell's useCallback deps do not
  // churn on every render, matching the real hook.
  useConfirm: () => confirmStub,
}));

vi.mock('@/lib/hooks/useConversations', () => ({
  useConversations: () => ({
    conversations: [],
    deleteConversation: vi.fn(),
    updateConversation: vi.fn(),
    isLoading: shellState.conversationsLoading,
  }),
}));

vi.mock('@shared/stores/web-chat-store', () => ({
  useChatStore: (selector: (state: { updateConversation: () => void }) => unknown) =>
    selector({ updateConversation: vi.fn() }),
}));

vi.mock('@shared/stores/authentication-store', () => ({
  useAuthStore: () => ({
    ...shellState.auth,
    logout: vi.fn(),
  }),
}));

vi.mock('@shared/stores/web-auth-store', () => ({
  useBillingStore: (
    selector: (state: {
      subscription: { tier: string } | null;
      isLoading: boolean;
      initialized: boolean;
    }) => unknown,
  ) => selector(shellState.billing),
}));

vi.mock('@/features/projects', () => ({
  useManagedCloudProjects: () => ({ projects: [] }),
  useProjectStore: (selector: (state: Record<string, () => void>) => unknown) =>
    selector({ toggleStar: vi.fn(), removeProject: vi.fn() }),
}));

vi.mock('@/features/projects/services/managed-cloud-projects', () => ({
  webManagedCloudProjects: { deleteProject: vi.fn() },
}));

vi.mock('@shared/components/agi/SidebarWordmark', () => ({
  SidebarWordmark: () => <div data-testid="wordmark" />,
}));

vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));

const mediaState = vi.hoisted(() => ({
  matches: false,
  listeners: new Set<(event: { matches: boolean }) => void>(),
}));

function setNarrowViewport(narrow: boolean) {
  mediaState.matches = narrow;
  for (const listener of mediaState.listeners) listener({ matches: narrow });
}

beforeEach(() => {
  routerState.push = vi.fn();
  routerState.pathname = '/chat/projects';
  mediaState.matches = false;
  mediaState.listeners.clear();
  shellState.auth.user = { name: 'Sid', email: 'sid@example.com' };
  shellState.auth.isLoading = false;
  shellState.auth.initialized = true;
  shellState.billing.subscription = { tier: 'free' };
  shellState.billing.isLoading = false;
  shellState.billing.initialized = true;
  shellState.conversationsLoading = false;
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    get matches() {
      return mediaState.matches;
    },
    media: query,
    onchange: null,
    addEventListener: (_type: string, listener: (event: { matches: boolean }) => void) => {
      mediaState.listeners.add(listener);
    },
    removeEventListener: (_type: string, listener: (event: { matches: boolean }) => void) => {
      mediaState.listeners.delete(listener);
    },
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});

describe('WebAppShell responsive navigation', () => {
  it('renders honest loading chrome while account and conversations hydrate', () => {
    shellState.auth.user = null;
    shellState.auth.isLoading = true;
    shellState.auth.initialized = false;
    shellState.billing.subscription = null;
    shellState.billing.isLoading = true;
    shellState.billing.initialized = false;
    // Even before the conversations hook begins fetching, unresolved auth
    // must keep the sidebar out of its genuine-empty state.
    shellState.conversationsLoading = false;

    render(
      <WebAppShell>
        <main>content</main>
      </WebAppShell>,
    );

    expect(screen.getByRole('status', { name: 'Loading account' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Account menu for User' })).toBeNull();
    expect(screen.getByTestId('app-sidebar')).toHaveAttribute('data-loading', 'true');
  });

  it('desktop: renders the persistent sidebar and no mobile navigation trigger', () => {
    render(
      <WebAppShell>
        <main>content</main>
      </WebAppShell>,
    );
    expect(screen.getByTestId('app-sidebar')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Open navigation' })).toBeNull();
  });

  it('narrow: hides the persistent sidebar behind an Open navigation control', () => {
    mediaState.matches = true;
    render(
      <WebAppShell>
        <main>content</main>
      </WebAppShell>,
    );
    expect(screen.queryByTestId('app-sidebar')).toBeNull();
    const trigger = screen.getByRole('button', { name: 'Open navigation' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('narrow: opens a modal navigation drawer and closes it with Escape, restoring focus', () => {
    mediaState.matches = true;
    render(
      <WebAppShell>
        <main>content</main>
      </WebAppShell>,
    );
    const trigger = screen.getByRole('button', { name: 'Open navigation' });
    fireEvent.click(trigger);

    const dialog = screen.getByRole('dialog', { name: 'Navigation' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByTestId('app-sidebar')).toBeInTheDocument();
    expect(trigger).toHaveAttribute('aria-expanded', 'true');

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Navigation' })).toBeNull();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(document.activeElement).toBe(trigger);
  });

  it('narrow: closes the drawer when the backdrop is clicked', () => {
    mediaState.matches = true;
    render(
      <WebAppShell>
        <main>content</main>
      </WebAppShell>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }));
    fireEvent.click(screen.getByTestId('mobile-nav-backdrop'));
    expect(screen.queryByRole('dialog', { name: 'Navigation' })).toBeNull();
  });

  it('narrow: closes the drawer after navigation (pathname change)', () => {
    mediaState.matches = true;
    const { rerender } = render(
      <WebAppShell>
        <main>content</main>
      </WebAppShell>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }));
    expect(screen.getByRole('dialog', { name: 'Navigation' })).toBeInTheDocument();

    routerState.pathname = '/chat/library';
    rerender(
      <WebAppShell>
        <main>content</main>
      </WebAppShell>,
    );
    expect(screen.queryByRole('dialog', { name: 'Navigation' })).toBeNull();
  });

  /**
   * Legal reachability from inside the product.
   *
   * An audit found the signed-in shell rendered NO route to any policy: every
   * legal link lived on the marketing footer, which a signed-in user never
   * sees. A privacy notice you can only reach by signing out is not accessible,
   * and the DPDP grievance route in particular has to be reachable from the
   * page that made someone want to use it.
   *
   * Asserted by href against the canonical route constants rather than by label,
   * so renaming a menu item is allowed and dropping the route is not.
   */
  it('reaches the policy set from the account menu', async () => {
    render(
      <WebAppShell>
        <main>content</main>
      </WebAppShell>,
    );

    const { CANONICAL_POLICY_ROUTES } = await import('@/lib/legal-constants');
    for (const route of [
      CANONICAL_POLICY_ROUTES.dataUse,
      CANONICAL_POLICY_ROUTES.dataRights,
      CANONICAL_POLICY_ROUTES.legalIndex,
    ]) {
      expect(
        document.querySelector(`a[href="${route}"]`),
        `the signed-in account menu must link ${route}`,
      ).not.toBeNull();
    }
  });

  it('resize from desktop to narrow swaps the persistent sidebar for the trigger', () => {
    render(
      <WebAppShell>
        <main>content</main>
      </WebAppShell>,
    );
    expect(screen.getByTestId('app-sidebar')).toBeInTheDocument();

    act(() => setNarrowViewport(true));
    expect(screen.queryByTestId('app-sidebar')).toBeNull();
    expect(screen.getByRole('button', { name: 'Open navigation' })).toBeInTheDocument();
  });
});
