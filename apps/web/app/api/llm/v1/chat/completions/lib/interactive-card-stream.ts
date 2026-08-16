import { parseInteractiveCardDelta } from '@agiworkforce/cloud-contracts';
import type { InteractiveCard } from '@agiworkforce/types';

export function extractAssistantInteractiveCardDeltas(value: Uint8Array): InteractiveCard[] {
  const text = new TextDecoder().decode(value);
  const cards: InteractiveCard[] = [];
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line.startsWith('data: ') || line === 'data: [DONE]') continue;
    try {
      const payload = JSON.parse(line.slice(6)) as {
        choices?: Array<{ delta?: { x_interactive_card?: unknown } }>;
      };
      for (const choice of payload.choices ?? []) {
        const card = parseInteractiveCardDelta(choice.delta?.x_interactive_card);
        if (card) cards.push(card);
      }
    } catch {
      // Non-JSON/custom SSE lines carry no interactive card.
    }
  }
  return cards;
}
