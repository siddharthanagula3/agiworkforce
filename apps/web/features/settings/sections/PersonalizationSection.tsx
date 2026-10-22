'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Switch } from '@agiworkforce/ui';
import { useBillingStore } from '@shared/stores/web-auth-store';
import { useCurrentUser } from '@/lib/identity/client';
import { SELECTABLE_LANGUAGES } from '@/app/i18n/index';
import { useStyleStore } from '@/features/chat/stores/style-store';
import {
  fetchStoredPreferenceNamespace,
  refreshProfileConsumers,
  savePreferenceNamespace,
} from '@/app/settings/_lib/preferences-client';
import { toUserMessage } from '@/lib/user-error-message';
import {
  WORK_DESCRIPTIONS,
  type WorkDescription,
} from '@/features/settings/constants/work-descriptions';
import { MemorySection } from './MemorySection';

const ABOUT_YOU_NAMESPACE = 'general';

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

const TECHNICAL_LEVELS = [
  { value: 'unspecified', label: 'Not set' },
  { value: 'beginner', label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'expert', label: 'Expert' },
] as const;

type TechnicalLevel = (typeof TECHNICAL_LEVELS)[number]['value'];

const PREFERRED_FORMATTINGS = [
  { value: 'unspecified', label: 'Not set' },
  { value: 'prose', label: 'Prose' },
  { value: 'bullets', label: 'Bullet lists' },
  { value: 'headings_and_bullets', label: 'Headings and bullets' },
  { value: 'tables_and_code', label: 'Tables and code' },
] as const;

type PreferredFormatting = (typeof PREFERRED_FORMATTINGS)[number]['value'];

const PREFERRED_LENGTHS = [
  { value: 'default', label: 'Default' },
  { value: 'shorter', label: 'Shorter' },
  { value: 'longer', label: 'Longer' },
] as const;

type PreferredLength = (typeof PREFERRED_LENGTHS)[number]['value'];

const MAX_ABOUT_YOU_CHARS = 1500;
const MAX_INSTRUCTIONS_CHARS = 2000;
const MAX_PREFERRED_NAME_CHARS = 60;

// Separate from the display language on purpose: that picker says in its own
// help text that conversations are unaffected, and someone reading the
// interface in one language often writes in another.
const RESPONSE_LANGUAGE_AUTO = 'auto';

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

interface ResponsePreferences {
  style: ResponseStyle;
  technicalLevel: TechnicalLevel;
  preferredFormatting: PreferredFormatting;
  preferredLength: PreferredLength;
  responseLanguage: string;
  warmth: number;
  enthusiasm: number;
  headersLists: number;
  emoji: number;
}

const DEFAULT_RESPONSE_PREFERENCES: ResponsePreferences = {
  style: 'default',
  technicalLevel: 'unspecified',
  preferredFormatting: 'unspecified',
  preferredLength: 'default',
  responseLanguage: RESPONSE_LANGUAGE_AUTO,
  warmth: 50,
  enthusiasm: 50,
  headersLists: 50,
  emoji: 50,
};

interface AboutYouSettings {
  preferredName: string;
  workDescription: WorkDescription;
  aboutYou: string;
  instructions: string;
  instructionsEnabled: boolean;
}

function storedChoice<T extends string>(
  value: unknown,
  allowed: readonly { value: T }[],
  fallback: T,
): T {
  return allowed.some((entry) => entry.value === value) ? (value as T) : fallback;
}

