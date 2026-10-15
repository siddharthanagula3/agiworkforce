import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { guestChatModel, guestChatSystemPrompt } from '@/lib/guest-chat/guest-chat-service';

import { chatSystemPromptSection, chatSystemPromptSections } from '../chat-system-prompt';
import { PROMPT_IDS, PROMPT_MANIFEST, isPromptId } from '../prompt-manifest';
import { parsePromptStamp, promptStamp } from '../prompt-registry';

const NAMES_AGI = /\bYou are AGI,/u;
const AGI_CLARIFIER = 'AGI is your name, not a claim to be artificial general intelligence';

/**
 * The manifest says which version serves; the release ledger says on what
 * channel and on what evidence. Pairing them is what stops a prompt reaching
 * 100% of traffic without a staged release behind it.
 */

const LEDGER_FILE = path.resolve(
  import.meta.dirname,
  '..',
  '..',
  '..',
  '..',
  '..',
  'packages',
  'ai',
  'model-registry',
  'catalog',
  'routing-policies.json',
);

interface ReleaseRecord {
  readonly version: number;
  readonly artifact: string;
  readonly id: string;
  readonly channel: string;
}

const records = (
  JSON.parse(readFileSync(LEDGER_FILE, 'utf8')) as {
    release: { records: readonly ReleaseRecord[] };
  }
).release.records;

const promptRecords = records.filter((record) => record.artifact === 'prompt');

function channelOf(stamp: string): string | null {
  const history = promptRecords.filter((record) => record.id === stamp);
  return history[history.length - 1]?.channel ?? null;
}

describe('the prompt manifest and the release ledger', () => {
  it('gives every shipped prompt version a release record', () => {
    const unreleased = PROMPT_IDS.flatMap((id) =>
      PROMPT_MANIFEST[id].versions
        .map((version) => promptStamp(id, version.version))
        .filter((stamp) => channelOf(stamp) === null),
    );

    expect(unreleased).toEqual([]);
  });

  it('never records a prompt version the manifest no longer holds', () => {
    for (const record of promptRecords) {
      const parsed = parsePromptStamp(record.id);
      expect(parsed, `${record.id} is not a manifest prompt stamp`).not.toBeNull();
      if (!parsed || !isPromptId(parsed.id)) continue;
      expect(
        PROMPT_MANIFEST[parsed.id].versions.map((version) => version.version),
        record.id,
      ).toContain(parsed.version);
    }
  });

  it('holds a voice instructions version that names the assistant AGI with the chat identity rules', () => {
    const agiVoices = PROMPT_MANIFEST['voice.live_instructions'].versions.filter((version) =>
      /^You are AGI, the voice assistant in /u.test(version.text),
    );

    expect(agiVoices.length).toBeGreaterThan(0);
    for (const { text } of agiVoices) {
      expect(text).toContain(AGI_CLARIFIER);
      expect(text).toContain('Never claim to be human');
      expect(text).toContain("never present yourself as another AI company's assistant or product");
    }
  });

  it('names the assistant the same way in the pinned chat, voice and guest chat prompts', () => {
    const chatIdentity = chatSystemPromptSection(
      chatSystemPromptSections(PROMPT_MANIFEST['chat.system'].pinnedVersion),
      'identity',
    );
    const voice = PROMPT_MANIFEST['voice.live_instructions'];
    const voiceText =
      voice.versions.find((version) => version.version === voice.pinnedVersion)?.text ?? '';
    const guestText = guestChatSystemPrompt(guestChatModel());
    const chatNamesAgi = NAMES_AGI.test(chatIdentity);

    expect(NAMES_AGI.test(voiceText), 'pin voice.live_instructions with chat.system').toBe(
      chatNamesAgi,
    );
    expect(NAMES_AGI.test(guestText), 'guest chat sends the pinned chat identity').toBe(
      chatNamesAgi,
    );
    expect(guestText.includes(AGI_CLARIFIER), 'guest chat says AGI is a name').toBe(chatNamesAgi);
  });

  it('serves only a stable version by default, and stages every other one', () => {
    for (const id of PROMPT_IDS) {
      const entry = PROMPT_MANIFEST[id];
      for (const version of entry.versions) {
        const stamp = promptStamp(id, version.version);
        const channel = channelOf(stamp);
        if (version.version === entry.pinnedVersion) {
          expect(channel, `${stamp} is pinned`).toBe('stable');
        } else {
          expect(channel, `${stamp} is not pinned`).not.toBe('stable');
        }
      }
    }
  });
});
