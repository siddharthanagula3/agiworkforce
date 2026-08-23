'use client';

import { useEffect, useMemo, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import type { PrivacyMode, SyncedAppSurface } from '@agiworkforce/types';
import {
  useUpdateWorkspacePolicy,
  useWorkspacePolicy,
  type WorkspaceAdminPolicy,
} from '../hooks/use-settings-queries';

type PolicyDraft = Omit<WorkspaceAdminPolicy, 'organizationId' | 'updatedAt'>;

const cardStyle = {
  border: '1px solid var(--settings-border)',
  borderRadius: 'var(--radius-lg)',
  background: 'var(--bg-elev)',
  overflow: 'hidden',
} as const;

const headerStyle = {
  padding: '14px 20px',
  borderBottom: '1px solid var(--settings-border)',
} as const;

const rowStyle = {
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: 16,
  padding: '12px 20px',
  borderBottom: '1px solid var(--settings-border)',
} as const;

const buttonStyle = {
  minHeight: 32,
  border: '1px solid var(--settings-border)',
  borderRadius: 'var(--radius-md)',
  background: 'var(--bg-base)',
  color: 'var(--text-1)',
  fontSize: 12,
  padding: '5px 12px',
  cursor: 'pointer',
} as const;

const PRIVACY_MODES: { value: PrivacyMode; label: string; hint: string }[] = [
  { value: 'local', label: 'Local', hint: 'On-device models. Nothing leaves the machine.' },
  {
    value: 'byok',
    label: 'Your own keys',
    hint: "Calls go direct to the provider on your org's keys.",
  },
  {
    value: 'managed',
    label: 'Managed Cloud',
    hint: 'AGI-hosted inference, metered to your workspace.',
  },
];

const SYNC_SURFACES: { value: SyncedAppSurface; label: string }[] = [
  { value: 'web', label: 'Web' },
  { value: 'desktop', label: 'Desktop' },
  { value: 'mobile', label: 'Mobile' },
];

const DEVELOPER_SURFACES: { key: keyof PolicyDraft; label: string }[] = [
  { key: 'allowCliCloudSync', label: 'CLI' },
  { key: 'allowVsCodeCloudSync', label: 'VS Code' },
  { key: 'allowChromeCloudSync', label: 'Chrome extension' },
];

function toDraft(policy: WorkspaceAdminPolicy): PolicyDraft {
  return {
    defaultPrivacyMode: policy.defaultPrivacyMode,
    allowedPrivacyModes: [...policy.allowedPrivacyModes],
    allowManagedCompute: policy.allowManagedCompute,
    requireLocalToByokPreview: policy.requireLocalToByokPreview,
    chatSyncSurfaces: [...policy.chatSyncSurfaces],
    allowCliCloudSync: policy.allowCliCloudSync,
    allowVsCodeCloudSync: policy.allowVsCodeCloudSync,
    allowChromeCloudSync: policy.allowChromeCloudSync,
    auditExportEnabled: policy.auditExportEnabled,
    retentionDays: policy.retentionDays,
  };
}

function Toggle({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled: boolean;
  label: string;
}) {
  return (
    <input
      type="checkbox"
      role="switch"
      aria-label={label}
      checked={checked}
      disabled={disabled}
      onChange={(event) => onChange(event.target.checked)}
      style={{ width: 16, height: 16, cursor: disabled ? 'not-allowed' : 'pointer' }}
    />
  );
}

/**
 * A capability the workspace does not control yet. Rendered as text rather than
 * a disabled input so it cannot read as "a switch someone turned off" — the
 * setting does not exist, the position does.
 */
function StatedPosition({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        fontSize: 11,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        color: 'var(--text-3)',
        border: '1px solid var(--settings-border)',
        borderRadius: 'var(--radius-sm)',
        padding: '3px 8px',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  );
}

function Row({
  title,
  description,
  control,
}: {
  title: string;
  description: string;
  control: React.ReactNode;
}) {
  return (
    <div style={rowStyle}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-1)' }}>{title}</div>
        <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>{description}</div>
      </div>
      <div style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 8 }}>{control}</div>
    </div>
  );
}

