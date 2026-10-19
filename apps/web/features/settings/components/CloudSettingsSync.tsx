'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useSession } from '@/lib/identity/client';
import { getCsrfToken } from '@/lib/client/csrf';
import { selectableLanguageOrDefault, SUPPORTED_LANGUAGES } from '@/app/i18n/index';
import { useAppTheme } from '@shared/hooks/useAppTheme';
import { useSettingsStore, type CustomCommand } from '@shared/stores/web-settings-store';
import {
  fetchStoredPreferenceNamespace,
  savePreferenceNamespace,
} from '@/app/settings/_lib/preferences-client';
import { toUserMessage } from '@/lib/user-error-message';
import { useCloudSettingsSyncStatusStore } from '@/features/settings/lib/cloud-settings-sync-status';
import {
  APPEARANCE_NAMESPACE,
  LANGUAGE_NAMESPACE,
  appearanceDelta,
  fromAppearanceNamespace,
  readStoredLocale,
  toAppearanceNamespace,
  type AppearanceNamespace,
  type AppearanceSettings,
  type SyncedTheme,
} from '@/features/settings/lib/appearance-namespace';
import {
  CUSTOM_COMMANDS_NAMESPACE,
  hydratedCustomCommands,
  readAccountCustomCommands,
  sameCustomCommands,
  type CustomCommandsNamespace,
} from '@/features/settings/lib/custom-commands-namespace';

const SAVE_DEBOUNCE_MS = 400;

const SUPPORTED_LOCALES = SUPPORTED_LANGUAGES.map((language) => language.code);

function isSyncedTheme(value: string | undefined): value is SyncedTheme {
  return value === 'light' || value === 'dark' || value === 'system';
}

type AppearanceField = keyof AppearanceSettings;
type AppearanceRevisions = Partial<Record<AppearanceField, number>>;

function fieldsUnchangedSince(
  account: Partial<AppearanceSettings>,
  atRead: AppearanceRevisions,
  now: AppearanceRevisions,
): Partial<AppearanceSettings> {
  return Object.fromEntries(
    Object.entries(account).filter(
      ([field]) => atRead[field as AppearanceField] === now[field as AppearanceField],
    ),
  ) as Partial<AppearanceSettings>;
}

