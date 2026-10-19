'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  MANAGED_CLOUD_PUBLISHED_ARTIFACT_TITLE_MAX_CHARS,
  type ManagedCloudPublishedArtifactVersion,
} from '@agiworkforce/cloud-contracts';
import { Copy } from '@agiworkforce/icons';
import { Button, Input, Label, Spinner } from '@agiworkforce/ui';
import { toast } from 'sonner';
import { toUserMessage } from '@/lib/user-error-message';
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
          <p className="text-sm text-[var(--chat-text-secondary)]">{description}</p>
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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setValue(site.title), [site.title]);

  const trimmed = value.trim();
  const unchanged = trimmed === site.title.trim();

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!trimmed || unchanged) return;
    setSaving(true);
    setError(null);
    try {
      await onRename(site, trimmed);
      toast.success('Site renamed');
    } catch (caught) {
      setError(toUserMessage(caught, 'Failed to rename this site'));
    } finally {
      setSaving(false);
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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const change = async (next: SiteVisibility) => {
    if (next === site.visibility) return;
    setSaving(true);
    setError(null);
    try {
      await onChange(site, next);
      toast.success(
        next === 'public'
          ? 'Anyone with the link can open it'
          : next === 'invited'
            ? 'Only the people you invite can open it'
            : 'Shared with your workspace',
      );
    } catch (caught) {
      setError(toUserMessage(caught, 'Failed to change who can open this site'));
    } finally {
      setSaving(false);
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
  const [versions, setVersions] = useState<ManagedCloudPublishedArtifactVersion[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [restoring, setRestoring] = useState<number | null>(null);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      setError(null);
      try {
        setVersions(await listPublishedArtifactVersions(site.token, signal));
      } catch (caught) {
        if (caught instanceof DOMException && caught.name === 'AbortError') return;
        setError(toUserMessage(caught, 'Failed to load the versions of this site'));
      }
    },
    [site.token],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load, site.version]);

  const restore = async (version: number) => {
    setRestoring(version);
    setError(null);
    try {
      await republishArtifactVersion(site, version);
      toast.success(`Version ${version} is live again`);
      onRestored();
    } catch (caught) {
      setError(toUserMessage(caught, 'Failed to restore that version'));
    } finally {
      setRestoring(null);
    }
  };

  return (
    <SettingsSection
      title="Versions"
      description="Each publish is kept. Restoring an older one publishes it again as the newest version."
    >
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
                  disabled={restoring !== null}
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
