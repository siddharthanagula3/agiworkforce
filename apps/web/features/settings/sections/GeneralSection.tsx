'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Monitor, Sun, Moon } from 'lucide-react';
import { useAppTheme as useTheme } from '@shared/hooks/useAppTheme';
import { useBillingStore } from '@shared/stores/web-auth-store';
import { useCurrentUser } from '@/lib/identity/client';
import { LanguageSelector } from '@/features/settings/components/LanguageSelector';
import { useTTS } from '@/lib/hooks/useTTS';
import { useModelStore } from '@shared/stores/model-store';
import { useThinkingStore, type EffortLevel } from '@shared/stores/thinking-store';
import { APP_NAV_DESTINATIONS } from '@shared/components/layout/app-nav-items';
import { getModelReasoning, splitEffortsByEntitlement } from '@shared/config/llm';
import {
  ACCENT_COLORS,
  useSettingsStore,
  type ChatTextSize,
} from '@shared/stores/web-settings-store';
import { CustomCommandsSettings } from '@/features/settings/components/CustomCommandsSettings';
import { KeyboardShortcutsDialog } from '@/features/chat/components/dialogs/KeyboardShortcutsDialog';
import { KEYBOARD_SHORTCUT_DOCS } from '@/features/chat/hooks/use-keyboard-shortcuts';
import {
  fetchStoredPreferenceNamespace,
  refreshProfileConsumers,
  saveDisplayName,
  savePreferenceNamespace,
} from '@/app/settings/_lib/preferences-client';
import { settingsService } from '@/features/settings/services/user-preferences';
import { IMAGE_ATTACHMENT_MIME_TYPES, MAX_AVATAR_BYTES } from '@agiworkforce/types';
import { toUserMessage } from '@/lib/user-error-message';
import {
  WORK_DESCRIPTIONS,
  type WorkDescription,
} from '@/features/settings/constants/work-descriptions';

const THEME_OPTIONS = [
  { value: 'system' as const, icon: Monitor, label: 'System' },
  { value: 'light' as const, icon: Sun, label: 'Light' },
  { value: 'dark' as const, icon: Moon, label: 'Dark' },
];

const PREF_NAMESPACE = 'general';

// Mobile's personalization panel writes here and the server reads it
// (user-identity.ts). Web writing anywhere else would give the two surfaces
// separate, silently diverging copies of the same preference.
const PERSONALIZATION_NAMESPACE = 'personalization';

const RESPONSE_STYLES = [
  { value: 'default', label: 'Default' },
  { value: 'concise', label: 'Concise' },
  { value: 'explanatory', label: 'Explanatory' },
  { value: 'formal', label: 'Formal' },
] as const;

type ResponseStyle = (typeof RESPONSE_STYLES)[number]['value'];

// The four traits mobile ships, on the same 0-100 scale with 50 neutral. The
// server only acts on a value 20 or more away from neutral, so the three
// levels below sit safely past that threshold in either direction.
const STYLE_TRAITS = [
  { key: 'warmth', label: 'Warmth' },
  { key: 'enthusiasm', label: 'Enthusiasm' },
  { key: 'headersLists', label: 'Headers and lists' },
  { key: 'emoji', label: 'Emoji' },
] as const;

const TRAIT_LEVELS = [
  { value: 'less', label: 'Less', score: 20 },
  { value: 'default', label: 'Default', score: 50 },
  { value: 'more', label: 'More', score: 80 },
] as const;

type TraitLevel = (typeof TRAIT_LEVELS)[number]['value'];

function traitLevelFor(value: number): TraitLevel {
  if (value <= 30) return 'less';
  if (value >= 70) return 'more';
  return 'default';
}

interface PersonalizationSettings {
  style: ResponseStyle;
  warmth: number;
  enthusiasm: number;
  headersLists: number;
  emoji: number;
}

const DEFAULT_PERSONALIZATION: PersonalizationSettings = {
  style: 'default',
  warmth: 50,
  enthusiasm: 50,
  headersLists: 50,
  emoji: 50,
};

function storedTrait(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.max(0, Math.min(100, Math.round(value)));
}

