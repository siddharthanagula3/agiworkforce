'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import {
  loadSkillsCatalog,
  skillAuthoringCapability,
} from '@features/skills/services/skills-catalog';
import { usePathname } from 'next/navigation';
import { useSession } from '@/lib/identity/client';
import { useBillingStore } from '@shared/stores/web-auth-store';
import { z } from 'zod';
import { Brain, Mic } from 'lucide-react';
import { SettingsModal, SETTINGS_NAV_GROUPS_WEB } from '@agiworkforce/ui';
import type {
  DirectoryConnectorDetail,
  SettingsDataAdapter,
  SettingsNavGroupResolved,
  SettingsPlugin,
  SettingsSkill,
} from '@agiworkforce/ui';
import { CONNECTORS } from '@/features/connectors/data/connectors';
import { ConnectorConsentSummary } from '@/features/connectors/components/ConnectorConsentSummary';
import { ConnectorScopeList } from '@/features/connectors/components/ConnectorScopeList';
import { ToolPermissionsPanel } from '@/features/connectors/components/ToolPermissionsPanel';
import { ConnectorCapabilitiesPanel } from '@/features/connectors/components/ConnectorCapabilitiesPanel';
import { ConnectorApiKeyForm } from '@/features/connectors/components/ConnectorApiKeyForm';
import {
  brokerOutcomeMessage,
  currentConnectorReturnPath,
  withConnectorReturnPath,
} from '@/features/connectors/hooks/use-connectors';
import { getCsrfToken } from '@/lib/client/csrf';
import { CONNECTOR_REAUTHORIZATION_COPY, useDirectoryAdapter } from '@/features/directory';

const NEW_SKILL_LABEL = 'New skill';
const TOOL_PERMISSIONS_LABEL = 'Tool permissions';
const TOOL_PERMISSIONS_HINT =
  'Choose when the assistant may use each of this connector\u2019s tools.';
import { announceSkillCatalogChanged } from '@shared/events/skill-catalog-events';
import type { WebSettingsContentSection } from '../lib/web-settings-sections';

import { GeneralSection } from '../sections/GeneralSection';
import { AccountSection } from '../sections/AccountSection';
import { TeamSection } from '../sections/TeamSection';
import { WorkspaceConsolePointer } from '../sections/WorkspaceConsolePointer';
import { SecuritySection } from '../sections/SecuritySection';
import { SafetySection } from '../sections/SafetySection';
import { PrivacySection } from '../sections/PrivacySection';
import { ArchivedChatsSection } from '../sections/ArchivedChatsSection';
import { DeletedChatsSection } from '../sections/DeletedChatsSection';
import { SharedLinksSection } from '../sections/SharedLinksSection';
import { BillingSection } from '../sections/BillingSection';
import { UsageSection } from '../sections/UsageSection';
import { CapabilitiesSection } from '../sections/CapabilitiesSection';
import { MemorySection } from '../sections/MemorySection';
import { NotificationsSection } from '../sections/NotificationsSection';
import { VoiceSection } from '../sections/VoiceSection';
import { ReflectSection } from '../sections/ReflectSection';
import { TimeFocusSection } from '../sections/TimeFocusSection';
import { HelpSection } from '../sections/HelpSection';
import { SettingsSectionNavigationProvider } from './SettingsSectionLink';
import { type ManagedSkillSummary as ApiSkill } from '@agiworkforce/cloud-contracts';
import { toUserMessage } from '@/lib/user-error-message';
import { SkillEditorDialog } from '@features/skills/components/SkillEditorDialog';
import type { SkillDraft } from '@agiworkforce/skills/validation';

// ---------------------------------------------------------------------------
// Skeleton shown while a section is still hydrating
// ---------------------------------------------------------------------------

function SectionSkeleton() {
  return (
    <div className="flex animate-pulse flex-col gap-6">
      <div className="h-6 w-48 rounded bg-foreground/10" />
      <div className="h-4 w-80 rounded bg-foreground/[0.07]" />
      <div className="h-40 w-full rounded-xl bg-foreground/[0.07]" />
    </div>
  );
}

const ApiPluginsResponseSchema = z.object({
  entries: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string().min(1),
      description: z.string(),
      category: z.string(),
      status: z.enum(['preview', 'published', 'deprecated']),
      webInstallable: z.boolean(),
      publisher: z.object({ name: z.string().min(1) }),
      declaredSkills: z.array(z.string()),
      skillsRequireInstall: z.boolean().default(false),
      requiredConnectors: z.array(z.string()).default([]),
      examplePrompts: z.array(z.string()).default([]),
      distribution: z.object({ manifestUrl: z.string().url() }).passthrough().nullable(),
      installCount: z.number().int().nonnegative().optional(),
      updatedAt: z.string(),
    }),
  ),
  total: z.number().int().nonnegative(),
});

const PluginInstallationsResponseSchema = z.object({
  installations: z.array(
    z.object({
      pluginId: z.string().min(1),
      installedVersion: z.string().min(1),
      enabled: z.boolean(),
      installedAt: z.string(),
      updatedAt: z.string(),
    }),
  ),
});

class LoadFailure extends Error {
  constructor(readonly status: number | null) {
    super(`load failed: ${status ?? 'network'}`);
  }
}

function loadFailureMessage(subject: string, error: unknown): string {
  const status =
    error instanceof LoadFailure
      ? error.status
      : typeof (error as { status?: unknown })?.status === 'number'
        ? (error as { status: number }).status
        : null;
  if (status === 401 || status === 403) {
    return `Your session expired. Reload the page to sign back in, then reopen ${subject}.`;
  }
  if (status !== null && status >= 500) {
    return `${subject} could not be loaded because the server returned an error. This is not a problem with your connection, retry, or contact support if it persists.`;
  }
  if (status !== null) {
    return `${subject} could not be loaded (the server rejected the request). Retry, or contact support if it persists.`;
  }
  return `${subject} could not be loaded. Check your connection and try again.`;
}

