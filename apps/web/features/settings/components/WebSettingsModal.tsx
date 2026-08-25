'use client';

/**
 * WebSettingsModal — wires the shared @agiworkforce/ui SettingsModal shell
 * to real section content from features/settings/sections/*.
 *
 * Section content is imported from dedicated Section components (NOT from
 * route pages, which are now <SettingsModalRedirect> stubs for deep-linking).
 *
 * Sections wired:
 *   general      -> GeneralSection  (profile + preferences + danger zone)
 *   account      -> AccountSection  (sessions, user ID, logout)
 *   team         -> TeamSection     (workspace + member administration)
 *   security     -> SecuritySection (2FA, session timeout, change password)
 *   safety       -> SafetySection (strict content admission)
 *   privacy      -> PrivacySection  (toggles, export, delete)
 *   archived      -> ArchivedChatsSection (restore + permanent delete)
 *   deleted-chats -> DeletedChatsSection (restore soft-deleted conversations)
 *   shared-links -> SharedLinksSection (review + revoke)
 *   billing      -> BillingSection  (plan, payment, invoices)
 *   usage        -> UsageSection    (credit bars, analytics)
 *   capabilities -> CapabilitiesSection (memory, tools, artifacts)
 *   memory       -> MemorySection   (MemoryEditor)
 *   notifications -> NotificationsSection (browser/email/mobile-push toggles)
 *   voice        -> VoiceSection    (dictation + managed-voice availability, mirrors /settings/voice)
 *   reflect      -> ReflectSection (on-demand account activity recap)
 *   time-focus   -> TimeFocusSection (account-wide quiet hours + break reminders)
 *   help         -> HelpSection (docs, support, status, release notes, legal)
 *   connectors   -> ConnectorsPanel (built-in to shared shell via adapter)
 *   skills       -> SkillsPanel     (built-in to shared shell via adapter)
 *   plugins      -> PluginsPanel    (built-in to shared shell via adapter)
 */

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from '@clerk/nextjs';
import { useBillingStore } from '@shared/stores/web-auth-store';
import { z } from 'zod';
import { Mic } from 'lucide-react';
import { SettingsModal, SETTINGS_NAV_GROUPS_WEB } from '@agiworkforce/ui';
import type {
  SettingsDataAdapter,
  SettingsNavGroupResolved,
  SettingsPlugin,
  SettingsSkill,
} from '@agiworkforce/ui';
import { CONNECTORS } from '@/features/connectors/data/connectors';
import { ConnectorConsentSummary } from '@/features/connectors/components/ConnectorConsentSummary';
import { ToolPermissionsPanel } from '@/features/connectors/components/ToolPermissionsPanel';
import { getCsrfToken } from '@/lib/client/csrf';
import { announceSkillCatalogChanged } from '@shared/events/skill-catalog-events';

// Section components — real wired content, NOT route stubs
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
import {
  ManagedSkillsResponseSchema,
  type ManagedSkillSummary as ApiSkill,
} from '@agiworkforce/cloud-contracts';
import { toUserMessage } from '@/lib/user-error-message';

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
      status: z.enum(['preview', 'published', 'deprecated']),
      webInstallable: z.boolean(),
      publisher: z.object({ name: z.string().min(1) }),
      declaredSkills: z.array(z.string()),
      requiredConnectors: z.array(z.string()).default([]),
      distribution: z.object({ manifestUrl: z.string().url() }).passthrough().nullable(),
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

