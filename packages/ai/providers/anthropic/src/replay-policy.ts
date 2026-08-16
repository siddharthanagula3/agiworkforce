
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
  if (block.type === 'thinking' && !block.signature) {
    return false;
  }
  return true;
}