class ConnectorLoadError extends Error {
  constructor(
    readonly kind: 'invalid-data' | 'status',
    readonly status: number | null = null,
  ) {
    super(kind);
  }
}

// GET /api/github/installations is fetched independently from the other two
// connector sources (known-flaws WEB-CONNECTORS-PANEL-ALL-OR-NOTHING-01): its
// failure means GitHub's connected state can't be confirmed right now, not
// that the whole directory is unreachable, so it degrades to this scoped
// notice instead of the global connectorsError.
const GITHUB_INSTALLATIONS_NOTICE =
  'GitHub app installations could not be loaded. GitHub may show as not connected here until this is retried.';

const ConnectorsResponseSchema = z.object({
  connectors: z.array(
    z.object({
      connectorId: z.string().min(1),
      connectedAt: z.string().optional(),
      needsReauthorization: z.boolean().optional(),
    }),
  ),
  available: z.array(z.string().min(1)).optional(),
});

const GitHubInstallationsResponseSchema = z.object({
  installations: z.array(
    z.object({
      installation_id: z.number().int().positive(),
      created_at: z.string().optional(),
    }),
  ),
});

const CustomConnectorsResponseSchema = z.object({
  connectors: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string().min(1),
      url: z.string().url(),
      createdAt: z.string(),
    }),
  ),
});

type ParsedConnectorRow = {
  connectorId: string;
  connectedAt?: string;
  needsReauthorization?: boolean;
};

type ParsedCustomConnectorRow = {
  id: string;
  name: string;
  url: string;
  createdAt: string;
};

function readConnectorResponse(value: unknown): {
  rows: ParsedConnectorRow[];
  available: string[];
  degraded: boolean;
} | null {
  if (!value || typeof value !== 'object') return null;
  const envelope = value as { connectors?: unknown; available?: unknown };
  if (!Array.isArray(envelope.connectors)) return null;

  let degraded = false;
  const rows: ParsedConnectorRow[] = [];
  for (const raw of envelope.connectors) {
    if (!raw || typeof raw !== 'object') {
      degraded = true;
      continue;
    }
    const row = raw as Record<string, unknown>;
    if (typeof row['connectorId'] !== 'string' || row['connectorId'].length === 0) {
      degraded = true;
      continue;
    }
    const parsed: ParsedConnectorRow = { connectorId: row['connectorId'] };
    if (row['connectedAt'] !== undefined) {
      if (typeof row['connectedAt'] === 'string') parsed.connectedAt = row['connectedAt'];
      else degraded = true;
    }
    if (row['needsReauthorization'] !== undefined) {
      if (typeof row['needsReauthorization'] === 'boolean') {
        parsed.needsReauthorization = row['needsReauthorization'];
      } else degraded = true;
    }
    rows.push(parsed);
  }

  let available: string[] = [];
  if (envelope.available !== undefined) {
    if (!Array.isArray(envelope.available)) {
      degraded = true;
    } else {
      available = envelope.available.filter((id): id is string => {
        const valid = typeof id === 'string' && id.length > 0;
        if (!valid) degraded = true;
        return valid;
      });
    }
  }

  return { rows, available, degraded };
}

function readCustomConnectorResponse(value: unknown): {
  rows: ParsedCustomConnectorRow[];
  degraded: boolean;
} | null {
  if (!value || typeof value !== 'object') return null;
  const envelope = value as { connectors?: unknown };
  if (!Array.isArray(envelope.connectors)) return null;

  let degraded = false;
  const rows: ParsedCustomConnectorRow[] = [];
  for (const raw of envelope.connectors) {
    if (!raw || typeof raw !== 'object') {
      degraded = true;
      continue;
    }
    const row = raw as Record<string, unknown>;
    if (
      typeof row['id'] !== 'string' ||
      row['id'].length === 0 ||
      typeof row['name'] !== 'string' ||
      row['name'].length === 0 ||
      typeof row['url'] !== 'string' ||
      row['url'].length === 0 ||
      typeof row['createdAt'] !== 'string'
    ) {
      degraded = true;
      continue;
    }
    rows.push({
      id: row['id'],
      name: row['name'],
      url: row['url'],
      createdAt: row['createdAt'],
    });
  }

  return { rows, degraded };
}

const SECTION_TO_SEGMENT: Record<string, string> = {
  general: 'general',
  account: 'account',
  team: 'team',
  security: 'security',
  safety: 'safety',
  privacy: 'privacy',
  archived: 'archived',
  'deleted-chats': 'deleted-chats',
  'shared-links': 'shared-links',
  billing: 'billing',
  usage: 'usage',
  capabilities: 'capabilities',
  connectors: 'connectors',
  skills: 'skills',
  plugins: 'plugins',
  memory: 'memory',
  notifications: 'notifications',
  voice: 'voice',
  reflect: 'reflect',
  'time-focus': 'time-focus',
  help: 'help',
};

const SEGMENT_TO_SECTION: Record<string, string> = Object.fromEntries(
  Object.entries(SECTION_TO_SEGMENT).map(([k, v]) => [v, k]),
);

const WEB_SETTINGS_NAV_GROUPS: SettingsNavGroupResolved[] = SETTINGS_NAV_GROUPS_WEB.map(
  (group) => ({
    ...group,
    items: group.items.flatMap((item) => {
      if (item.key === 'capabilities') {
        return [
          item,
          {
            key: 'memory' as const,
            label: 'Memory',
            icon: Brain,
            keywords: ['facts', 'remember', 'personalization', 'manage memories'],
          },
        ];
      }
      if (item.key === 'notifications') {
        return [
          item,
          {
            key: 'voice' as const,
            label: 'Voice',
            icon: Mic,
            keywords: ['speech', 'tts', 'microphone', 'audio', 'dictation'],
          },
        ];
      }
      return [item];
    }),
  }),
);