export function WorkspacePolicySection() {
  const query = useWorkspacePolicy();
  const update = useUpdateWorkspacePolicy();
  const overview = query.data ?? null;

  const [draft, setDraft] = useState<PolicyDraft | null>(null);

  useEffect(() => {
    if (overview) setDraft(toDraft(overview.policy));
  }, [overview]);

  const canEdit = Boolean(overview?.canManagePolicy) && !update.isPending;

  const dirty = useMemo(() => {
    if (!overview || !draft) return false;
    if (!overview.configured) return true;
    return JSON.stringify(draft) !== JSON.stringify(toDraft(overview.policy));
  }, [overview, draft]);

  const coherenceError = useMemo(() => {
    if (!draft) return null;
    if (!draft.allowedPrivacyModes.includes(draft.defaultPrivacyMode)) {
      return 'The default privacy mode must be one of the allowed modes.';
    }
    if (draft.allowManagedCompute && !draft.allowedPrivacyModes.includes('managed')) {
      return 'Allow the Managed Cloud mode before turning on managed compute, or members would be blocked by their own policy.';
    }
    if (draft.allowedPrivacyModes.length === 0) return 'Allow at least one privacy mode.';
    if (draft.chatSyncSurfaces.length === 0) return 'Allow at least one app surface.';
    return null;
  }, [draft]);

  if (query.isLoading) {
    return (
      <section style={cardStyle}>
        <div style={{ padding: '20px', fontSize: 13, color: 'var(--text-3)' }}>
          Loading workspace policy…
        </div>
      </section>
    );
  }

  if (query.isError) {
    return (
      <section style={cardStyle}>
        <div style={{ padding: '20px', display: 'grid', gap: 10 }}>
          <div style={{ fontSize: 13, color: 'var(--text-1)' }}>
            Workspace policy could not be loaded.
          </div>
          <button type="button" style={buttonStyle} onClick={() => void query.refetch()}>
            Try again
          </button>
        </div>
      </section>
    );
  }

  if (!overview || !draft) return null;

  function patch(next: Partial<PolicyDraft>) {
    setDraft((current) => (current ? { ...current, ...next } : current));
  }

  function togglePrivacyMode(mode: PrivacyMode, on: boolean) {
    if (!draft) return;
    const next = on
      ? [...new Set([...draft.allowedPrivacyModes, mode])]
      : draft.allowedPrivacyModes.filter((value) => value !== mode);
    patch({ allowedPrivacyModes: next });
  }

  function toggleSyncSurface(surface: SyncedAppSurface, on: boolean) {
    if (!draft) return;
    const next = on
      ? [...new Set([...draft.chatSyncSurfaces, surface])]
      : draft.chatSyncSurfaces.filter((value) => value !== surface);
    patch({ chatSyncSurfaces: next });
  }

  return (
    <section style={cardStyle}>
      <header style={headerStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <ShieldCheck size={15} aria-hidden="true" />
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--text-1)' }}>
            Workspace policy
          </h3>
        </div>
        <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--text-3)' }}>
          {overview.configured
            ? 'These rules bind every member of this workspace. Personal accounts are unaffected.'
            : 'This workspace has no policy yet, so nothing is restricted. The values below are what your first save would apply.'}
        </p>
      </header>

      {!overview.canManagePolicy ? (
        <div style={{ padding: '10px 20px', fontSize: 12, color: 'var(--text-3)' }}>
          Only an owner or admin can change these. You are a {overview.currentUserRole}.
        </div>
      ) : null}

      <Row
        title="AGI-managed cloud compute"
        description="When off, members of this workspace cannot run managed turns, images, video, embeddings, or transcription."
        control={
          <Toggle
            label="Allow AGI-managed cloud compute"
            checked={draft.allowManagedCompute}
            disabled={!canEdit}
            onChange={(next) => patch({ allowManagedCompute: next })}
          />
        }
      />

      <div style={{ ...rowStyle, display: 'block' }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-1)' }}>
          Allowed privacy modes
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-3)', margin: '2px 0 10px' }}>
          A mode that is not allowed here is refused server-side, on every surface.
        </div>
        <div style={{ display: 'grid', gap: 8 }}>
          {PRIVACY_MODES.map((mode) => (
            <label
              key={mode.value}
              style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12 }}
            >
              <input
                type="checkbox"
                checked={draft.allowedPrivacyModes.includes(mode.value)}
                disabled={!canEdit}
                onChange={(event) => togglePrivacyMode(mode.value, event.target.checked)}
                style={{ marginTop: 2 }}
              />
              <span>
                <span style={{ color: 'var(--text-1)', fontWeight: 500 }}>{mode.label}</span>
                <span style={{ color: 'var(--text-3)', display: 'block' }}>{mode.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </div>

      <Row
        title="Default privacy mode"
        description="What a new conversation starts in for members of this workspace."
        control={
          <select
            aria-label="Default privacy mode"
            value={draft.defaultPrivacyMode}
            disabled={!canEdit}
            onChange={(event) => patch({ defaultPrivacyMode: event.target.value as PrivacyMode })}
            style={buttonStyle}
          >
            {PRIVACY_MODES.map((mode) => (
              <option key={mode.value} value={mode.value}>
                {mode.label}
              </option>
            ))}
          </select>
        }
      />

      <Row
        title="Preview before Local leaves the device"
        description="Members must review the exact payload before a Local chat continues on your own provider keys."
        control={
          <Toggle
            label="Require a preview before Local moves to your own keys"
            checked={draft.requireLocalToByokPreview}
            disabled={!canEdit}
            onChange={(next) => patch({ requireLocalToByokPreview: next })}
          />
        }
      />

      <div style={{ ...rowStyle, display: 'block' }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-1)' }}>
          Apps that may reach the cloud
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-3)', margin: '2px 0 10px' }}>
          Which clients your members may sign in to and sync from. This reads the app&apos;s own
          identifier, so treat it as a deployment setting rather than a security boundary — the
          privacy-mode rules above are what bind regardless of client.
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14 }}>
          {SYNC_SURFACES.map((surface) => (
            <label key={surface.value} style={{ display: 'flex', gap: 6, fontSize: 12 }}>
              <input
                type="checkbox"
                checked={draft.chatSyncSurfaces.includes(surface.value)}
                disabled={!canEdit}
                onChange={(event) => toggleSyncSurface(surface.value, event.target.checked)}
              />
              <span style={{ color: 'var(--text-1)' }}>{surface.label}</span>
            </label>
          ))}
          {DEVELOPER_SURFACES.map((surface) => (
            <label key={surface.key} style={{ display: 'flex', gap: 6, fontSize: 12 }}>
              <input
                type="checkbox"
                checked={Boolean(draft[surface.key])}
                disabled={!canEdit}
                onChange={(event) =>
                  patch({ [surface.key]: event.target.checked } as Partial<PolicyDraft>)
                }
              />
              <span style={{ color: 'var(--text-1)' }}>{surface.label}</span>
            </label>
          ))}
        </div>
      </div>

      {/*
       * Audit export and retention are deliberately NOT editable here.
       *
       * Both would be settings that decide nothing: there is no audit read or
       * export route to gate, and nothing reads the retention window. Shipping
       * live toggles for them would tell an owner their workspace is governed
       * in ways it is not — and /enterprise states in writing that neither is a
       * shipped control. They appear as stated positions, not switches, until
       * the enforcement lands.
       */}
      <Row
        title="Audit export"
        description="Not available as a self-serve control. Audit events are recorded to an append-only trail; extracts are supplied on request under contract."
        control={<StatedPosition>Contract-scoped</StatedPosition>}
      />

      <Row
        title="Retention window"
        description="Follows the published platform retention schedule in the privacy policy. Per-workspace windows are a contract-scoped commitment, not a shipped control."
        control={<StatedPosition>Platform schedule</StatedPosition>}
      />

      <div
        style={{
          padding: '12px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <div
          style={{
            fontSize: 12,
            color: coherenceError ? 'var(--settings-destructive-foreground)' : 'var(--text-3)',
          }}
        >
          {coherenceError ??
            (overview.configured
              ? `Last changed ${new Date(overview.policy.updatedAt).toLocaleString()}`
              : 'Not yet configured.')}
        </div>
        <button
          type="button"
          style={{
            ...buttonStyle,
            opacity: !canEdit || !dirty || coherenceError ? 0.5 : 1,
            cursor: !canEdit || !dirty || coherenceError ? 'not-allowed' : 'pointer',
          }}
          disabled={!canEdit || !dirty || Boolean(coherenceError)}
          onClick={() => update.mutate(draft)}
        >
          {update.isPending ? 'Saving…' : overview.configured ? 'Save policy' : 'Apply policy'}
        </button>
      </div>
    </section>
  );
}
