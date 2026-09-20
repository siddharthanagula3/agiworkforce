import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
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
    user: { id: 'user-1', name: 'Sid', email: 'sid@example.com' } as {
      id: string;
      name: string;
      email: string;
    } | null,
    isLoading: false,
    initialized: true,
  },
  billing: {
    user: null as {
      id: string;
      name?: string;
      email?: string;
      profile?: { display_name?: string | null };
    } | null,
    subscription: { tier: 'free' } as { tier: string } | null,
    isLoading: false,
    initialized: true,
    error: null as string | null,
    unauthenticated: false,
  },
  conversations: [] as Array<{ id: string; title: string; updatedAt: string }>,
  conversationsLoading: false,
  conversationsListError: null as string | null,
  fetchConversations: vi.fn(),
  projects: [] as Array<{ id: string; name: string }>,
  usage: null as { percent: number } | null,
}));

const providerState = vi.hoisted(() => ({
  user: null as {
    id: string;
    fullName: string | null;
    firstName: string | null;
    lastName: string | null;
    username: string | null;
    email: string | null;
    emails: string[];
  } | null,
}));

const settingsModalState = vi.hoisted(() => ({ openSettings: vi.fn() }));
const upgradeFlowState = vi.hoisted(() => ({ openUpgradeDialog: vi.fn() }));