// ---------------------------------------------------------------------------
// Connector catalog -> SettingsConnector shape
//
// `exclusive` connectors are local-only (filesystem/terminal/browser/vision/
// ollama), excluded entirely. `mergedSettingsConnectors` below flips
// canConnect/statusLabel once GET /api/connectors reports the id as
// available. Connected state renders from real data: active user_connectors
// rows (GET /api/connectors) and, for GitHub, real GitHub App installations.
// ---------------------------------------------------------------------------

const CONNECTOR_NOT_CONNECTED_LABEL = 'Not connected';

const CAPABILITY_SENTENCE_END = '.';

function capabilityDescription(connector: (typeof CONNECTORS)[number]): string {
  const summary = connector.capabilitySummary;
  if (!summary) return connector.description;
  return `${summary.charAt(0).toUpperCase()}${summary.slice(1)}${CAPABILITY_SENTENCE_END}`;
}

export const SETTINGS_CONNECTORS = CONNECTORS.filter((c) => !c.exclusive).map((c) => ({
  id: c.id,
  name: c.name,
  publisher: c.name,
  description: capabilityDescription(c),
  category: c.category,
  authType: c.authType,
  actionCount: c.actionCount,
  phase: c.phase,
  iconBg: c.iconBg,
  iconText: c.iconText,
  canConnect: false,
  statusLabel: CONNECTOR_NOT_CONNECTED_LABEL,
}));

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface WebSettingsModalProps {
  open: boolean;
  onClose: () => void;
  initialSection?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function WebSettingsModal({
  open,
  onClose,
  initialSection = 'general',
}: WebSettingsModalProps) {
  const pathname = usePathname();

  // Derive section from current URL path (deep-link support)
  const sectionFromPath = (() => {
    if (!pathname) return null;
    const match = pathname.match(/^\/settings\/([^/]+)/);
    if (match?.[1] && SEGMENT_TO_SECTION[match[1]]) return SEGMENT_TO_SECTION[match[1]];
    if (pathname.startsWith('/connectors')) return 'connectors';
    if (pathname.startsWith('/skills')) return 'skills';
    if (pathname.startsWith('/apps')) return 'plugins';
    return null;
  })();

  const workRole = useBillingStore((state) => state.user?.profile?.work_description ?? null);

  const [activeSection, setActiveSection] = useState<string>(sectionFromPath ?? initialSection);

  useEffect(() => {
    if (sectionFromPath) {
      setActiveSection(sectionFromPath);
    } else if (open) {
      setActiveSection(initialSection);
    }
  }, [open, initialSection, sectionFromPath]);

  const handleSectionChange = useCallback((key: string) => {
    setActiveSection(key);
  }, []);

  // The `__session` cookie is a short-lived JWT that only a document request
  // can refresh through Clerk's handshake redirect. A fetch that relies on it
  // alone starts 401ing as soon as it goes stale, so mint a fresh token the
  // way the chat sync client does and send it explicitly.
  const { getToken } = useSession();
  const authedHeaders = useCallback(
    async (base?: Record<string, string>): Promise<Record<string, string>> => {
      const token = await getToken();
      return { ...base, ...(token ? { Authorization: `Bearer ${token}` } : {}) };
    },
    [getToken],
  );

  const [connectedConnectors, setConnectedConnectors] = useState<
    { connectorId: string; connectedAt?: string; needsReauthorization?: boolean }[]
  >([]);
  // OAuth grants the server reports as expired or revoked. `/api/connectors`
  // has always returned this per row; nothing outside the Connectors page read
  // it, so a connector could stop working and the only way to find out was to
  // open that one page and scroll to the right row.
  const [expiredConnectorIds, setExpiredConnectorIds] = useState<string[]>([]);
  const [githubInstallations, setGithubInstallations] = useState<
    { installation_id: number; created_at?: string }[]
  >([]);
  // Connector ids the server reports as actually connectable on web (GET
  // /api/connectors `available`): github when the GitHub App is configured, plus
  // operator-mapped remote MCP connectors. Drives canConnect instead of a
  // build-time hardcoded false.
  const [availableIds, setAvailableIds] = useState<string[]>([]);
  const [customConnectors, setCustomConnectors] = useState<
    { id: string; name: string; url: string; createdAt: string }[]
  >([]);

  const [connectorsLoading, setConnectorsLoading] = useState(false);
  const [connectorsError, setConnectorsError] = useState<string | null>(null);
  const [connectorsNotice, setConnectorsNotice] = useState<string | null>(null);
  const [githubInstallationsNotice, setGithubInstallationsNotice] = useState<string | null>(null);

  const refreshCustomConnectors = useCallback(async () => {
    const response = await fetch('/api/connectors/custom', {
      credentials: 'include',
      headers: await authedHeaders(),
    });
    if (!response.ok) throw new Error('Custom connector directory request failed.');
    const body = await response.json();
    const parsed = CustomConnectorsResponseSchema.safeParse(body);
    if (parsed.success) {
      setCustomConnectors(parsed.data.connectors);
      return;
    }
    const fallback = readCustomConnectorResponse(body);
    if (!fallback) throw new Error('Custom connector directory returned invalid data.');
    setCustomConnectors(fallback.rows);
    if (fallback.degraded) {
      setConnectorsNotice(
        'Some connector data could not be read. Valid connectors remain available; retry to refresh.',
      );
    }
  }, [authedHeaders]);

  const loadConnectors = useCallback(
    async (signal?: AbortSignal) => {
      setConnectorsLoading(true);
      setConnectorsError(null);
      setConnectorsNotice(null);
      setGithubInstallationsNotice(null);
      try {
        const requestOptions = {
          credentials: 'include' as const,
          headers: await authedHeaders(),
          ...(signal ? { signal } : {}),
        };
        const [connectorsResponse, installationsResponse, customResponse] = await Promise.all([
          fetch('/api/connectors', requestOptions),
          fetch('/api/github/installations', requestOptions),
          fetch('/api/connectors/custom', requestOptions),
        ]);
        if (!connectorsResponse.ok || !customResponse.ok) {
          const status = [connectorsResponse, customResponse].find(
            (response) => !response.ok,
          )?.status;
          throw new ConnectorLoadError('status', status ?? null);
        }
        const [connectorsJson, customJson] = await Promise.all([
          connectorsResponse.json(),
          customResponse.json(),
        ]);
        const connectorsResult = ConnectorsResponseSchema.safeParse(connectorsJson);
        const customResult = CustomConnectorsResponseSchema.safeParse(customJson);
        const connectorsFallback = connectorsResult.success
          ? {
              rows: connectorsResult.data.connectors,
              available: connectorsResult.data.available ?? [],
              degraded: false,
            }
          : readConnectorResponse(connectorsJson);
        const customFallback = customResult.success
          ? { rows: customResult.data.connectors, degraded: false }
          : readCustomConnectorResponse(customJson);
        if (!connectorsFallback || !customFallback) {
          throw new ConnectorLoadError('invalid-data');
        }
        if (signal?.aborted) return;
        setConnectedConnectors(connectorsFallback.rows);
        setAvailableIds(connectorsFallback.available);
        setExpiredConnectorIds(
          connectorsFallback.rows
            .filter((connector) => connector.needsReauthorization)
            .map((connector) => connector.connectorId),
        );
        setCustomConnectors(customFallback.rows);
        if (connectorsFallback.degraded || customFallback.degraded) {
          setConnectorsNotice(
            'Some connector data could not be read. Valid connectors remain available; retry to refresh.',
          );
        }

        // Deliberately isolated from the try/catch above: a malformed body or
        // JSON parse failure here must still degrade to the scoped notice,
        // never escalate to the blocking connectorsError.
        if (!installationsResponse.ok) {
          setGithubInstallations([]);
          setGithubInstallationsNotice(GITHUB_INSTALLATIONS_NOTICE);
        } else {
          try {
            const installationsResult = GitHubInstallationsResponseSchema.safeParse(
              await installationsResponse.json(),
            );
            if (installationsResult.success) {
              setGithubInstallations(installationsResult.data.installations);
            } else {
              setGithubInstallations([]);
              setGithubInstallationsNotice(GITHUB_INSTALLATIONS_NOTICE);
            }
          } catch {
            setGithubInstallations([]);
            setGithubInstallationsNotice(GITHUB_INSTALLATIONS_NOTICE);
          }
        }
      } catch (error) {
        if (signal?.aborted) return;
        setConnectorsError(
          error instanceof ConnectorLoadError && error.kind === 'invalid-data'
            ? 'Connectors returned data this page could not read. Try again, or contact support if it persists.'
            : loadFailureMessage(
                'Connectors',
                error instanceof ConnectorLoadError ? new LoadFailure(error.status) : error,
              ),
        );
      } finally {
        if (!signal?.aborted) setConnectorsLoading(false);
      }
    },
    [authedHeaders],
  );

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    void loadConnectors(controller.signal);
    return () => {
      controller.abort();
    };
  }, [loadConnectors, open]);

  const customSettingsConnectors = useMemo(
    () =>
      customConnectors.map((c) => ({
        id: `custom-${c.id}`,
        name: c.name,
        description: c.url,
        category: 'Custom',
        authType: 'custom_mcp',
        actionCount: 0,
        phase: 1,
        iconBg: 'from-slate-500 to-slate-600',
        iconText: 'MCP',
        canConnect: false,
      })),
    [customConnectors],
  );

  const [toolPermissionsConnectorId, setToolPermissionsConnectorId] = useState<string | null>(null);
  const [apiKeyConnectorId, setApiKeyConnectorId] = useState<string | null>(null);

  const mergedSettingsConnectors = useMemo(
    () =>
      [
        ...SETTINGS_CONNECTORS.map((c) =>
          availableIds.includes(c.id) ? { ...c, canConnect: true, statusLabel: undefined } : c,
        ),
        ...customSettingsConnectors,
      ] as typeof SETTINGS_CONNECTORS,
    [availableIds, customSettingsConnectors],
  );

  const mergedConnectedConnectors = useMemo(() => {
    // Drop github AND custom rows from the raw /api/connectors list: github is
    // re-derived from real installations below, and custom rows are re-pushed
    // from the richer /api/connectors/custom fetch (this modal keys customs by
    // `custom-<row uuid>` because its remove flow slices the uuid back out;
    // the API's connectorId uses `custom-<shortId>`, the chat serverId).
    const rows = connectedConnectors
      .filter((c) => c.connectorId !== 'github' && !c.connectorId.startsWith('custom-'))
      .map((c) => ({
        connectorId: c.connectorId,
        ...(c.connectedAt ? { connectedAt: c.connectedAt } : {}),
        ...(c.needsReauthorization
          ? { status: 'warning' as const, warningLabel: CONNECTOR_REAUTHORIZATION_COPY }
          : {}),
      }));
    if (githubInstallations.length > 0) {
      rows.push({ connectorId: 'github', connectedAt: githubInstallations[0]?.created_at });
    }
    for (const c of customConnectors) {
      rows.push({ connectorId: `custom-${c.id}`, connectedAt: c.createdAt });
    }
    return rows;
  }, [connectedConnectors, githubInstallations, customConnectors]);

  const connectConnector = useCallback(
    async (id: string) => {
      // Web has no working per-provider authorization flow yet, so the catalog
      // is mapped with canConnect: false and the shared panel never invokes
      // this. Kept non-optimistic for when a real flow lands: POST first, only
      // reflect state the server confirmed, surface failures to the panel.
      const connector = SETTINGS_CONNECTORS.find((c) => c.id === id);
      const name = connector?.name ?? id;
      const csrfToken = await getCsrfToken();
      const res = await fetch('/api/connectors', {
        method: 'POST',
        headers: await authedHeaders({
          'Content-Type': 'application/json',
          'x-csrf-token': csrfToken,
        }),
        credentials: 'include',
        body: JSON.stringify({
          connectorId: id,
          ...(connector ? { authType: connector.authType } : {}),
        }),
      });
      if (!res.ok) {
        // GitHub connects through the App install flow: the server answers POST
        // with 409 + installStartPath. Follow it instead of surfacing an error.
        const body = (await res
          .clone()
          .json()
          .catch(() => null)) as {
          error?: string;
          oauthStartPath?: string;
          installStartPath?: string;
          credentialsPath?: string;
        } | null;
        if (res.status === 409 && body?.credentialsPath) {
          setApiKeyConnectorId(id);
          return;
        }
        if (res.status === 409 && typeof window !== 'undefined') {
          if (body?.oauthStartPath) {
            const target = withConnectorReturnPath(
              body.oauthStartPath,
              currentConnectorReturnPath(),
            );
            if (target) {
              const probeUrl = `${target}${target.includes('?') ? '&' : '?'}mode=json`;
              const probeRes = await fetch(probeUrl, {
                headers: await authedHeaders(),
                credentials: 'include',
              });
              const probeBody = (await probeRes.json().catch(() => null)) as {
                authorizeUrl?: string;
                error?: string;
                status?: string;
              } | null;
              if (probeRes.ok && probeBody?.authorizeUrl) {
                window.location.href = probeBody.authorizeUrl;
                return;
              }
              throw new Error(
                (probeBody?.status && brokerOutcomeMessage(probeBody.status, name)) ??
                  probeBody?.error ??
                  `Could not connect ${name}.`,
              );
            }
          }
          if (body?.installStartPath) {
            window.location.href = body.installStartPath;
            return;
          }
        }
        throw new Error(body?.error ?? `Could not connect ${name}.`);
      }
      const json = (await res.json()) as {
        connector: { connectorId: string; connectedAt?: string };
      };
      setConnectedConnectors((prev) => [
        ...prev.filter((c) => c.connectorId !== id),
        { connectorId: json.connector.connectorId, connectedAt: json.connector.connectedAt },
      ]);
    },
    [authedHeaders],
  );

  const disconnectConnector = useCallback(
    async (id: string) => {
      const csrfToken = await getCsrfToken();
      if (id === 'github') {
        // GitHub "connected" state is its App installations; disconnect
        // removes each installation via the real installations endpoint.
        for (const installation of githubInstallations) {
          const res = await fetch('/api/github/installations', {
            method: 'DELETE',
            headers: await authedHeaders({
              'Content-Type': 'application/json',
              'x-csrf-token': csrfToken,
            }),
            credentials: 'include',
            body: JSON.stringify({ installationId: installation.installation_id }),
          });
          if (!res.ok) {
            throw new Error('Could not disconnect GitHub. Try again.');
          }
        }
        setGithubInstallations([]);
        return;
      }
      if (id.startsWith('custom-')) {
        const rowId = id.slice('custom-'.length);
        const res = await fetch(`/api/connectors/custom?id=${encodeURIComponent(rowId)}`, {
          method: 'DELETE',
          headers: await authedHeaders({ 'x-csrf-token': csrfToken }),
          credentials: 'include',
        });
        if (!res.ok) {
          throw new Error('Could not remove this connector. Try again.');
        }
        setCustomConnectors((prev) => prev.filter((c) => c.id !== rowId));
        return;
      }
      const res = await fetch(`/api/connectors?connectorId=${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: await authedHeaders({ 'x-csrf-token': csrfToken }),
        credentials: 'include',
      });
      if (!res.ok) {
        throw new Error('Could not disconnect. Try again.');
      }
      setConnectedConnectors((prev) => prev.filter((c) => c.connectorId !== id));
    },
    [authedHeaders, githubInstallations],
  );

  // ── Skills state ───────────────────────────────────────────────────────────

  const [skills, setSkills] = useState<SettingsSkill[]>([]);
  const [skillsLoading, setSkillsLoading] = useState(false);
  const [skillsError, setSkillsError] = useState<string | null>(null);
  const [canAuthorSkills, setCanAuthorSkills] = useState(false);
  const [pluginCatalog, setPluginCatalog] = useState<SettingsPlugin[]>([]);
  const [pluginsLoading, setPluginsLoading] = useState(false);
  const [pluginsLoaded, setPluginsLoaded] = useState(false);
  const [pluginsError, setPluginsError] = useState<string | null>(null);
  const [pluginMutationIds, setPluginMutationIds] = useState<Set<string>>(new Set());
  const [pluginMutationErrors, setPluginMutationErrors] = useState<Record<string, string>>({});

  const loadSkills = useCallback(async (signal?: AbortSignal) => {
    setSkillsLoading(true);
    setSkillsError(null);
    try {
      const catalog = await loadSkillsCatalog();
      if (signal?.aborted) return;
      setCanAuthorSkills(skillAuthoringCapability());
      setSkills(
        catalog.map((skill: ApiSkill) => ({
          id: skill.name,
          name: skill.name,
          description: skill.description ?? '',
          source: skill.source,
          tab: skill.source === 'bundled' ? 'prompts' : 'agents',
          statusLabel: skill.lifecycle === 'draft' ? 'Coming later' : 'Included',
          ...(skill.version ? { version: skill.version } : {}),
          ...(skill.downloadable
            ? { downloadHref: `/api/skills/${encodeURIComponent(skill.name)}/download` }
            : {}),
          ...(skill.editable ? { editable: true } : {}),
        })),
      );
    } catch (error) {
      if (signal?.aborted) return;
      setSkillsError(loadFailureMessage('Skills', error));
    } finally {
      if (!signal?.aborted) setSkillsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open || !['connectors', 'skills', 'plugins'].includes(activeSection)) return;
    if (skills.length > 0) return;
    const controller = new AbortController();
    void loadSkills(controller.signal);
    return () => {
      controller.abort();
    };
  }, [open, activeSection, skills.length, loadSkills]);

  // ── Skill editor (create/edit/delete) ──────────────────────────────────────

  const [skillEditorMode, setSkillEditorMode] = useState<'create' | 'edit' | null>(null);
  const [editingSkillName, setEditingSkillName] = useState<string | null>(null);
  const [editingSkillBody, setEditingSkillBody] = useState<string | null>(null);
  const [editingSkillBodyLoading, setEditingSkillBodyLoading] = useState(false);
  const [editingSkillBodyError, setEditingSkillBodyError] = useState<string | null>(null);
  const [skillSubmitting, setSkillSubmitting] = useState(false);
  const [skillSubmitError, setSkillSubmitError] = useState<string | null>(null);
  const [skillMutationIds, setSkillMutationIds] = useState<Set<string>>(new Set());
  const [skillMutationErrors, setSkillMutationErrors] = useState<Record<string, string>>({});

  const closeSkillEditor = useCallback(() => {
    setSkillEditorMode(null);
    setEditingSkillName(null);
    setEditingSkillBody(null);
    setEditingSkillBodyError(null);
    setSkillSubmitError(null);
  }, []);

  const onCreateSkill = useCallback(() => {
    setSkillSubmitError(null);
    setEditingSkillName(null);
    setEditingSkillBody(null);
    setEditingSkillBodyError(null);
    setSkillEditorMode('create');
  }, []);

  const editSkill = useCallback(
    (skill: SettingsSkill) => {
      setSkillSubmitError(null);
      setEditingSkillName(skill.name);
      setEditingSkillBody(null);
      setEditingSkillBodyError(null);
      setSkillEditorMode('edit');
      setEditingSkillBodyLoading(true);
      void (async () => {
        try {
          const res = await fetch(`/api/skills/${encodeURIComponent(skill.name)}`, {
            credentials: 'include',
            headers: await authedHeaders(),
          });
          if (!res.ok) throw new Error('Could not load this skill.');
          const body = (await res.json()) as { body: string };
          setEditingSkillBody(body.body);
        } catch (error) {
          setEditingSkillBodyError(toUserMessage(error, 'Could not load this skill.'));
        } finally {
          setEditingSkillBodyLoading(false);
        }
      })();
    },
    [authedHeaders],
  );

  const submitSkillDraft = useCallback(
    async (draft: SkillDraft) => {
      setSkillSubmitting(true);
      setSkillSubmitError(null);
      try {
        const csrfToken = await getCsrfToken();
        const isEdit = skillEditorMode === 'edit' && editingSkillName !== null;
        const res = await fetch(
          isEdit ? `/api/skills/${encodeURIComponent(editingSkillName)}` : '/api/skills',
          {
            method: isEdit ? 'PUT' : 'POST',
            credentials: 'include',
            headers: await authedHeaders({
              'Content-Type': 'application/json',
              'x-csrf-token': csrfToken,
            }),
            body: JSON.stringify(draft),
          },
        );
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as {
            error?: { message?: string };
          } | null;
          throw new Error(body?.error?.message ?? 'Could not save this skill.');
        }
        closeSkillEditor();
        setSkills([]);
        announceSkillCatalogChanged();
      } catch (error) {
        setSkillSubmitError(toUserMessage(error, 'Could not save this skill.'));
      } finally {
        setSkillSubmitting(false);
      }
    },
    [authedHeaders, closeSkillEditor, editingSkillName, skillEditorMode],
  );

  const removeSkill = useCallback(
    async (id: string) => {
      setSkillMutationIds((current) => new Set(current).add(id));
      setSkillMutationErrors((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
      try {
        const csrfToken = await getCsrfToken();
        const res = await fetch(`/api/skills/${encodeURIComponent(id)}`, {
          method: 'DELETE',
          credentials: 'include',
          headers: await authedHeaders({ 'x-csrf-token': csrfToken }),
        });
        if (!res.ok) throw new Error('Could not delete this skill.');
        setSkills((current) => current.filter((skill) => skill.id !== id));
        announceSkillCatalogChanged();
      } catch (error) {
        setSkillMutationErrors((current) => ({
          ...current,
          [id]: toUserMessage(error, 'Could not delete this skill.'),
        }));
      } finally {
        setSkillMutationIds((current) => {
          const next = new Set(current);
          next.delete(id);
          return next;
        });
      }
    },
    [authedHeaders],
  );

  const visibleSkills = useMemo(
    () =>
      skills.map((skill) => ({
        ...skill,
        mutating: skillMutationIds.has(skill.id),
        ...(skillMutationErrors[skill.id] ? { error: skillMutationErrors[skill.id] } : {}),
      })),
    [skills, skillMutationErrors, skillMutationIds],
  );

  const loadPlugins = useCallback(async (signal?: AbortSignal) => {
    setPluginsLoading(true);
    setPluginsError(null);
    try {
      const [catalogResponse, installationsResponse] = await Promise.all([
        fetch('/api/plugins?limit=100', { credentials: 'include', cache: 'no-store', signal }),
        fetch('/api/plugins/installations', { credentials: 'include', signal }),
      ]);
      if (!catalogResponse.ok || !installationsResponse.ok) {
        throw new LoadFailure(
          [catalogResponse, installationsResponse].find((response) => !response.ok)?.status ?? null,
        );
      }
      const [catalogJson, installationsJson] = await Promise.all([
        catalogResponse.json(),
        installationsResponse.json(),
      ]);
      const catalog = ApiPluginsResponseSchema.safeParse(catalogJson);
      const installations = PluginInstallationsResponseSchema.safeParse(installationsJson);
      if (!catalog.success || !installations.success) {
        throw new Error('Plugin directory returned invalid data.');
      }
      if (signal?.aborted) return;
      const installationByPlugin = new Map(
        installations.data.installations.map((installation) => [
          installation.pluginId,
          installation,
        ]),
      );
      setPluginCatalog(
        catalog.data.entries.map((plugin) => {
          const installation = installationByPlugin.get(plugin.id);
          return {
            id: plugin.id,
            name: plugin.name,
            description: plugin.description,
            enabled: installation?.enabled ?? false,
            installed: Boolean(installation),
            installable: plugin.webInstallable,
            author: plugin.publisher.name,
            category: plugin.category,
            skillCount: plugin.declaredSkills.length,
            declaredSkills: plugin.declaredSkills,
            skillsRequireInstall: plugin.skillsRequireInstall,
            requiredConnectors: plugin.requiredConnectors,
            examplePrompts: plugin.examplePrompts,
            ...(typeof plugin.installCount === 'number'
              ? { installCount: plugin.installCount }
              : {}),
            updatedAt: plugin.updatedAt,
            statusLabel: plugin.webInstallable
              ? 'Available on Web'
              : plugin.status === 'preview'
                ? 'Coming later'
                : plugin.status === 'deprecated'
                  ? 'Deprecated'
                  : plugin.distribution
                    ? 'Available in CLI/Desktop'
                    : 'Unavailable',
            detailsHref: `/plugins/${plugin.id}`,
          } satisfies SettingsPlugin;
        }),
      );
    } catch (error) {
      if (signal?.aborted) return;
      setPluginsError(loadFailureMessage('Plugins', error));
      setPluginCatalog([]);
    } finally {
      if (!signal?.aborted) {
        setPluginsLoading(false);
        setPluginsLoaded(true);
      }
    }
  }, []);

  useEffect(() => {
    if (!open || !['connectors', 'skills', 'plugins'].includes(activeSection)) return;
    if (pluginsLoaded) return;
    const controller = new AbortController();
    void loadPlugins(controller.signal);
    return () => {
      controller.abort();
    };
  }, [open, activeSection, pluginsLoaded, loadPlugins]);

  const mutatePlugin = useCallback(async (pluginId: string, request: () => Promise<Response>) => {
    setPluginMutationIds((current) => new Set(current).add(pluginId));
    setPluginMutationErrors((current) => {
      const next = { ...current };
      delete next[pluginId];
      return next;
    });
    try {
      const response = await request();
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        throw new Error(body?.error?.message ?? 'Plugin update failed.');
      }
      setPluginCatalog([]);
      setPluginsLoaded(false);
      setSkills([]);
      announceSkillCatalogChanged();
    } catch (error) {
      setPluginMutationErrors((current) => ({
        ...current,
        [pluginId]: toUserMessage(error, 'Plugin update failed.'),
      }));
    } finally {
      setPluginMutationIds((current) => {
        const next = new Set(current);
        next.delete(pluginId);
        return next;
      });
    }
  }, []);

  const installPlugin = useCallback(
    async (pluginId: string) => {
      const csrfToken = await getCsrfToken();
      await mutatePlugin(pluginId, () =>
        fetch('/api/plugins/installations', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken },
          body: JSON.stringify({ pluginId }),
        }),
      );
    },
    [mutatePlugin],
  );

  const setPluginEnabled = useCallback(
    async (pluginId: string, enabled: boolean) => {
      const csrfToken = await getCsrfToken();
      await mutatePlugin(pluginId, () =>
        fetch(`/api/plugins/installations/${encodeURIComponent(pluginId)}`, {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken },
          body: JSON.stringify({ enabled }),
        }),
      );
    },
    [mutatePlugin],
  );

  const removePlugin = useCallback(
    async (pluginId: string) => {
      const csrfToken = await getCsrfToken();
      await mutatePlugin(pluginId, () =>
        fetch(`/api/plugins/installations/${encodeURIComponent(pluginId)}`, {
          method: 'DELETE',
          credentials: 'include',
          headers: { 'x-csrf-token': csrfToken },
        }),
      );
    },
    [mutatePlugin],
  );

  const visiblePluginCatalog = useMemo(
    () =>
      pluginCatalog.map((plugin) => ({
        ...plugin,
        mutating: pluginMutationIds.has(plugin.id),
        ...(pluginMutationErrors[plugin.id] ? { error: pluginMutationErrors[plugin.id] } : {}),
      })),
    [pluginCatalog, pluginMutationErrors, pluginMutationIds],
  );

  // ── Data adapter ───────────────────────────────────────────────────────────

  const addCustomConnector = useCallback(
    async (input: { name: string; url: string; authToken?: string }) => {
      const csrfToken = await getCsrfToken();
      const res = await fetch('/api/connectors/custom', {
        method: 'POST',
        headers: await authedHeaders({
          'Content-Type': 'application/json',
          'x-csrf-token': csrfToken,
        }),
        credentials: 'include',
        body: JSON.stringify({
          name: input.name,
          url: input.url,
          ...(input.authToken ? { authToken: input.authToken } : {}),
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? 'Could not add connector. Try again.');
      }
      await refreshCustomConnectors();
    },
    [authedHeaders, refreshCustomConnectors],
  );

  // Attention badge on the Connectors nav row, so an expired grant is visible
  // from any settings tab rather than only from inside Connectors.
  const toolPermissionsConnector = useMemo(() => {
    if (!toolPermissionsConnectorId) return null;
    const match = mergedSettingsConnectors.find((c) => c.id === toolPermissionsConnectorId);
    if (!match) return null;
    return {
      id: match.id,
      name: match.name,
      iconText: match.iconText,
      iconBg: match.iconBg,
    };
  }, [mergedSettingsConnectors, toolPermissionsConnectorId]);

  const navBadges = useMemo(
    () =>
      expiredConnectorIds.length > 0
        ? {
            connectors: {
              count: expiredConnectorIds.length,
              description:
                expiredConnectorIds.length === 1
                  ? '1 connector needs to be reconnected'
                  : `${expiredConnectorIds.length} connectors need to be reconnected`,
            },
          }
        : undefined,
    [expiredConnectorIds],
  );

  const adapter: SettingsDataAdapter = {
    connectors: mergedSettingsConnectors,
    connectedConnectors: mergedConnectedConnectors,
    connectorsLoading,
    connectorsError,
    connectorsNotice:
      [connectorsNotice, githubInstallationsNotice].filter(Boolean).join(' ') || null,
    retryConnectors: loadConnectors,
    connectConnector,
    disconnectConnector,
    addCustomConnector,
    customConnectorAuthTokenSupported: true,
    skills: visibleSkills,
    skillsLoading,
    skillsError,
    retrySkills: loadSkills,
    ...(canAuthorSkills ? { onCreateSkill, editSkill, removeSkill } : {}),
    plugins: visiblePluginCatalog.filter((plugin) => plugin.installed),
    pluginsLoading,
    pluginsError,
    retryPlugins: loadPlugins,
    pluginCatalog: visiblePluginCatalog,
    installPlugin,
    setPluginEnabled,
    removePlugin,
  };

  const directoryAdapter = useDirectoryAdapter({
    ...(canAuthorSkills
      ? {
          onCreateSkill,
          onEditSkill: (name: string) => editSkill({ name } as SettingsSkill),
          createSkillLabel: NEW_SKILL_LABEL,
        }
      : {}),
    curatedConnectors: mergedSettingsConnectors,
    connectedConnectors: mergedConnectedConnectors,
    connectorsError,
    connectorsNotice:
      [connectorsNotice, githubInstallationsNotice].filter(Boolean).join(' ') || null,
    renderConnectorDetailFooter: (connectorId: string, detail: DirectoryConnectorDetail) => (
      <div className="flex flex-col gap-3">
        {apiKeyConnectorId === connectorId ? (
          <ConnectorApiKeyForm
            connectorId={connectorId}
            onConnected={() => {
              setApiKeyConnectorId(null);
              void loadConnectors();
              void directoryAdapter.loadSection?.('connectors');
            }}
            onCancel={() => setApiKeyConnectorId(null)}
          />
        ) : null}
        {detail.connected || (detail.tools?.length ?? 0) > 0 ? (
          <button
            type="button"
            onClick={() => setToolPermissionsConnectorId(connectorId)}
            className="w-full rounded-lg border border-border px-3 py-2 text-left text-xs text-foreground transition-colors hover:bg-muted"
          >
            <span className="font-medium">{TOOL_PERMISSIONS_LABEL}</span>
            <span className="mt-0.5 block text-muted-foreground">{TOOL_PERMISSIONS_HINT}</span>
          </button>
        ) : null}
      </div>
    ),
    onRetryConnectors: loadConnectors,
    onConnectConnector: connectConnector,
    onDisconnectConnector: disconnectConnector,
  });

  const sectionContent: Record<WebSettingsContentSection, React.ReactNode> = {
    general: <GeneralSection />,
    account: <AccountSection />,
    team: (
      <div style={{ display: 'grid', gap: 16 }}>
        <WorkspaceConsolePointer />
        <TeamSection />
      </div>
    ),
    security: <SecuritySection />,
    safety: <SafetySection />,
    privacy: <PrivacySection />,
    archived: <ArchivedChatsSection />,
    'deleted-chats': <DeletedChatsSection />,
    'shared-links': <SharedLinksSection />,
    billing: <BillingSection />,
    usage: <UsageSection />,
    capabilities: <CapabilitiesSection />,
    memory: <MemorySection />,
    notifications: <NotificationsSection />,
    voice: <VoiceSection />,
    reflect: <ReflectSection />,
    'time-focus': <TimeFocusSection />,
    help: <HelpSection />,
    // connectors / skills / plugins fall through to adapter-driven built-in panels
  };

  return (
    <Suspense fallback={<SectionSkeleton />}>
      <SettingsSectionNavigationProvider onNavigate={handleSectionChange} onExit={onClose}>
        <SettingsModal
          open={open}
          onClose={onClose}
          activeSection={activeSection}
          onSectionChange={handleSectionChange}
          sectionContent={sectionContent}
          navGroups={WEB_SETTINGS_NAV_GROUPS}
          adapter={adapter}
          directoryAdapter={directoryAdapter}
          connectorDisclosure={<ConnectorConsentSummary />}
          renderConnectorScopes={(connectorId) => <ConnectorScopeList connectorId={connectorId} />}
          renderConnectorCapabilities={(connectorId) => (
            <ConnectorCapabilitiesPanel connectorRef={connectorId} connected />
          )}
          workRole={workRole}
          renderConnectorToolPermissions={(connectorId) => (
            <button
              type="button"
              onClick={() => setToolPermissionsConnectorId(connectorId)}
              className="w-full rounded-lg border border-border px-3 py-2 text-left text-xs text-foreground transition-colors hover:bg-muted"
            >
              <span className="font-medium">Tool permissions</span>
              <span className="mt-0.5 block text-muted-foreground">
                Choose when the assistant may use each of this connector&rsquo;s tools.
              </span>
            </button>
          )}
          navBadges={navBadges}
          title="Settings"
        />
        <ToolPermissionsPanel
          connector={toolPermissionsConnector}
          open={toolPermissionsConnector !== null}
          onOpenChange={(next) => {
            if (!next) setToolPermissionsConnectorId(null);
          }}
        />
        <SkillEditorDialog
          open={skillEditorMode !== null}
          onOpenChange={(next) => {
            if (!next) closeSkillEditor();
          }}
          mode={skillEditorMode ?? 'create'}
          initialSkill={
            skillEditorMode === 'edit' && editingSkillName !== null
              ? {
                  name: editingSkillName,
                  description:
                    skills.find((skill) => skill.name === editingSkillName)?.description ?? '',
                  body: editingSkillBody ?? '',
                }
              : null
          }
          bodyLoading={editingSkillBodyLoading}
          bodyError={editingSkillBodyError}
          submitting={skillSubmitting}
          submitError={skillSubmitError}
          onSubmit={submitSkillDraft}
        />
      </SettingsSectionNavigationProvider>
    </Suspense>
  );
}
