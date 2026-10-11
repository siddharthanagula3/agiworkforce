'use client';

import { useEffect, useState } from 'react';
import { MANAGED_CLOUD_PUBLISHED_ARTIFACT_TITLE_MAX_CHARS } from '@agiworkforce/cloud-contracts';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
} from '@agiworkforce/ui';
import { toUserMessage } from '@/lib/user-error-message';
import { siteName } from '../lib/site-format';
import type { PublishedSite, SiteVisibility } from '../services/sites-service';
import { SiteSharingOptions } from './SiteSharingOptions';

export function RenameSiteDialog({
  site,
  onOpenChange,
  onRename,
}: {
  site: PublishedSite | null;
  onOpenChange: (open: boolean) => void;
  onRename: (site: PublishedSite, title: string) => Promise<void>;
}) {
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!site) return;
    setValue(site.title);
    setError(null);
  }, [site]);

  const trimmed = value.trim();
  const unchanged = site ? trimmed === site.title.trim() : true;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!site || !trimmed || unchanged) return;
    setSaving(true);
    setError(null);
    try {
      await onRename(site, trimmed);
      onOpenChange(false);
    } catch (caught) {
      setError(toUserMessage(caught, 'Failed to rename this site'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={site !== null} onOpenChange={(open) => !saving && onOpenChange(open)}>
      <DialogContent>
        <form onSubmit={(event) => void submit(event)} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Rename site</DialogTitle>
            <DialogDescription>
              The new name shows on the site and in your list. The link stays the same.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="rename-site-input">Name</Label>
            <Input
              id="rename-site-input"
              value={value}
              maxLength={MANAGED_CLOUD_PUBLISHED_ARTIFACT_TITLE_MAX_CHARS}
              onChange={(event) => setValue(event.target.value)}
              disabled={saving}
              autoFocus
            />
            {error ? (
              <p role="alert" className="text-sm text-[var(--chat-destructive-text)]">
                {error}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving || !trimmed || unchanged}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function SiteSharingDialog({
  site,
  workspace,
  onOpenChange,
  onChange,
}: {
  site: PublishedSite | null;
  workspace: { memberCount: number } | null;
  onOpenChange: (open: boolean) => void;
  onChange: (site: PublishedSite, visibility: SiteVisibility) => Promise<void>;
}) {
  const [value, setValue] = useState<SiteVisibility>('public');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!site) return;
    setValue(site.visibility);
    setError(null);
  }, [site]);

  const save = async () => {
    if (!site) return;
    if (value === site.visibility) {
      onOpenChange(false);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onChange(site, value);
      onOpenChange(false);
    } catch (caught) {
      setError(toUserMessage(caught, 'Failed to change who can open this site'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={site !== null} onOpenChange={(open) => !saving && onOpenChange(open)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Sharing</DialogTitle>
          <DialogDescription>
            {site ? `Choose who can open “${siteName(site)}”.` : 'Choose who can open this site.'}
          </DialogDescription>
        </DialogHeader>
        <SiteSharingOptions
          idPrefix="sharing-dialog"
          value={value}
          workspace={workspace}
          disabled={saving}
          onChange={setValue}
        />
        {error ? (
          <p role="alert" className="text-sm text-[var(--chat-destructive-text)]">
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={saving}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button type="button" disabled={saving} onClick={() => void save()}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
