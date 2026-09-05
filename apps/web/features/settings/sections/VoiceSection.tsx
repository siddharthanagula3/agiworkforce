'use client';

/**
 * Voice settings section.
 *
 * Web has exactly one working voice surface: composer dictation
 * (push-to-talk speech-to-text, not a live voice conversation). Managed
 * voice personas, live-call models and BYOK do not run here, so this page
 * shows only the two controls that do something: a Dictation toggle and
 * the language dictation transcribes into.
 */

import { defaultLanguage as DEFAULT_LANGUAGE_CODE, SUPPORTED_LANGUAGES } from '@/app/i18n/index';
import { useSettingsStore } from '@shared/stores/web-settings-store';
import { useVoiceInputStore } from '@features/chat/stores/voice-input-store';

export function VoiceSection() {
  const dictationEnabled = useSettingsStore((state) => state.dictationEnabled);
  const setDictationEnabled = useSettingsStore((state) => state.setDictationEnabled);
  const dictationLanguage = useVoiceInputStore((state) => state.language);
  const setDictationLanguage = useVoiceInputStore((state) => state.setLanguage);
  const dictationLanguageCode = dictationLanguage.split('-')[0]?.toLowerCase() ?? '';
  const selectedLanguageCode = SUPPORTED_LANGUAGES.some(
    (lang) => lang.code === dictationLanguageCode,
  )
    ? dictationLanguageCode
    : DEFAULT_LANGUAGE_CODE;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div>
        <h1
          style={{
            fontFamily: 'var(--sans)',
            fontSize: 24,
            fontWeight: 500,
            color: 'var(--text-1)',
            margin: '0 0 4px',
          }}
        >
          Voice
        </h1>
        <p style={{ fontSize: 14, color: 'var(--text-3)', margin: 0 }}>
          Composer dictation, the only voice surface that runs on web.
        </p>
      </div>

      <div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
            padding: '14px 0',
            borderBottom: '1px solid var(--settings-border)',
          }}
        >
          <div>
            <div style={{ fontSize: 14, color: 'var(--text-1)' }}>Dictation</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
              Turn speech into composer text with the microphone button. Review the transcript
              before sending.
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={dictationEnabled}
            aria-label="Dictation"
            onClick={() => setDictationEnabled(!dictationEnabled)}
            style={{
              flexShrink: 0,
              width: 44,
              height: 24,
              borderRadius: 999,
              border: 'none',
              cursor: 'pointer',
              background: dictationEnabled
                ? 'var(--chat-accent-primary)'
                : 'var(--settings-border)',
              transition: 'background 0.15s',
            }}
          >
            <span
              aria-hidden="true"
              style={{
                display: 'block',
                width: 18,
                height: 18,
                borderRadius: '50%',
                background: 'var(--bg-elev)',
                transform: `translateX(${dictationEnabled ? 23 : 3}px)`,
                transition: 'transform 0.15s',
              }}
            />
          </button>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
            padding: '14px 0',
          }}
        >
          <div style={{ fontSize: 14, color: 'var(--text-1)' }}>Language</div>
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
              padding: '0 8px',
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
