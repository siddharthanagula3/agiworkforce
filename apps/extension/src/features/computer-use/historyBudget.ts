import { ELEMENT_LIST_HEADING, PAGE_CONTENT_FENCE_BEGIN } from './cdpDriver';
import type { AgentMessage } from './cloudAgentClient';

// getPageContent overwrites the tab's element index map on every read, so an
// older listing's indices address nothing; a step compares against one prior.
export const RETAINED_OBSERVATIONS = 2;

/** Heading the loop writes before a DOM summary embedded in a larger message. */
export const DOM_SUMMARY_HEADING = 'Current page DOM summary';

type ObservationKind = 'screenshot' | 'dom';

type MessageContent = AgentMessage['content'];
type ContentPart = Extract<MessageContent, readonly unknown[]>[number];
type TextPart = Extract<ContentPart, { type: 'text' }>;

interface ObservationSlot {
  kind: ObservationKind;
  step: number;
  message: number;
  part: number;
  /** A screenshot tool result whose pixels the image message beside it carries. */
  duplicate: boolean;
}

const WHOLE_CONTENT = -1;

function slotKey(message: number, part: number): string {
  return `${message}:${part}`;
}

function screenshotStub(step: number): string {
  return `[screenshot from step ${step} dropped to bound context. Call screenshot again if you need the current view.]`;
}

function duplicateStub(step: number): string {
  return `[screenshot from step ${step} taken. The image is attached in the next message.]`;
}

function domStub(step: number): string {
  return `[${DOM_SUMMARY_HEADING} from step ${step} dropped to bound context. Call read_dom again for the current page.]`;
}

function screenshotBase64(content: string): string | null {
  if (!content.startsWith('{')) return null;
  try {
    const parsed = JSON.parse(content) as { type?: unknown; base64?: unknown };
    if (parsed.type !== 'screenshot' || typeof parsed.base64 !== 'string') return null;
    return parsed.base64;
  } catch {
    return null;
  }
}

function isDomSummary(text: string): boolean {
  return text.includes(PAGE_CONTENT_FENCE_BEGIN) || text.includes(ELEMENT_LIST_HEADING);
}

function echoesBase64(message: AgentMessage | undefined, base64: string): boolean {
  const content = message?.content;
  if (!Array.isArray(content)) return false;
  return content.some((part) => part.type === 'image_url' && part.image_url.url.endsWith(base64));
}

// Step 0 is the opening observation, step N the results of the Nth assistant
// turn, so the numbering derives from the array alone.
function collectSlots(history: readonly AgentMessage[]): ObservationSlot[] {
  const slots: ObservationSlot[] = [];
  let step = 0;

  history.forEach((message, index) => {
    if (message.role === 'assistant') {
      step += 1;
      return;
    }

    const content = message.content;
    if (typeof content === 'string') {
      const base64 = screenshotBase64(content);
      if (base64 !== null) {
        const duplicate = echoesBase64(history[index + 1], base64);
        slots.push({ kind: 'screenshot', step, message: index, part: WHOLE_CONTENT, duplicate });
      } else if (isDomSummary(content)) {
        slots.push({ kind: 'dom', step, message: index, part: WHOLE_CONTENT, duplicate: false });
      }
      return;
    }
    if (!Array.isArray(content)) return;

    content.forEach((part, partIndex) => {
      if (part.type === 'image_url') {
        slots.push({
          kind: 'screenshot',
          step,
          message: index,
          part: partIndex,
          duplicate: false,
        });
      } else if (part.type === 'text' && isDomSummary(part.text)) {
        slots.push({ kind: 'dom', step, message: index, part: partIndex, duplicate: false });
      }
    });
  });

  return slots;
}

/** Steps whose observations of this kind are young enough to send verbatim. */
function retainedSteps(
  slots: readonly ObservationSlot[],
  kind: ObservationKind,
  retained: number,
): Set<number> {
  const steps: number[] = [];
  for (const slot of slots) {
    if (slot.kind !== kind || slot.duplicate) continue;
    if (!steps.includes(slot.step)) steps.push(slot.step);
  }
  return new Set(steps.slice(-Math.max(1, Math.floor(retained))));
}

function stubForSlot(slot: ObservationSlot, stale: boolean): string {
  if (slot.kind === 'dom') return domStub(slot.step);
  return stale ? screenshotStub(slot.step) : duplicateStub(slot.step);
}

function stubbedText(text: string, slot: ObservationSlot, stale: boolean): string {
  const stub = stubForSlot(slot, stale);
  const headingAt = text.indexOf(DOM_SUMMARY_HEADING);
  if (slot.kind !== 'dom' || headingAt <= 0) return stub;
  return `${text.slice(0, headingAt).trimEnd()}\n\n${stub}`;
}

// Stubs stale observations and screenshot text the next image message repeats.
// No message is added, removed or reordered, so tool-call pairing survives.
export function pruneObservationHistory(
  history: readonly AgentMessage[],
  retained: number = RETAINED_OBSERVATIONS,
): AgentMessage[] {
  const slots = collectSlots(history);
  const keptByKind: Record<ObservationKind, Set<number>> = {
    screenshot: retainedSteps(slots, 'screenshot', retained),
    dom: retainedSteps(slots, 'dom', retained),
  };

  const replace = new Map<string, { slot: ObservationSlot; stale: boolean }>();
  for (const slot of slots) {
    const stale = !keptByKind[slot.kind].has(slot.step);
    if (!stale && !slot.duplicate) continue;
    replace.set(slotKey(slot.message, slot.part), { slot, stale });
  }
  if (replace.size === 0) return [...history];

  return history.map((message, index): AgentMessage => {
    const whole = replace.get(slotKey(index, WHOLE_CONTENT));
    if (whole) {
      return { ...message, content: stubForSlot(whole.slot, whole.stale) } as AgentMessage;
    }

    const content = message.content;
    if (!Array.isArray(content)) return message;
    if (!content.some((_, partIndex) => replace.has(slotKey(index, partIndex)))) return message;

    const parts = content.map((part, partIndex): ContentPart => {
      const target = replace.get(slotKey(index, partIndex));
      if (!target) return part;
      const source = part.type === 'text' ? part.text : '';
      return { type: 'text', text: stubbedText(source, target.slot, target.stale) };
    });

    const texts = parts.filter((part): part is TextPart => part.type === 'text');
    if (texts.length !== parts.length) return { ...message, content: parts } as AgentMessage;
    return { ...message, content: texts.map((part) => part.text).join('\n\n') } as AgentMessage;
  });
}
