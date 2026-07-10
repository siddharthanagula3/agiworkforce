'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Monitor, Sun, Moon } from 'lucide-react';
import { useAppTheme as useTheme } from '@shared/hooks/useAppTheme';
import { useBillingStore } from '@/stores/unified/auth';
import { useUser } from '@clerk/nextjs';
import { LanguageSelector } from '@/features/settings/components/LanguageSelector';
import {
  fetchPreferenceNamespace,
  savePreferenceNamespace,
} from '@/app/settings/_lib/preferences-client';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const THEME_OPTIONS = [
  { value: 'system' as const, icon: Monitor, label: 'System' },
  { value: 'light' as const, icon: Sun, label: 'Light' },
  { value: 'dark' as const, icon: Moon, label: 'Dark' },
];

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

type WorkDescription = (typeof WORK_DESCRIPTIONS)[number] | '';

const PREF_NAMESPACE = 'general';

interface PreferenceSettings {
  chatFont: string;
  voice: string;
}

interface GeneralSettings extends PreferenceSettings {
  displayName: string;
  preferredName: string;
  workDescription: WorkDescription;
  instructions: string;
}

const DEFAULT_PREFS: PreferenceSettings = {
  chatFont: 'serif',
  voice: 'nova',
};

const DEFAULT_GENERAL_SETTINGS: GeneralSettings = {
  displayName: '',
  preferredName: '',
  workDescription: '',
  instructions: '',
  ...DEFAULT_PREFS,
};

// ---------------------------------------------------------------------------
// Section component
// ---------------------------------------------------------------------------

