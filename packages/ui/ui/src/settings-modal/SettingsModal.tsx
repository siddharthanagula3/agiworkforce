'use client';

import React, { useMemo, useState, useCallback, useEffect } from 'react';
import { toUserMessage } from '../lib/network-error';
import {
  Search,
  Check,
  Settings2,
  UserCircle,
  Shield,
  CreditCard,
  BarChart3,
  Zap,
  Plug,
  BookOpen,
  Puzzle,
  Brain,
  Bell,
  Lock,
  ArrowLeft,
  AlertTriangle,
  ChevronDown,
  Loader2,
  FileJson,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '../cn';
import { useUiTranslation } from '../i18n';
import { Menu, MenuItem } from '../sidebar/Menu';
import type {
  SettingsDataAdapter,
  SettingsConnector,
  SettingsSkill,
  ConnectedConnector,
} from './types';
import { CUSTOM_MCP_UNVERIFIED_NOTICE, isUnverifiedCustomConnector } from './types';
import { SETTINGS_NAV_KEYWORDS } from '../settings-nav';
import type { SettingsNavGroupResolved, SettingsNavKey } from '../settings-nav';
import { ConnectorLogo } from './ConnectorLogo';
import { DirectoryPanel } from '../directory';
import type { DirectoryAdapter } from '../directory';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../primitives/Dialog';
import { useConfirm } from '../primitives/ConfirmDialog';
import {
  parseCustomMcpJsonConfig,
  describeCustomMcpJsonImportError,
} from './custom-mcp-json-import';

const ADD_CUSTOM_CONNECTOR_LABEL = 'Add custom connector';

const UNKNOWN_VERSION_PLACEHOLDER = '\u2013';

const DIRECTORY_SECTIONS = ['skills', 'connectors', 'plugins'] as const;

function isDirectorySection(key: string): key is (typeof DIRECTORY_SECTIONS)[number] {
  return (DIRECTORY_SECTIONS as readonly string[]).includes(key);
}

const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background';

function formatSettingsDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unavailable';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date);
}

function isValidHttpsUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' && parsed.hostname.length > 0;
  } catch {
    return false;
  }
}

// Destructive actions in this modal route through the package-shared
// useConfirm primitive (CPS-03/CONN-29), so a new one cannot ship without a
// confirm step, as connector Disconnect once did.

const REMOVE_PLUGIN_CONFIRM = {
  title: 'Remove plugin?',
  description: "This plugin's commands and skills will no longer be available.",
  confirmText: 'Remove',
  variant: 'destructive',
} as const;

const REMOVE_SKILL_CONFIRM = {
  title: 'Delete skill?',
  description: 'This removes it from your account. Chats that already used it are not affected.',
  confirmText: 'Delete',
  variant: 'destructive',
} as const;

interface NavEntry {
  key: string;
  label: string;
  icon: LucideIcon;
}

function matchesNavFilter(
  entry: { key: string; label: string; keywords?: string[] },
  filter: string,
): boolean {
  if (entry.label.toLowerCase().includes(filter)) return true;
  const keywords = entry.keywords ?? SETTINGS_NAV_KEYWORDS[entry.key as SettingsNavKey] ?? [];
  return keywords.some((keyword) => keyword.toLowerCase().includes(filter));
}

const ALL_NAV_ENTRIES: NavEntry[] = [
  { key: 'general', label: 'General', icon: Settings2 },
  { key: 'account', label: 'Account', icon: UserCircle },
  { key: 'security', label: 'Security', icon: Lock },
  { key: 'privacy', label: 'Privacy', icon: Shield },
  { key: 'billing', label: 'Billing', icon: CreditCard },
  { key: 'usage', label: 'Usage', icon: BarChart3 },
  { key: 'capabilities', label: 'Capabilities', icon: Zap },
  { key: 'connectors', label: 'Connectors', icon: Plug },
  { key: 'skills', label: 'Skills', icon: BookOpen },
  { key: 'plugins', label: 'Plugins', icon: Puzzle },
  { key: 'memory', label: 'Memory', icon: Brain },
  { key: 'notifications', label: 'Notifications', icon: Bell },
];

type ConnectorTab = 'all' | 'connected' | 'not-connected';

const CONNECTOR_TABS: { key: ConnectorTab; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'connected', label: 'Connected' },
  { key: 'not-connected', label: 'Not connected' },
];

function ConnectorStatusCell({
  connector,
  connection,
  canConnect,
  mutating,
  onConnect,
}: {
  connector: SettingsConnector;
  connection: ConnectedConnector | undefined;
  canConnect: boolean;
  mutating: boolean;
  onConnect: () => void;
}) {
  if (connection) {
    if (connection.status === 'warning') {
      return (
        <span className="flex items-center gap-1.5 text-xs font-medium text-foreground">
          <AlertTriangle className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
          {connection.warningLabel ?? 'Connection issue'}
        </span>
      );
    }
    return (
      <span className="flex items-center gap-1.5 text-xs font-medium text-primary">
        <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary/15">
          <Check className="h-2.5 w-2.5" aria-hidden="true" />
        </span>
        Connected
      </span>
    );
  }
  if (canConnect) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onConnect();
        }}
        disabled={mutating}
        aria-busy={mutating || undefined}
        aria-label={`Connect ${connector.name}`}
        className={cn(
          'rounded-lg border border-border px-3 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50',
          FOCUS_RING,
        )}
      >
        {mutating ? 'Connecting…' : 'Connect'}
      </button>
    );
  }
  return (
    <span className="text-xs text-muted-foreground">
      {connector.statusLabel ?? 'Not connected'}
    </span>
  );
}

