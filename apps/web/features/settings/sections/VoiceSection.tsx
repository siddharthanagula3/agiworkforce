'use client';

import { formatPrivacyModeLabel } from '@agiworkforce/types';
import { SettingsPageLink } from '../components/SettingsSectionLink';

const byokLabel = formatPrivacyModeLabel('byok');

export function VoiceSection() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
      <div>
        <h1
          style={{
            fontFamily: 'var(--serif)',
            fontSize: 24,
            fontWeight: 500,
            color: 'var(--text-1)',
            margin: '0 0 4px',
          }}
        >
          Voice
        </h1>
        <p style={{ fontSize: 14, color: 'var(--text-3)', margin: 0 }}>
          Composer dictation and managed voice availability.
        </p>
      </div>

      <section
        style={{
          border: '1px solid var(--settings-border)',
          borderRadius: 'var(--radius-lg)',
          background: 'var(--bg-elev)',
          padding: '20px 24px',
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-1)', marginBottom: 6 }}>
          Composer dictation works today
        </div>
        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: 'var(--text-3)' }}>
          Use the microphone in the chat composer to turn speech into message text. Review the
          transcript before sending; this is push-to-talk dictation, not a live voice conversation.
        </p>
      </section>

      <section
        aria-label="Managed voice availability"
        style={{
          border: '1px solid var(--settings-border)',
          borderRadius: 'var(--radius-lg)',
          background: 'var(--bg-elev)',
          padding: '20px 24px',
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-1)', marginBottom: 6 }}>
          Managed voice is not available
        </div>
        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: 'var(--text-3)' }}>
          Voice personas, live-call models, intelligence levels, language selection, metered
          minutes, and provider controls are not active on Web. This page does not show disabled
          settings that the runtime cannot consume.
        </p>
      </section>

      <section
        style={{
          border: '1px solid var(--settings-border)',
          borderRadius: 'var(--radius-lg)',
          background: 'var(--bg-elev)',
          padding: '20px 24px',
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)', marginBottom: 6 }}>
          Bring Your Own Key (BYOK)
        </div>
        <p style={{ margin: '0 0 14px', fontSize: 13, lineHeight: 1.6, color: 'var(--text-3)' }}>
          Desktop and CLI support {byokLabel}. Web dictation does not use those keys and does not
          promise a managed voice allowance.
        </p>
        <SettingsPageLink
          href="/byok"
          style={{
            display: 'inline-block',
            padding: '7px 14px',
            border: '1px solid var(--settings-border)',
            borderRadius: 'var(--radius)',
            color: 'var(--text-2)',
            fontSize: 13,
            textDecoration: 'none',
          }}
        >
          Learn about BYOK
        </SettingsPageLink>
      </section>
    </div>
  );
}
