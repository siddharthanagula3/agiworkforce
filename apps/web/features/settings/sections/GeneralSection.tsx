'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Monitor, Sun, Moon } from 'lucide-react';
import { useAppTheme as useTheme } from '@shared/hooks/useAppTheme';
import { useBillingStore } from '@shared/stores/web-auth-store';
import { useUser } from '@clerk/nextjs';
import { LanguageSelector } from '@/features/settings/components/LanguageSelector';
import { useTTS } from '@/lib/hooks/useTTS';
import { useModelStore } from '@shared/stores/model-store';
import { useThinkingStore, type EffortLevel } from '@shared/stores/thinking-store';
import { useSettingsStore, type ChatTextSize } from '@shared/stores/web-settings-store';
import { CustomCommandsSettings } from '@/features/settings/components/CustomCommandsSettings';
import { KeyboardShortcutsDialog } from '@/features/chat/components/dialogs/KeyboardShortcutsDialog';
import { KEYBOARD_SHORTCUT_DOCS } from '@/features/chat/hooks/use-keyboard-shortcuts';
import {
  fetchStoredPreferenceNamespace,
  refreshProfileConsumers,
  saveDisplayName,
  savePreferenceNamespace,
} from '@/app/settings/_lib/preferences-client';

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

interface GeneralSettings {
  preferredName: string;
  workDescription: WorkDescription;
  instructions: string;
}

function storedText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