function storedTrait(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function storedText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

const SAVE_FAILED_MESSAGE = 'Your personalization was not saved.';

const SELECT_CLASS =
  'h-9 w-full rounded-full border border-border bg-background px-3 text-sm text-foreground outline-none disabled:cursor-not-allowed disabled:opacity-60 focus:ring-1 focus:ring-ring sm:w-56';

const TEXTAREA_CLASS =
  'resize-y rounded-md border border-border bg-background px-3 py-2.5 text-sm leading-relaxed text-foreground placeholder:text-muted-foreground outline-none disabled:cursor-not-allowed disabled:opacity-60 focus:ring-1 focus:ring-ring';

const PILL_BUTTON_CLASS =
  'self-start rounded-full border border-border px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60';

export function PersonalizationSection() {
  const user = useBillingStore((s) => s.user);
  const billingInitialized = useBillingStore((s) => s.initialized);
  const { user: identityUser, isLoaded: identityLoaded } = useCurrentUser();
  const serverProfile = user?.profile;
  const accountEmail = user?.email ?? identityUser?.email ?? '';

  const [preferredName, setPreferredName] = useState('');
  const [workDescription, setWorkDescription] = useState<WorkDescription>('');
  const [aboutYou, setAboutYou] = useState('');
  const [instructions, setInstructions] = useState('');
  const [instructionsEnabled, setInstructionsEnabled] = useState(true);
  const [responses, setResponses] = useState<ResponsePreferences>(DEFAULT_RESPONSE_PREFERENCES);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirtyRef = useRef(false);
  const hydratedRef = useRef(false);
  const mountedRef = useRef(false);
  const saveInFlightRef = useRef<Promise<void> | null>(null);
  const saveFailedRef = useRef(false);
  const keepaliveRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    keepaliveRef.current = false;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  function markDirty() {
    dirtyRef.current = true;
    saveFailedRef.current = false;
    setSavedAt(null);
  }

  const hydrate = useCallback(async () => {
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

    setLoaded(false);
    setLoadError(null);
    setPreferredName(fallbackPreferredName);
    dirtyRef.current = false;

    try {
      const stored = await fetchStoredPreferenceNamespace<AboutYouSettings>(ABOUT_YOU_NAMESPACE);
      setPreferredName(
        typeof stored.preferredName === 'string'
          ? stored.preferredName.trim()
          : fallbackPreferredName,
      );
      setWorkDescription(
        (storedText(stored.workDescription) as WorkDescription | undefined) ??
          (serverProfile?.work_description as WorkDescription | null) ??
          '',
      );
      setAboutYou(typeof stored.aboutYou === 'string' ? stored.aboutYou : '');
      setInstructions(typeof stored.instructions === 'string' ? stored.instructions : '');
      setInstructionsEnabled(stored.instructionsEnabled !== false);

      const storedStyle =
        await fetchStoredPreferenceNamespace<Partial<ResponsePreferences>>(
          PERSONALIZATION_NAMESPACE,
        );
      setResponses({
        style: storedChoice(storedStyle.style, RESPONSE_STYLES, 'default'),
        technicalLevel: storedChoice(storedStyle.technicalLevel, TECHNICAL_LEVELS, 'unspecified'),
        preferredFormatting: storedChoice(
          storedStyle.preferredFormatting,
          PREFERRED_FORMATTINGS,
          'unspecified',
        ),
        preferredLength: storedChoice(storedStyle.preferredLength, PREFERRED_LENGTHS, 'default'),
        responseLanguage:
          typeof storedStyle.responseLanguage === 'string' && storedStyle.responseLanguage
            ? storedStyle.responseLanguage
            : RESPONSE_LANGUAGE_AUTO,
        warmth: storedTrait(storedStyle.warmth) ?? 50,
        enthusiasm: storedTrait(storedStyle.enthusiasm) ?? 50,
        headersLists: storedTrait(storedStyle.headersLists) ?? 50,
        emoji: storedTrait(storedStyle.emoji) ?? 50,
      });
    } catch (error) {
      setLoadError(toUserMessage(error, 'Your personalization could not be loaded.'));
    } finally {
      setLoaded(true);
    }
  }, [accountEmail, identityUser?.firstName, identityUser?.fullName, serverProfile, user?.name]);

  useEffect(() => {
    if (hydratedRef.current) return;
    if (!identityLoaded || !billingInitialized) return;
    hydratedRef.current = true;
    void hydrate();
  }, [billingInitialized, identityLoaded, hydrate]);

  const ready = loaded && loadError === null;

  const latestRef = useRef({
    preferredName,
    workDescription,
    aboutYou,
    instructions,
    instructionsEnabled,
    responses,
  });
  latestRef.current = {
    preferredName,
    workDescription,
    aboutYou,
    instructions,
    instructionsEnabled,
    responses,
  };

  const flushPendingSave = useCallback((): Promise<void> => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    if (saveInFlightRef.current) return saveInFlightRef.current;
    if (!dirtyRef.current) return Promise.resolve();

    const operation = (async () => {
      try {
        while (dirtyRef.current) {
          dirtyRef.current = false;
          const values = latestRef.current;
          const options = { keepalive: keepaliveRef.current, merge: true };
          const results = await Promise.allSettled([
            savePreferenceNamespace<AboutYouSettings>(
              ABOUT_YOU_NAMESPACE,
              {
                preferredName: values.preferredName.trim(),
                workDescription: values.workDescription,
                aboutYou: values.aboutYou.trim(),
                instructions: values.instructions,
                instructionsEnabled: values.instructionsEnabled,
              },
              options,
            ),
            savePreferenceNamespace(PERSONALIZATION_NAMESPACE, values.responses, options),
          ]);
          const failure = results.find((result) => result.status === 'rejected');
          if (failure?.status === 'rejected') {
            dirtyRef.current = true;
            throw failure.reason;
          }
          await refreshProfileConsumers();
        }
        saveFailedRef.current = false;
        if (mountedRef.current) {
          setSaveError(null);
          if (!dirtyRef.current) setSavedAt(Date.now());
        }
      } catch (error) {
        saveFailedRef.current = true;
        const message = toUserMessage(error, SAVE_FAILED_MESSAGE);
        if (mountedRef.current) setSaveError(message);
        else toast.error(message);
        throw error;
      } finally {
        saveInFlightRef.current = null;
      }
    })();
    saveInFlightRef.current = operation;
    return operation;
  }, []);

  useEffect(() => {
    if (!ready || !dirtyRef.current) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      void flushPendingSave().catch(() => {});
    }, 400);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [
    aboutYou,
    flushPendingSave,
    instructions,
    instructionsEnabled,
    preferredName,
    ready,
    responses,
    workDescription,
  ]);

  useEffect(
    () => () => {
      keepaliveRef.current = true;
      if (!saveFailedRef.current) void flushPendingSave().catch(() => {});
    },
    [flushPendingSave],
  );

  function retrySave() {
    dirtyRef.current = true;
    saveFailedRef.current = false;
    void flushPendingSave().catch(() => {});
  }

  function updateResponses(patch: Partial<ResponsePreferences>) {
    markDirty();
    setResponses((current) => ({ ...current, ...patch }));
  }

  function handleResetStyle() {
    markDirty();
    setResponses(DEFAULT_RESPONSE_PREFERENCES);
    useStyleStore.getState().resetToDefault();
    toast.success('Response style is back to the defaults.');
  }

  const disabled = !ready;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-medium text-foreground">Personalization</h1>
        <SaveStatus
          loaded={loaded}
          loadError={loadError}
          saveError={saveError}
          savedAt={savedAt}
          onReload={() => void hydrate()}
          onRetrySave={retrySave}
        />
      </div>

      <section aria-labelledby="personalization-style-heading" className="flex flex-col gap-4">
        <h2 id="personalization-style-heading" className="text-h3 text-foreground">
          Style and tone
        </h2>
        <SelectRow
          id="personalization-response-style"
          label="Response style"
          hint="The overall voice AGI answers in."
          value={responses.style}
          options={RESPONSE_STYLES}
          disabled={disabled}
          onChange={(value) => updateResponses({ style: value as ResponseStyle })}
        />
        <SelectRow
          id="personalization-preferred-length"
          label="Response length"
          value={responses.preferredLength}
          options={PREFERRED_LENGTHS}
          disabled={disabled}
          onChange={(value) => updateResponses({ preferredLength: value as PreferredLength })}
        />
        <SelectRow
          id="personalization-technical-level"
          label="Technical level"
          value={responses.technicalLevel}
          options={TECHNICAL_LEVELS}
          disabled={disabled}
          onChange={(value) => updateResponses({ technicalLevel: value as TechnicalLevel })}
        />
        <SelectRow
          id="personalization-preferred-formatting"
          label="Preferred formatting"
          value={responses.preferredFormatting}
          options={PREFERRED_FORMATTINGS}
          disabled={disabled}
          onChange={(value) =>
            updateResponses({ preferredFormatting: value as PreferredFormatting })
          }
        />
        <SelectRow
          id="personalization-response-language"
          label="Response language"
          value={responses.responseLanguage}
          options={[
            { value: RESPONSE_LANGUAGE_AUTO, label: 'Match my message' },
            ...SELECTABLE_LANGUAGES.map((language) => ({
              value: language.code,
              label: language.nativeName,
            })),
          ]}
          disabled={disabled}
          onChange={(value) => updateResponses({ responseLanguage: value })}
        />
      </section>

      <section
        aria-labelledby="personalization-characteristics-heading"
        className="flex flex-col gap-4"
      >
        <div className="flex flex-col gap-1">
          <h2 id="personalization-characteristics-heading" className="text-h3 text-foreground">
            Characteristics
          </h2>
          <p className="text-sm text-muted-foreground">
            Adjust these on top of your response style.
          </p>
        </div>
        {STYLE_TRAITS.map((trait) => (
          <SelectRow
            key={trait.key}
            id={`personalization-trait-${trait.key}`}
            label={trait.label}
            value={traitLevelFor(responses[trait.key])}
            options={TRAIT_LEVELS}
            disabled={disabled}
            onChange={(value) => {
              const level = TRAIT_LEVELS.find((entry) => entry.value === value);
              if (level) updateResponses({ [trait.key]: level.score });
            }}
          />
        ))}
        <button
          type="button"
          onClick={handleResetStyle}
          disabled={disabled}
          className={PILL_BUTTON_CLASS}
        >
          Reset response style
        </button>
      </section>

      <section
        aria-labelledby="personalization-instructions-heading"
        className="flex flex-col gap-2"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 id="personalization-instructions-heading" className="text-h3 text-foreground">
            <label htmlFor="personalization-instructions">Instructions for AGI</label>
          </h2>
          <Switch
            checked={instructionsEnabled}
            aria-label="Apply instructions for AGI"
            disabled={disabled}
            onCheckedChange={(next) => {
              markDirty();
              setInstructionsEnabled(next);
            }}
          />
        </div>
        <p id="personalization-instructions-hint" className="text-sm text-muted-foreground">
          {instructionsEnabled
            ? 'AGI keeps these in mind in every chat.'
            : 'Off. Your instructions are kept and not sent to the model.'}
        </p>
        <textarea
          id="personalization-instructions"
          aria-describedby="personalization-instructions-hint"
          value={instructions}
          onChange={(e) => {
            markDirty();
            setInstructions(e.target.value.slice(0, MAX_INSTRUCTIONS_CHARS));
          }}
          maxLength={MAX_INSTRUCTIONS_CHARS}
          rows={4}
          disabled={disabled}
          placeholder="e.g. when learning new concepts, I find analogies particularly helpful"
          className={TEXTAREA_CLASS}
          style={{ fontFamily: 'inherit' }}
        />
        <span className="text-end text-sm text-muted-foreground">
          {instructions.length} / {MAX_INSTRUCTIONS_CHARS}
        </span>
      </section>

      <section aria-labelledby="personalization-about-heading" className="flex flex-col gap-4">
        <h2 id="personalization-about-heading" className="text-h3 text-foreground">
          About you
        </h2>
        <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <div className="flex min-w-0 flex-col gap-0.5">
            <label
              htmlFor="personalization-preferred-name"
              className="text-sm font-medium text-foreground"
            >
              What should AGI call you?
            </label>
            <span
              id="personalization-preferred-name-hint"
              className="text-sm text-muted-foreground"
            >
              Leave empty to skip names.
            </span>
          </div>
          <input
            id="personalization-preferred-name"
            aria-describedby="personalization-preferred-name-hint"
            type="text"
            value={preferredName}
            onChange={(e) => {
              markDirty();
              setPreferredName(e.target.value.slice(0, MAX_PREFERRED_NAME_CHARS));
            }}
            maxLength={MAX_PREFERRED_NAME_CHARS}
            disabled={disabled}
            placeholder="Nickname or first name"
            className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground outline-none disabled:cursor-not-allowed disabled:opacity-60 focus:ring-1 focus:ring-ring sm:w-56"
          />
        </div>
        <SelectRow
          id="personalization-work"
          label="What best describes your work?"
          value={workDescription}
          options={[
            { value: '', label: 'Select a role...' },
            ...WORK_DESCRIPTIONS.map((entry) => ({ value: entry, label: entry })),
          ]}
          disabled={disabled}
          onChange={(value) => {
            markDirty();
            setWorkDescription(value as WorkDescription);
          }}
        />
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="personalization-about-you"
            className="text-sm font-medium text-foreground"
          >
            More about you
          </label>
          <p id="personalization-about-you-hint" className="text-sm text-muted-foreground">
            Interests, values or background AGI should keep in mind.
          </p>
          <textarea
            id="personalization-about-you"
            aria-describedby="personalization-about-you-hint"
            value={aboutYou}
            onChange={(e) => {
              markDirty();
              setAboutYou(e.target.value.slice(0, MAX_ABOUT_YOU_CHARS));
            }}
            maxLength={MAX_ABOUT_YOU_CHARS}
            rows={3}
            disabled={disabled}
            placeholder="e.g. I run a small bakery and I am learning to code in the evenings"
            className={TEXTAREA_CLASS}
            style={{ fontFamily: 'inherit' }}
          />
          <span className="text-end text-sm text-muted-foreground">
            {aboutYou.length} / {MAX_ABOUT_YOU_CHARS}
          </span>
        </div>
      </section>

      <MemorySection />
    </div>
  );
}

