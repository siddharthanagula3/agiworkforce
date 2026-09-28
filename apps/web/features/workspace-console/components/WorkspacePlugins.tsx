'use client';

import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { Puzzle } from 'lucide-react';
import {
  isDirectoryScanCaution,
  Spinner,
  useConfirmAction,
  type DirectoryScanCaution,
} from '@agiworkforce/ui';
import {
  ORGANIZATION_PLUGINS_ADMIN_PATH,
  PLUGIN_UPLOAD_ACKNOWLEDGED_SCAN_FIELD,
  type OrganizationPluginGroup,
  type OrganizationPluginGroupSetting,
  type OrganizationPluginInstallPreference,
  type OrganizationPluginPatch,
  type OrganizationPluginSummary,
  type OrganizationPluginsAdminResponse,
  type OrganizationPluginsPublishResponse,
} from '@agiworkforce/cloud-contracts';
import { getAuthToken } from '@shared/lib/get-auth-token';

import { addCsrfHeaders } from '@/lib/client/csrf';
import { toUserMessage } from '@/lib/user-error-message';
import { UPLOAD_FILE_FIELD } from '@/features/directory/constants';
import { scanCautionFrom } from '@/features/directory/services/request-error';

export const WORKSPACE_PLUGINS_QUERY_KEY = ['workspace', 'plugins'] as const;

const PREFERENCES: ReadonlyArray<{
  value: OrganizationPluginInstallPreference;
  label: string;
  hint: string;
}> = [
  {
    value: 'required',
    label: 'Required',
    hint: 'On for everyone. Members cannot turn it off.',
  },
  {
    value: 'installed_by_default',
    label: 'Installed by default',
    hint: 'On for everyone. Each member can turn it off.',
  },
  {
    value: 'available',
    label: 'Available to install',
    hint: 'Listed for members to add themselves.',
  },
  { value: 'not_available', label: 'Not available', hint: 'Hidden from members.' },
];

const cardStyle = {
  border: '1px solid var(--settings-border)',
  borderRadius: 'var(--radius-lg)',
  background: 'var(--bg-elev)',
} as const;

const controlStyle = {
  minHeight: 32,
  border: '1px solid var(--settings-border)',
  borderRadius: 'var(--radius-md)',
  background: 'var(--bg-base)',
  color: 'var(--text-1)',
  fontSize: 12,
  padding: 'var(--space-1) var(--space-2)',
} as const;

const secondaryButtonClass =
  'rounded-md border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-[var(--bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 pointer-coarse:min-h-11';

const primaryButtonClass =
  'rounded-md bg-primary px-4 py-2 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 pointer-coarse:min-h-11';

const selectClass = 'pointer-coarse:min-h-11';

async function readApiError(res: Response): Promise<{ message: string; body: unknown }> {
  const fallback = `Request failed (${res.status}).`;
  try {
    const body = (await res.json()) as { error?: { message?: string } | string };
    const raw = typeof body.error === 'string' ? body.error : (body.error?.message ?? '');
    return {
      message: raw.trim()
        ? toUserMessage(Object.assign(new Error(raw), { status: res.status }), fallback)
        : fallback,
      body,
    };
  } catch {
    return { message: fallback, body: null };
  }
}

async function authorizedHeaders(json: boolean): Promise<HeadersInit> {
  const token = await getAuthToken();
  if (!token) throw new Error('User not authenticated');
  return addCsrfHeaders({
    Authorization: `Bearer ${token}`,
    ...(json ? { 'Content-Type': 'application/json' } : {}),
  });
}

export function useWorkspacePlugins(): UseQueryResult<
  OrganizationPluginsAdminResponse | null,
  Error
> {
  return useQuery<OrganizationPluginsAdminResponse | null, Error>({
    queryKey: WORKSPACE_PLUGINS_QUERY_KEY,
    queryFn: async () => {
      const token = await getAuthToken();
      if (!token) throw new Error('User not authenticated');
      const res = await fetch(ORGANIZATION_PLUGINS_ADMIN_PATH, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 403) return null;
      if (!res.ok) throw new Error((await readApiError(res)).message);
      return (await res.json()) as OrganizationPluginsAdminResponse;
    },
    staleTime: 30 * 1000,
    meta: { errorMessage: 'Failed to load this workspace’s plugins' },
  });
}

interface PublishInput {
  file: File;
  acknowledgedScans: readonly string[];
}

