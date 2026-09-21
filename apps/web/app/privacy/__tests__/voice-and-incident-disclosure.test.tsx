import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@shared/components/layout/Header', () => ({ Header: () => null }));
vi.mock('@/features/marketing/components/MarketingFooter', () => ({
  MarketingFooter: () => null,
}));

import PrivacyPage from '../page';

const WEB_DIR = path.join(__dirname, '..', '..', '..');

function read(relative: string): string {
  return readFileSync(path.join(WEB_DIR, relative), 'utf8');
}

function voiceSessionsMigration(): string {
  const dir = path.join(WEB_DIR, 'db', 'neon');
  const file = readdirSync(dir).find((name) => name.endsWith('_voice_sessions.sql'));
  if (!file) throw new Error('no voice_sessions migration found');
  return readFileSync(path.join(dir, file), 'utf8');
}

function flatCopy(): string {
  return document.body.textContent?.replace(/\s+/g, ' ') ?? '';
}

describe('/privacy discloses microphone audio', () => {
  it('names when audio is captured, where it goes, and that it is not stored', () => {
    render(<PrivacyPage />);
    const copy = flatCopy();

    expect(screen.getByText('Voice and audio')).toBeInTheDocument();
    expect(copy).toMatch(/captured only while you are dictating into the composer or holding a/);
    expect(copy).toMatch(/transcription endpoint/);
    expect(copy).toMatch(/We do not store the audio\./);
    expect(copy).toMatch(/no voiceprint, speaker identification or other biometric identifier/);
  });

  it('keeps the disclosure tied to the routes that send the audio', () => {
    const dictation = read('app/api/llm/v1/audio/transcriptions/route.ts');
    const live = read('app/api/voice/live/sessions/route.ts');

    expect(dictation).toContain("providerApiUrl('openai', 'audio/transcriptions')");
    expect(live).toContain("OPENAI_KEY_ENV = 'OPENAI_API_KEY'");
  });

  it('keeps the no-stored-audio claim tied to the session table that holds no audio', () => {
    const migration = voiceSessionsMigration();
    const table = /create table if not exists public\.voice_sessions \(([\s\S]*?)\n\);/.exec(
      migration,
    )?.[1];

    expect(
      table,
      'the voice session table is no longer declared where the claim reads it',
    ).toBeTruthy();
    expect(table).not.toMatch(/\baudio\b/i);
  });
});

describe('/privacy discloses how a breach notice would reach a reader', () => {
  it('states the procedure, the clock, and the delivery limit rather than implying email', () => {
    render(<PrivacyPage />);
    const copy = flatCopy();

    expect(screen.getByRole('heading', { name: 'Security incidents' })).toBeInTheDocument();
    expect(copy).toMatch(/72-hour clock for notifying a regulator where a law requires one/);
    expect(copy).toMatch(/There is no account-lifecycle mail in this product/);
    expect(copy).toMatch(
      /as an in-product message and at a dated public address rather than by email/,
    );
    expect(copy).toMatch(
      /Neither that in-product notice nor that public page exists as a built feature/,
    );
  });

  it('does not promise a notice the product cannot send', () => {
    render(<PrivacyPage />);
    const copy = flatCopy();

    expect(copy).not.toMatch(/we will email (you|every affected)/i);
    expect(copy).not.toMatch(/notify you by email/i);
  });
});