function ConnectorDetail({
  connector,
  connection,
  canConnect,
  mutating,
  onConnect,
  onDisconnect,
  onBack,
  error,
  disclosure,
  scopes,
  capabilities,
  toolPermissions,
}: {
  connector: SettingsConnector;
  connection: ConnectedConnector | undefined;
  canConnect: boolean;
  mutating: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  onBack: () => void;
  error?: string;
  /**
   * Surface-supplied permission disclosure shown before the user connects.
   * Optional and surface-owned on purpose: this package must not hard-code web
   * routes or web-specific policy copy into a shell that Desktop also renders.
   */
  disclosure?: React.ReactNode;
  /**
   * Surface-supplied per-scope permission list, shown both before connecting
   * and on the connected card. Surface-owned for the same reason as
   * `disclosure`: the scope ceiling data belongs to the surface.
   */
  scopes?: React.ReactNode;
  /** Live capability catalog supplied by the owning surface. */
  capabilities?: React.ReactNode;
  /**
   * Surface-supplied per-tool permission controls, shown only once the
   * connector is connected. Surface-owned for the same reason as `disclosure`:
   * the permission store and its API are web/mobile concerns, not this shell's.
   */
  toolPermissions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-5">
      <button
        type="button"
        onClick={onBack}
        className={cn(
          'flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground',
          FOCUS_RING,
        )}
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back
      </button>

      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <ConnectorLogo
            connectorId={connector.id}
            fallbackGradient={connector.iconBg}
            fallbackText={connector.iconText}
            size="lg"
          />
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
              <span className="truncate">{connector.name}</span>
              {connection && connection.status !== 'warning' && (
                <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary/15">
                  <Check className="h-2.5 w-2.5 text-primary" aria-hidden="true" />
                </span>
              )}
              {isUnverifiedCustomConnector(connector) && (
                <span className="shrink-0 rounded-full bg-warning-fill/10 px-2 py-0.5 text-xs font-semibold uppercase tracking-wider text-warning-text">
                  Unverified
                </span>
              )}
            </h2>
            <p className="text-xs text-muted-foreground">{connector.category}</p>
          </div>
        </div>
        <div className="shrink-0">
          {connection ? (
            <button
              type="button"
              onClick={onDisconnect}
              disabled={mutating}
              aria-busy={mutating || undefined}
              className={cn(
                'rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted disabled:opacity-50',
                FOCUS_RING,
              )}
            >
              {mutating ? 'Disconnecting…' : 'Disconnect'}
            </button>
          ) : canConnect ? (
            <button
              type="button"
              onClick={onConnect}
              disabled={mutating}
              aria-busy={mutating || undefined}
              className={cn(
                'rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50',
                FOCUS_RING,
              )}
            >
              {mutating ? 'Connecting…' : 'Connect'}
            </button>
          ) : (
            <span className="text-xs text-muted-foreground">
              {connector.statusLabel ?? 'Not connected'}
            </span>
          )}
        </div>
      </div>

      {connection?.status === 'warning' && (
        <p className="flex items-center gap-1.5 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-foreground">
          <AlertTriangle
            className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
          {connection.warningLabel ?? 'Connection issue'}
        </p>
      )}
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}

      <p className="text-sm leading-relaxed text-muted-foreground">{connector.description}</p>

      {isUnverifiedCustomConnector(connector) && (
        <p className="flex items-start gap-1.5 text-xs text-warning-text">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {CUSTOM_MCP_UNVERIFIED_NOTICE}
        </p>
      )}

      {/* Surface-supplied permission disclosure (what connecting grants, how to
          revoke). Rendered before the Details block so it is above the fold at
          the moment the user is deciding. */}
      {disclosure}
      {scopes}

      {connection && capabilities}

      {/* Per-tool permissions are only meaningful once tools exist to govern,
          so they follow the connection rather than the catalog entry. */}
      {connection && toolPermissions}

      {/* Details: real catalog metadata only (no invented author/URL/docs). */}
      <div className="rounded-lg border border-border/80">
        <div className="border-b border-border/60 px-3 py-2 text-xs font-semibold text-foreground">
          Details
        </div>
        <dl className="divide-y divide-border/60 text-xs">
          <div className="flex items-center justify-between px-3 py-2">
            <dt className="text-muted-foreground">Type</dt>
            <dd className="text-foreground">{connector.category}</dd>
          </div>
          <div className="flex items-center justify-between px-3 py-2">
            <dt className="text-muted-foreground">Authentication</dt>
            <dd className="uppercase text-foreground">{connector.authType.replace('_', ' ')}</dd>
          </div>
          {/* NOTE: an "Actions" row rendered `connector.actionCount` here. That
              number has no backing implementation on any surface: web supplies
              hand-written counts from features/connectors/data/connectors.ts and
              Desktop passes 0, so it advertised a capability count at exactly
              the moment the user is deciding to grant access. Do not reinstate
              it without a runtime tool count to render. */}
          {connection?.connectedAt && (
            <div className="flex items-center justify-between px-3 py-2">
              <dt className="text-muted-foreground">Connected</dt>
              <dd className="text-foreground">{formatSettingsDate(connection.connectedAt)}</dd>
            </div>
          )}
        </dl>
      </div>
    </div>
  );
}

function useConnectorMutations(adapter?: SettingsDataAdapter) {
  const [mutatingIds, setMutatingIds] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<Record<string, string>>({});

  const run = useCallback(
    async (id: string, action: ((cid: string) => Promise<void> | void) | undefined) => {
      if (!action) return;
      setMutatingIds((prev) => new Set([...prev, id]));
      setErrors((prev) => {
        if (!(id in prev)) return prev;
        const next = { ...prev };
        delete next[id];
        return next;
      });
      try {
        await action(id);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Something went wrong. Try again.';
        setErrors((prev) => ({ ...prev, [id]: message }));
      } finally {
        setMutatingIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    },
    [],
  );

  const connect = useCallback(
    (id: string) => void run(id, adapter?.connectConnector),
    [adapter?.connectConnector, run],
  );
  const disconnect = useCallback(
    (id: string) => void run(id, adapter?.disconnectConnector),
    [adapter?.disconnectConnector, run],
  );

  return { mutatingIds, errors, connect, disconnect };
}

function skillAuthorLabel(source: string): string {
  switch (source) {
    case 'personal':
    case 'project':
    case 'workspace':
      return 'You';
    case 'bundled':
      return 'AGI';
    case 'managed-local':
      return 'Managed';
    default:
      return source;
  }
}

function AddCustomConnectorForm({
  adapter,
  onBack,
}: {
  adapter?: SettingsDataAdapter;
  onBack: () => void;
}) {
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [authToken, setAuthToken] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [jsonConfigText, setJsonConfigText] = useState('');
  const [jsonImportError, setJsonImportError] = useState<string | null>(null);
  const [jsonImportNote, setJsonImportNote] = useState<string | null>(null);

  const trimmedUrl = url.trim();
  const urlValid = isValidHttpsUrl(trimmedUrl);
  const canSubmit = name.trim().length > 0 && urlValid && !submitting;

  const handleImportJsonConfig = useCallback(() => {
    const result = parseCustomMcpJsonConfig(jsonConfigText);
    if (!result.ok) {
      setJsonImportError(describeCustomMcpJsonImportError(result.error));
      setJsonImportNote(null);
      return;
    }
    setJsonImportError(null);
    setJsonImportNote(
      result.value.droppedHeaderNames.length > 0
        ? `Only a single bearer token is stored for custom connectors. Dropped: ${result.value.droppedHeaderNames.join(', ')} from this config will not be saved.`
        : null,
    );
    setName(result.value.name ?? '');
    setUrl(result.value.url);
    setAuthToken(result.value.authToken ?? '');
    setError(null);
  }, [jsonConfigText]);

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      if (!adapter?.addCustomConnector) {
        throw new Error('Custom connectors are not yet supported in this environment.');
      }
      await adapter.addCustomConnector({
        name: name.trim(),
        url: trimmedUrl,
        ...(adapter.customConnectorAuthTokenSupported && authToken.trim()
          ? { authToken: authToken.trim() }
          : {}),
      });
      onBack();
    } catch (err) {
      setError(toUserMessage(err, 'Could not add connector. Try again.'));
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass = cn(
    'h-9 w-full rounded-lg border border-border bg-muted/30 px-3 text-sm text-foreground placeholder:text-muted-foreground',
    FOCUS_RING,
  );

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        void handleSubmit();
      }}
    >
      <button
        type="button"
        onClick={onBack}
        className={cn(
          'flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground',
          FOCUS_RING,
        )}
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back
      </button>

      <div>
        <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
          Add custom connector
          <span className="rounded-full bg-accent px-2 py-0.5 text-[12px] font-semibold uppercase tracking-wider text-accent-foreground">
            Beta
          </span>
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Connect a remote MCP server to give the assistant new tools.{' '}
          {adapter?.openHref ? (
            <button
              type="button"
              onClick={() => void adapter.openHref?.('/docs')}
              className={cn('text-foreground underline underline-offset-2', FOCUS_RING)}
            >
              Learn more
            </button>
          ) : (
            <a
              href="/docs"
              target="_blank"
              rel="noreferrer"
              className={cn('text-foreground underline underline-offset-2', FOCUS_RING)}
            >
              Learn more
            </a>
          )}
        </p>
      </div>

      {/*
        Paste a Claude Desktop / Cursor / VS Code style MCP config (or a bare
        {"url": "..."} object) to fill in the fields below instead of typing
        them by hand. Parsing only prefills state: the Add button below is
        still the only way this ever reaches adapter.addCustomConnector.
      */}
      <div className="flex flex-col gap-1.5 rounded-lg border border-border bg-muted/20 p-3">
        <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
          <FileJson className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
          Paste a JSON config
        </div>
        <textarea
          value={jsonConfigText}
          onChange={(e) => {
            setJsonConfigText(e.target.value);
            setJsonImportError(null);
            setJsonImportNote(null);
          }}
          placeholder={'{\n  "url": "https://example.com/mcp"\n}'}
          rows={3}
          aria-label="MCP server JSON config"
          className={cn(
            'w-full resize-y rounded-lg border border-border bg-muted/30 px-3 py-2 font-mono text-xs text-foreground placeholder:text-muted-foreground',
            FOCUS_RING,
          )}
        />
        {jsonImportError && (
          <p role="alert" className="text-[12px] text-danger">
            {jsonImportError}
          </p>
        )}
        {jsonImportNote && (
          <p role="status" className="text-[12px] text-amber-600 dark:text-amber-500">
            {jsonImportNote}
          </p>
        )}
        <button
          type="button"
          onClick={handleImportJsonConfig}
          disabled={jsonConfigText.trim().length === 0}
          className={cn(
            'w-fit rounded-lg border border-border px-2.5 py-1 text-[12px] font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50',
            FOCUS_RING,
          )}
        >
          Parse &amp; fill in fields below
        </button>
      </div>

      {/*
        CONNECTOR-FORM-PASSWORD-AUTOFILL-01: do not remove these autofill
        opt-outs. A bare text input followed by a password input is the exact
        shape browsers and password managers treat as a LOGIN form, so Chrome
        and Safari filled the signed-in user's account email into "Name" and
        their saved ACCOUNT PASSWORD into "Bearer token", a field whose own
        help text promises it is "Sent only to this MCP server". Submitting the
        prefilled form would have transmitted the user's password to an
        arbitrary third-party MCP server.

        `autoComplete="off"` alone does not stop this: managers deliberately
        ignore it on login-shaped forms. `new-password` on the secret field is
        what actually defeats the heuristic, and the vendor-specific opt-outs
        cover 1Password/LastPass/Bitwarden.
      */}
      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-foreground">Name</span>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="My connector"
          name="mcp-connector-label"
          autoComplete="off"
          data-1p-ignore
          data-lpignore="true"
          data-bwignore
          className={inputClass}
        />
      </label>

      {adapter?.customConnectorAuthTokenSupported ? (
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-foreground">
            Bearer token <span className="font-normal text-muted-foreground">(optional)</span>
          </span>
          <input
            type="password"
            value={authToken}
            onChange={(e) => setAuthToken(e.target.value)}
            placeholder="Token is encrypted before storage"
            name="mcp-connector-bearer-token"
            // `new-password`, not `off`: password managers ignore `off` on a
            // login-shaped form. See CONNECTOR-FORM-PASSWORD-AUTOFILL-01 above.
            autoComplete="new-password"
            data-1p-ignore
            data-lpignore="true"
            data-bwignore
            className={inputClass}
          />
          <span className="text-[12px] text-muted-foreground">
            Sent only to this MCP server and never shown again.
          </span>
        </label>
      ) : null}

      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-foreground">Remote MCP server URL</span>
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://example.com/mcp"
          aria-invalid={trimmedUrl.length > 0 && !urlValid}
          aria-describedby={
            trimmedUrl.length > 0 && !urlValid ? 'custom-connector-url-error' : undefined
          }
          className={inputClass}
        />
        {trimmedUrl.length > 0 && !urlValid && (
          <span id="custom-connector-url-error" className="text-[12px] text-danger">
            Enter a valid https:// URL.
          </span>
        )}
      </label>

      <p className="flex items-start gap-1.5 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-foreground">
        <AlertTriangle
          className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground"
          aria-hidden="true"
        />
        Only use connectors from developers you trust. Custom connectors can read the conversation
        context you share with their tools.
      </p>

      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}

      <p className="flex items-start gap-1.5 text-xs text-warning-text">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        {CUSTOM_MCP_UNVERIFIED_NOTICE}
      </p>

      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onBack}
          className={cn(
            'rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted',
            FOCUS_RING,
          )}
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!canSubmit}
          aria-busy={submitting || undefined}
          className={cn(
            'rounded-lg bg-foreground px-3 py-1.5 text-xs font-medium text-background transition-colors hover:bg-foreground/90 disabled:opacity-50',
            FOCUS_RING,
          )}
        >
          {submitting ? 'Adding…' : 'Add'}
        </button>
      </div>
    </form>
  );
}