function SaveStatus({
  loaded,
  loadError,
  saveError,
  savedAt,
  onReload,
  onRetrySave,
}: {
  loaded: boolean;
  loadError: string | null;
  saveError: string | null;
  savedAt: number | null;
  onReload: () => void;
  onRetrySave: () => void;
}) {
  if (!loaded) {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Loading personalization…
      </p>
    );
  }
  if (loadError !== null) {
    return (
      <p role="alert" className="flex flex-wrap items-center gap-2 text-sm text-danger">
        {loadError}
        <button type="button" onClick={onReload} className={PILL_BUTTON_CLASS}>
          Retry
        </button>
      </p>
    );
  }
  if (saveError !== null) {
    return (
      <p role="alert" className="flex flex-wrap items-center gap-2 text-sm text-danger">
        {saveError}
        <button type="button" onClick={onRetrySave} className={PILL_BUTTON_CLASS}>
          Try again
        </button>
      </p>
    );
  }
  if (savedAt !== null) {
    return <p className="text-sm text-muted-foreground">Saved</p>;
  }
  return null;
}

function SelectRow({
  id,
  label,
  hint,
  value,
  options,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  hint?: string;
  value: string;
  options: readonly { value: string; label: string }[];
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const hintId = hint ? `${id}-hint` : undefined;
  return (
    <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <div className="flex min-w-0 flex-col gap-0.5">
        <label htmlFor={id} className="text-sm font-medium text-foreground">
          {label}
        </label>
        {hint && (
          <span id={hintId} className="text-sm text-muted-foreground">
            {hint}
          </span>
        )}
      </div>
      <select
        id={id}
        value={value}
        disabled={disabled}
        aria-describedby={hintId}
        onChange={(event) => onChange(event.target.value)}
        className={SELECT_CLASS}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