const AVATAR_MAX_MB = MAX_AVATAR_BYTES / (1024 * 1024);
const AVATAR_ACCEPT = IMAGE_ATTACHMENT_MIME_TYPES.join(',');

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
  const { user: identityUser, isLoaded: identityLoaded } = useCurrentUser();

  const [mounted, setMounted] = useState(false);
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);

  const serverProfile = user?.profile;
  const accountEmail = user?.email ?? identityUser?.email ?? '';

  const [displayName, setDisplayName] = useState('');
  const [preferredName, setPreferredName] = useState('');
  const [workDescription, setWorkDescription] = useState<WorkDescription>('');
  const [instructions, setInstructions] = useState<string>('');
  const [personalization, setPersonalization] =
    useState<PersonalizationSettings>(DEFAULT_PERSONALIZATION);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirtyRef = useRef(false);
  const hydratedRef = useRef(false);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);

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
      identityUser?.fullName ??
      accountEmail.split('@')[0] ??
      '';
    const fallbackPreferredName =
      serverProfile?.preferred_name ??
      identityUser?.firstName ??
      fallbackFullName.split(' ')[0] ??
      '';

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

      const storedStyle = await fetchStoredPreferenceNamespace<Partial<PersonalizationSettings>>(
        PERSONALIZATION_NAMESPACE,
      ).catch(() => ({}) as Partial<PersonalizationSettings>);
      setPersonalization({
        style: RESPONSE_STYLES.some((entry) => entry.value === storedStyle.style)
          ? (storedStyle.style as ResponseStyle)
          : 'default',
        warmth: storedTrait(storedStyle.warmth) ?? 50,
        enthusiasm: storedTrait(storedStyle.enthusiasm) ?? 50,
        headersLists: storedTrait(storedStyle.headersLists) ?? 50,
        emoji: storedTrait(storedStyle.emoji) ?? 50,
      });
    } catch (error) {
      setLoadError(toUserMessage(error, 'Failed to load settings'));
    } finally {
      setPreferencesLoaded(true);
    }
  }, [accountEmail, identityUser?.firstName, identityUser?.fullName, serverProfile, user?.name]);

  useEffect(() => {
    if (hydratedRef.current) return;
    if (!identityLoaded || !billingInitialized) return;
    hydratedRef.current = true;
    void hydrateProfilePreferences();
  }, [billingInitialized, identityLoaded, hydrateProfilePreferences]);

  const profilePreferencesReady = preferencesLoaded && loadError === null;

  const latestFormValuesRef = useRef({
    preferredName,
    workDescription,
    instructions,
    personalization,
  });
  latestFormValuesRef.current = { preferredName, workDescription, instructions, personalization };

  const flushPendingSave = useCallback(() => {
    if (!dirtyRef.current) return;
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    dirtyRef.current = false;
    const values = latestFormValuesRef.current;
    void Promise.all([
      savePreferenceNamespace<GeneralSettings>(PREF_NAMESPACE, {
        preferredName: values.preferredName.trim(),
        workDescription: values.workDescription,
        instructions: values.instructions,
      }),
      savePreferenceNamespace(PERSONALIZATION_NAMESPACE, values.personalization),
    ]).catch(() => {});
  }, []);

  useEffect(() => {
    if (!mounted || !preferencesLoaded || !dirtyRef.current || loadError !== null) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      const next: GeneralSettings = {
        preferredName: preferredName.trim(),
        workDescription,
        instructions,
      };
      void Promise.all([
        savePreferenceNamespace(PREF_NAMESPACE, next),
        savePreferenceNamespace(PERSONALIZATION_NAMESPACE, personalization),
      ])
        .then(() => {
          dirtyRef.current = false;
          setSaveError(null);
          return refreshProfileConsumers();
        })
        .catch((error) => {
          setSaveError(toUserMessage(error, 'Failed to save preferences'));
        });
    }, 400);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [
    instructions,
    loadError,
    mounted,
    personalization,
    preferencesLoaded,
    preferredName,
    workDescription,
  ]);

  useEffect(() => () => flushPendingSave(), [flushPendingSave]);

  const theme = !mounted || !nextTheme ? 'dark' : (nextTheme as 'dark' | 'light' | 'system');

  const avatarInitials = (() => {
    const name = preferredName || displayName || accountEmail || 'A';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase();
    }
    return (parts[0]?.[0] ?? 'A').toUpperCase();
  })();

  const avatarUrl = typeof user?.avatar_url === 'string' ? user.avatar_url : null;

  async function handleAvatarFile(file: File) {
    setAvatarError(null);
    if (file.size > MAX_AVATAR_BYTES) {
      setAvatarError(`Pick an image under ${AVATAR_MAX_MB} MB.`);
      return;
    }
    const mime = file.type.split(';', 1)[0]?.trim().toLowerCase() ?? '';
    if (!IMAGE_ATTACHMENT_MIME_TYPES.includes(mime)) {
      setAvatarError('Pick a PNG, JPEG, GIF, WebP, or HEIC image.');
      return;
    }
    setAvatarBusy(true);
    try {
      const { error } = await settingsService.uploadAvatar(file);
      if (error) {
        setAvatarError(error);
        return;
      }
      await refreshProfileConsumers();
    } catch (err) {
      setAvatarError(toUserMessage(err, 'Upload failed.'));
    } finally {
      setAvatarBusy(false);
    }
  }

  async function handleAvatarRemove() {
    setAvatarError(null);
    setAvatarBusy(true);
    try {
      const { error } = await settingsService.updateProfile({ avatar_url: null });
      if (error) {
        setAvatarError(error);
        return;
      }
      await refreshProfileConsumers();
    } catch (err) {
      setAvatarError(toUserMessage(err, 'Could not remove the photo.'));
    } finally {
      setAvatarBusy(false);
    }
  }

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
      setSaveError(toUserMessage(err, 'Failed to save profile.'));
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
          <div className="flex items-start gap-4">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt="Your profile photo"
                className="h-14 w-14 shrink-0 rounded-full object-cover"
              />
            ) : (
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
            )}
            <div className="flex flex-col items-start gap-2">
              <span className="text-sm font-medium text-foreground">
                {accountEmail || 'Account email unavailable'}
              </span>
              <input
                ref={avatarInputRef}
                type="file"
                accept={AVATAR_ACCEPT}
                className="sr-only"
                aria-label="Profile photo"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (file) void handleAvatarFile(file);
                }}
              />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => avatarInputRef.current?.click()}
                  disabled={avatarBusy}
                  className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
                >
                  {avatarBusy ? 'Working…' : avatarUrl ? 'Change photo' : 'Upload photo'}
                </button>
                {avatarUrl && (
                  <button
                    type="button"
                    onClick={() => void handleAvatarRemove()}
                    disabled={avatarBusy}
                    className="rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
                  >
                    Remove
                  </button>
                )}
              </div>
              <span className="text-xs text-muted-foreground">
                PNG, JPEG, GIF, WebP, or HEIC. Up to {AVATAR_MAX_MB} MB.
              </span>
              {avatarError && (
                <span role="alert" className="text-xs text-danger">
                  {avatarError}
                </span>
              )}
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

          {/*
            Response style. Mobile has shipped these for a while; web had
            nothing, and until 2026-08-21 neither surface's values reached the
            model. Both now write the same `personalization` namespace that
            user-identity.ts reads, so the two surfaces cannot diverge.
          */}
          <FieldRow label="Response style" htmlFor="general-response-style">
            <select
              id="general-response-style"
              value={personalization.style}
              onChange={(e) => {
                markDirty();
                setPersonalization((current) => ({
                  ...current,
                  style: e.target.value as ResponseStyle,
                }));
              }}
              disabled={!profilePreferencesReady || saving}
              className={SELECT_CLASS}
            >
              {RESPONSE_STYLES.map((entry) => (
                <option key={entry.value} value={entry.value}>
                  {entry.label}
                </option>
              ))}
            </select>
          </FieldRow>

          {STYLE_TRAITS.map((trait) => (
            <FieldRow key={trait.key} label={trait.label} htmlFor={`general-trait-${trait.key}`}>
              <select
                id={`general-trait-${trait.key}`}
                value={traitLevelFor(personalization[trait.key])}
                onChange={(e) => {
                  markDirty();
                  const level = TRAIT_LEVELS.find((entry) => entry.value === e.target.value);
                  if (!level) return;
                  setPersonalization((current) => ({ ...current, [trait.key]: level.score }));
                }}
                disabled={!profilePreferencesReady || saving}
                aria-label={trait.label}
                className={SELECT_CLASS}
              >
                {TRAIT_LEVELS.map((level) => (
                  <option key={level.value} value={level.value}>
                    {level.label}
                  </option>
                ))}
              </select>
            </FieldRow>
          ))}

          {/* Instructions for AGI, full-width textarea (matches reference) */}
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
            <span className="text-right text-[12px] text-muted-foreground">
              {instructions.length} / 2000
            </span>
          </label>

          {/* Save row */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleSave}
              disabled={!profilePreferencesReady || displayName.trim().length === 0 || saving}
              className="rounded-md bg-amber-700 px-4 py-2 text-[13px] font-semibold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-50 hover:opacity-90"
            >
              {saving ? 'Saving...' : 'Save profile'}
            </button>
            {savedAt !== null && saveError === null && (
              <span className="text-xs text-muted-foreground">Saved</span>
            )}
            {saveError !== null && <span className="text-xs text-danger">{saveError}</span>}
            {!preferencesLoaded && (
              <span role="status" className="text-xs text-muted-foreground">
                Loading profile…
              </span>
            )}
            {loadError !== null && saveError === null && (
              <span className="flex items-center gap-2 text-xs text-danger">
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
                    className={`flex h-8 w-8 items-center justify-center rounded-md border transition-colors ${isActive ? 'border-amber-700 bg-amber-700 text-white' : 'border-border bg-transparent text-muted-foreground hover:bg-muted'}`}
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

          <AccentColorRow />

          <HighContrastRow />
          <MotionRow />
          <SidebarItemsRow />

          <Row
            label="Display Language"
            hint="Translates pricing, marketing pages, and device sign-in. The chat interface is still English."
          >
            <LanguageSelector />
          </Row>

          {/* Default model */}
          <DefaultModelRow />

          {/* Reasoning effort */}
          <ReasoningEffortRow />

          {/* Chat text size */}
          <ChatFontRow />
          <ChatTextSizeRow />

          {/* Code block wrapping */}
          <CodeBlockWrapRow />

          {/* Read-aloud voice */}
          <ReadAloudVoiceRow />
          <VoiceSpeedRow />

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

      <p className="text-xs text-muted-foreground">
        Keeping chats in step across devices?{' '}
        <a
          href="/settings/sync"
          className="inline-block min-h-6 py-0.5 text-[var(--chat-accent-primary-text)] hover:underline"
        >
          Sync settings
        </a>
        .
      </p>
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

function effortLabel(level: EffortLevel): string {
  return level === 'xhigh' ? 'Extra high' : level.charAt(0).toUpperCase() + level.slice(1);
}

/**
 * CAP-020. The composer's effort picker has always split levels by entitlement
 * (ComposerFooter, via splitEffortsByEntitlement) and this one offered all five
 * unconditionally, the same setting, two pickers, one of them lying. The
 * server clamps anything above the plan's cap in resolveRequestEffort, so
 * picking "Max" on a tier without manual model selection silently produced the
 * default while Settings kept displaying Max.
 *
 * Gated levels stay VISIBLE and disabled rather than being hidden: a level that
 * vanishes reads as unsupported by the product, which is a different and wrong
 * message from "your plan does not include this".
 */
function ReasoningEffortRow() {
  const enabled = useThinkingStore((state) => state.enabled);
  const effort = useThinkingStore((state) => state.effort);
  const setEnabled = useThinkingStore((state) => state.setEnabled);
  const setEffort = useThinkingStore((state) => state.setEffort);
  const tier = useBillingStore((state) => state.subscription?.tier ?? null);
  const billingReady = useBillingStore((state) => state.initialized);
  const selectedModelId = useModelStore((state) => state.selectedModelId);

  // Until billing has loaded we do not know the tier, and guessing would either
  // gate a paying customer or promise a level the server will clamp. Offer
  // everything and let the composer's own gate speak once it knows.
  const gatedEfforts = useMemo(() => {
    if (!billingReady || tier === null) return new Set<string>();
    const { gated } = splitEffortsByEntitlement(getModelReasoning(selectedModelId), tier);
    return new Set<string>(gated);
  }, [billingReady, selectedModelId, tier]);

  return (
    <Row
      label="Reasoning effort"
      hint={
        // ANTHROPIC_THINKING_BUDGET runs 4096 at low to 65536 at max, so the
        // ceiling really is 16x. It is a CEILING, not a spend: the model may
        // use far less on an easy question, and saying "costs 16x more" would
        // be a claim the billing data would contradict.
        gatedEfforts.size > 0
          ? 'Higher effort lets a reply think up to 16x longer, which draws on your usage allowance faster. Levels above your plan need one with manual model selection.'
          : 'Higher effort lets a reply think up to 16x longer, which draws on your usage allowance faster.'
      }
    >
      <select
        value={enabled ? effort : 'off'}
        onChange={(event) => {
          const next = event.target.value;
          if (next === 'off') setEnabled(false);
          else if (!gatedEfforts.has(next)) setEffort(next as EffortLevel);
        }}
        aria-label="Reasoning effort"
        className={SELECT_CLASS}
      >
        <option value="off">Off</option>
        {EFFORT_LEVELS.map((level) => {
          const gated = gatedEfforts.has(level);
          return (
            <option key={level} value={level} disabled={gated}>
              {gated ? `${effortLabel(level)}, not on your plan` : effortLabel(level)}
            </option>
          );
        })}
      </select>
    </Row>
  );
}

function AccentColorRow() {
  const accentColor = useSettingsStore((state) => state.accentColor);
  const setAccentColor = useSettingsStore((state) => state.setAccentColor);

  return (
    <Row label="Accent colour">
      <div className="flex gap-1.5" role="group" aria-label="Accent colour">
        {ACCENT_COLORS.map((accent) => {
          const isActive = accentColor === accent.value;
          return (
            <button
              key={accent.value}
              type="button"
              onClick={() => setAccentColor(accent.value)}
              data-accent-swatch={accent.value}
              title={accent.label}
              aria-label={`${accent.label} accent`}
              aria-pressed={isActive}
              className={`flex h-7 w-7 items-center justify-center rounded-full ring-offset-2 ring-offset-background transition-shadow ${isActive ? 'ring-2 ring-foreground' : 'ring-0'}`}
            >
              {isActive && <Check className="h-3.5 w-3.5 text-white" aria-hidden="true" />}
            </button>
          );
        })}
      </div>
    </Row>
  );
}

function SidebarItemsRow() {
  // Coalesced: a persisted store written before this key existed rehydrates
  // without it, and a crash here would take the whole settings panel down.
  const hiddenNavIds = useSettingsStore((state) => state.hiddenNavIds) ?? [];
  const setNavItemVisible = useSettingsStore((state) => state.setNavItemVisible);

  // Only the destinations the rail itself marks hideable. Chat is excluded at
  // the source, so it cannot be switched off and strand the user without a way
  // back to conversations.
  const hideable = APP_NAV_DESTINATIONS.filter((destination) => destination.hideable);

  return (
    <Row label="Sidebar items" hint="Hide anything you do not use from the left rail.">
      <div className="flex flex-wrap justify-end gap-1.5" role="group" aria-label="Sidebar items">
        {hideable.map((destination) => {
          const visible = !hiddenNavIds.includes(destination.id);
          return (
            <button
              key={destination.id}
              type="button"
              role="switch"
              aria-checked={visible}
              aria-label={destination.label}
              onClick={() => setNavItemVisible(destination.id, !visible)}
              className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
                visible
                  ? 'border-transparent bg-accent text-accent-foreground ring-1 ring-inset ring-primary'
                  : 'border-border text-muted-foreground hover:text-foreground'
              }`}
            >
              {destination.label}
            </button>
          );
        })}
      </div>
    </Row>
  );
}

function MotionRow() {
  const motion = useSettingsStore((state) => state.motion);
  const setMotion = useSettingsStore((state) => state.setMotion);

  const options = [
    { value: 'system' as const, label: 'System' },
    { value: 'reduced' as const, label: 'Reduced' },
  ];

  return (
    <Row
      label="Motion"
      hint="Reduce animation in streaming responses and other interface elements. System follows your device setting."
    >
      <div className="flex gap-1" role="group" aria-label="Motion">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={motion === option.value}
            aria-label={`${option.label} motion`}
            onClick={() => setMotion(option.value)}
            className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
              motion === option.value
                ? 'bg-accent text-accent-foreground ring-1 ring-inset ring-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </Row>
  );
}

function HighContrastRow() {
  const highContrast = useSettingsStore((state) => state.highContrast);
  const setHighContrast = useSettingsStore((state) => state.setHighContrast);

  return (
    <Row label="High contrast">
      <button
        type="button"
        role="switch"
        aria-checked={highContrast}
        aria-label="High contrast"
        onClick={() => setHighContrast(!highContrast)}
        className={`h-6 w-11 shrink-0 rounded-full transition-colors ${
          highContrast ? 'bg-primary' : 'bg-muted'
        }`}
      >
        <span
          aria-hidden="true"
          className={`block h-5 w-5 rounded-full bg-background transition-transform ${
            highContrast ? 'translate-x-[22px]' : 'translate-x-0.5'
          }`}
        />
      </button>
    </Row>
  );
}

function ChatFontRow() {
  const chatFont = useSettingsStore((state) => state.chatFont) ?? 'default';
  const setChatFont = useSettingsStore((state) => state.setChatFont);

  // Only families layout.tsx and globals.css actually load. 'dyslexic' is
  // self-hosted under public/fonts/opendyslexic/, the control this replaces
  // pointed at a CDN font the CSP blocked, so it fell back silently and
  // looked broken.
  const options = [
    { value: 'default' as const, label: 'Default' },
    { value: 'sans' as const, label: 'Sans' },
    { value: 'serif' as const, label: 'Serif' },
    { value: 'dyslexic' as const, label: 'Dyslexic friendly' },
  ];

  return (
    <Row label="Chat font" hint="Applies to message text. Code always stays monospace.">
      <select
        value={chatFont}
        onChange={(event) => setChatFont(event.target.value as typeof chatFont)}
        aria-label="Chat font"
        className={SELECT_CLASS}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
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

function VoiceSpeedRow() {
  const { isSupported, voices } = useTTS();
  const voiceSpeed = useSettingsStore((state) => state.voiceSpeed) ?? 'normal';
  const setVoiceSpeed = useSettingsStore((state) => state.setVoiceSpeed);

  // Hidden rather than disabled when the browser exposes no voices: the row
  // above already explains the absence, and a second dead control repeating it
  // adds noise without adding information.
  if (!isSupported || voices.length === 0) return null;

  const options = [
    { value: 'slow' as const, label: 'Slow' },
    { value: 'normal' as const, label: 'Normal' },
    { value: 'fast' as const, label: 'Fast' },
  ];

  return (
    <Row label="Read-aloud speed">
      <div className="flex gap-1" role="group" aria-label="Read-aloud speed">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={voiceSpeed === option.value}
            aria-label={`${option.label} read-aloud speed`}
            onClick={() => setVoiceSpeed(option.value)}
            className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
              voiceSpeed === option.value
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </Row>
  );
}

function ReadAloudVoiceRow() {
  const { isSupported, voices, voiceUri, setVoiceUri, speak, stop, isSpeaking } = useTTS();

  useEffect(() => () => stop(), [stop]);

  if (!isSupported || voices.length === 0) {
    return (
      <Row label="Read-aloud voice">
        <span className="text-xs text-muted-foreground sm:text-right">
          This browser exposes no speech voices, so read-aloud is unavailable here.
        </span>
      </Row>
    );
  }

  return (
    <>
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
      <p className="-mt-3 text-xs leading-relaxed text-muted-foreground">
        Read-aloud uses your browser&apos;s built-in speech. It always plays through your system
        default output device, browsers give web pages no way to choose one, so change it in your
        operating system&apos;s sound settings. AGI reads a reply on request and then stops; web has
        no hands-free voice conversation that listens back between turns.
      </p>
    </>
  );
}

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-9 flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <span className={`flex min-w-0 flex-col gap-0.5 ${hint ? '' : 'sm:shrink-0'}`}>
        <span className="text-sm text-foreground">{label}</span>
        {hint && <span className="text-[12px] text-muted-foreground">{hint}</span>}
      </span>
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
        {helper && <span className="text-[12px] text-muted-foreground">{helper}</span>}
      </label>
      <div className="w-full min-w-0 sm:w-auto sm:shrink-0">{children}</div>
    </div>
  );
}
