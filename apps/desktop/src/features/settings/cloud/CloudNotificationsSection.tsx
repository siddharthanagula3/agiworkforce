
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  getCloudPreferenceNamespace,
  saveCloudPreferenceNamespace,
} from '../../../api/cloudAccountSettings';
import { SectionError, SectionHeading, SectionLoading } from './sectionChrome';

const NAMESPACE = 'notifications';
const KEY = 'browserReplyReady';
const DEFAULT_ENABLED = true;

export function CloudNotificationsSection() {
  const [stored, setStored] = useState<Record<string, unknown>>({});
  const [enabled, setEnabled] = useState(DEFAULT_ENABLED);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);

  const load = useCallback(async () => {
    const current = ++generation.current;
    setLoading(true);
    setError(null);
    setLoadFailed(false);
    try {
      const next = await getCloudPreferenceNamespace(NAMESPACE);
      if (generation.current !== current) return;
      setStored(next);
      setEnabled(typeof next[KEY] === 'boolean' ? (next[KEY] as boolean) : DEFAULT_ENABLED);
    } catch (caught) {
      if (generation.current === current) {
        setLoadFailed(true);
        setError(
          caught instanceof Error ? caught.message : 'Could not load your notification settings.',
        );
      }
    } finally {
      if (generation.current === current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    return () => {
      generation.current += 1;
    };
  }, [load]);

  const handleChange = async (next: boolean) => {
    setEnabled(next);
    setSaving(true);
    setError(null);
    try {
      await saveCloudPreferenceNamespace(NAMESPACE, { ...stored, [KEY]: next });
      setStored((current) => ({ ...current, [KEY]: next }));
    } catch (caught) {
      setEnabled(!next);
      setError(
        caught instanceof Error ? caught.message : 'Could not save your notification settings.',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-5" data-testid="cloud-notifications">
      <SectionHeading
        title="Notifications"
        description="Account-level notification preferences. Desktop's own notification controls are device settings and stay in Local settings."
      />

      {loading ? <SectionLoading label="Loading your notification settings…" /> : null}
      {error ? <SectionError message={error} onRetry={() => void load()} /> : null}

      {!loading && !loadFailed ? (
        <>
          <div className="overflow-hidden rounded-lg border border-border bg-card/40">
            <div className="flex items-start justify-between gap-4 p-5">
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">Reply ready</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Browser notification when a long-running response finishes while the AGI tab is in
                  the background. This preference is used by agiworkforce.com in your browser.
                </p>
              </div>
              <label className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  aria-label="Reply ready"
                  checked={enabled}
                  disabled={saving}
                  onChange={(event) => void handleChange(event.target.checked)}
                />
                {enabled ? 'On' : 'Off'}
              </label>
            </div>
          </div>
          <p className="text-xs leading-5 text-muted-foreground">
            Email, task, schedule, project, usage, tips, and marketing channels are not offered:
            nothing in AGI sends them, and a saved preference nothing reads is not a setting.
          </p>
        </>
      ) : null}
    </div>
  );
}
