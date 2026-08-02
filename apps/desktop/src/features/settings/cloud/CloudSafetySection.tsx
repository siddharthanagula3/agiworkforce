/**
 * Cloud safety preferences, rendered inline.
 *
 * The `safety` namespace of `/api/settings/preferences` is bearer-reachable
 * (`getClerkAuthUser`), so this no longer opens a cookie-gated child window
 * that could land on `/login`. Same namespace and same key the web Safety
 * section reads and writes (`reduceSensitiveContent`), so a change made here is
 * the change the account already has.
 *
 * The whole namespace is written back on every save because
 * `PUT /api/settings/preferences` replaces a namespace's value outright.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import {
  getCloudPreferenceNamespace,
  saveCloudPreferenceNamespace,
} from '../../../api/cloudAccountSettings';
import { SectionError, SectionHeading, SectionLoading } from './sectionChrome';

const NAMESPACE = 'safety';
const KEY = 'reduceSensitiveContent';

export function CloudSafetySection() {
  const [stored, setStored] = useState<Record<string, unknown>>({});
  const [enabled, setEnabled] = useState(false);
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
      setEnabled(next[KEY] === true);
    } catch (caught) {
      if (generation.current === current) {
        setLoadFailed(true);
        setError(caught instanceof Error ? caught.message : 'Could not load your safety settings.');
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
    // Optimistic, then reverted on failure — never left showing a value the
    // account does not have.
    setEnabled(next);
    setSaving(true);
    setError(null);
    try {
      await saveCloudPreferenceNamespace(NAMESPACE, { ...stored, [KEY]: next });
      setStored((current) => ({ ...current, [KEY]: next }));
    } catch (caught) {
      setEnabled(!next);
      setError(caught instanceof Error ? caught.message : 'Could not save your safety settings.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-5" data-testid="cloud-safety">
      <SectionHeading
        title="Safety"
        description="Choose additional safeguards for Managed Cloud prompts. This setting belongs to your Cloud account and applies on every surface."
      />

      {loading ? <SectionLoading label="Loading your safety settings…" /> : null}
      {error ? <SectionError message={error} onRetry={() => void load()} /> : null}

      {!loading && !loadFailed ? (
        <div className="overflow-hidden rounded-lg border border-border bg-card/40">
          <div className="flex items-start justify-between gap-4 p-5">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">Reduce sensitive content</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Block clearly explicit or harmful how-to prompts before they reach a Managed Cloud
                model. Educational, medical, journalistic, and support-seeking discussion remains
                available.
              </p>
            </div>
            <label className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                aria-label="Reduce sensitive content"
                checked={enabled}
                disabled={saving}
                onChange={(event) => void handleChange(event.target.checked)}
              />
              {enabled ? 'On' : 'Off'}
            </label>
          </div>
          <p className="border-t border-border/60 p-5 text-xs leading-5 text-muted-foreground">
            This changes prompt admission for Managed Cloud only. It does not monitor conversations,
            notify another person, or replace emergency services — and it does not apply to Local
            Mode, which never leaves this device.
          </p>
        </div>
      ) : null}
    </div>
  );
}