/**
 * Connectors worth trying first, keyed by the work description the user gave in
 * General settings.
 *
 * These are CURATED SUGGESTIONS, not popularity: this product has no install
 * counts and inventing a "Popular" ranking from nothing is exactly the fake
 * metric the panel's honesty rules forbid. The heading says "Suggested for"
 * for that reason. A role with no entry gets no row rather than a generic one.
 */
const CONNECTOR_SUGGESTIONS_BY_ROLE: Readonly<Record<string, readonly string[]>> = {
  'software engineering': ['github', 'linear', 'sentry', 'gitlab'],
  'data science / ml': ['google-drive', 'notion', 'databricks', 'snowflake'],
  'product management': ['linear', 'notion', 'slack', 'jira'],
  'design / ux': ['figma', 'notion', 'slack'],
  marketing: ['hubspot', 'google-drive', 'slack', 'canva'],
  'sales / business development': ['salesforce', 'hubspot', 'slack', 'gmail'],
  'legal / compliance': ['google-drive', 'notion', 'box'],
  'finance / accounting': ['google-drive', 'stripe', 'quickbooks'],
  operations: ['slack', 'notion', 'google-drive', 'asana'],
  'research / academia': ['google-drive', 'notion', 'zotero'],
  'writing / content': ['notion', 'google-drive', 'wordpress'],
  healthcare: ['google-drive', 'box'],
  education: ['google-drive', 'notion', 'canvas'],
};

function suggestedConnectorIdsFor(role: string | null | undefined): readonly string[] {
  if (!role) return [];
  return CONNECTOR_SUGGESTIONS_BY_ROLE[role.trim().toLowerCase()] ?? [];
}

