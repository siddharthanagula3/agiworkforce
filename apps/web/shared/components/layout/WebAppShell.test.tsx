import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WebAppShell } from './WebAppShell';

/**
 * WEB-APPSHELL-MOBILE-SIDEBAR-01, at narrow viewports the shell must not
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
    error: null as string | null,
    unauthenticated: false,
  },
  conversationsLoading: false,
  conversationsListError: null as string | null,
  fetchConversations: vi.fn(),
}));

const settingsModalState = vi.hoisted(() => ({ openSettings: vi.fn() }));

/** Stable stub for the shared `useConfirm` destructive-confirm hook. */
const confirmStub = vi.hoisted(() => ({
  confirm: vi.fn(async () => true),
  dialog: null as React.ReactNode,
}));

/**
 * The drawer has to be able to decline an Escape: a row-action menu open over
 * it takes that key for itself, and tearing the drawer down loses the user's
 * place. Which panels count as open is the Menu package's own test; what
 * belongs here is whether the shell wires the decision up and honours it.
 */
const menuEscape = vi.hoisted(() => ({
  keepOpenForMenuEscape: vi.fn<(event: { preventDefault: () => void }) => void>(),
  handler: null as ((event: { preventDefault: () => void }) => void) | null,
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

// The account menu's Upgrade item drives the same upgrade flow as
// WebChatPage (dialog, mid-cycle confirm, real Stripe checkout call) via
// this shared hook. Stubbed for the same reason WorkspaceMenuItems is: this
// is a layout test, not a billing-flow one.
vi.mock('@features/billing/hooks/use-upgrade-plan-flow', () => ({
  useUpgradePlanFlow: () => ({ openUpgradeDialog: vi.fn(), upgradeDialogs: null }),
}));

// Same reasoning as the upgrade flow above, the shortcuts reference dialog
// pulls in the settings store's shortcut-preference wiring, which this
// layout test has no reason to stand up.
vi.mock('@/features/chat/components/dialogs/KeyboardShortcutsDialog', () => ({
  KeyboardShortcutsDialog: () => null,
}));

vi.mock('@agiworkforce/ui', async () => {
  const React = await import('react');
  return {
    Sidebar: (props: {
      collapsed?: boolean;
      isLoading?: boolean;
      error?: string | null;
      onRetryLoad?: () => void;
      footerSlot?: React.ReactNode;
    }) => (
      <div
        data-testid="app-sidebar"
        data-collapsed={String(props.collapsed ?? false)}
        data-loading={String(props.isLoading ?? false)}
        data-list-error={props.error ?? ''}
      >
        {props.onRetryLoad && (
          <button type="button" onClick={props.onRetryLoad}>
            Retry
          </button>
        )}
        {props.footerSlot}
      </div>
    ),
    // The mobile drawer is the shared Sheet. The stub keeps the parts the shell
    // depends on - open gating, Escape, focus restoration - so the drawer
    // assertions below still exercise real behaviour rather than the stub.
    Sheet: ({
      open,
      onOpenChange,
      children,
    }: {
      open?: boolean;
      onOpenChange?: (next: boolean) => void;
      children?: React.ReactNode;
    }) => {
      React.useEffect(() => {
        if (!open) return;
        const onKeyDown = (event: KeyboardEvent) => {
          if (event.key !== 'Escape') return;
          let declined = false;
          menuEscape.handler?.({
            preventDefault: () => {
              declined = true;
            },
          });
          if (!declined) onOpenChange?.(false);
        };
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
      }, [open, onOpenChange]);
      if (!open) return null;
      return (
        <div>
          <div data-testid="mobile-nav-backdrop" onClick={() => onOpenChange?.(false)} />
          {children}
        </div>
      );
    },
    SheetContent: ({
      children,
      onCloseAutoFocus,
      onEscapeKeyDown,
      ...rest
    }: {
      children?: React.ReactNode;
      onCloseAutoFocus?: (event: { preventDefault: () => void }) => void;
      onEscapeKeyDown?: (event: { preventDefault: () => void }) => void;
      [key: string]: unknown;
    }) => {
      menuEscape.handler = onEscapeKeyDown ?? null;
      const ref = React.useRef<HTMLDivElement>(null);
      React.useEffect(() => {
        ref.current?.focus();
        return () => onCloseAutoFocus?.({ preventDefault: () => {} });
      }, [onCloseAutoFocus]);
      const { id, className, 'data-testid': testId } = rest as Record<string, string>;
      return (
        <div
          ref={ref}
          id={id}
          className={className}
          data-testid={testId}
          role="dialog"
          aria-modal="true"
          aria-label="Navigation"
          tabIndex={-1}
        >
          {children}
        </div>
      );
    },
    SheetTitle: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
    DropdownMenu: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
    DropdownMenuTrigger: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
    // Content and items render their children rather than returning null. The
    // stub used to swallow both, which meant nothing inside the account menu
    // could be asserted on, including whether the product offers any route to
    // its own policies. `asChild` is accepted and ignored; the child is already
    // the element we want in the tree.
    DropdownMenuContent: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
    DropdownMenuItem: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
    DropdownMenuLabel: () => null,
    DropdownMenuSeparator: () => null,
    // The collapsed rail's account trigger wraps itself in a Tooltip so a
    // hovered avatar-only button still names itself; passthrough fragments
    // keep that trigger and its menu in the tree without pulling in Radix.
    Tooltip: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
    TooltipTrigger: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
    TooltipContent: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
    TooltipProvider: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
    // shell-nav-ia-gap-01: the shell's destructive confirms (delete conversation,
    // delete project) go through the shared AlertDialog wrapper instead of
    // window.confirm. Stable identity so the shell's useCallback deps do not
    // churn on every render, matching the real hook.
    useConfirm: () => confirmStub,
    keepOpenForMenuEscape: menuEscape.keepOpenForMenuEscape,
    shortcutLabel: (key: string) => key,
  };
});

vi.mock('@/lib/hooks/useConversations', () => ({
  useConversations: () => ({
    conversations: [],
    deleteConversation: vi.fn(),
    updateConversation: vi.fn(),
    isLoading: shellState.conversationsLoading,
    listError: shellState.conversationsListError,
    fetchConversations: shellState.fetchConversations,
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
  useBillingStore: (selector: (state: typeof shellState.billing) => unknown) =>
    selector(shellState.billing),
}));

vi.mock('@/features/settings/components/SettingsModalProvider', () => ({
  useSettingsModal: () => ({
    isOpen: false,
    openSettings: settingsModalState.openSettings,
    closeSettings: vi.fn(),
  }),
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
  shellState.billing.error = null;
  shellState.billing.unauthenticated = false;
  shellState.conversationsLoading = false;
  shellState.conversationsListError = null;
  shellState.fetchConversations = vi.fn();
  settingsModalState.openSettings = vi.fn();
  menuEscape.keepOpenForMenuEscape.mockReset();
  menuEscape.handler = null;
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

const LIST_FAILURE = 'Too many requests. Please wait before trying again.';

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

  /**
   * A 429 on the conversation list painted "No conversations yet · Start a new
   * chat" on every shell route: the shell read the hook's list failure and
   * dropped it on the floor, so the rail told an account with 50 chats that it
   * had none. What the rail then draws is Sidebar's own test.
   */
  it('hands the sidebar the conversation-list failure instead of dropping it', () => {
    shellState.conversationsListError = LIST_FAILURE;

    render(
      <WebAppShell>
        <main>content</main>
      </WebAppShell>,
    );

    expect(screen.getByTestId('app-sidebar')).toHaveAttribute('data-list-error', LIST_FAILURE);
  });

  it('claims no list failure when the fetch succeeded', () => {
    render(
      <WebAppShell>
        <main>content</main>
      </WebAppShell>,
    );

    expect(screen.getByTestId('app-sidebar')).toHaveAttribute('data-list-error', '');
  });

  it('gives the sidebar a retry that re-runs the list fetch', () => {
    shellState.conversationsListError = LIST_FAILURE;

    render(
      <WebAppShell>
        <main>content</main>
      </WebAppShell>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(shellState.fetchConversations).toHaveBeenCalledTimes(1);
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

  it('narrow: keeps the drawer open when a row-action menu claims the Escape', () => {
    mediaState.matches = true;
    menuEscape.keepOpenForMenuEscape.mockImplementation((event) => event.preventDefault());
    render(
      <WebAppShell>
        <main>content</main>
      </WebAppShell>,
    );
    const trigger = screen.getByRole('button', { name: 'Open navigation' });
    fireEvent.click(trigger);

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(menuEscape.keepOpenForMenuEscape).toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'Navigation' })).toBeInTheDocument();
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
  });

  it('narrow: the next Escape closes the drawer once no menu claims it', () => {
    mediaState.matches = true;
    menuEscape.keepOpenForMenuEscape.mockImplementation((event) => event.preventDefault());
    render(
      <WebAppShell>
        <main>content</main>
      </WebAppShell>,
    );
    const trigger = screen.getByRole('button', { name: 'Open navigation' });
    fireEvent.click(trigger);
    fireEvent.keyDown(document, { key: 'Escape' });

    menuEscape.keepOpenForMenuEscape.mockImplementation(() => {});
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByRole('dialog', { name: 'Navigation' })).toBeNull();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('narrow: takes the page behind the open drawer out of the tab order', () => {
    mediaState.matches = true;
    render(
      <WebAppShell>
        <main>
          <button type="button">behind the drawer</button>
        </main>
      </WebAppShell>,
    );
    const behind = screen.getByRole('button', { name: 'behind the drawer' });
    const content = behind.closest('[inert]');
    expect(content, 'background content is focusable while the drawer is open').toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }));
    expect(behind.closest('[inert]')).not.toBeNull();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(behind.closest('[inert]')).toBeNull();
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

  /**
   * SHELL-NAV-IA-006: the chat shell offered free-tier users a "Free plan /
   * Upgrade" pill and an Upgrade badge in the account footer; this lighter
   * shell (/tasks, /chat/library, /chat/projects, /chat/schedules) rendered
   * neither, so leaving /chat removed the only in-product upgrade route.
   */
  it('free tier: offers the upgrade nudge and routes it to billing', () => {
    render(
      <WebAppShell>
        <main>content</main>
      </WebAppShell>,
    );

    expect(screen.getByText('Free plan')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Upgrade' }));
    expect(settingsModalState.openSettings).toHaveBeenCalledWith('billing');
  });

  it('paid tier: shows the catalog plan label and no upgrade nudge', async () => {
    shellState.billing.subscription = { tier: 'pro' };
    const { getBillingPlanPricing } = await import('@agiworkforce/types');

    render(
      <WebAppShell>
        <main>content</main>
      </WebAppShell>,
    );

    expect(screen.queryByText('Free plan')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Upgrade' })).toBeNull();
    expect(screen.getByText(getBillingPlanPricing('pro').label)).toBeInTheDocument();
  });

  it('unknown plan (401 from /api/me): claims no tier and sells no upgrade', async () => {
    // The 401 path clears `subscription`, sets `initialized` and records no
    // error, the exact state a `?? 'free'` fallback turns into an upgrade
    // pitch aimed at a paying subscriber.
    shellState.billing.subscription = null;
    shellState.billing.unauthenticated = true;
    const { getBillingPlanPricing } = await import('@agiworkforce/types');

    render(
      <WebAppShell>
        <main>content</main>
      </WebAppShell>,
    );

    expect(screen.queryByText('Free plan')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Upgrade' })).toBeNull();
    expect(screen.queryByText(getBillingPlanPricing('free').label)).toBeNull();
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
