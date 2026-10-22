'use client';

import { useCallback, useEffect, useState } from 'react';
import { Switch } from '@agiworkforce/ui';
import { defaultLanguage as DEFAULT_LANGUAGE_CODE, SUPPORTED_LANGUAGES } from '@/app/i18n/index';
import { useSettingsStore } from '@shared/stores/web-settings-store';
import { useVoiceInputStore } from '@features/chat/stores/voice-input-store';
import { useVoiceSessionStore } from '@features/chat/stores/voice-session-store';
import { LIVE_VOICES } from '@features/chat/lib/live-voices';
import {
  VoiceCarousel,
  VoiceLanguagePicker,
} from '@features/chat/components/Voice/VoiceSettingsModal';
import { HelpArticleLink } from '@/features/support/components/HelpArticleLink';

const SYSTEM_DEFAULT_MICROPHONE = '';

function useMicrophones(): MediaDeviceInfo[] | null {
  const [devices, setDevices] = useState<MediaDeviceInfo[] | null>(null);
  const refresh = useCallback(async () => {
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      setDevices(all.filter((device) => device.kind === 'audioinput' && device.deviceId));
    } catch {
      setDevices([]);
    }
  }, []);

  useEffect(() => {
    const media = typeof navigator === 'undefined' ? undefined : navigator.mediaDevices;
    if (!media || typeof media.enumerateDevices !== 'function') return;
    void refresh();
    media.addEventListener?.('devicechange', refresh);
    return () => media.removeEventListener?.('devicechange', refresh);
  }, [refresh]);

  return devices;
}

export function VoiceSection() {
  const dictationEnabled = useSettingsStore((state) => state.dictationEnabled);
  const setDictationEnabled = useSettingsStore((state) => state.setDictationEnabled);
  const dictationLanguage = useVoiceInputStore((state) => state.language);
  const setDictationLanguage = useVoiceInputStore((state) => state.setLanguage);
  const microphoneId = useVoiceInputStore((state) => state.microphoneId);
  const setMicrophoneId = useVoiceInputStore((state) => state.setMicrophoneId);
  const microphones = useMicrophones();
  const voice = useVoiceSessionStore((state) => state.voice);
  const setVoice = useVoiceSessionStore((state) => state.setVoice);
  const voiceLanguage = useVoiceSessionStore((state) => state.language);
  const setVoiceLanguage = useVoiceSessionStore((state) => state.setLanguage);
  const [languageOpen, setLanguageOpen] = useState(false);
  const dictationLanguageCode = dictationLanguage.split('-')[0]?.toLowerCase() ?? '';
  const selectedLanguageCode = SUPPORTED_LANGUAGES.some(
    (lang) => lang.code === dictationLanguageCode,
  )
    ? dictationLanguageCode
    : DEFAULT_LANGUAGE_CODE;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
      <div>
        <h1
          style={{
            fontFamily: 'var(--sans)',
            fontSize: 24,
            fontWeight: 500,
            color: 'var(--text-1)',
            margin: '0 0 var(--space-1)',
          }}
        >
          Voice
        </h1>
        <p style={{ fontSize: 14, color: 'var(--text-3)', margin: 0 }}>
          Choose your voice and dictate with the microphone button.
        </p>
        <div style={{ marginTop: 'var(--space-2)' }}>
          <HelpArticleLink docId="voice" label="How voice works" />
        </div>
      </div>

      <div
        data-testid="voice-picker"
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-3)',
          padding: 'var(--space-4) 0',
          borderBottom: '1px solid var(--settings-border)',
        }}
      >
        <VoiceCarousel voices={LIVE_VOICES} voiceUri={voice} onVoiceChange={setVoice} />
        <VoiceLanguagePicker
          language={voiceLanguage}
          open={languageOpen}
          onOpenChange={setLanguageOpen}
          onLanguageChange={setVoiceLanguage}
        />
      </div>

      <div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 'var(--space-4)',
            padding: 'var(--space-4) 0',
            borderBottom: '1px solid var(--settings-border)',
          }}
        >
          <div>
            <div style={{ fontSize: 14, color: 'var(--text-1)' }}>Dictation</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 'var(--space-1)' }}>
              Turn speech into composer text with the microphone button. Review the transcript
              before sending.
            </div>
          </div>
          <Switch
            checked={dictationEnabled}
            aria-label="Dictation"
            onCheckedChange={setDictationEnabled}
          />
        </div>

        {microphones && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 'var(--space-4)',
              padding: 'var(--space-4) 0',
              borderBottom: '1px solid var(--settings-border)',
            }}
          >
            <div>
              <div style={{ fontSize: 14, color: 'var(--text-1)' }}>Microphone</div>
              <div style={{ fontSize: 14, color: 'var(--text-3)', marginTop: 'var(--space-1)' }}>
                Used for dictation
              </div>
            </div>
            <select
              value={
                microphones.some((device) => device.deviceId === microphoneId)
                  ? microphoneId
                  : SYSTEM_DEFAULT_MICROPHONE
              }
              disabled={!dictationEnabled}
              onChange={(event) => setMicrophoneId(event.target.value)}
              aria-label="Microphone"
              style={{
                height: 32,
                maxWidth: 240,
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--settings-border)',
                background: 'var(--bg-base)',
                color: 'var(--text-1)',
                fontSize: 14,
                padding: '0 var(--space-2)',
                opacity: dictationEnabled ? 1 : 0.6,
              }}
            >
              <option value={SYSTEM_DEFAULT_MICROPHONE}>System default</option>
              {microphones
                .filter((device) => device.deviceId !== 'default')
                .map((device, index) => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label || `Microphone ${index + 1}`}
                  </option>
                ))}
            </select>
          </div>
        )}

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 'var(--space-4)',
            padding: 'var(--space-4) 0',
          }}
        >
          <div style={{ fontSize: 14, color: 'var(--text-1)' }}>Dictation language</div>
          <select
            value={selectedLanguageCode}
            disabled={!dictationEnabled}
            onChange={(event) => setDictationLanguage(event.target.value)}
            aria-label="Dictation language"
            style={{
              height: 32,
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--settings-border)',
              background: 'var(--bg-base)',
              color: 'var(--text-1)',
              fontSize: 13,
              padding: '0 var(--space-2)',
              opacity: dictationEnabled ? 1 : 0.6,
            }}
          >
            {SUPPORTED_LANGUAGES.map((lang) => (
              <option key={lang.code} value={lang.code}>
                {lang.nativeName}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
