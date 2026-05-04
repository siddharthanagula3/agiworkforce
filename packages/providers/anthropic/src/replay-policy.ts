/**
 * Anthropic-specific replay policy for transcript history rebuild.
 *
 * The main thing Anthropic cares about is that `thinking` blocks are
 * preserved with their `signature` when round-tripping (otherwise the API
 * rejects them). For all other content this is a passthrough.
 */

import type { ProviderMessage, ContentBlock, ReplayPolicy } from '@agiworkforce/types';

export function buildAnthropicReplayPolicy(): ReplayPolicy {
  return {
    sanitizeForReplay(messages: ProviderMessage[]): ProviderMessage[] {
      return messages.map((msg) => {
        if (typeof msg.content === 'string') {
          return msg;
        }
        return {
          role: msg.role,
          content: msg.content.filter((block) => isReplayableBlock(block)),
        };
      });
    },
  };
}

function isReplayableBlock(block: ContentBlock): boolean {
  // Drop unsigned thinking blocks; Anthropic will reject them on replay.
  if (block.type === 'thinking' && !block.signature) {
    return false;
  }
  return true;
}