function usePublishWorkspacePlugin() {
  const queryClient = useQueryClient();
  return useMutation<OrganizationPluginsPublishResponse, Error, PublishInput>({
    mutationFn: async ({ file, acknowledgedScans }) => {
      const form = new FormData();
      form.set(UPLOAD_FILE_FIELD, file);
      for (const scan of acknowledgedScans)
        form.append(PLUGIN_UPLOAD_ACKNOWLEDGED_SCAN_FIELD, scan);
      const res = await fetch(ORGANIZATION_PLUGINS_ADMIN_PATH, {
        method: 'POST',
        headers: await authorizedHeaders(false),
        body: form,
      });
      if (!res.ok) {
        const failure = await readApiError(res);
        throw scanCautionFrom(failure.body, failure.message) ?? new Error(failure.message);
      }
      return (await res.json()) as OrganizationPluginsPublishResponse;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: WORKSPACE_PLUGINS_QUERY_KEY });
    },
  });
}

function useChangeWorkspacePlugin() {
  const queryClient = useQueryClient();
  return useMutation<OrganizationPluginsAdminResponse, Error, OrganizationPluginPatch>({
    mutationFn: async (patch) => {
      const res = await fetch(ORGANIZATION_PLUGINS_ADMIN_PATH, {
        method: 'PATCH',
        headers: await authorizedHeaders(true),
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error((await readApiError(res)).message);
      return (await res.json()) as OrganizationPluginsAdminResponse;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(WORKSPACE_PLUGINS_QUERY_KEY, data);
    },
  });
}

function preferenceLabel(value: OrganizationPluginInstallPreference): string {
  return PREFERENCES.find((preference) => preference.value === value)?.label ?? value;
}

function PreferenceSelect({
  id,
  value,
  disabled,
  label,
  onChange,
}: {
  id: string;
  value: OrganizationPluginInstallPreference;
  disabled: boolean;
  label: string;
  onChange: (value: OrganizationPluginInstallPreference) => void;
}) {
  return (
    <select
      id={id}
      aria-label={label}
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value as OrganizationPluginInstallPreference)}
      className={selectClass}
      style={controlStyle}
    >
      {PREFERENCES.map((preference) => (
        <option key={preference.value} value={preference.value}>
          {preference.label}
        </option>
      ))}
    </select>
  );
}