/** Stable stub for the shared `useConfirmAction` destructive-confirm hook. */
const confirmStub = vi.hoisted(() => ({
  confirm: vi.fn((request: { onConfirm: () => unknown }) => {
    void request.onConfirm();
  }),
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

vi.mock('@/lib/identity/client', () => ({
  useSignOut: () => vi.fn(),
  useCurrentUser: () => ({ user: providerState.user }),
  useSession: () => ({ isLoaded: true, isSignedIn: true, userId: 'user-1' }),
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
  WorkspaceMenuItems: ({ onManage }: { onManage: () => void }) => (
    <button type="button" onClick={onManage}>
      Manage workspace
    </button>
  ),
}));

// The account menu's Upgrade item drives the same upgrade flow as
// WebChatPage (dialog, mid-cycle confirm, real Stripe checkout call) via
// this shared hook. Stubbed for the same reason WorkspaceMenuItems is: this
// is a layout test, not a billing-flow one.
vi.mock('@features/billing/hooks/use-upgrade-plan-flow', () => ({
  useUpgradePlanFlow: () => ({
    openUpgradeDialog: upgradeFlowState.openUpgradeDialog,
    upgradeDialogs: null,
  }),
}));

// Same reasoning as the upgrade flow above, the shortcuts reference dialog
// pulls in the settings store's shortcut-preference wiring, which this
// layout test has no reason to stand up.
vi.mock('@/features/chat/components/dialogs/KeyboardShortcutsDialog', () => ({
  KeyboardShortcutsDialog: ({ open }: { open: boolean }) =>
    open ? <div data-testid="keyboard-shortcuts-dialog" /> : null,
}));

vi.mock('@/features/chat/components/dialogs/GlobalSearchDialog', () => ({
  GlobalSearchDialog: ({ open }: { open: boolean }) =>
    open ? <div data-testid="global-search-dialog" /> : null,
}));

vi.mock('@agiworkforce/ui', async () => {
  const React = await import('react');
  return {
    MOBILE_NAV_DRAWER_WIDTH: 280,
    OPEN_SEARCH_SHORTCUT: { key: 'F', ctrl: true, meta: true, shift: true },
    Sidebar: (props: {
      collapsed?: boolean;
      isLoading?: boolean;
      error?: string | null;
      onRetryLoad?: () => void;
      onNewChat?: () => void;
      onOpenCode?: () => void;
      onOpenSearch?: () => void;
      showUsageWidget?: boolean;
      budgetPercent?: number;
      sessions?: unknown[];
      projects?: unknown[];
      navItems?: Array<{ id: string }>;
      footerSlot?: React.ReactNode;
    }) => (
      <div
        data-testid="app-sidebar"
        data-collapsed={String(props.collapsed ?? false)}
        data-loading={String(props.isLoading ?? false)}
        data-list-error={props.error ?? ''}
        data-sessions={String(props.sessions?.length ?? 0)}
        data-projects={String(props.projects?.length ?? 0)}
        data-nav-items={(props.navItems ?? []).map((item) => item.id).join(',')}
      >
        <button type="button" onClick={props.onNewChat}>
          New chat
        </button>
        {props.onRetryLoad && (
          <button type="button" onClick={props.onRetryLoad}>
            Retry
          </button>
        )}
        {props.onOpenCode && (
          <button type="button" onClick={props.onOpenCode}>
            Code
          </button>
        )}
        <button type="button" onClick={props.onOpenSearch}>
          Search
        </button>
        <span data-testid="app-sidebar-usage" data-shown={String(props.showUsageWidget ?? false)}>
          {props.budgetPercent ?? 0}
        </span>
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
    DropdownMenuItem: ({
      asChild,
      children,
      onClick,
    }: {
      asChild?: boolean;
      children?: React.ReactNode;
      onClick?: () => void;
    }) =>
      asChild ? (
        <>{children}</>
      ) : (
        <button type="button" onClick={onClick}>
          {children}
        </button>
      ),
    DropdownMenuLabel: () => null,
    DropdownMenuSeparator: () => null,
    // The collapsed rail's account trigger wraps itself in a Tooltip so a
    // hovered avatar-only button still names itself; passthrough fragments
    // keep that trigger and its menu in the tree without pulling in Radix.
    Tooltip: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
    TooltipTrigger: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
    TooltipContent: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
    TooltipProvider: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
    // The account menu's feedback dialog mounts closed with its trigger hidden;
    // the stub renders its content only while open so nothing leaks into the
    // menu assertions.
    Dialog: ({ open, children }: { open?: boolean; children?: React.ReactNode }) =>
      open ? <>{children}</> : null,
    DialogContent: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
    DialogHeader: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
    DialogTitle: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
    DialogDescription: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
    Button: ({
      children,
      ...rest
    }: React.ButtonHTMLAttributes<HTMLButtonElement> & { children?: React.ReactNode }) => (
      <button {...rest}>{children}</button>
    ),
    Label: ({ children, ...rest }: React.LabelHTMLAttributes<HTMLLabelElement>) => (
      <label {...rest}>{children}</label>
    ),
    // Stable identity so the shell's useCallback deps do not churn on every
    // render, matching the real hook.
    useConfirmAction: () => confirmStub,
    keepOpenForMenuEscape: menuEscape.keepOpenForMenuEscape,
    shortcutLabel: (key: string) => key,
  };
});

vi.mock('@/lib/hooks/useConversations', () => ({
  useConversations: () => ({
    conversations: shellState.conversations,
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
  useManagedCloudProjects: () => ({ projects: shellState.projects }),
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
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    value: narrow ? 640 : 1280,
  });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 });
  for (const listener of mediaState.listeners) listener({ matches: narrow });
  window.dispatchEvent(new Event('resize'));
}

beforeEach(() => {
  routerState.push = vi.fn();
  routerState.pathname = '/chat/projects';
  mediaState.listeners.clear();
  setNarrowViewport(false);
  shellState.auth.user = { id: 'user-1', name: 'Sid', email: 'sid@example.com' };
  shellState.auth.isLoading = false;
  shellState.auth.initialized = true;
  shellState.billing.subscription = { tier: 'free' };
  shellState.billing.user = null;
  shellState.billing.isLoading = false;
  shellState.billing.initialized = true;
  shellState.billing.error = null;
  shellState.billing.unauthenticated = false;
  providerState.user = null;
  shellState.conversations = [];
  shellState.conversationsLoading = false;
  shellState.conversationsListError = null;
  shellState.fetchConversations = vi.fn();
  shellState.projects = [];
  settingsModalState.openSettings = vi.fn();
  upgradeFlowState.openUpgradeDialog = vi.fn();
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
  it('settles the account footer from canonical profile and provider email', () => {
    shellState.auth.user = { id: 'user-1', name: 'User', email: '' };
    shellState.billing.user = {
      id: 'user-1',
      name: 'User',
      profile: { display_name: 'demo' },
    };
    providerState.user = {
      id: 'user-1',
      fullName: 'Provider Name',
      firstName: 'Provider',
      lastName: 'Name',
      username: null,
      email: 'signed-in@example.com',
      emails: ['signed-in@example.com'],
    };

    render(
      <WebAppShell>
        <main>content</main>
      </WebAppShell>,
    );

    expect(screen.getByRole('button', { name: 'Account menu for Demo' })).toBeInTheDocument();
    expect(screen.getByText('signed-in@example.com')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Account menu for User' })).toBeNull();
  });

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

  // Scroll chaining out of the content region moves the fixed shell wrapper
  // underneath it, which on touch rubber-bands the page background into view.
  it('contains the content region overscroll', () => {
    render(
      <WebAppShell>
        <main>content</main>
      </WebAppShell>,
    );

    const content = document.getElementById('main-content');
    expect(content?.className).toContain('overscroll-contain');
    expect(content?.className).toContain('overflow-auto');
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

  // The Code surface renders its own left column, so the shell that hosts it
  // must be able to drop the app navigation and keep everything else it mounts.
  // Two sidebars side by side is what shipped before this prop existed.
  it('rail=false: renders no app navigation on either viewport', () => {
    render(
      <WebAppShell rail={false}>
        <main>content</main>
      </WebAppShell>,
    );
    expect(screen.queryByTestId('app-sidebar')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Open navigation' })).toBeNull();

    cleanup();
    setNarrowViewport(true);

    render(
      <WebAppShell rail={false}>
        <main>content</main>
      </WebAppShell>,
    );
    expect(screen.queryByTestId('app-sidebar')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Open navigation' })).toBeNull();
    expect(screen.queryByRole('dialog', { name: 'Navigation' })).toBeNull();
  });

  it('hands the sidebar a Code destination beside its New chat control', () => {
    render(
      <WebAppShell>
        <main>content</main>
      </WebAppShell>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Code' }));

    expect(routerState.push).toHaveBeenCalledWith('/code');
  });

  it('narrow: hides the persistent sidebar behind an Open navigation control', () => {
    setNarrowViewport(true);
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
    setNarrowViewport(true);
    render(
      <WebAppShell>
        <main>content</main>
      </WebAppShell>,
    );
    const trigger = screen.getByRole('button', { name: 'Open navigation' });
    trigger.focus();
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
    setNarrowViewport(true);
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
    setNarrowViewport(true);
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
    setNarrowViewport(true);
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
    setNarrowViewport(true);
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
    setNarrowViewport(true);
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

  it.each([
    ['common:settings', 'general'],
    ['Manage workspace', 'team'],
  ])('narrow: closes navigation before opening %s in place', (label, section) => {
    setNarrowViewport(true);
    render(
      <WebAppShell>
        <main>content</main>
      </WebAppShell>,
    );
    const trigger = screen.getByRole('button', { name: 'Open navigation' });
    fireEvent.click(trigger);

    fireEvent.click(screen.getByRole('button', { name: label }));

    expect(screen.queryByRole('dialog', { name: 'Navigation' })).toBeNull();
    expect(settingsModalState.openSettings).toHaveBeenCalledWith(section);
    expect(document.activeElement).not.toBe(trigger);
  });

  it('narrow: closes navigation before opening feedback', () => {
    setNarrowViewport(true);
    render(
      <WebAppShell>
        <main>content</main>
      </WebAppShell>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }));

    fireEvent.click(screen.getByRole('button', { name: 'common:navSendFeedback' }));

    expect(screen.queryByRole('dialog', { name: 'Navigation' })).toBeNull();
    expect(document.body.textContent).toContain('Share feedback');
  });

  it('narrow: closes navigation before opening keyboard shortcuts', () => {
    setNarrowViewport(true);
    render(
      <WebAppShell>
        <main>content</main>
      </WebAppShell>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }));

    fireEvent.click(screen.getByRole('button', { name: 'common:navKeyboardShortcuts /' }));

    expect(screen.queryByRole('dialog', { name: 'Navigation' })).toBeNull();
    expect(screen.getByTestId('keyboard-shortcuts-dialog')).toBeInTheDocument();
  });

  it('narrow: closes navigation before opening the upgrade flow', () => {
    setNarrowViewport(true);
    render(
      <WebAppShell>
        <main>content</main>
      </WebAppShell>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }));
    fireEvent.click(screen.getByRole('button', { name: 'common:navUpgrade' }));

    expect(screen.queryByRole('dialog', { name: 'Navigation' })).toBeNull();
    expect(upgradeFlowState.openUpgradeDialog).toHaveBeenCalledOnce();
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
  /**
   * This shell used to pass no onOpenSearch, so the shared Sidebar fell back to
   * its own client-only overlay: Projects, Library and Schedules searched the
   * loaded page of conversations while chat searched the server.
   */
  it('searches through the same dialog the chat page uses', () => {
    render(
      <WebAppShell>
        <main>content</main>
      </WebAppShell>,
    );

    expect(screen.queryByTestId('global-search-dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    expect(screen.getByTestId('global-search-dialog')).toBeInTheDocument();
  });

  it('hands the sidebar the usage meter props', () => {
    render(
      <WebAppShell>
        <main>content</main>
      </WebAppShell>,
    );

    expect(screen.getByTestId('app-sidebar-usage')).toBeInTheDocument();
  });
});

/**
 * Bootstrap independence: the shell is chrome plus several independent
 * fetches, and the account, recents, projects and usage calls all resolve at
 * different times. Each of them failing or staying in flight must cost the
 * user only that region.
 */
describe('WebAppShell bootstrap independence', () => {
  const renderShell = () =>
    render(
      <WebAppShell>
        <main>content</main>
      </WebAppShell>,
    );

  it('paints the shell and its route before any secondary call has answered', () => {
    shellState.auth.initialized = false;
    shellState.auth.isLoading = true;
    shellState.billing.initialized = false;
    shellState.billing.isLoading = true;
    shellState.conversationsLoading = true;

    renderShell();

    expect(screen.getByText('content')).toBeInTheDocument();
    expect(screen.getByTestId('app-sidebar')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New chat' })).toBeInTheDocument();
  });

  it('keeps New chat working while the recents list is still loading', () => {
    shellState.conversationsLoading = true;

    renderShell();
    fireEvent.click(screen.getByRole('button', { name: 'New chat' }));

    expect(routerState.push).toHaveBeenCalledWith('/chat');
  });

  it('keeps New chat working when the recents list failed outright', () => {
    shellState.conversationsListError = LIST_FAILURE;

    renderShell();

    expect(screen.getByTestId('app-sidebar')).toHaveAttribute('data-list-error', LIST_FAILURE);
    fireEvent.click(screen.getByRole('button', { name: 'New chat' }));
    expect(routerState.push).toHaveBeenCalledWith('/chat');
  });

  it('renders the rail and the route before the project list arrives', () => {
    renderShell();
    expect(screen.getByTestId('app-sidebar')).toHaveAttribute('data-projects', '0');
    expect(screen.getByText('content')).toBeInTheDocument();
    cleanup();

    shellState.projects = [{ id: 'p1', name: 'Atlas' }];
    renderShell();
    expect(screen.getByTestId('app-sidebar')).toHaveAttribute('data-projects', '1');
  });

  it('holds the usage meter back until its summary arrives, and shows the shell anyway', () => {
    renderShell();

    expect(screen.getByTestId('app-sidebar-usage')).toHaveAttribute('data-shown', 'false');
    expect(screen.getByText('content')).toBeInTheDocument();
  });

  it('keeps the account footer when the profile carries neither name nor email', () => {
    shellState.auth.user = { id: 'user-1', name: '', email: '' };
    shellState.billing.user = null;
    providerState.user = null;

    renderShell();

    expect(screen.getByTestId('app-sidebar')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Account menu for/ })).toBeInTheDocument();
    expect(screen.getByText('content')).toBeInTheDocument();
  });

  it('carries the rail across a route change rather than rebuilding it', () => {
    const { rerender } = renderShell();
    const railBefore = screen.getByTestId('app-sidebar').getAttribute('data-nav-items');

    routerState.pathname = '/chat/library';
    rerender(
      <WebAppShell>
        <main>content</main>
      </WebAppShell>,
    );

    expect(screen.getByTestId('app-sidebar')).toBeInTheDocument();
    expect(screen.getByTestId('app-sidebar').getAttribute('data-nav-items')).toBe(railBefore);
  });
});
