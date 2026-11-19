import { describe, expect, it } from 'vitest';

import { buildCapabilityPreamble } from '@/app/api/llm/v1/chat/completions/lib/capability-preamble';
import {
  CHAT_SYSTEM_PROMPT_VERSIONS,
  chatSystemPromptSections,
} from '@/lib/prompts/chat-system-prompt';
import { freeQuotaCapabilityPreamble } from '@/lib/server/free-quota-turn';

import {
  surfacePublishesArtifactApps,
  surfaceRendersWritingCards,
} from '../chat-surface-rendering';

const OTHER_SURFACES = ['chrome', 'vscode', 'cli', 'unknown'] as const;

describe('what each chat client renders of a turn', () => {
  it('renders email and writing blocks as cards in the web chat, the desktop app and the mobile app only', () => {
    expect(surfaceRendersWritingCards('web')).toBe(true);
    expect(surfaceRendersWritingCards('desktop')).toBe(true);
    expect(surfaceRendersWritingCards('mobile')).toBe(true);
    for (const surface of OTHER_SURFACES) {
      expect(surfaceRendersWritingCards(surface), surface).toBe(false);
    }
  });

  const versionsWithDraftCards = CHAT_SYSTEM_PROMPT_VERSIONS.filter(
    ({ sections }) => sections['email_and_writing_cards'] !== undefined,
  );

  it('has a prompt version that describes email and writing draft cards', () => {
    expect(versionsWithDraftCards.length).toBeGreaterThan(0);
  });

  it.each(versionsWithDraftCards.map(({ version }) => version))(
    'asks the model for email and writing drafts on a mobile chat turn and a mobile free turn, version %s',
    (version) => {
      const draftCardGuidance = chatSystemPromptSections(version)['email_and_writing_cards'];
      const promptSelection = { variants: { 'chat.system': version } };
      const chatTurn = buildCapabilityPreamble({
        tools: [],
        surface: 'mobile',
        writingCards: surfaceRendersWritingCards('mobile'),
        promptSelection,
      });
      const freeTurn = freeQuotaCapabilityPreamble(undefined, {
        servingModel: { kind: 'unattributed', name: 'Free' },
        promptSelection,
        writingCards: surfaceRendersWritingCards('mobile'),
      });
      expect(chatTurn).toContain(draftCardGuidance);
      expect(freeTurn).toContain(draftCardGuidance);
    },
  );
});

describe('where an artifact app can run', () => {
  it('publishes hosted artifacts from the web chat, the desktop app and the mobile app only', () => {
    expect(surfacePublishesArtifactApps('web')).toBe(true);
    expect(surfacePublishesArtifactApps('desktop')).toBe(true);
    expect(surfacePublishesArtifactApps('mobile')).toBe(true);
    for (const surface of ['chrome', 'vscode', 'cli', 'unknown'] as const) {
      expect(surfacePublishesArtifactApps(surface), surface).toBe(false);
    }
  });
});