function ConnectorsPanel({
  adapter,
  connectorDisclosure,
  renderConnectorScopes,
  renderConnectorCapabilities,
  renderConnectorToolPermissions,
  workRole,
}: {
  adapter?: SettingsDataAdapter;
  connectorDisclosure?: React.ReactNode;
  /** Work description from General settings, used only to order suggestions. */
  workRole?: string | null;
  /**
   * Renders the per-scope permission list for a connector, before and after
   * connecting. Supplied by the surface because the scope ceiling data lives
   * there.
   */
  renderConnectorScopes?: (connectorId: string) => React.ReactNode;
  /**
   * Renders per-tool permission controls for a connected connector. Supplied by
   * the surface because the permission store and its API live there.
   */
  renderConnectorToolPermissions?: (connectorId: string) => React.ReactNode;
  /** Renders a live Tools/Resources/Prompts/Apps catalog for a connected connector. */
  renderConnectorCapabilities?: (connectorId: string) => React.ReactNode;
}) {
  const { t } = useUiTranslation('settings');
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<ConnectorTab>('all');
  const [detailId, setDetailId] = useState<string | null>(null);
  const [view, setView] = useState<'table' | 'add-custom'>('table');
  const {
    mutatingIds,
    errors: rowErrors,
    connect: handleConnect,
    disconnect: handleDisconnect,
  } = useConnectorMutations(adapter);
  const { confirm, dialog: confirmDialog } = useConfirm();

  const catalogConnectors = useMemo(
    () => (adapter?.connectors ?? []).filter((c) => !c.exclusive),
    [adapter?.connectors],
  );
  const connectionById = useMemo(() => {
    const map = new Map<string, ConnectedConnector>();
    for (const c of adapter?.connectedConnectors ?? []) map.set(c.connectorId, c);
    return map;
  }, [adapter?.connectedConnectors]);
  // Keep the primary settings table operational: connected connectors,
  // deployment-ready connectors, and user-added MCP servers. The full preview
  // catalog remains available under Add > Browse connectors, without flooding
  // the everyday pane with dozens of inert "Coming soon" rows.
  const connectors = useMemo(
    () =>
      catalogConnectors.filter(
        (connector) =>
          connectionById.has(connector.id) ||
          connector.canConnect === true ||
          isUnverifiedCustomConnector(connector),
      ),
    [catalogConnectors, connectionById],
  );
  const loading = adapter?.connectorsLoading ?? false;
  const loadError = adapter?.connectorsError;
  const notice = adapter?.connectorsNotice;

  const tabCounts = useMemo(() => {
    let connected = 0;
    for (const c of connectors) if (connectionById.has(c.id)) connected += 1;
    return {
      all: connectors.length,
      connected,
      'not-connected': connectors.length - connected,
    } as Record<ConnectorTab, number>;
  }, [connectors, connectionById]);

  // Suggestions are drawn from what is actually in this deployment's catalogue
  // and not already connected: proposing a connector the user cannot add, or
  // one they already have, is noise dressed as help.
  const suggested = useMemo(() => {
    const ids = suggestedConnectorIdsFor(workRole);
    if (ids.length === 0) return [];
    const byId = new Map(connectors.map((c) => [c.id, c]));
    return ids
      .map((id) => byId.get(id))
      .filter((c): c is SettingsConnector => Boolean(c) && !connectionById.has(c!.id))
      .slice(0, 4);
  }, [connectors, connectionById, workRole]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return connectors.filter((c) => {
      const isConnected = connectionById.has(c.id);
      if (activeTab === 'connected' && !isConnected) return false;
      if (activeTab === 'not-connected' && isConnected) return false;
      if (q) {
        return (
          c.name.toLowerCase().includes(q) ||
          c.description.toLowerCase().includes(q) ||
          c.category.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [connectors, connectionById, search, activeTab]);

  if (view === 'add-custom') {
    return <AddCustomConnectorForm adapter={adapter} onBack={() => setView('table')} />;
  }

  const detailConnector = detailId ? connectors.find((c) => c.id === detailId) : undefined;
  if (detailConnector) {
    const canConnect = Boolean(detailConnector.canConnect && adapter?.connectConnector);
    return (
      <>
        <ConnectorDetail
          connector={detailConnector}
          connection={connectionById.get(detailConnector.id)}
          canConnect={canConnect}
          mutating={mutatingIds.has(detailConnector.id)}
          onConnect={() => handleConnect(detailConnector.id)}
          onDisconnect={() =>
            void confirm({
              title: `Disconnect ${detailConnector.name}?`,
              description: `The assistant will no longer be able to use ${detailConnector.name}. You can connect it again later.`,
              confirmText: 'Disconnect',
              variant: 'destructive',
            }).then((confirmed) => {
              if (confirmed) handleDisconnect(detailConnector.id);
            })
          }
          onBack={() => setDetailId(null)}
          error={rowErrors[detailConnector.id]}
          disclosure={connectorDisclosure}
          scopes={renderConnectorScopes?.(detailConnector.id)}
          capabilities={renderConnectorCapabilities?.(detailConnector.id)}
          toolPermissions={renderConnectorToolPermissions?.(detailConnector.id)}
        />
        {confirmDialog}
      </>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div>
        <h2 className="text-base font-semibold text-foreground">Connectors</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Connect your tools and give the assistant access to your apps.
        </p>
      </div>

      {loading ? (
        <p
          role="status"
          aria-live="polite"
          className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground"
        >
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Loading connectors…
        </p>
      ) : loadError ? (
        <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
          <p className="text-sm text-danger">{loadError}</p>
          {adapter?.retryConnectors ? (
            <button
              type="button"
              className={cn(
                'mt-3 inline-flex min-h-6 items-center text-xs font-medium text-foreground underline underline-offset-2',
                FOCUS_RING,
              )}
              onClick={() => void adapter.retryConnectors?.()}
            >
              Try again
            </button>
          ) : null}
        </div>
      ) : (
        <>
          {notice ? (
            <div
              role="status"
              className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-foreground"
            >
              <AlertTriangle
                className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
              <span className="flex-1">{notice}</span>
              {adapter?.retryConnectors ? (
                <button
                  type="button"
                  onClick={() => void adapter.retryConnectors?.()}
                  className="shrink-0 font-medium underline underline-offset-2 hover:text-foreground"
                >
                  Try again
                </button>
              ) : null}
            </div>
          ) : null}

          {suggested.length > 0 ? (
            <section aria-labelledby="connector-suggestions" className="flex flex-col gap-2">
              <h3
                id="connector-suggestions"
                className="text-[12px] uppercase tracking-wider text-muted-foreground"
              >
                Suggested for {workRole}
              </h3>
              <div className="flex flex-wrap gap-2">
                {suggested.map((connector) => (
                  <button
                    key={connector.id}
                    type="button"
                    onClick={() => setDetailId(connector.id)}
                    className="flex items-center gap-2 rounded-lg border border-border/80 px-3 py-2 text-xs text-foreground transition-colors hover:bg-muted/40"
                  >
                    <span
                      aria-hidden="true"
                      className="flex h-5 w-5 items-center justify-center rounded text-[12px] font-semibold"
                      style={{ background: connector.iconBg, color: connector.iconText }}
                    >
                      {connector.name.slice(0, 1).toUpperCase()}
                    </span>
                    {connector.name}
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          {/* Toolbar: filter tabs (left) + search + Add (right) */}
          <div
            className={cn(
              'flex items-center gap-2 flex-wrap',
              connectors.length > 0 ? 'justify-between' : 'justify-end',
            )}
          >
            {connectors.length > 0 ? (
              <div
                role="tablist"
                aria-label={t('connectors.filter', 'Filter connectors')}
                className="flex items-center gap-1"
              >
                {CONNECTOR_TABS.map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    role="tab"
                    aria-selected={activeTab === tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    className={cn(
                      'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                      FOCUS_RING,
                      activeTab === tab.key
                        ? 'bg-foreground text-background'
                        : 'border border-border text-muted-foreground hover:bg-muted',
                    )}
                  >
                    {t(`connectors.tab.${tab.key}`, tab.label)}
                    <span className="ml-1 font-normal">{tabCounts[tab.key]}</span>
                  </button>
                ))}
              </div>
            ) : null}
            <div className="flex shrink-0 items-center gap-1.5">
              {connectors.length > 0 ? (
                <div className="relative w-48">
                  <Search
                    className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <input
                    type="search"
                    aria-label="Search connectors"
                    placeholder="Search connectors…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className={cn(
                      'h-8 w-full rounded-lg border border-border bg-muted/30 pl-8 pr-3 text-xs text-foreground placeholder:text-muted-foreground',
                      FOCUS_RING,
                    )}
                  />
                </div>
              ) : null}
              <Menu
                align="end"
                portalled={false}
                trigger={({ toggle, open }) => (
                  <button
                    type="button"
                    onClick={toggle}
                    aria-haspopup="menu"
                    aria-expanded={open}
                    className={cn(
                      'flex h-8 items-center gap-1 rounded-lg bg-foreground px-3 text-xs font-medium text-background transition-colors hover:bg-foreground/90',
                      FOCUS_RING,
                    )}
                  >
                    Add
                    <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                )}
                menuClassName="w-52"
              >
                {({ close }) => (
                  <>
                    <MenuItem close={close} onSelect={() => setView('add-custom')}>
                      Add custom connector
                    </MenuItem>
                  </>
                )}
              </Menu>
            </div>
          </div>

          {/* Table */}
          {filtered.length === 0 ? (
            connectors.length === 0 ? (
              <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border px-4 py-8 text-center">
                <div>
                  <p className="text-sm font-medium text-foreground">Connect your first tool</p>
                  <p className="mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">
                    Add a trusted remote MCP server now, or browse the directory to see which
                    branded connectors your deployment can enable.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setView('add-custom')}
                  disabled={!adapter?.addCustomConnector}
                  className={cn(
                    'rounded-lg bg-foreground px-3 py-1.5 text-xs font-medium text-background transition-colors hover:bg-foreground/90 disabled:cursor-not-allowed disabled:opacity-50',
                    FOCUS_RING,
                  )}
                >
                  Connect remote MCP server
                </button>
              </div>
            ) : (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No connectors match your filters.
              </p>
            )
          ) : (
            <div className="overflow-x-auto overscroll-contain rounded-lg border border-border/80">
              <table className="w-full table-fixed border-collapse text-left">
                <thead>
                  <tr className="border-b border-border/60 text-[12px] uppercase tracking-wider text-muted-foreground">
                    <th scope="col" className="w-[62%] px-3 py-2 font-semibold sm:w-[46%]">
                      Connector
                    </th>
                    <th
                      scope="col"
                      className="hidden px-3 py-2 font-semibold sm:table-cell sm:w-[24%]"
                    >
                      Type
                    </th>
                    <th scope="col" className="w-[38%] px-3 py-2 font-semibold sm:w-[30%]">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {filtered.map((connector) => {
                    const connection = connectionById.get(connector.id);
                    const canConnect = Boolean(connector.canConnect && adapter?.connectConnector);
                    const rowError = rowErrors[connector.id];
                    return (
                      <tr key={connector.id} className="transition-colors hover:bg-muted/40">
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <ConnectorLogo
                              connectorId={connector.id}
                              fallbackGradient={connector.iconBg}
                              fallbackText={connector.iconText}
                              size="sm"
                            />
                            <div className="min-w-0">
                              <div className="flex min-w-0 items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setDetailId(connector.id);
                                  }}
                                  className={cn(
                                    'block min-h-6 max-w-full truncate py-0.5 text-sm font-medium text-foreground hover:underline',
                                    FOCUS_RING,
                                  )}
                                >
                                  {connector.name}
                                </button>
                                {isUnverifiedCustomConnector(connector) && (
                                  <span className="shrink-0 rounded-full bg-warning-fill/10 px-1.5 py-0.5 text-xs font-semibold uppercase tracking-wider text-warning-text">
                                    Unverified
                                  </span>
                                )}
                              </div>
                              <p className="truncate text-xs text-muted-foreground sm:hidden">
                                {connector.category}
                              </p>
                              {rowError && (
                                <p role="alert" className="mt-0.5 text-[12px] text-danger">
                                  {rowError}
                                </p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="hidden px-3 py-2.5 text-xs text-muted-foreground sm:table-cell">
                          {connector.category}
                        </td>
                        <td className="px-3 py-2.5">
                          <ConnectorStatusCell
                            connector={connector}
                            connection={connection}
                            canConnect={canConnect}
                            mutating={mutatingIds.has(connector.id)}
                            onConnect={() => handleConnect(connector.id)}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function SkillsPanel({ adapter }: { adapter?: SettingsDataAdapter }) {
  const [search, setSearch] = useState('');
  const { confirm, dialog: confirmDialog } = useConfirm();
  const skills = useMemo(() => adapter?.skills ?? [], [adapter?.skills]);
  const loading = adapter?.skillsLoading ?? false;
  const loadError = adapter?.skillsError;
  const canAuthor = Boolean(adapter?.onCreateSkill);
  const hasActions = Boolean(adapter?.editSkill || adapter?.removeSkill);

  const filtered = useMemo(() => {
    if (!search) return skills;
    const q = search.toLowerCase();
    return skills.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.source.includes(q),
    );
  }, [skills, search]);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-base font-semibold text-foreground">Skills</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {canAuthor
            ? 'Portable instruction sets for focused workflows. Select one in chat with / or @, write your own, or download a bundled SKILL.md.'
            : "Bundled, portable instruction sets for focused workflows. Select one in chat with / or @, or download its SKILL.md. The web app doesn't author skills. Use Record a skill in the Desktop app, or add a SKILL.md file to .agiworkforce/skills in the CLI."}
        </p>
      </div>

      {/* Toolbar: search + Browse + New skill (capability-gated) */}
      <div className="flex items-center gap-1.5">
        <div className="relative min-w-0 flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            type="search"
            aria-label="Search skills"
            placeholder="Search skills…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={cn(
              'h-8 w-full rounded-lg border border-border bg-muted/30 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground',
              FOCUS_RING,
            )}
          />
        </div>
        {canAuthor && (
          <button
            type="button"
            onClick={() => adapter?.onCreateSkill?.()}
            className={cn(
              'h-8 shrink-0 rounded-lg bg-foreground px-3 text-xs font-medium text-background transition-colors hover:bg-foreground/90',
              FOCUS_RING,
            )}
          >
            New skill
          </button>
        )}
      </div>

      {loading ? (
        <div role="status" aria-live="polite" className="flex flex-col gap-2">
          <span className="sr-only">Loading skills…</span>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-10 animate-pulse rounded-lg bg-muted/40" />
          ))}
        </div>
      ) : loadError ? (
        <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
          <p className="text-sm text-danger">{loadError}</p>
          {adapter?.retrySkills ? (
            <button
              type="button"
              className={cn(
                'mt-3 inline-flex min-h-6 items-center text-xs font-medium text-foreground underline underline-offset-2',
                FOCUS_RING,
              )}
              onClick={() => void adapter.retrySkills?.()}
            >
              Try again
            </button>
          ) : null}
        </div>
      ) : filtered.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          {skills.length === 0
            ? canAuthor
              ? 'No skills yet. Create one, or download a bundled SKILL.md from Browse.'
              : "No skills loaded in this environment. Skills ship bundled with AGI Workforce. The web app can't create one. Use Record a skill in the Desktop app, or add a SKILL.md file to .agiworkforce/skills in the CLI."
            : 'No skills match your search.'}
        </p>
      ) : (
        <div className="overflow-x-auto overscroll-contain rounded-lg border border-border/80">
          <table className="w-full table-fixed border-collapse text-left">
            <thead>
              <tr className="border-b border-border/60 text-[12px] uppercase tracking-wider text-muted-foreground">
                <th
                  scope="col"
                  className={cn(
                    'px-3 py-2 font-semibold',
                    hasActions ? 'w-[52%] sm:w-[38%]' : 'w-[64%] sm:w-[54%]',
                  )}
                >
                  Skill
                </th>
                <th scope="col" className="hidden w-[14%] px-3 py-2 font-semibold sm:table-cell">
                  Author
                </th>
                {/*
                  Version, not "Last updated". The reference shows a date; the
                  skills source exposes no modified time, and a date derived
                  from load time would be fiction. The bundle's own frontmatter
                  version is real, and answers the same question: which
                  iteration of this skill am I running.
                */}
                <th scope="col" className="hidden w-[12%] px-3 py-2 font-semibold sm:table-cell">
                  Version
                </th>
                <th
                  scope="col"
                  className={cn(
                    'px-3 py-2 font-semibold',
                    hasActions ? 'w-[24%] sm:w-[16%]' : 'w-[36%] sm:w-[20%]',
                  )}
                >
                  Status
                </th>
                {hasActions && (
                  <th scope="col" className="w-[24%] px-3 py-2 text-right font-semibold sm:w-[20%]">
                    Actions
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {filtered.map((skill: SettingsSkill) => (
                <tr key={skill.id} className="transition-colors hover:bg-muted/40">
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <BookOpen className="h-4 w-4" aria-hidden="true" />
                      </div>
                      <div className="min-w-0">
                        {/*
                          A phone gives this cell about 100px. Truncating to one
                          line rendered every description as a fragment - "Review
                          code for…" - so the table listed skills nobody could
                          tell apart. Wrapping costs height, which scrolls.
                        */}
                        <p className="text-sm font-medium text-foreground sm:truncate">
                          {skill.name}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground sm:truncate">
                          {skill.description || skill.source}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="hidden px-3 py-2.5 text-xs text-muted-foreground sm:table-cell">
                    {skillAuthorLabel(skill.source)}
                  </td>
                  <td className="hidden px-3 py-2.5 text-xs tabular-nums text-muted-foreground sm:table-cell">
                    {skill.version ?? UNKNOWN_VERSION_PLACEHOLDER}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span>{skill.statusLabel ?? 'Available'}</span>
                    </div>
                  </td>
                  {hasActions && (
                    <td className="px-3 py-2.5">
                      {skill.editable ? (
                        <div className="flex flex-wrap justify-end gap-x-2 gap-y-1 text-xs">
                          {adapter?.editSkill ? (
                            <button
                              type="button"
                              disabled={skill.mutating}
                              onClick={() => adapter.editSkill?.(skill)}
                              className={cn(
                                'inline-flex min-h-6 items-center font-medium text-foreground underline-offset-4 hover:underline disabled:opacity-50',
                                FOCUS_RING,
                              )}
                            >
                              Edit
                            </button>
                          ) : null}
                          {adapter?.removeSkill ? (
                            <button
                              type="button"
                              disabled={skill.mutating}
                              onClick={() =>
                                void confirm(REMOVE_SKILL_CONFIRM).then((confirmed) => {
                                  if (confirmed) void adapter.removeSkill?.(skill.id);
                                })
                              }
                              className={cn(
                                'inline-flex min-h-6 items-center font-medium text-danger underline-offset-4 hover:underline disabled:opacity-50',
                                FOCUS_RING,
                              )}
                            >
                              Delete
                            </button>
                          ) : null}
                        </div>
                      ) : null}
                      {skill.error ? (
                        <p role="alert" className="mt-1 text-right text-[12px] text-danger">
                          {skill.error}
                        </p>
                      ) : null}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {confirmDialog}
    </div>
  );
}

function PluginsPanel({ adapter }: { adapter?: SettingsDataAdapter }) {
  const [search, setSearch] = useState('');
  const { confirm, dialog: confirmDialog } = useConfirm();
  const plugins = useMemo(() => adapter?.plugins ?? [], [adapter?.plugins]);
  const loading = adapter?.pluginsLoading ?? false;
  const loadError = adapter?.pluginsError;

  const filtered = useMemo(() => {
    if (!search) return plugins;
    const q = search.toLowerCase();
    return plugins.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        (p.author ?? '').toLowerCase().includes(q),
    );
  }, [plugins, search]);

  // Optional columns render only when real data exists somewhere in the list.
  const hasAuthor = plugins.some((p) => p.author);
  const hasSkillCount = plugins.some((p) => p.skillCount != null);
  const hasUpdatedAt = plugins.some((p) => p.updatedAt);
  const hasActions = Boolean(adapter?.setPluginEnabled || adapter?.removePlugin);

  const addItems: { label: string; onSelect: () => void }[] = [
    ...(adapter?.onAddPluginMarketplace
      ? [{ label: 'Add marketplace', onSelect: adapter.onAddPluginMarketplace }]
      : []),
    ...(adapter?.onUploadPlugin
      ? [{ label: 'Upload plugin', onSelect: adapter.onUploadPlugin }]
      : []),
  ];

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-base font-semibold text-foreground">Plugins</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Add reviewed skill packs now, with more community integrations coming later.
        </p>
      </div>

      {/* Toolbar: search + Browse + Add (capability-gated) */}
      <div className="flex items-center gap-1.5">
        <div className="relative min-w-0 flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            type="search"
            aria-label="Search plugins"
            placeholder="Search plugins…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={cn(
              'h-8 w-full rounded-lg border border-border bg-muted/30 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground',
              FOCUS_RING,
            )}
          />
        </div>
        {addItems.length > 0 && (
          <Menu
            align="end"
            trigger={({ toggle, open }) => (
              <button
                type="button"
                onClick={toggle}
                aria-haspopup="menu"
                aria-expanded={open}
                className={cn(
                  'flex h-8 shrink-0 items-center gap-1 rounded-lg bg-foreground px-3 text-xs font-medium text-background transition-colors hover:bg-foreground/90',
                  FOCUS_RING,
                )}
              >
                Add
                <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            )}
            menuClassName="w-48"
          >
            {({ close }) => (
              <>
                {addItems.map((item) => (
                  <MenuItem key={item.label} close={close} onSelect={item.onSelect}>
                    {item.label}
                  </MenuItem>
                ))}
              </>
            )}
          </Menu>
        )}
      </div>

      {loading ? (
        <div role="status" aria-live="polite" className="flex flex-col gap-2">
          <span className="sr-only">Loading plugins…</span>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-12 animate-pulse rounded-lg bg-muted/40" />
          ))}
        </div>
      ) : loadError ? (
        <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
          <p className="text-sm text-danger">{loadError}</p>
          {adapter?.retryPlugins ? (
            <button
              type="button"
              onClick={() => void adapter.retryPlugins?.()}
              className={cn(
                'mt-3 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted',
                FOCUS_RING,
              )}
            >
              Retry
            </button>
          ) : null}
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-12 text-center">
          <Puzzle className="mx-auto mb-3 h-8 w-8 text-muted-foreground opacity-30" />
          <p className="text-sm text-muted-foreground">
            {plugins.length === 0
              ? 'No plugins installed. Browse the directory to add an available Web plugin.'
              : 'No plugins match your search.'}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto overscroll-contain rounded-lg border border-border/80">
          <table className="w-full table-fixed border-collapse text-left">
            <thead>
              <tr className="border-b border-border/60 text-[12px] uppercase tracking-wider text-muted-foreground">
                <th
                  scope="col"
                  className={cn(
                    'px-3 py-2 font-semibold sm:w-[42%]',
                    hasActions ? 'w-[60%]' : 'w-full',
                  )}
                >
                  Plugin
                </th>
                {hasAuthor && (
                  <th scope="col" className="hidden w-[12%] px-3 py-2 font-semibold sm:table-cell">
                    Author
                  </th>
                )}
                {hasSkillCount && (
                  <th scope="col" className="hidden w-[10%] px-3 py-2 font-semibold sm:table-cell">
                    Skills
                  </th>
                )}
                {hasUpdatedAt && (
                  <th scope="col" className="hidden w-[16%] px-3 py-2 font-semibold sm:table-cell">
                    Last updated
                  </th>
                )}
                {hasActions && (
                  <th scope="col" className="w-[40%] px-3 py-2 text-right font-semibold sm:w-[20%]">
                    Actions
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {filtered.map((plugin) => (
                <tr key={plugin.id} className="transition-colors hover:bg-muted/40">
                  <td className="px-3 py-2.5">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-medium text-foreground">
                          {plugin.name}
                        </p>
                        {plugin.installable === false ? (
                          <span
                            title="No longer available on this surface: installed, but the server does not run it."
                            className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[12px] font-semibold text-muted-foreground"
                          >
                            {plugin.statusLabel ?? 'Unavailable'}
                          </span>
                        ) : (
                          <span
                            className={cn(
                              'shrink-0 rounded-full px-2 py-0.5 text-[12px] font-semibold',
                              plugin.enabled
                                ? 'bg-primary/15 text-primary'
                                : 'bg-muted text-muted-foreground',
                            )}
                          >
                            {plugin.enabled ? 'Enabled' : 'Disabled'}
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {plugin.description || 'No description.'}
                      </p>
                    </div>
                  </td>
                  {hasAuthor && (
                    <td className="hidden px-3 py-2.5 text-xs text-muted-foreground sm:table-cell">
                      {plugin.author ?? '-'}
                    </td>
                  )}
                  {hasSkillCount && (
                    <td className="hidden px-3 py-2.5 text-xs text-muted-foreground sm:table-cell">
                      {plugin.skillCount ?? '-'}
                    </td>
                  )}
                  {hasUpdatedAt && (
                    <td className="hidden px-3 py-2.5 text-xs text-muted-foreground sm:table-cell">
                      {plugin.updatedAt ? formatSettingsDate(plugin.updatedAt) : '-'}
                    </td>
                  )}
                  {hasActions && (
                    <td className="px-3 py-2.5">
                      <div className="flex flex-wrap justify-end gap-x-2 gap-y-1 text-xs">
                        {adapter?.setPluginEnabled ? (
                          <button
                            type="button"
                            disabled={plugin.mutating}
                            onClick={() =>
                              void adapter.setPluginEnabled?.(plugin.id, !plugin.enabled)
                            }
                            className={cn(
                              'inline-flex min-h-6 items-center font-medium text-foreground underline-offset-4 hover:underline disabled:opacity-50',
                              FOCUS_RING,
                            )}
                          >
                            {plugin.enabled ? 'Disable' : 'Enable'}
                          </button>
                        ) : null}
                        {adapter?.removePlugin ? (
                          <button
                            type="button"
                            disabled={plugin.mutating}
                            onClick={() =>
                              void confirm(REMOVE_PLUGIN_CONFIRM).then((confirmed) => {
                                if (confirmed) void adapter.removePlugin?.(plugin.id);
                              })
                            }
                            className={cn(
                              'inline-flex min-h-6 items-center font-medium text-danger underline-offset-4 hover:underline disabled:opacity-50',
                              FOCUS_RING,
                            )}
                          >
                            Remove
                          </button>
                        ) : null}
                      </div>
                      {plugin.error ? (
                        <p role="alert" className="mt-1 text-right text-[12px] text-danger">
                          {plugin.error}
                        </p>
                      ) : null}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {confirmDialog}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SettingsModal props + component
// ---------------------------------------------------------------------------

const NAV_SCROLL_EDGE_EPSILON_PX = 1;

interface NavScrollEdges {
  canScrollUp: boolean;
  canScrollDown: boolean;
}

interface NavScrollEdgesResult extends NavScrollEdges {
  navRef: (node: HTMLElement | null) => void;
  node: HTMLElement | null;
}

function useNavScrollEdges(dependency: unknown): NavScrollEdgesResult {
  const [node, setNode] = useState<HTMLElement | null>(null);
  const [edges, setEdges] = useState<NavScrollEdges>({
    canScrollUp: false,
    canScrollDown: false,
  });

  useEffect(() => {
    if (!node) return;

    function measure() {
      if (!node) return;
      const canScrollUp = node.scrollTop > NAV_SCROLL_EDGE_EPSILON_PX;
      const canScrollDown =
        node.scrollHeight - node.clientHeight - node.scrollTop > NAV_SCROLL_EDGE_EPSILON_PX;
      setEdges((prev) =>
        prev.canScrollUp === canScrollUp && prev.canScrollDown === canScrollDown
          ? prev
          : { canScrollUp, canScrollDown },
      );
    }

    measure();
    node.addEventListener('scroll', measure, { passive: true });
    const resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(node);

    return () => {
      node.removeEventListener('scroll', measure);
      resizeObserver.disconnect();
    };
  }, [node, dependency]);

  return { ...edges, navRef: setNode, node };
}

function NavButton({
  itemKey,
  label,
  Icon,
  isActive,
  onClick,
  badge,
}: {
  itemKey: string;
  label: string;
  Icon: LucideIcon;
  isActive: boolean;
  onClick: (key: string) => void;
  badge?: SettingsNavBadge;
}) {
  return (
    <button
      type="button"
      onClick={() => onClick(itemKey)}
      className={cn(
        'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors',
        FOCUS_RING,
        isActive
          ? 'bg-accent text-accent-foreground font-medium'
          : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
      )}
      aria-current={isActive ? 'page' : undefined}
      aria-controls="settings-pane"
    >
      <Icon className={cn('h-4 w-4 shrink-0', isActive ? 'opacity-90' : 'opacity-60')} />
      <span className="truncate">{label}</span>
      {badge && badge.count > 0 && (
        <span
          className={cn(
            'ml-auto flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5',
            'bg-destructive text-[12px] font-semibold leading-none text-destructive-foreground',
          )}
          // The count alone ("2") tells a screen-reader user nothing about what
          // needs attention, so the caller supplies the sentence.
          aria-label={badge.description}
          title={badge.description}
        >
          {badge.count > 9 ? '9+' : badge.count}
        </span>
      )}
    </button>
  );
}

/**
 * An attention marker on one nav row, e.g. connectors whose OAuth grant has
 * expired. Surface-owned: this package renders the badge but never decides
 * what warrants one, so no web-specific policy leaks into the shell Desktop
 * also renders.
 */
export interface SettingsNavBadge {
  /** Rendered as-is up to 9, then "9+". Zero renders nothing. */
  count: number;
  description: string;
}

export interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  activeSection: string;
  onSectionChange: (key: string) => void;
  /**
   * Map of section key to rendered React node for the right pane.
   * Connectors/Skills/Plugins fall back to built-in adapter-driven panels.
   */
  sectionContent: Partial<Record<string, React.ReactNode>>;
  /** Subset of nav keys to show (omit to show all). Ignored when navGroups is set. */
  activeKeys?: string[];
  navGroups?: SettingsNavGroupResolved[];
  /** Data for built-in Connectors/Skills/Plugins panels. */
  adapter?: SettingsDataAdapter;
  directoryAdapter?: DirectoryAdapter;
  directoryHeaderActions?: Partial<Record<string, React.ReactNode>>;
  /**
   * Permission disclosure rendered in the built-in connector detail view before
   * the Connect/Disconnect control. Surface-owned so this package never
   * hard-codes web policy copy or web routes into a shell Desktop also renders.
   * Omit and the detail view simply shows no disclosure block.
   */
  connectorDisclosure?: React.ReactNode;
  /** Work description from General settings; orders connector suggestions. */
  workRole?: string | null;
  /**
   * Renders per-tool permission controls inside the built-in connector detail
   * view, for a connector the user has actually connected. Surface-owned for
   * the same reason as `connectorDisclosure`: the permission store and its API
   * belong to the surface, not to this shell.
   */
  renderConnectorToolPermissions?: (connectorId: string) => React.ReactNode;
  /** Surface-owned live MCP capability catalog. */
  renderConnectorCapabilities?: (connectorId: string) => React.ReactNode;
  /**
   * Renders the per-scope permission list inside the built-in connector detail
   * view, both before and after connecting. Surface-owned for the same reason
   * as `connectorDisclosure`: the scope ceiling data belongs to the surface.
   */
  renderConnectorScopes?: (connectorId: string) => React.ReactNode;
  navBadges?: Partial<Record<string, SettingsNavBadge>>;
  /** Modal title (default: "Settings") */
  title?: string;
}

export function SettingsModal({
  open,
  onClose,
  activeSection,
  onSectionChange,
  sectionContent,
  activeKeys,
  navGroups,
  adapter,
  directoryAdapter,
  directoryHeaderActions,
  connectorDisclosure,
  workRole,
  renderConnectorToolPermissions,
  renderConnectorCapabilities,
  renderConnectorScopes,
  navBadges,
  title,
}: SettingsModalProps) {
  const { t } = useUiTranslation('settings');
  const [navSearch, setNavSearch] = useState('');
  const [customConnectorOpen, setCustomConnectorOpen] = useState(false);

  // Grouped nav (preferred): filter items within each group, dropping groups
  // that end up empty so headers never orphan.
  const visibleGroups = useMemo(() => {
    if (!navGroups) return null;
    const filter = navSearch.trim().toLowerCase();
    return navGroups
      .map((g) => ({
        label: g.label,
        items: filter ? g.items.filter((i) => matchesNavFilter(i, filter)) : g.items,
      }))
      .filter((g) => g.items.length > 0);
  }, [navGroups, navSearch]);

  // Legacy flat nav (backward compat when navGroups is not provided).
  const visibleEntries = useMemo(() => {
    const filter = navSearch.trim().toLowerCase();
    const keySet = activeKeys ? new Set(activeKeys) : null;
    return ALL_NAV_ENTRIES.filter((e) => {
      if (keySet && !keySet.has(e.key)) return false;
      if (filter) return matchesNavFilter(e, filter);
      return true;
    });
  }, [navSearch, activeKeys]);

  const navScrollDependency = visibleGroups ?? visibleEntries;
  const {
    canScrollUp,
    canScrollDown,
    navRef,
    node: navScrollNode,
  } = useNavScrollEdges(navScrollDependency);

  useEffect(() => {
    if (!navScrollNode) return;
    navScrollNode
      .querySelector<HTMLElement>('[aria-current="page"]')
      ?.scrollIntoView({ block: 'nearest' });
  }, [activeSection, navScrollNode]);

  function renderSection() {
    if (
      directoryAdapter &&
      isDirectorySection(activeSection) &&
      directoryAdapter.sections.includes(activeSection)
    ) {
      if (activeSection === 'connectors' && customConnectorOpen && adapter?.addCustomConnector) {
        return (
          <AddCustomConnectorForm adapter={adapter} onBack={() => setCustomConnectorOpen(false)} />
        );
      }
      const customAction =
        activeSection === 'connectors' && adapter?.addCustomConnector ? (
          <button
            type="button"
            onClick={() => setCustomConnectorOpen(true)}
            className={cn(
              'inline-flex min-h-8 shrink-0 items-center rounded-lg border border-border px-3 text-xs font-medium text-foreground transition-colors hover:bg-muted',
              FOCUS_RING,
            )}
          >
            {ADD_CUSTOM_CONNECTOR_LABEL}
          </button>
        ) : null;
      return (
        sectionContent[activeSection] ?? (
          <DirectoryPanel
            section={activeSection}
            adapter={directoryAdapter}
            headerActions={directoryHeaderActions?.[activeSection] ?? customAction}
          />
        )
      );
    }
    if (activeSection === 'connectors') {
      return (
        sectionContent['connectors'] ?? (
          <ConnectorsPanel
            adapter={adapter}
            connectorDisclosure={connectorDisclosure}
            renderConnectorScopes={renderConnectorScopes}
            renderConnectorCapabilities={renderConnectorCapabilities}
            renderConnectorToolPermissions={renderConnectorToolPermissions}
            workRole={workRole}
          />
        )
      );
    }
    if (activeSection === 'skills') {
      return sectionContent['skills'] ?? <SkillsPanel adapter={adapter} />;
    }
    if (activeSection === 'plugins') {
      return sectionContent['plugins'] ?? <PluginsPanel adapter={adapter} />;
    }
    return (
      sectionContent[activeSection] ?? (
        <div className="py-16 text-center">
          <p className="text-sm text-muted-foreground">
            No content for section &quot;{activeSection}&quot;.
          </p>
        </div>
      )
    );
  }

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) return;
    setNavSearch('');
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        hideCloseButton={false}
        closeLabel={t('modal.close', 'Close settings')}
        aria-describedby={undefined}
        onPointerDownOutside={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
        className="flex h-[min(94vh,680px)] w-[min(96vw,860px)] max-w-none flex-col gap-0 overflow-hidden rounded-xl border-border/60 bg-background p-0 shadow-2xl md:flex-row"
      >
        <nav
          aria-label={t('modal.navigation', 'Settings navigation')}
          className="relative flex max-h-[64%] w-full shrink-0 flex-col border-b border-border/60 py-4 md:max-h-none md:w-[220px] md:border-b-0 md:border-r md:pb-5 md:pt-7"
        >
          {/* Title */}
          <DialogTitle className="mb-3 px-4 pr-12 text-base font-semibold text-foreground md:pr-4">
            {title ?? t('modal.title', 'Settings')}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {t('modal.description', 'Search and configure AGI settings.')}
          </DialogDescription>

          {/* Search */}
          <div className="relative mb-3 px-3">
            <Search
              className="pointer-events-none absolute left-6 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <input
              type="search"
              aria-label={t('modal.searchLabel', 'Search settings')}
              placeholder={t('modal.searchPlaceholder', 'Search')}
              value={navSearch}
              onChange={(e) => setNavSearch(e.target.value)}
              className={cn(
                'h-8 w-full rounded-md border border-border/60 bg-muted/30 pl-7 pr-3 text-xs text-foreground placeholder:text-muted-foreground',
                FOCUS_RING,
              )}
            />
          </div>

          <div
            ref={navRef}
            data-testid="settings-nav-scroll-region"
            className="relative flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain"
          >
            <div
              aria-hidden="true"
              data-testid="settings-nav-scroll-fade-top"
              className={cn(
                'pointer-events-none sticky left-0 top-0 z-10 -mb-6 h-6 w-full bg-gradient-to-b from-background to-transparent transition-opacity',
                canScrollUp ? 'opacity-100' : 'opacity-0',
              )}
            />
            <div aria-hidden="true" className="h-6 shrink-0" />
            {visibleGroups ? (
              <div className="flex flex-col gap-3 px-2">
                {visibleGroups.map((group, gi) => (
                  <div key={group.label ?? `group-${gi}`} className="flex flex-col gap-0.5">
                    {group.label && (
                      <div className="px-3 pb-1 pt-1 text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
                        {group.label}
                      </div>
                    )}
                    {group.items.map((item) => (
                      <NavButton
                        key={item.key}
                        itemKey={item.key}
                        label={t(`nav.${item.key}`, item.label)}
                        Icon={item.icon}
                        isActive={activeSection === item.key}
                        onClick={onSectionChange}
                        badge={navBadges?.[item.key]}
                      />
                    ))}
                  </div>
                ))}
                {visibleGroups.length === 0 && (
                  <p className="px-3 py-2 text-xs text-muted-foreground">
                    {t('modal.noMatches', 'No matches.')}
                  </p>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-0.5 px-2">
                {visibleEntries.map((entry) => (
                  <NavButton
                    key={entry.key}
                    itemKey={entry.key}
                    label={t(`nav.${entry.key}`, entry.label)}
                    Icon={entry.icon}
                    isActive={activeSection === entry.key}
                    onClick={onSectionChange}
                    badge={navBadges?.[entry.key]}
                  />
                ))}
              </div>
            )}
            <div aria-hidden="true" className="h-6 shrink-0" />
            <div
              aria-hidden="true"
              data-testid="settings-nav-scroll-fade-bottom"
              className={cn(
                'pointer-events-none sticky bottom-0 left-0 z-10 -mt-6 h-6 w-full bg-gradient-to-t from-background to-transparent transition-opacity',
                canScrollDown ? 'opacity-100' : 'opacity-0',
              )}
            />
          </div>
        </nav>

        {/* Right pane */}
        <main
          className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-5 pt-10 [scrollbar-gutter:stable] sm:px-6 sm:pb-6 md:px-8 md:pb-8 md:pt-7"
          id="settings-pane"
          tabIndex={-1}
        >
          {/* Bound the measure: without it the same pane renders 576px wide in
              the Cloud shell and 720px in the Local one, and grows unbounded
              with the window. */}
          <div className="mx-auto w-full max-w-[672px]">{renderSection()}</div>
        </main>
      </DialogContent>
    </Dialog>
  );
}