class ConnectorLoadError extends Error {
  constructor(readonly kind: 'signed-out' | 'request' | 'invalid-data') {
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

// ---------------------------------------------------------------------------
// URL segment -> section key mapping.
//
// INBOUND ONLY. This resolves a deep link (`/settings/<segment>`) to the
// section the modal should open at. Nothing writes the URL in the other
// direction — see handleSectionChange for why.
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// AUDIT-FIX settings-27: `voice` is deliberately NOT added to the shared
// `SETTINGS_NAV_GROUPS_WEB` in @agiworkforce/ui — that constant also drives
// apps/desktop's Cloud settings nav (DESKTOP_CLOUD_SETTINGS_NAV maps over it
// directly with no section content for a Cloud-side Voice tab; Desktop's own
// voice settings are Local-only, a different surface). Adding the key there
// would silently regress Desktop Cloud settings to the exact "nav item with
// no content behind it" bug its own test suite guards against. Web-only
// insertion here, mirroring how DesktopCloudSettingsModal already injects its
// own extra items (`cowork`, `archived`, `shared-links`) on top of the same
// shared array instead of editing it.
// ---------------------------------------------------------------------------

const WEB_SETTINGS_NAV_GROUPS: SettingsNavGroupResolved[] = SETTINGS_NAV_GROUPS_WEB.map(
  (group) => ({
    ...group,
    items: group.items.flatMap((item) =>
      item.key === 'notifications'
        ? [
            item,
            {
              key: 'voice' as const,
              label: 'Voice',
              icon: Mic,
              keywords: ['speech', 'tts', 'microphone', 'audio', 'dictation'],
            },
          ]
        : [item],
    ),
  }),
);

// ---------------------------------------------------------------------------
// Connector catalog -> SettingsConnector shape
//
// HONEST WEB SEMANTICS (known-flaws WEB-CONNECTORS row): the catalog's
// `exclusive` connectors are local-only (filesystem/terminal/browser/vision/
// ollama) — the cloud web server cannot run them, so they are excluded
// entirely. For everything else, POST /api/connectors deliberately 501s
// (no per-provider authorization flow is implemented on web yet), so NO
// connector renders a Connect button here (canConnect: false) — the table
// shows a truthful status label instead of a button that is known to fail.
// Connected state still renders from real data: active user_connectors rows
// (GET /api/connectors) and, for GitHub, real GitHub App installations.
// ---------------------------------------------------------------------------

const SETTINGS_CONNECTORS = CONNECTORS.filter((c) => !c.exclusive).map((c) => ({
  id: c.id,
  name: c.name,
  description: c.description,
  category: c.category,
  authType: c.authType,
  actionCount: c.actionCount,
  phase: c.phase,
  iconBg: c.iconBg,
  iconText: c.iconText,
  canConnect: false,
  statusLabel: c.phase > 1 ? 'Coming soon' : 'Not yet available on web',
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

  // The work description the user gave in General settings. Used only to order
  // connector suggestions — never sent anywhere from here.
  const workRole = useBillingStore((state) => state.user?.profile?.work_description ?? null);

  const [activeSection, setActiveSection] = useState<string>(sectionFromPath ?? initialSection);

  // Sync the active section when the URL changes (deep-link) OR when the modal is
  // (re)opened to a requested section. The modal stays mounted (open=false) between
  // uses, so the useState initializer alone won't pick up a newly-requested
  // initialSection (e.g. the rail's "Customize" → openSettings('general')) — sync on open.
  useEffect(() => {
    if (sectionFromPath) {
      setActiveSection(sectionFromPath);
    } else if (open) {
      setActiveSection(initialSection);
    }
  }, [open, initialSection, sectionFromPath]);

  /**
   * Rail selection is local state. It does NOT navigate.
   *
   * CRIT-008. This used to `router.replace` the section's deep-link route
   * (`/connectors`, `/skills`, `/apps`, `/settings/<segment>`). Every one of
   * those routes renders <SettingsModalRedirect>, whose entire job is to
   * reopen this modal and `router.replace('/chat')` — so the URL bounced
   * straight back one tick later, and the page underneath the modal was
   * unmounted and remounted on every single rail click (twice, plus a server
   * render of the force-dynamic /settings layout). The shareable URL it looked
   * like it was producing never survived the round trip. `help` was worse:
   * `SETTINGS_NAV_GROUPS_WEB` lists it and there is no `/settings/help` route,
   * so clicking Help left the user on a 404.
   *
   * Deep links INTO the modal are unchanged — those routes are the entry
   * points, not the section switcher.
   */
  const handleSectionChange = useCallback((key: string) => {
    setActiveSection(key);
  }, []);

  // ── Connected connectors state ─────────────────────────────────────────────
  // Three REAL sources (no optimistic fakery):
  //   1. Active user_connectors rows (GET /api/connectors) — the per-user
  //      enablement gate.
  //   2. GitHub App installations (GET /api/github/installations) — GitHub
  //      cannot have a user_connectors row (known-flaws WEB-CONNECTORS row);
  //      the installation IS the real "connected" signal, matching what the
  //      chat tool loop actually offers.
  //   3. The user's own custom remote MCP connectors (GET /api/connectors/custom)
  //      — these have no static catalog entry, so they're synthesized into
  //      both `connectors` (the catalog the shared table renders) and
  //      `connectedConnectors` below, namespaced `custom-<row id>` to match
  //      the chat tool loop (lib/user-connector-tools.ts).

  // The `__session` cookie is a short-lived JWT that only a document request
  // can refresh through Clerk's handshake redirect. A fetch that relies on it
  // alone starts 401ing as soon as it goes stale, so mint a fresh token the
  // way the chat sync client does and send it explicitly.
  const { getToken } = useAuth();
  const authedHeaders = useCallback(
    async (base?: Record<string, string>): Promise<Record<string, string>> => {
      const token = await getToken();
      return { ...base, ...(token ? { Authorization: `Bearer ${token}` } : {}) };
    },
    [getToken],
  );

  const [connectedConnectors, setConnectedConnectors] = useState<
    { connectorId: string; connectedAt?: string }[]
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
  // Scoped to the GitHub installations source only — never blocks the rest of
  // the panel (see GITHUB_INSTALLATIONS_NOTICE).
  const [githubInstallationsNotice, setGithubInstallationsNotice] = useState<string | null>(null);

  const refreshCustomConnectors = useCallback(async () => {
    const response = await fetch('/api/connectors/custom', {
      credentials: 'include',
      headers: await authedHeaders(),
    });
    if (!response.ok) throw new Error('Custom connector directory request failed.');
    const parsed = CustomConnectorsResponseSchema.safeParse(await response.json());
    if (!parsed.success) throw new Error('Custom connector directory returned invalid data.');
    setCustomConnectors(parsed.data.connectors);
  }, [authedHeaders]);

  const loadConnectors = useCallback(
    async (signal?: AbortSignal) => {
      setConnectorsLoading(true);
      setConnectorsError(null);
      setGithubInstallationsNotice(null);
      try {
        const requestOptions = {
          credentials: 'include' as const,
          headers: await authedHeaders(),
          ...(signal ? { signal } : {}),
        };
        // All three fetch in parallel — GitHub installations still races
        // alongside the other two — but only /api/connectors and
        // /api/connectors/custom gate the panel. Installations is judged and
        // applied on its own below, so a failure there degrades to a scoped
        // notice instead of taking the whole panel down with it.
        const [connectorsResponse, installationsResponse, customResponse] = await Promise.all([
          fetch('/api/connectors', requestOptions),
          fetch('/api/github/installations', requestOptions),
          fetch('/api/connectors/custom', requestOptions),
        ]);
        if (!connectorsResponse.ok || !customResponse.ok) {
          const status = [connectorsResponse, customResponse].find(
            (response) => !response.ok,
          )?.status;
          throw new ConnectorLoadError(status === 401 || status === 403 ? 'signed-out' : 'request');
        }
        const [connectorsJson, customJson] = await Promise.all([
          connectorsResponse.json(),
          customResponse.json(),
        ]);
        const connectorsResult = ConnectorsResponseSchema.safeParse(connectorsJson);
        const customResult = CustomConnectorsResponseSchema.safeParse(customJson);
        if (!connectorsResult.success || !customResult.success) {
          throw new ConnectorLoadError('invalid-data');
        }
        if (signal?.aborted) return;
        setConnectedConnectors(connectorsResult.data.connectors);
        setAvailableIds(connectorsResult.data.available ?? []);
        setExpiredConnectorIds(
          connectorsResult.data.connectors
            .filter((connector) => connector.needsReauthorization)
            .map((connector) => connector.connectorId),
        );
        setCustomConnectors(customResult.data.connectors);

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
        const kind = error instanceof ConnectorLoadError ? error.kind : 'request';
        setConnectorsError(
          kind === 'signed-out'
            ? 'Your session expired. Reload the page to sign back in, then reopen Connectors.'
            : kind === 'invalid-data'
              ? 'Connectors returned data this page could not read. Try again, or contact support if it persists.'
              : 'Connectors could not be loaded. Check your connection and try again.',
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

  // Per-tool connector permissions are enforced on every turn
  // (tool-loop connector-tool-permissions) and were previously only reachable
  // from the standalone /connectors page, which signed-in users are redirected
  // away from — so the rules applied to a user were invisible to them.
  const [toolPermissionsConnectorId, setToolPermissionsConnectorId] = useState<string | null>(null);

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
    const rows = connectedConnectors.filter(
      (c) => c.connectorId !== 'github' && !c.connectorId.startsWith('custom-'),
    );
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
      if (!connector) return;
      const csrfToken = await getCsrfToken();
      const res = await fetch('/api/connectors', {
        method: 'POST',
        headers: await authedHeaders({
          'Content-Type': 'application/json',
          'x-csrf-token': csrfToken,
        }),
        credentials: 'include',
        body: JSON.stringify({ connectorId: id, authType: connector.authType }),
      });
      if (!res.ok) {
        // GitHub connects through the App install flow: the server answers POST
        // with 409 + installStartPath. Follow it instead of surfacing an error.
        const body = (await res
          .clone()
          .json()
          .catch(() => null)) as { error?: string; installStartPath?: string } | null;
        if (res.status === 409 && body?.installStartPath && typeof window !== 'undefined') {
          window.location.href = body.installStartPath;
          return;
        }
        throw new Error(body?.error ?? `Could not connect ${connector.name}.`);
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
      const response = await fetch('/api/skills', signal ? { signal } : undefined);
      if (!response.ok) throw new Error('Skills request failed.');
      const parsed = ManagedSkillsResponseSchema.safeParse(await response.json());
      if (!parsed.success) throw new Error('Skills request returned invalid data.');
      if (signal?.aborted) return;
      setSkills(
        parsed.data.skills.map((skill: ApiSkill) => ({
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
        })),
      );
    } catch (error) {
      if (signal?.aborted) return;
      setSkillsError('Skills could not be loaded. Check your connection and try again.');
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

  const loadPlugins = useCallback(async (signal?: AbortSignal) => {
    setPluginsLoading(true);
    setPluginsError(null);
    try {
      const [catalogResponse, installationsResponse] = await Promise.all([
        fetch('/api/plugins?limit=100', { credentials: 'include', cache: 'no-store', signal }),
        fetch('/api/plugins/installations', { credentials: 'include', signal }),
      ]);
      if (!catalogResponse.ok || !installationsResponse.ok) {
        throw new Error('Plugin directory request failed.');
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
            skillCount: plugin.declaredSkills.length,
            declaredSkills: plugin.declaredSkills,
            requiredConnectors: plugin.requiredConnectors,
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
    } catch {
      if (signal?.aborted) return;
      setPluginsError('Plugins could not be loaded. Check your connection and try again.');
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

  // Custom remote-MCP connectors: persisted via POST /api/connectors/custom
  // (live connect-and-list + encrypted-at-rest bearer token — see
  // lib/user-connector-tools.ts). Bearer-token auth only; OAuth
  // client-credentials aren't supported yet, so the form no longer collects
  // them (the dead Advanced-settings OAuth fields were removed).
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
    connectorsNotice: githubInstallationsNotice,
    retryConnectors: loadConnectors,
    connectConnector,
    disconnectConnector,
    addCustomConnector,
    customConnectorAuthTokenSupported: true,
    skills,
    skillsLoading,
    skillsError,
    retrySkills: loadSkills,
    plugins: visiblePluginCatalog.filter((plugin) => plugin.installed),
    pluginsLoading,
    pluginsError,
    retryPlugins: loadPlugins,
    pluginCatalog: visiblePluginCatalog,
    installPlugin,
    setPluginEnabled,
    removePlugin,
  };

  // ── Section content map ────────────────────────────────────────────────────
  // Each value is the real wired Section component — NOT the route stub pages.

  const sectionContent: Partial<Record<string, React.ReactNode>> = {
    general: <GeneralSection />,
    account: <AccountSection />,
    // Membership stays here because a plain member legitimately needs it — to
    // see who is in their workspace and to leave it. Policy, sharing, and the
    // audit trail moved to the `/workspace` console, which is addressable per
    // section and gated on the owner/admin role those panels actually require.
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
          connectorDisclosure={<ConnectorConsentSummary />}
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
      </SettingsSectionNavigationProvider>
    </Suspense>
  );
}