export function GeneralSection() {
  const { theme: nextTheme, setTheme: setNextTheme } = useTheme();
  const user = useBillingStore((s) => s.user);
  const billingInitialized = useBillingStore((s) => s.initialized);
  const { user: clerkUser, isLoaded: clerkLoaded } = useUser();

  const [mounted, setMounted] = useState(false);
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);

  const serverProfile = user?.profile;
  const accountEmail = user?.email ?? clerkUser?.primaryEmailAddress?.emailAddress ?? '';

  const [displayName, setDisplayName] = useState('');
  const [preferredName, setPreferredName] = useState('');
  const [workDescription, setWorkDescription] = useState<WorkDescription>('');
  const [instructions, setInstructions] = useState<string>('');
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirtyRef = useRef(false);
  const hydratedRef = useRef(false);

  function markDirty() {
    dirtyRef.current = true;
  }

  useEffect(() => {
    setMounted(true);
  }, []);

  const hydrateProfilePreferences = useCallback(async () => {
    const fallbackFullName =
      serverProfile?.display_name ??
      user?.name ??
      clerkUser?.fullName ??
      accountEmail.split('@')[0] ??
      '';
    const fallbackPreferredName =
      serverProfile?.preferred_name ?? clerkUser?.firstName ?? fallbackFullName.split(' ')[0] ?? '';

    setPreferencesLoaded(false);
    setLoadError(null);
    setDisplayName(fallbackFullName);
    setPreferredName(fallbackPreferredName);
    dirtyRef.current = false;

    try {
      const stored = await fetchStoredPreferenceNamespace<GeneralSettings>(PREF_NAMESPACE);
      setPreferredName(storedText(stored.preferredName) ?? fallbackPreferredName);
      setWorkDescription(
        (storedText(stored.workDescription) as WorkDescription | undefined) ??
          (serverProfile?.work_description as WorkDescription | null) ??
          '',
      );
      setInstructions(typeof stored.instructions === 'string' ? stored.instructions : '');
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Failed to load settings');
    } finally {
      setPreferencesLoaded(true);
    }
  }, [accountEmail, clerkUser?.firstName, clerkUser?.fullName, serverProfile, user?.name]);

  useEffect(() => {
    if (hydratedRef.current) return;
    if (!clerkLoaded || !billingInitialized) return;
    hydratedRef.current = true;
    void hydrateProfilePreferences();
  }, [billingInitialized, clerkLoaded, hydrateProfilePreferences]);

  const profilePreferencesReady = preferencesLoaded && loadError === null;

  useEffect(() => {
    if (!mounted || !preferencesLoaded || !dirtyRef.current || loadError !== null) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const next: GeneralSettings = {
        preferredName: preferredName.trim(),
        workDescription,
        instructions,
      };
      void savePreferenceNamespace(PREF_NAMESPACE, next)
        .then(() => {
          setSaveError(null);
          return refreshProfileConsumers();
        })
        .catch((error) => {
          setSaveError(error instanceof Error ? error.message : 'Failed to save preferences');
        });
    }, 400);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [instructions, loadError, mounted, preferencesLoaded, preferredName, workDescription]);

  const theme = !mounted || !nextTheme ? 'dark' : (nextTheme as 'dark' | 'light' | 'system');

  const avatarInitials = (() => {
    const name = preferredName || displayName || accountEmail || 'A';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase();
    }
    return (parts[0]?.[0] ?? 'A').toUpperCase();
  })();

  async function handleSave() {
    if (!profilePreferencesReady) return;
    const trimmedFull = displayName.trim();
    if (!trimmedFull) return;
    const trimmedPreferred = preferredName.trim() || (trimmedFull.split(' ')[0] ?? trimmedFull);
    setSaving(true);
    setSaveError(null);
    try {
      await saveDisplayName(trimmedFull);
      await savePreferenceNamespace<GeneralSettings>(PREF_NAMESPACE, {
        preferredName: trimmedPreferred,
        workDescription,
        instructions,
      });
      setPreferredName(trimmedPreferred);

      await refreshProfileConsumers();
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
              {/* No "Upgrade for photo upload" chip here.
                  It was rendered unconditionally — no tier check — so it
                  survived every upgrade, including Max 15x, and told a paying
                  customer on the top plan to upgrade. Worse, upgrading does
                  not unlock it: avatar upload is not implemented on any tier,
                  so the link sent people to /pricing to buy a feature that
                  does not exist. Removed rather than tier-gated, because
                  gating it would still promise something nothing delivers.
                  Restore it when there is a real upload path to point at. */}
            </div>
          </div>

          {/* Full name */}
          <FieldRow label="Full name" htmlFor="general-full-name">
            <input
              id="general-full-name"
              type="text"
              value={displayName}
              onChange={(e) => {
                markDirty();
                setDisplayName(e.target.value.slice(0, 80));
              }}
              maxLength={80}
              disabled={!profilePreferencesReady || saving}
              placeholder="Your name"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none disabled:cursor-not-allowed disabled:opacity-60 focus:ring-1 focus:ring-ring sm:w-64"
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
              onChange={(e) => {
                markDirty();
                setPreferredName(e.target.value.slice(0, 60));
              }}
              maxLength={60}
              disabled={!profilePreferencesReady || saving}
              placeholder="Nickname or first name"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none disabled:cursor-not-allowed disabled:opacity-60 focus:ring-1 focus:ring-ring sm:w-64"
            />
          </FieldRow>

          {/* Work description */}
          <FieldRow label="What best describes your work?" htmlFor="general-work">
            <select
              id="general-work"
              value={workDescription}
              disabled={!profilePreferencesReady || saving}
              onChange={(e) => {
                markDirty();
                setWorkDescription(e.target.value as WorkDescription);
              }}
              className="w-full cursor-pointer rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none disabled:cursor-not-allowed disabled:opacity-60 focus:ring-1 focus:ring-ring sm:w-64"
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
              onChange={(e) => {
                markDirty();
                setInstructions(e.target.value.slice(0, 2000));
              }}
              maxLength={2000}
              rows={4}
              disabled={!profilePreferencesReady || saving}
              placeholder="e.g. when learning new concepts, I find analogies particularly helpful"
              className="resize-y rounded-md border border-border bg-background px-3 py-2.5 text-[13px] leading-relaxed text-foreground placeholder:text-muted-foreground outline-none disabled:cursor-not-allowed disabled:opacity-60 focus:ring-1 focus:ring-ring"
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
              disabled={!profilePreferencesReady || displayName.trim().length === 0 || saving}
              className="rounded-md bg-amber-600 px-4 py-2 text-[13px] font-semibold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-50 hover:opacity-90"
            >
              {saving ? 'Saving...' : 'Save profile'}
            </button>
            {savedAt !== null && saveError === null && (
              <span className="text-xs text-muted-foreground">Synced to your account.</span>
            )}
            {saveError !== null && <span className="text-xs text-destructive">{saveError}</span>}
            {!preferencesLoaded && (
              <span role="status" className="text-xs text-muted-foreground">
                Loading profile…
              </span>
            )}
            {loadError !== null && saveError === null && (
              <span className="flex items-center gap-2 text-xs text-destructive">
                {loadError}
                <button
                  type="button"
                  onClick={() => void hydrateProfilePreferences()}
                  className="rounded-md border border-border px-2 py-1 font-medium text-foreground hover:bg-muted"
                >
                  Retry
                </button>
              </span>
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
            <div className="flex gap-1" role="group" aria-label="Theme">
              {THEME_OPTIONS.map((opt) => {
                const Icon = opt.icon;
                const isActive = theme === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setNextTheme(opt.value)}
                    className={`flex h-8 w-8 items-center justify-center rounded-md border transition-colors ${isActive ? 'border-amber-600 bg-amber-600 text-white' : 'border-border bg-transparent text-muted-foreground hover:bg-muted'}`}
                    title={opt.label}
                    aria-label={`${opt.label} theme`}
                    aria-pressed={isActive}
                  >
                    <Icon className="h-4 w-4" />
                  </button>
                );
              })}
            </div>
          </Row>

          {/* Display Language */}
          <Row label="Display Language">
            <LanguageSelector />
          </Row>

          {/* Default model */}
          <DefaultModelRow />

          {/* Reasoning effort */}
          <ReasoningEffortRow />

          {/* Chat text size */}
          <ChatTextSizeRow />

          {/* Code block wrapping */}
          <CodeBlockWrapRow />

          {/* Read-aloud voice */}
          <ReadAloudVoiceRow />

          {/* Keyboard shortcuts */}
          <KeyboardShortcutsRow />
        </div>
      </div>

      {/* Custom slash commands */}
      <div>
        <h2 className="mb-1 text-base font-semibold text-foreground">Custom commands</h2>
        <p className="mb-4 text-xs leading-relaxed text-muted-foreground">
          Commands you define here appear in the composer&apos;s slash menu alongside the built-in
          ones.
        </p>
        <CustomCommandsSettings />
      </div>
    </div>
  );
}