export function GeneralSection() {
  const { theme: nextTheme, setTheme: setNextTheme } = useTheme();
  const user = useBillingStore((s) => s.user);
  const { user: clerkUser } = useUser();

  const [mounted, setMounted] = useState(false);
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);

  // --- Profile state -------------------------------------------------------
  const userMeta = useMemo(
    () => (user?.['user_metadata'] as Record<string, unknown> | undefined) ?? {},
    [user],
  );
  const accountEmail = user?.email ?? clerkUser?.primaryEmailAddress?.emailAddress ?? '';
  const initialFullName =
    (userMeta['full_name'] as string | undefined) ??
    (userMeta['name'] as string | undefined) ??
    clerkUser?.fullName ??
    accountEmail.split('@')[0] ??
    '';

  const [displayName, setDisplayName] = useState(initialFullName);

  const [preferredName, setPreferredName] = useState<string>(() => {
    return (
      (userMeta['preferred_name'] as string | undefined) ??
      clerkUser?.firstName ??
      initialFullName.split(' ')[0] ??
      ''
    );
  });

  const [workDescription, setWorkDescription] = useState<WorkDescription>('');
  const [instructions, setInstructions] = useState<string>('');
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // --- Preferences state ---------------------------------------------------
  const [prefs, setPrefs] = useState<PreferenceSettings>(DEFAULT_PREFS);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setMounted(true);
    const defaults: GeneralSettings = {
      ...DEFAULT_GENERAL_SETTINGS,
      displayName: initialFullName,
      preferredName:
        (userMeta['preferred_name'] as string | undefined) ??
        clerkUser?.firstName ??
        initialFullName.split(' ')[0] ??
        '',
      workDescription: (userMeta['work_description'] as WorkDescription | undefined) ?? '',
      instructions: (userMeta['instructions'] as string | undefined) ?? '',
    };

    let cancelled = false;
    void fetchPreferenceNamespace<GeneralSettings>(PREF_NAMESPACE, defaults)
      .then((serverSettings) => {
        if (cancelled) return;
        setDisplayName(serverSettings.displayName);
        setPreferredName(serverSettings.preferredName);
        setWorkDescription(serverSettings.workDescription);
        setInstructions(serverSettings.instructions);
        setPrefs({ chatFont: serverSettings.chatFont, voice: serverSettings.voice });
        setLoadError(null);
      })
      .catch((error) => {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : 'Failed to load settings');
        }
      })
      .finally(() => {
        if (!cancelled) setPreferencesLoaded(true);
      });

    return () => {
      cancelled = true;
    };
  }, [clerkUser?.firstName, initialFullName, userMeta]);

  // Auto-save preferences with 400ms debounce
  useEffect(() => {
    if (!mounted || !preferencesLoaded) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const next: GeneralSettings = {
        displayName,
        preferredName,
        workDescription,
        instructions,
        ...prefs,
      };
      void savePreferenceNamespace(PREF_NAMESPACE, next).catch((error) => {
        setSaveError(error instanceof Error ? error.message : 'Failed to save preferences');
      });
    }, 400);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [
    displayName,
    instructions,
    mounted,
    preferencesLoaded,
    preferredName,
    prefs,
    workDescription,
  ]);

  const updatePref = <K extends keyof PreferenceSettings>(key: K, value: PreferenceSettings[K]) => {
    setPrefs((prev) => ({ ...prev, [key]: value }));
  };

  const theme = !mounted || !nextTheme ? 'dark' : (nextTheme as 'dark' | 'light' | 'system');

  // Derived: initials for avatar (up to 2 chars)
  const avatarInitials = (() => {
    const name = preferredName || displayName || accountEmail || 'A';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase();
    }
    return (parts[0]?.[0] ?? 'A').toUpperCase();
  })();

  async function handleSave() {
    const trimmedFull = displayName.trim();
    if (!trimmedFull) return;
    const trimmedPreferred = preferredName.trim() || (trimmedFull.split(' ')[0] ?? trimmedFull);
    setSaving(true);
    setSaveError(null);
    try {
      await savePreferenceNamespace<GeneralSettings>(PREF_NAMESPACE, {
        displayName: trimmedFull,
        preferredName: trimmedPreferred,
        workDescription,
        instructions,
        ...prefs,
      });

      if (clerkUser) {
        await clerkUser.update({
          unsafeMetadata: {
            full_name: trimmedFull,
            preferred_name: trimmedPreferred,
            work_description: workDescription,
            instructions: instructions.slice(0, 2000),
          },
        });
      }
      setSavedAt(Date.now());
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save profile.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      {/* Profile section */}
      <div>
        <h2 className="mb-4 text-base font-semibold text-foreground">Profile</h2>

        <div className="flex flex-col gap-5">
          {/* Avatar row */}
          <div className="flex items-center gap-4">
            <div
              aria-hidden="true"
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-xl font-semibold uppercase tracking-wide text-white"
              style={{
                background:
                  'linear-gradient(135deg, var(--chat-accent-primary, #c8892a) 0%, var(--chat-accent-secondary, #21808d) 100%)',
              }}
            >
              {avatarInitials}
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium text-foreground">
                {accountEmail || 'Account email unavailable'}
              </span>
              <div className="flex items-center gap-2">
                <Link
                  href="/pricing"
                  title="Avatar upload is available with hosted cloud upgrades"
                  className="rounded-md border border-border px-2.5 py-1 text-[11px] font-semibold text-muted-foreground no-underline transition-colors hover:bg-muted"
                >
                  Upgrade for photo upload
                </Link>
                <span className="text-[11px] text-muted-foreground">Hosted cloud upgrade</span>
              </div>
            </div>
          </div>

          {/* Full name */}
          <FieldRow label="Full name" htmlFor="general-full-name">
            <input
              id="general-full-name"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value.slice(0, 80))}
              maxLength={80}
              placeholder="Your name"
              className="w-56 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-ring sm:w-64"
            />
          </FieldRow>

          {/* What should AGI call you */}
          <FieldRow
            label="What should AGI call you?"
            helper="The assistant uses this in greetings and follow-ups."
            htmlFor="general-preferred-name"
          >
            <input
              id="general-preferred-name"
              type="text"
              value={preferredName}
              onChange={(e) => setPreferredName(e.target.value.slice(0, 60))}
              maxLength={60}
              placeholder="Nickname or first name"
              className="w-56 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-ring sm:w-64"
            />
          </FieldRow>

          {/* Work description */}
          <FieldRow label="What best describes your work?" htmlFor="general-work">
            <select
              id="general-work"
              value={workDescription}
              onChange={(e) => setWorkDescription(e.target.value as WorkDescription)}
              className="w-56 cursor-pointer rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-ring sm:w-64"
              style={{ appearance: 'none', WebkitAppearance: 'none' }}
            >
              <option value="">Select a role...</option>
              {WORK_DESCRIPTIONS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </FieldRow>

          {/* Instructions for AGI — full-width textarea (matches reference) */}
          <label className="flex flex-col gap-1.5 pt-1">
            <span className="text-[13px] font-medium text-foreground">Instructions for AGI</span>
            <span className="text-xs leading-relaxed text-muted-foreground">
              AGI will keep these in mind across chats. They help tailor tone, format, and
              explanations to how you work best.
            </span>
            <textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value.slice(0, 2000))}
              maxLength={2000}
              rows={4}
              placeholder="e.g. when learning new concepts, I find analogies particularly helpful"
              className="resize-y rounded-md border border-border bg-background px-3 py-2.5 text-[13px] leading-relaxed text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-ring"
              style={{ fontFamily: 'inherit' }}
            />
            <span className="text-right text-[11px] text-muted-foreground">
              {instructions.length} / 2000
            </span>
          </label>

          {/* Save row */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleSave}
              disabled={displayName.trim().length === 0 || saving}
              className="rounded-md bg-amber-600 px-4 py-2 text-[13px] font-semibold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-50 hover:opacity-90"
            >
              {saving ? 'Saving...' : 'Save profile'}
            </button>
            {savedAt !== null && saveError === null && (
              <span className="text-xs text-muted-foreground">Synced to your account.</span>
            )}
            {saveError !== null && <span className="text-xs text-destructive">{saveError}</span>}
            {loadError !== null && saveError === null && (
              <span className="text-xs text-destructive">{loadError}</span>
            )}
          </div>
        </div>
      </div>

      {/* Preferences section */}
      <div>
        <h2 className="mb-4 text-base font-semibold text-foreground">Preferences</h2>

        <div className="flex flex-col gap-5">
          {/* Appearance */}
          <Row label="Appearance">
            <div className="flex gap-1">
              {THEME_OPTIONS.map((opt) => {
                const Icon = opt.icon;
                const isActive = theme === opt.value;
                return (
                  <button
                    key={opt.value}
                    onClick={() => setNextTheme(opt.value)}
                    className={`flex h-8 w-8 items-center justify-center rounded-md border transition-colors ${isActive ? 'border-amber-600 bg-amber-600 text-white' : 'border-border bg-transparent text-muted-foreground hover:bg-muted'}`}
                    title={opt.label}
                    aria-label={`${opt.label} theme`}
                  >
                    <Icon className="h-4 w-4" />
                  </button>
                );
              })}
            </div>
          </Row>

          {/* Chat font */}
          <Row label="Chat font">
            <select
              className="rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground outline-none focus:ring-1 focus:ring-ring"
              value={prefs.chatFont}
              onChange={(e) => updatePref('chatFont', e.target.value)}
            >
              <option value="serif">Instrument Serif</option>
              <option value="sans">System Sans</option>
              <option value="mono">JetBrains Mono</option>
            </select>
          </Row>

          {/* Voice */}
          <Row label="Voice">
            <select
              className="rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground outline-none focus:ring-1 focus:ring-ring"
              value={prefs.voice}
              onChange={(e) => updatePref('voice', e.target.value)}
            >
              <option value="nova">Nova (clear, neutral)</option>
              <option value="ember">Ember (warm, conversational)</option>
              <option value="vale">Vale (calm, precise)</option>
              <option value="echo">Echo (deep, measured)</option>
            </select>
          </Row>

          {/* Display Language */}
          <Row label="Display Language">
            <LanguageSelector />
          </Row>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Row helper (Preferences section)
// ---------------------------------------------------------------------------

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-9 items-center justify-between gap-4">
      <span className="shrink-0 text-sm text-foreground">{label}</span>
      {children}
    </div>
  );
}

// Profile field row: label (+ optional helper) on the left, control on the
// right, separated by a thin hairline divider (matches the reference layout).
function FieldRow({
  label,
  helper,
  htmlFor,
  children,
}: {
  label: string;
  helper?: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border/40 pb-4">
      <label htmlFor={htmlFor} className="flex min-w-0 flex-col gap-0.5">
        <span className="text-[13px] font-medium text-foreground">{label}</span>
        {helper && <span className="text-[11px] text-muted-foreground">{helper}</span>}
      </label>
      <div className="shrink-0">{children}</div>
    </div>
  );
}