function GroupSettings({
  plugin,
  groups,
  disabled,
  onSave,
}: {
  plugin: OrganizationPluginSummary;
  groups: readonly OrganizationPluginGroup[];
  disabled: boolean;
  onSave: (settings: OrganizationPluginGroupSetting[]) => void;
}) {
  const unused = groups.filter(
    (group) => !plugin.groupSettings.some((setting) => setting.groupId === group.id),
  );
  const [groupId, setGroupId] = useState('');
  const [preference, setPreference] = useState<OrganizationPluginInstallPreference>('required');
  const chosenGroup = unused.some((group) => group.id === groupId) ? groupId : '';
  const nameOf = (id: string) => groups.find((group) => group.id === id)?.name ?? id;

  if (groups.length === 0) {
    return (
      <p className="text-xs" style={{ color: 'var(--text-3)' }}>
        Create a group under Roles to give this plugin a different setting for some members.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {plugin.groupSettings.length > 0 ? (
        <ul className="flex flex-col gap-2" aria-label={`Group settings for ${plugin.name}`}>
          {plugin.groupSettings.map((setting) => (
            <li key={setting.groupId} className="flex flex-wrap items-center gap-2">
              <span className="min-w-0 truncate text-xs" style={{ color: 'var(--text-1)' }}>
                {nameOf(setting.groupId)}
              </span>
              <PreferenceSelect
                id={`plugin-${plugin.id}-group-${setting.groupId}`}
                label={`Setting for ${nameOf(setting.groupId)}`}
                value={setting.installPreference}
                disabled={disabled}
                onChange={(value) =>
                  onSave(
                    plugin.groupSettings.map((candidate) =>
                      candidate.groupId === setting.groupId
                        ? { ...candidate, installPreference: value }
                        : candidate,
                    ),
                  )
                }
              />
              <button
                type="button"
                className={secondaryButtonClass}
                style={{ borderColor: 'var(--settings-border)', color: 'var(--text-1)' }}
                disabled={disabled}
                onClick={() =>
                  onSave(
                    plugin.groupSettings.filter(
                      (candidate) => candidate.groupId !== setting.groupId,
                    ),
                  )
                }
              >
                Use the workspace setting
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {unused.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label={`Group to set ${plugin.name} for`}
            value={chosenGroup}
            disabled={disabled}
            onChange={(event) => setGroupId(event.target.value)}
            className={selectClass}
            style={controlStyle}
          >
            <option value="">Choose a group</option>
            {unused.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </select>
          <PreferenceSelect
            id={`plugin-${plugin.id}-new-group`}
            label="Setting for that group"
            value={preference}
            disabled={disabled}
            onChange={setPreference}
          />
          <button
            type="button"
            className={secondaryButtonClass}
            style={{ borderColor: 'var(--settings-border)', color: 'var(--text-1)' }}
            disabled={disabled || !chosenGroup}
            onClick={() => {
              onSave([
                ...plugin.groupSettings,
                { groupId: chosenGroup, installPreference: preference },
              ]);
              setGroupId('');
            }}
          >
            Set for group
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function WorkspacePlugins() {
  const { data, isPending, isError, error, refetch } = useWorkspacePlugins();
  const publish = usePublishWorkspacePlugin();
  const change = useChangeWorkspacePlugin();
  const { confirm, dialog } = useConfirmAction();
  const fileInput = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<File | null>(null);
  const [caution, setCaution] = useState<DirectoryScanCaution | null>(null);
  const [published, setPublished] = useState<string[]>([]);

  if (isPending) {
    return (
      <div
        className="flex items-center gap-2"
        style={{ ...cardStyle, padding: 'var(--space-5)', color: 'var(--text-3)', fontSize: 13 }}
      >
        <Spinner size="sm" />
        Loading workspace plugins…
      </div>
    );
  }

  if (isError) {
    return (
      <div style={{ ...cardStyle, padding: 'var(--space-5)' }}>
        <p className="text-sm font-medium" style={{ color: 'var(--text-1)' }}>
          We could not load this workspace’s plugins
        </p>
        <p className="mt-1.5 text-xs" style={{ color: 'var(--text-3)' }}>
          {toUserMessage(error, 'Could not load the workspace plugins.')}
        </p>
        <button
          type="button"
          onClick={() => void refetch()}
          className={`mt-3 ${secondaryButtonClass}`}
          style={{ borderColor: 'var(--settings-border)', color: 'var(--text-1)' }}
        >
          Try again
        </button>
      </div>
    );
  }

  if (data === null) return null;

  const submit = (file: File, acknowledgedScans: readonly string[]) => {
    setPublished([]);
    setCaution(null);
    setPending(file);
    publish.mutate(
      { file, acknowledgedScans },
      {
        onSuccess: (result) => {
          setPending(null);
          setPublished(result.plugins.map((plugin) => plugin.name));
        },
        onError: (failure) => {
          if (isDirectoryScanCaution(failure)) setCaution(failure);
          else setPending(null);
        },
      },
    );
  };

  const askToRetire = (plugin: OrganizationPluginSummary) => {
    confirm({
      title: `Retire ${plugin.name}?`,
      description:
        'Every member loses this plugin and its skills at once. Publishing it again brings it back with the same settings.',
      confirmLabel: 'Retire for everyone',
      cancelLabel: 'Keep it published',
      destructive: true,
      onConfirm: () =>
        new Promise<void>((resolve) => {
          change.mutate({ pluginId: plugin.id, status: 'retired' }, { onSettled: () => resolve() });
        }),
    });
  };

  return (
    <div style={cardStyle}>
      {dialog}
      <div className="flex items-start gap-3 px-5 py-4">
        <Puzzle
          size={16}
          aria-hidden
          style={{ color: 'var(--text-3)', marginTop: 'var(--space-1)' }}
        />
        <div>
          <h3 className="text-sm font-medium" style={{ color: 'var(--text-1)' }}>
            Workspace plugins
          </h3>
          <p className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--text-3)' }}>
            Members find these under Plugins, from this workspace. Members cannot edit a workspace
            plugin; publish a new version to change it.
          </p>
        </div>
      </div>

      {change.isError ? (
        <p
          className="border-t px-5 py-3 text-xs"
          style={{
            borderColor: 'var(--settings-border)',
            color: 'var(--settings-destructive-text)',
          }}
          role="alert"
        >
          {toUserMessage(change.error, 'That change could not be saved.')}
        </p>
      ) : null}

      <ul className="flex flex-col" aria-label="Workspace plugins">
        {data.plugins.length === 0 ? (
          <li
            className="border-t px-5 py-4 text-xs"
            style={{ borderColor: 'var(--settings-border)', color: 'var(--text-3)' }}
          >
            This workspace has not published a plugin yet.
          </li>
        ) : (
          data.plugins.map((plugin) => {
            const retired = plugin.status === 'retired';
            const hint = PREFERENCES.find(
              (preference) => preference.value === plugin.installPreference,
            )?.hint;
            return (
              <li
                key={plugin.id}
                className="flex flex-col gap-3 border-t px-5 py-4"
                style={{ borderColor: 'var(--settings-border)' }}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium" style={{ color: 'var(--text-1)' }}>
                      {plugin.name}
                    </p>
                    <p className="mt-0.5 text-xs" style={{ color: 'var(--text-3)' }}>
                      {`Version ${plugin.version} · ${plugin.skills.length === 1 ? '1 skill' : `${plugin.skills.length} skills`}`}
                      {retired ? ' · Retired' : ` · ${preferenceLabel(plugin.installPreference)}`}
                    </p>
                    {plugin.scanVerdict === 'review' ? (
                      <p className="mt-0.5 text-xs" style={{ color: 'var(--text-3)' }}>
                        {`Published with ${plugin.scanFindings.length === 1 ? 'a scan finding' : `${plugin.scanFindings.length} scan findings`} an administrator accepted.`}
                      </p>
                    ) : null}
                  </div>
                  {data.canManage ? (
                    retired ? (
                      <button
                        type="button"
                        className={secondaryButtonClass}
                        style={{ borderColor: 'var(--settings-border)', color: 'var(--text-1)' }}
                        disabled={change.isPending}
                        onClick={() => change.mutate({ pluginId: plugin.id, status: 'published' })}
                      >
                        Publish again
                      </button>
                    ) : (
                      <button
                        type="button"
                        className={secondaryButtonClass}
                        style={{ borderColor: 'var(--settings-border)', color: 'var(--text-1)' }}
                        disabled={change.isPending}
                        onClick={() => askToRetire(plugin)}
                      >
                        Retire
                      </button>
                    )
                  ) : null}
                </div>
                {data.canManage && !retired ? (
                  <div className="flex flex-col gap-2">
                    <label
                      className="text-xs font-medium"
                      style={{ color: 'var(--text-1)' }}
                      htmlFor={`plugin-${plugin.id}-preference`}
                    >
                      For everyone in the workspace
                    </label>
                    <div className="flex flex-wrap items-center gap-2">
                      <PreferenceSelect
                        id={`plugin-${plugin.id}-preference`}
                        label={`Setting for ${plugin.name}`}
                        value={plugin.installPreference}
                        disabled={change.isPending}
                        onChange={(value) =>
                          change.mutate({ pluginId: plugin.id, installPreference: value })
                        }
                      />
                      {hint ? (
                        <span className="text-xs" style={{ color: 'var(--text-3)' }}>
                          {hint}
                        </span>
                      ) : null}
                    </div>
                    <p className="text-xs font-medium" style={{ color: 'var(--text-1)' }}>
                      For a group
                    </p>
                    <GroupSettings
                      plugin={plugin}
                      groups={data.groups}
                      disabled={change.isPending}
                      onSave={(groupSettings) =>
                        change.mutate({ pluginId: plugin.id, groupSettings })
                      }
                    />
                  </div>
                ) : null}
              </li>
            );
          })
        )}
      </ul>

      {data.canManage ? (
        <div
          className="flex flex-col gap-2 border-t px-5 py-4"
          style={{ borderColor: 'var(--settings-border)' }}
        >
          <p className="text-xs font-medium" style={{ color: 'var(--text-1)' }}>
            Publish a plugin or a skill
          </p>
          <p className="text-xs" style={{ color: 'var(--text-3)' }}>
            Upload a plugin .zip, or a .zip holding one skill and its SKILL.md. Every file is
            scanned first. A skill starts on for everyone and each member can turn it off; a plugin
            starts as available to install. Publishing the same one again replaces it and keeps its
            settings.
          </p>
          <input
            ref={fileInput}
            type="file"
            accept=".zip,application/zip"
            className="sr-only"
            aria-label="Plugin zip"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file) submit(file, []);
            }}
          />
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className={primaryButtonClass}
              disabled={publish.isPending}
              onClick={() => fileInput.current?.click()}
            >
              {publish.isPending ? 'Scanning and publishing…' : 'Upload a plugin or skill'}
            </button>
            {publish.isPending ? <Spinner size="sm" /> : null}
          </div>
          {caution && pending ? (
            <div className="flex flex-col gap-2" role="alert">
              <p className="text-xs" style={{ color: 'var(--text-1)' }}>
                {caution.message}
              </p>
              <ul className="flex flex-col gap-1">
                {caution.findings.map((finding) => (
                  <li key={finding} className="text-xs" style={{ color: 'var(--text-3)' }}>
                    {finding}
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className={primaryButtonClass}
                  disabled={publish.isPending}
                  onClick={() => submit(pending, caution.acknowledgements)}
                >
                  Publish anyway
                </button>
                <button
                  type="button"
                  className={secondaryButtonClass}
                  style={{ borderColor: 'var(--settings-border)', color: 'var(--text-1)' }}
                  onClick={() => {
                    setCaution(null);
                    setPending(null);
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : null}
          {publish.isError && !caution ? (
            <p
              className="text-xs"
              style={{ color: 'var(--settings-destructive-text)' }}
              role="alert"
            >
              {toUserMessage(publish.error, 'That plugin could not be published.')}
            </p>
          ) : null}
          {published.length > 0 ? (
            <p className="text-xs" style={{ color: 'var(--text-3)' }} role="status">
              {`Published ${published.join(', ')}.`}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