const SELECT_CLASS =
  'h-8 rounded-md border border-border bg-background px-2 text-sm text-foreground';

function DefaultModelRow() {
  const selectedModelId = useModelStore((state) => state.selectedModelId);
  const setSelectedModel = useModelStore((state) => state.setSelectedModel);
  const availableModels = useModelStore((state) => state.availableModels);

  const selectable = availableModels.filter((model) => model.availability !== 'coming_soon');
  if (selectable.length === 0) return null;

  return (
    <Row label="Default model">
      <select
        value={selectedModelId}
        onChange={(event) => setSelectedModel(event.target.value)}
        aria-label="Default model"
        className={`${SELECT_CLASS} max-w-[220px]`}
      >
        {selectable.map((model) => (
          <option key={model.id} value={model.id}>
            {model.name}
          </option>
        ))}
      </select>
    </Row>
  );
}

const EFFORT_LEVELS: EffortLevel[] = ['low', 'medium', 'high', 'xhigh', 'max'];

function ReasoningEffortRow() {
  const enabled = useThinkingStore((state) => state.enabled);
  const effort = useThinkingStore((state) => state.effort);
  const setEnabled = useThinkingStore((state) => state.setEnabled);
  const setEffort = useThinkingStore((state) => state.setEffort);

  return (
    <Row label="Reasoning effort">
      <select
        value={enabled ? effort : 'off'}
        onChange={(event) => {
          const next = event.target.value;
          if (next === 'off') setEnabled(false);
          else setEffort(next as EffortLevel);
        }}
        aria-label="Reasoning effort"
        className={SELECT_CLASS}
      >
        <option value="off">Off</option>
        {EFFORT_LEVELS.map((level) => (
          <option key={level} value={level}>
            {level === 'xhigh' ? 'Extra high' : level.charAt(0).toUpperCase() + level.slice(1)}
          </option>
        ))}
      </select>
    </Row>
  );
}

