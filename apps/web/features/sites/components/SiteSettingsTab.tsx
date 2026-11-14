'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  MANAGED_CLOUD_PUBLISHED_ARTIFACT_TITLE_MAX_CHARS,
  type ManagedCloudPublishedArtifactVersion,
} from '@agiworkforce/cloud-contracts';
import { Copy } from '@agiworkforce/icons';
import { Button, Input, Label, Spinner } from '@agiworkforce/ui';
import { toast } from 'sonner';
import { toUserMessage } from '@/lib/user-error-message';
import type { RequestAuthority } from '@/lib/identity/request-authority';
import { isPublicationLeaseCurrent, usePublishedSitesStore } from '../stores/published-sites-store';
import { unpublishConsequence } from '../hooks/useSiteActions';
import { formatRelativeTime } from '../lib/site-format';
import {
  listPublishedArtifactVersions,
  republishArtifactVersion,
  type PublishedSite,
  type SiteVisibility,
} from '../services/sites-service';
import { SiteSharingOptions } from './SiteSharingOptions';
import { SiteViewersEditor } from './SiteViewersEditor';

function SettingsSection({
  title,
  description,
  children,
  danger = false,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <section
      className={
        danger
          ? 'flex flex-col gap-3 rounded-xl border border-[var(--chat-destructive)] p-4'
          : 'flex flex-col gap-3 border-b border-[var(--chat-border-subtle)] pb-6'
      }
    >
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-medium text-[var(--chat-text-primary)]">{title}</h2>
        {description ? (
          <p className="text-xs text-[var(--chat-text-secondary)]">{description}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function NameSetting({
  site,
  onRename,
}: {
  site: PublishedSite;
  onRename: (site: PublishedSite, title: string) => Promise<void>;
}) {
  const [value, setValue] = useState(site.title);
  const lease = usePublishedSitesStore((state) => state.lease);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setValue(site.title), [site.title]);

  const trimmed = value.trim();
  const unchanged = trimmed === site.title.trim();

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!isPublicationLeaseCurrent(lease) || !trimmed || unchanged) return;
    setSaving(true);
    setError(null);
    try {
      await onRename(site, trimmed);
      if (!isPublicationLeaseCurrent(lease)) return;
      toast.success('Site renamed');
    } catch (caught) {
      if (!isPublicationLeaseCurrent(lease)) return;
      setError(toUserMessage(caught, 'Failed to rename this site'));
    } finally {
      if (isPublicationLeaseCurrent(lease)) setSaving(false);
    }
  };

  return (
    <SettingsSection title="Name" description="Shown on the site and in your list of sites.">
      <form onSubmit={(event) => void save(event)} className="flex flex-col gap-2 sm:flex-row">
        <Label htmlFor="site-name-input" className="sr-only">
          Site name
        </Label>
        <Input
          id="site-name-input"
          value={value}
          maxLength={MANAGED_CLOUD_PUBLISHED_ARTIFACT_TITLE_MAX_CHARS}
          onChange={(event) => setValue(event.target.value)}
          disabled={saving}
          className="sm:max-w-md"
        />
        <Button type="submit" variant="outline" disabled={saving || !trimmed || unchanged}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </form>
      {error ? (
        <p role="alert" className="text-sm text-[var(--chat-destructive-text)]">
          {error}
        </p>
      ) : null}
    </SettingsSection>
  );
}

function SharingSetting({
  site,
  workspace,
  onChange,
}: {
  site: PublishedSite;
  workspace: { memberCount: number } | null;
  onChange: (site: PublishedSite, visibility: SiteVisibility) => Promise<void>;
}) {
  const lease = usePublishedSitesStore((state) => state.lease);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const change = async (next: SiteVisibility) => {
    if (!isPublicationLeaseCurrent(lease) || next === site.visibility) return;
    setSaving(true);
    setError(null);
    try {
      await onChange(site, next);
      if (!isPublicationLeaseCurrent(lease)) return;
      toast.success(
        next === 'public'
          ? 'Anyone with the link can open it'
          : next === 'invited'
            ? 'Only the people you invite can open it'
            : 'Shared with your workspace',
      );
    } catch (caught) {
      if (!isPublicationLeaseCurrent(lease)) return;
      setError(toUserMessage(caught, 'Failed to change who can open this site'));
    } finally {
      if (isPublicationLeaseCurrent(lease)) setSaving(false);
    }
  };

  return (
    <SettingsSection title="Sharing" description="Changing this keeps the same link.">
      <SiteSharingOptions
        idPrefix="site-sharing"
        value={site.visibility}
        workspace={workspace}
        disabled={saving}
        onChange={(next) => void change(next)}
      />
      {site.visibility === 'invited' ? <SiteViewersEditor token={site.token} /> : null}
      {error ? (
        <p role="alert" className="text-sm text-[var(--chat-destructive-text)]">
          {error}
        </p>
      ) : null}
    </SettingsSection>
  );
}

function VersionsSetting({ site, onRestored }: { site: PublishedSite; onRestored: () => void }) {
  const lease = usePublishedSitesStore((state) => state.lease);
  return (
    <VersionsSession
      key={JSON.stringify([
        site.token,
        site.artifactId,
        site.version,
        site.visibility,
        site.updatedAt,
        lease?.epoch,
      ])}
      site={site}
      onRestored={onRestored}
    />
  );
}

type VersionsLane = {
  active: boolean;
  operation: VersionsRequest | null;
  versions: ManagedCloudPublishedArtifactVersion[] | null;
};

type VersionsRequest = Pick<RequestAuthority, 'assertCurrent' | 'fetch' | 'isCurrent' | 'retire'>;

function createVersionsRequest(owns: () => boolean): VersionsRequest {
  const controller = new AbortController();
  const retire = () => controller.abort();
  const isCurrent = () => {
    if (!owns()) retire();
    return !controller.signal.aborted;
  };
  const assertCurrent = () => {
    if (!isCurrent()) throw new DOMException('Version history owner changed', 'AbortError');
  };
  return {
    isCurrent,
    assertCurrent,
    retire,
    fetch: (input, init) => {
      assertCurrent();
      const signal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
      return fetch(input, {
        ...init,
        signal: signal ? AbortSignal.any([signal, controller.signal]) : controller.signal,
      });
    },
  };
}

function VersionsSession({ site, onRestored }: { site: PublishedSite; onRestored: () => void }) {
  const lease = usePublishedSitesStore((state) => state.lease);
  const activation = useRef<VersionsLane | null>(null);
  const [state, setState] = useState<{
    lane: VersionsLane | null;
    versions: ManagedCloudPublishedArtifactVersion[] | null;
    error: string | null;
    restoring: number | null;
    consumed: boolean;
  }>({ lane: null, versions: null, error: null, restoring: null, consumed: false });
  const current = useCallback(
    (lane: VersionsLane) =>
      lane.active && activation.current === lane && isPublicationLeaseCurrent(lease),
    [lease],
  );

  useLayoutEffect(() => {
    const lane: VersionsLane = { active: true, operation: null, versions: null };
    activation.current = lane;
    setState({ lane, versions: null, error: null, restoring: null, consumed: false });
    const retire = () => {
      lane.active = false;
      lane.operation?.retire();
      lane.operation = null;
    };
    if (isPublicationLeaseCurrent(lease)) {
      const request = createVersionsRequest(() => current(lane) && lane.operation === request);
      lane.operation = request;
      void (async () => {
        try {
          const versions = await listPublishedArtifactVersions(site.token, undefined, request);
          if (!request.isCurrent()) return;
          lane.versions = versions;
          setState((previous) =>
            current(lane)
              ? { lane, versions, error: null, restoring: null, consumed: false }
              : previous,
          );
        } catch (caught) {
          if (!request.isCurrent()) return;
          setState((previous) =>
            current(lane)
              ? {
                  ...previous,
                  error: toUserMessage(caught, 'Failed to load the versions of this site'),
                }
              : previous,
          );
        } finally {
          if (lane.operation === request) lane.operation = null;
          request.retire();
        }
      })();
    }
    return retire;
  }, [current, lease, site.token]);

  const { lane, versions, error, restoring, consumed } = state;

  const restore = async (version: number) => {
    if (
      !lane ||
      !current(lane) ||
      lane.operation ||
      lane.versions !== versions ||
      !versions?.some((entry) => entry.version === version && !entry.live)
    )
      return;
    const request = createVersionsRequest(
      () => current(lane) && lane.operation === request && lane.versions === versions,
    );
    lane.operation = request;
    setState((previous) => ({ ...previous, restoring: version, error: null }));
    try {
      await republishArtifactVersion(site, version, request);
      if (!request.isCurrent()) return;
      lane.versions = null;
      setState((previous) => (current(lane) ? { ...previous, consumed: true } : previous));
      toast.success(`Version ${version} is live again`);
      onRestored();
    } catch (caught) {
      if (!request.isCurrent()) return;
      setState((previous) =>
        current(lane)
          ? { ...previous, error: toUserMessage(caught, 'Failed to restore that version') }
          : previous,
      );
    } finally {
      if (current(lane) && lane.operation === request) {
        lane.operation = null;
        setState((previous) => (current(lane) ? { ...previous, restoring: null } : previous));
      }
      request.retire();
    }
  };

  return (
    <SettingsSection
      title="Versions"
      description="Each publish is kept. Restoring one republishes it as the newest."
    >
      {consumed ? (
        <p role="status" className="text-sm text-[var(--chat-text-secondary)]">
          Restore confirmed. Refresh the site details before restoring another version.
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-[var(--chat-destructive-text)]">
          {error}
        </p>
      ) : null}
      {versions === null ? (
        error ? null : (
          <div
            role="status"
            className="flex items-center gap-2 text-sm text-[var(--chat-text-secondary)]"
          >
            <Spinner size="sm" aria-hidden="true" />
            Loading versions…
          </div>
        )
      ) : versions.length === 0 ? (
        <p className="text-sm text-[var(--chat-text-secondary)]">No earlier versions.</p>
      ) : (
        <ul
          aria-label="Versions"
          className="flex flex-col divide-y divide-[var(--chat-border-subtle)]"
        >
          {versions.map((entry) => (
            <li
              key={entry.version}
              data-testid="site-version"
              className="flex flex-wrap items-center justify-between gap-2 py-2"
            >
              <span className="min-w-0 text-sm text-[var(--chat-text-primary)]">
                Version {entry.version}
                {formatRelativeTime(entry.createdAt) ? (
                  <span className="text-[var(--chat-text-muted)]">
                    {' · Published '}
                    {formatRelativeTime(entry.createdAt)}
                  </span>
                ) : null}
              </span>
              {entry.live ? (
                <span className="text-sm text-[var(--chat-text-muted)]">Live</span>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={restoring !== null || consumed}
                  onClick={() => void restore(entry.version)}
                >
                  {restoring === entry.version ? 'Restoring…' : 'Restore'}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </SettingsSection>
  );
}

export function SiteSettingsTab({
  site,
  workspace,
  onCopyLink,
  onRename,
  onSetVisibility,
  onUnpublish,
  onRestored,
}: {
  site: PublishedSite;
  workspace: { memberCount: number } | null;
  onCopyLink: (site: PublishedSite) => void;
  onRename: (site: PublishedSite, title: string) => Promise<void>;
  onSetVisibility: (site: PublishedSite, visibility: SiteVisibility) => Promise<void>;
  onUnpublish: (site: PublishedSite) => void;
  onRestored: () => void;
}) {
  return (
    <div className="flex flex-col gap-6">
      <NameSetting site={site} onRename={onRename} />

      <SettingsSection title="URL" description="Links you already shared keep working.">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Label htmlFor="site-url-input" className="sr-only">
            Site URL
          </Label>
          <Input
            id="site-url-input"
            value={site.shareUrl}
            readOnly
            className="font-mono text-sm sm:max-w-md"
            onFocus={(event) => event.currentTarget.select()}
          />
          <Button type="button" variant="outline" onClick={() => onCopyLink(site)}>
            <Copy className="h-4 w-4" aria-hidden="true" />
            Copy link
          </Button>
        </div>
      </SettingsSection>

      <SharingSetting site={site} workspace={workspace} onChange={onSetVisibility} />

      <VersionsSetting site={site} onRestored={onRestored} />

      <SettingsSection title="Unpublish" description={unpublishConsequence(site)} danger>
        <div>
          <Button
            type="button"
            variant="destructive"
            data-testid="site-unpublish"
            onClick={() => onUnpublish(site)}
          >
            Unpublish site
          </Button>
        </div>
      </SettingsSection>
    </div>
  );
}
