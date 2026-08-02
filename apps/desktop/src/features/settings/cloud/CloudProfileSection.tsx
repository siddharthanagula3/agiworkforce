/**
 * Cloud profile (Settings → General, account half), rendered inline.
 *
 * Previously this opened `/settings/general` in a child webview gated on a
 * Clerk browser cookie Desktop never holds, so it could land on `/login` while
 * the app showed the user signed in. Both writes it needs are bearer-reachable:
 *
 *   full name        → `PATCH /api/me` (`profiles.display_name`, the PER-8
 *                      single source of truth for the name)
 *   everything else  → `PUT /api/settings/preferences` namespace `general`
 *
 * Precedence matches `apps/web/features/settings/sections/GeneralSection.tsx`:
 * a stored value wins only when it carries information, so an empty stored
 * string falls back to the server-resolved profile instead of locking the field
 * empty forever (PER-10).
 *
 * The `general` namespace is written back WHOLE. `PUT /api/settings/preferences`
 * replaces a namespace's value outright (its SQL merge is shallow and only
 * preserves other namespaces), and web stores `chatFont`/`voice` in this same
 * namespace — so the stored record is spread into every save.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import {
  getCloudAccountProfile,
  getCloudPreferenceNamespace,
  saveCloudDisplayName,
  saveCloudPreferenceNamespace,
} from '../../../api/cloudAccountSettings';
import { PRIMARY_BUTTON, SectionError, SectionHeading, SectionLoading } from './sectionChrome';

const NAMESPACE = 'general';

/** Mirrors WORK_DESCRIPTIONS in the web General section. */
const WORK_DESCRIPTIONS = [
  'Software engineering',
  'Data science / ML',
  'Product management',
  'Design / UX',
  'Marketing',
  'Sales / Business development',
  'Legal / Compliance',
  'Finance / Accounting',
  'Operations',
  'Research / Academia',
  'Writing / Content',
  'Healthcare',
  'Education',
  'Other',
] as const;

const INSTRUCTIONS_LIMIT = 2000;

/** Trimmed value, or null when the stored value carries no information. */
function storedText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

const INPUT_CLASS =
  'mt-2 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground';

export function CloudProfileSection() {
  const [storedNamespace, setStoredNamespace] = useState<Record<string, unknown>>({});
  const [email, setEmail] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [preferredName, setPreferredName] = useState('');
  const [workDescription, setWorkDescription] = useState('');
  const [instructions, setInstructions] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const generation = useRef(0);

  const load = useCallback(async () => {
    const current = ++generation.current;
    setLoading(true);
    setError(null);
    setLoadFailed(false);
    try {
      const [profile, stored] = await Promise.all([
        getCloudAccountProfile(),
        getCloudPreferenceNamespace(NAMESPACE),
      ]);
      if (generation.current !== current) return;
      setStoredNamespace(stored);
      setEmail(profile.email);
      const resolvedFullName = profile.displayName ?? '';
      setDisplayName(resolvedFullName);
      setPreferredName(
        storedText(stored['preferredName']) ??
          profile.preferredName ??
          resolvedFullName.split(' ')[0] ??
          '',
      );
      setWorkDescription(storedText(stored['workDescription']) ?? profile.workDescription ?? '');
      // Free-form: an empty stored value IS the user's answer, so no fallback.
      setInstructions(typeof stored['instructions'] === 'string' ? stored['instructions'] : '');
    } catch (caught) {
      if (generation.current === current) {
        setLoadFailed(true);
        setError(caught instanceof Error ? caught.message : 'Could not load your Cloud profile.');
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

  const handleSave = async () => {
    const trimmedFullName = displayName.trim();
    if (!trimmedFullName) return;
    const trimmedPreferred = preferredName.trim() || (trimmedFullName.split(' ')[0] ?? '');
    setSaving(true);
    setError(null);
    try {
      await saveCloudDisplayName(trimmedFullName);
      await saveCloudPreferenceNamespace(NAMESPACE, {
        ...storedNamespace,
        preferredName: trimmedPreferred,
        workDescription,
        instructions,
      });
      setStoredNamespace((current) => ({
        ...current,
        preferredName: trimmedPreferred,
        workDescription,
        instructions,
      }));
      setPreferredName(trimmedPreferred);
      setSavedAt(Date.now());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save your Cloud profile.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-5" data-testid="cloud-profile">
      <SectionHeading
        title="Cloud profile"
        description="Your name, how AGI should address you, and account-level instructions. These belong to your AGI Cloud account and apply on every surface."
      />

      {loading ? <SectionLoading label="Loading your Cloud profile…" /> : null}
      {error ? <SectionError message={error} onRetry={() => void load()} /> : null}

      {!loading && !loadFailed ? (
        <div className="flex flex-col gap-5">
          <div className="rounded-lg border border-border bg-card/40 p-5">
            <p className="text-xs text-muted-foreground">Account email</p>
            <p className="mt-1 text-sm text-foreground">{email ?? 'Email unavailable'}</p>
          </div>

          <div>
            <label
              className="block text-xs font-medium text-foreground"
              htmlFor="cloud-profile-full-name"
            >
              Full name
            </label>
            <input
              id="cloud-profile-full-name"
              type="text"
              value={displayName}
              maxLength={80}
              placeholder="Your name"
              className={INPUT_CLASS}
              onChange={(event) => setDisplayName(event.target.value.slice(0, 80))}
            />
          </div>

          <div>
            <label
              className="block text-xs font-medium text-foreground"
              htmlFor="cloud-profile-preferred-name"
            >
              What should AGI call you?
            </label>
            <input
              id="cloud-profile-preferred-name"
              type="text"
              value={preferredName}
              maxLength={60}
              placeholder="Nickname or first name"
              className={INPUT_CLASS}
              onChange={(event) => setPreferredName(event.target.value.slice(0, 60))}
            />
          </div>

          <div>
            <label
              className="block text-xs font-medium text-foreground"
              htmlFor="cloud-profile-work"
            >
              What best describes your work?
            </label>
            <select
              id="cloud-profile-work"
              value={workDescription}
              className={INPUT_CLASS}
              onChange={(event) => setWorkDescription(event.target.value)}
            >
              <option value="">Select a role…</option>
              {WORK_DESCRIPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              className="block text-xs font-medium text-foreground"
              htmlFor="cloud-profile-instructions"
            >
              Instructions for AGI
            </label>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              AGI keeps these in mind across Cloud chats. They tailor tone, format, and
              explanations.
            </p>
            <textarea
              id="cloud-profile-instructions"
              value={instructions}
              maxLength={INSTRUCTIONS_LIMIT}
              rows={4}
              placeholder="e.g. when learning new concepts, I find analogies particularly helpful"
              className={`${INPUT_CLASS} resize-y leading-relaxed`}
              onChange={(event) => setInstructions(event.target.value.slice(0, INSTRUCTIONS_LIMIT))}
            />
            <p className="mt-1 text-right text-[11px] text-muted-foreground">
              {instructions.length} / {INSTRUCTIONS_LIMIT}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              className={PRIMARY_BUTTON}
              disabled={displayName.trim().length === 0 || saving}
              aria-busy={saving || undefined}
              onClick={() => void handleSave()}
            >
              {saving ? 'Saving…' : 'Save profile'}
            </button>
            {savedAt !== null && error === null ? (
              <span role="status" className="text-xs text-muted-foreground">
                Synced to your account.
              </span>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