export function CloudSettingsSync() {
  const { isLoaded, isSignedIn, userId } = useSession();
  const { theme, setTheme } = useAppTheme();
  const { i18n } = useTranslation();
  const setStatus = useCloudSettingsSyncStatusStore((state) => state.setStatus);

  const accentColor = useSettingsStore((state) => state.accentColor);
  const chatFont = useSettingsStore((state) => state.chatFont);
  const chatTextSize = useSettingsStore((state) => state.chatTextSize);
  const motion = useSettingsStore((state) => state.motion);
  const highContrast = useSettingsStore((state) => state.highContrast);
  const codeBlockWrap = useSettingsStore((state) => state.codeBlockWrap);
  const sendWithEnter = useSettingsStore((state) => state.sendWithEnter);
  const defaultWorkMode = useSettingsStore((state) => state.defaultWorkMode);
  const followUpSuggestionsEnabled = useSettingsStore((state) => state.followUpSuggestionsEnabled);
  const followUpBehavior = useSettingsStore((state) => state.followUpBehavior);
  const dictationEnabled = useSettingsStore((state) => state.dictationEnabled);
  const voiceSpeed = useSettingsStore((state) => state.voiceSpeed);
  const hiddenNavIds = useSettingsStore((state) => state.hiddenNavIds);
  const customCommands = useSettingsStore((state) => state.customCommands);

  const [hydrateKey, setHydrateKey] = useState(0);
  const [hydratedAt, setHydratedAt] = useState<number | null>(null);
  const acknowledged = useRef<AppearanceNamespace | null>(null);
  const acknowledgedLocale = useRef<string | null>(null);
  const acknowledgedCommands = useRef<CustomCommand[] | null>(null);
  const writeQueue = useRef<Promise<void>>(Promise.resolve());
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingAppearanceWrite = useRef<Record<string, unknown> | null>(null);

  const i18nRef = useRef(i18n);
  i18nRef.current = i18n;

  const language = i18n.language;
  const currentLocale = language.split('-')[0] ?? language;
  const localeRef = useRef(currentLocale);
  localeRef.current = currentLocale;

  const appearanceRevisions = useRef<AppearanceRevisions>({});
  const renderedAppearance = useRef<Record<AppearanceField, unknown> | null>(null);
  useLayoutEffect(() => {
    const current: Record<AppearanceField, unknown> = {
      theme,
      accentColor,
      chatFont,
      chatTextSize,
      motion,
      highContrast,
      codeBlockWrap,
      sendWithEnter,
      defaultWorkMode,
      followUpSuggestionsEnabled,
      followUpBehavior,
      dictationEnabled,
      voiceSpeed,
      hiddenNavIds,
    };
    const previous = renderedAppearance.current;
    renderedAppearance.current = current;
    if (!previous) return;
    for (const field of Object.keys(current) as AppearanceField[]) {
      if (Object.is(previous[field], current[field])) continue;
      appearanceRevisions.current[field] = (appearanceRevisions.current[field] ?? 0) + 1;
    }
  }, [
    accentColor,
    chatFont,
    chatTextSize,
    codeBlockWrap,
    sendWithEnter,
    defaultWorkMode,
    dictationEnabled,
    followUpBehavior,
    followUpSuggestionsEnabled,
    hiddenNavIds,
    highContrast,
    motion,
    theme,
    voiceSpeed,
  ]);

  const write = useCallback<(namespace: string, patch: Record<string, unknown>) => void>(
    (namespace, patch) => {
      writeQueue.current = writeQueue.current.then(async () => {
        try {
          await savePreferenceNamespace(namespace, patch, {
            merge: true,
            keepalive: namespace !== CUSTOM_COMMANDS_NAMESPACE,
          });
          if (namespace === APPEARANCE_NAMESPACE) {
            acknowledged.current = { ...(acknowledged.current ?? {}), ...patch };
          } else if (namespace === CUSTOM_COMMANDS_NAMESPACE) {
            acknowledgedCommands.current = readAccountCustomCommands(patch);
          } else {
            acknowledgedLocale.current = String(patch['locale'] ?? acknowledgedLocale.current);
          }
          setStatus(null, null);
        } catch (error) {
          setStatus(toUserMessage(error, 'Your settings did not reach your account.'), () =>
            write(namespace, patch),
          );
        }
      });
    },
    [setStatus],
  );

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn || !userId) {
      setHydratedAt(null);
      acknowledged.current = null;
      acknowledgedLocale.current = null;
      acknowledgedCommands.current = null;
      setStatus(null, null);
      return;
    }

    let cancelled = false;
    const revisionsAtRead = { ...appearanceRevisions.current };
    void getCsrfToken().catch(() => {});
    void Promise.all([
      fetchStoredPreferenceNamespace<AppearanceNamespace>(APPEARANCE_NAMESPACE),
      fetchStoredPreferenceNamespace<{ locale?: string }>(LANGUAGE_NAMESPACE),
      fetchStoredPreferenceNamespace<CustomCommandsNamespace>(CUSTOM_COMMANDS_NAMESPACE),
    ])
      .then(async ([storedAppearance, storedLanguage, storedCommands]) => {
        if (cancelled) return;
        const { theme: storedTheme, ...storeFields } = fieldsUnchangedSince(
          fromAppearanceNamespace(storedAppearance),
          revisionsAtRead,
          appearanceRevisions.current,
        );
        if (Object.keys(storeFields).length > 0) useSettingsStore.setState(storeFields);
        if (storedTheme) setTheme(storedTheme);

        const accountCommands = readAccountCustomCommands(storedCommands);
        useSettingsStore.setState({
          customCommands: hydratedCustomCommands({
            account: accountCommands,
            local: useSettingsStore.getState().customCommands,
            localOwner: useSettingsStore.getState().customCommandsOwner,
            userId,
          }),
          customCommandsOwner: userId,
        });
        acknowledgedCommands.current = accountCommands;

        const storedLocale = readStoredLocale(storedLanguage, SUPPORTED_LOCALES);
        if (storedLocale && storedLocale !== localeRef.current) {
          await i18nRef.current.changeLanguage(selectableLanguageOrDefault(storedLocale));
        }
        if (cancelled) return;
        acknowledgedLocale.current = storedLocale;

        acknowledged.current = storedAppearance;
        setHydratedAt(Date.now());
        setStatus(null, null);
      })
      .catch((error) => {
        if (cancelled) return;
        // Nothing is written until a read succeeds: pushing this device's values
        // over a namespace we failed to read is the clobber this guards against.
        setStatus(toUserMessage(error, 'Your settings could not be synced.'), () =>
          setHydrateKey((value) => value + 1),
        );
      });

    return () => {
      cancelled = true;
    };
  }, [hydrateKey, isLoaded, isSignedIn, setStatus, setTheme, userId]);

  useEffect(() => {
    if (hydratedAt === null || !isSignedIn) return;
    const next = toAppearanceNamespace({
      theme: isSyncedTheme(theme) ? theme : 'system',
      accentColor,
      chatFont: chatFont ?? 'default',
      chatTextSize,
      motion,
      highContrast,
      codeBlockWrap,
      sendWithEnter,
      defaultWorkMode,
      followUpSuggestionsEnabled,
      followUpBehavior,
      dictationEnabled,
      voiceSpeed: voiceSpeed ?? 'normal',
      hiddenNavIds: hiddenNavIds ?? [],
    });
    const delta = appearanceDelta(acknowledged.current, next);
    if (!delta) return;

    pendingAppearanceWrite.current = delta as Record<string, unknown>;
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => {
      debounce.current = null;
      pendingAppearanceWrite.current = null;
      write(APPEARANCE_NAMESPACE, delta as Record<string, unknown>);
    }, SAVE_DEBOUNCE_MS);

    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [
    accentColor,
    chatFont,
    chatTextSize,
    codeBlockWrap,
    sendWithEnter,
    defaultWorkMode,
    dictationEnabled,
    followUpBehavior,
    followUpSuggestionsEnabled,
    hiddenNavIds,
    highContrast,
    hydratedAt,
    isSignedIn,
    motion,
    theme,
    voiceSpeed,
    write,
  ]);

  useEffect(() => {
    if (hydratedAt === null || !isSignedIn) return;
    if (sameCustomCommands(acknowledgedCommands.current, customCommands)) return;
    write(CUSTOM_COMMANDS_NAMESPACE, { commands: customCommands });
  }, [customCommands, hydratedAt, isSignedIn, write]);

  useEffect(() => {
    if (hydratedAt === null || !isSignedIn) return;
    if (!SUPPORTED_LOCALES.includes(currentLocale)) return;
    if (acknowledgedLocale.current === currentLocale) return;
    write(LANGUAGE_NAMESPACE, { locale: currentLocale });
  }, [currentLocale, hydratedAt, isSignedIn, write]);

  useEffect(() => {
    const flush = () => {
      const patch = pendingAppearanceWrite.current;
      if (!patch) return;
      pendingAppearanceWrite.current = null;
      if (debounce.current) {
        clearTimeout(debounce.current);
        debounce.current = null;
      }
      void savePreferenceNamespace(APPEARANCE_NAMESPACE, patch, { merge: true, keepalive: true });
    };
    window.addEventListener('pagehide', flush);
    return () => window.removeEventListener('pagehide', flush);
  }, []);

  return null;
}

export default CloudSettingsSync;