function ChatTextSizeRow() {
  const chatTextSize = useSettingsStore((state) => state.chatTextSize);
  const setChatTextSize = useSettingsStore((state) => state.setChatTextSize);

  return (
    <Row label="Chat text size">
      <select
        value={chatTextSize}
        onChange={(event) => setChatTextSize(event.target.value as ChatTextSize)}
        aria-label="Chat text size"
        className={SELECT_CLASS}
      >
        <option value="small">Small</option>
        <option value="default">Default</option>
        <option value="large">Large</option>
      </select>
    </Row>
  );
}

function CodeBlockWrapRow() {
  const codeBlockWrap = useSettingsStore((state) => state.codeBlockWrap);
  const setCodeBlockWrap = useSettingsStore((state) => state.setCodeBlockWrap);

  return (
    <Row label="Wrap long code lines">
      <button
        type="button"
        role="switch"
        aria-checked={codeBlockWrap}
        aria-label="Wrap long code lines"
        onClick={() => setCodeBlockWrap(!codeBlockWrap)}
        className={`h-6 w-11 shrink-0 rounded-full transition-colors ${
          codeBlockWrap ? 'bg-primary' : 'bg-muted'
        }`}
      >
        <span
          aria-hidden="true"
          className={`block h-5 w-5 rounded-full bg-background transition-transform ${
            codeBlockWrap ? 'translate-x-[22px]' : 'translate-x-0.5'
          }`}
        />
      </button>
    </Row>
  );
}

function KeyboardShortcutsRow() {
  const [open, setOpen] = useState(false);

  return (
    <Row label="Keyboard shortcuts">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="h-8 rounded-md border border-border px-2.5 text-xs text-foreground transition-colors hover:bg-muted"
      >
        View shortcuts
      </button>
      <KeyboardShortcutsDialog
        open={open}
        onOpenChange={setOpen}
        shortcuts={KEYBOARD_SHORTCUT_DOCS}
      />
    </Row>
  );
}

function ReadAloudVoiceRow() {
  const { isSupported, voices, voiceUri, setVoiceUri, speak, stop, isSpeaking } = useTTS();

  useEffect(() => () => stop(), [stop]);

  if (!isSupported || voices.length === 0) return null;

  return (
    <Row label="Read-aloud voice">
      <div className="flex min-w-0 items-center gap-2">
        <select
          value={voiceUri ?? ''}
          onChange={(event) => setVoiceUri(event.target.value || null)}
          aria-label="Read-aloud voice"
          className="h-8 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-sm text-foreground sm:max-w-[220px]"
        >
          <option value="">Browser default</option>
          {voices.map((voice) => (
            <option key={voice.voiceURI} value={voice.voiceURI}>
              {voice.name} ({voice.lang})
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() =>
            isSpeaking ? stop() : speak('This is how messages will sound when read aloud.')
          }
          className="h-8 shrink-0 rounded-md border border-border px-2.5 text-xs text-foreground transition-colors hover:bg-muted"
        >
          {isSpeaking ? 'Stop' : 'Preview'}
        </button>
      </div>
    </Row>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-9 flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <span className="text-sm text-foreground sm:shrink-0">{label}</span>
      {children}
    </div>
  );
}

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
    <div className="flex flex-col items-stretch gap-2 border-b border-border/40 pb-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <label htmlFor={htmlFor} className="flex min-w-0 flex-col gap-0.5">
        <span className="text-[13px] font-medium text-foreground">{label}</span>
        {helper && <span className="text-[11px] text-muted-foreground">{helper}</span>}
      </label>
      <div className="w-full min-w-0 sm:w-auto sm:shrink-0">{children}</div>
    </div>
  );
}
