'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useSession } from '@/lib/identity/client';
import { SUPPORTED_LANGUAGES } from '@/app/i18n/index';
import { useAppTheme } from '@shared/hooks/useAppTheme';
import { useSettingsStore } from '@shared/stores/web-settings-store';
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
  type SyncedTheme,
} from '@/features/settings/lib/appearance-namespace';

const SAVE_DEBOUNCE_MS = 400;

const SUPPORTED_LOCALES = SUPPORTED_LANGUAGES.map((language) => language.code);

function isSyncedTheme(value: string | undefined): value is SyncedTheme {
  return value === 'light' || value === 'dark' || value === 'system';
}

export function CloudSettingsSync() {
  const { isLoaded, isSignedIn } = useSession();
  const { theme, setTheme } = useAppTheme();
  const { i18n } = useTranslation();
  const setStatus = useCloudSettingsSyncStatusStore((state) => state.setStatus);

  const accentColor = useSettingsStore((state) => state.accentColor);
  const chatFont = useSettingsStore((state) => state.chatFont);
  const chatTextSize = useSettingsStore((state) => state.chatTextSize);
  const motion = useSettingsStore((state) => state.motion);
  const highContrast = useSettingsStore((state) => state.highContrast);
  const codeBlockWrap = useSettingsStore((state) => state.codeBlockWrap);
  const dictationEnabled = useSettingsStore((state) => state.dictationEnabled);
  const voiceSpeed = useSettingsStore((state) => state.voiceSpeed);
  const hiddenNavIds = useSettingsStore((state) => state.hiddenNavIds);

  const [hydrateKey, setHydrateKey] = useState(0);
  const [hydratedAt, setHydratedAt] = useState<number | null>(null);
  const acknowledged = useRef<AppearanceNamespace | null>(null);
  const acknowledgedLocale = useRef<string | null>(null);
  const writeQueue = useRef<Promise<void>>(Promise.resolve());
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const i18nRef = useRef(i18n);
  i18nRef.current = i18n;

  const language = i18n.language;
  const currentLocale = language.split('-')[0] ?? language;
  const localeRef = useRef(currentLocale);
  localeRef.current = currentLocale;

  const write = useCallback<(namespace: string, patch: Record<string, unknown>) => void>(
    (namespace, patch) => {
      writeQueue.current = writeQueue.current.then(async () => {
        try {
          await savePreferenceNamespace(namespace, patch, { merge: true });
          if (namespace === APPEARANCE_NAMESPACE) {
            acknowledged.current = { ...(acknowledged.current ?? {}), ...patch };
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
    if (!isSignedIn) {
      setHydratedAt(null);
      acknowledged.current = null;
      acknowledgedLocale.current = null;
      setStatus(null, null);
      return;
    }

    let cancelled = false;
    void Promise.all([
      fetchStoredPreferenceNamespace<AppearanceNamespace>(APPEARANCE_NAMESPACE),
      fetchStoredPreferenceNamespace<{ locale?: string }>(LANGUAGE_NAMESPACE),
    ])
      .then(async ([storedAppearance, storedLanguage]) => {
        if (cancelled) return;
        const { theme: storedTheme, ...storeFields } = fromAppearanceNamespace(storedAppearance);
        if (Object.keys(storeFields).length > 0) useSettingsStore.setState(storeFields);
        if (storedTheme) setTheme(storedTheme);

        const storedLocale = readStoredLocale(storedLanguage, SUPPORTED_LOCALES);
        if (storedLocale && storedLocale !== localeRef.current) {
          await i18nRef.current.changeLanguage(storedLocale);
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
  }, [hydrateKey, isLoaded, isSignedIn, setStatus, setTheme]);

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
      dictationEnabled,
      voiceSpeed: voiceSpeed ?? 'normal',
      hiddenNavIds: hiddenNavIds ?? [],
    });
    const delta = appearanceDelta(acknowledged.current, next);
    if (!delta) return;

    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => {
      debounce.current = null;
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
    dictationEnabled,
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
    if (!SUPPORTED_LOCALES.includes(currentLocale)) return;
    if (acknowledgedLocale.current === currentLocale) return;
    write(LANGUAGE_NAMESPACE, { locale: currentLocale });
  }, [currentLocale, hydratedAt, isSignedIn, write]);

  return null;
}

export default CloudSettingsSync;
