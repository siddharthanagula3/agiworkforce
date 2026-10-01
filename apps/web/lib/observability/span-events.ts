import { getNumberFromEnv } from '@opentelemetry/core';
import type { Span } from '@opentelemetry/api';
import type { TimedEvent } from '@opentelemetry/sdk-trace-base';

interface RecordedEvents {
  events: TimedEvent[];
  dropped: number;
  limit: number;
}

const events = new WeakMap<object, RecordedEvents>();
const DEFAULT_SDK_COUNT_LIMIT = 128;

function countLimit(name: string): number {
  const configured = getNumberFromEnv(name);
  return configured !== undefined && Number.isSafeInteger(configured) && configured >= 0
    ? configured
    : DEFAULT_SDK_COUNT_LIMIT;
}

export function beginSpanEvents(span: object): void {
  events.set(span, { events: [], dropped: 0, limit: countLimit('OTEL_SPAN_EVENT_COUNT_LIMIT') });
}

export function retainSpanEvent(span: Span, event: TimedEvent): void {
  const recorded = events.get(span);
  if (!recorded) return;
  if (recorded.limit === 0) recorded.dropped++;
  else {
    if (recorded.events.length >= recorded.limit) {
      recorded.events.shift();
      recorded.dropped++;
    }
    const attributes = Object.entries(event.attributes ?? {});
    const attributeLimit = countLimit('OTEL_SPAN_ATTRIBUTE_PER_EVENT_COUNT_LIMIT');
    recorded.events.push({
      ...event,
      attributes: Object.fromEntries(attributes.slice(0, attributeLimit)),
      droppedAttributesCount: Math.max(0, attributes.length - attributeLimit),
      time: [...event.time],
    });
  }
  events.set(span, recorded);
}

export function takeSpanEvents(span: object): RecordedEvents {
  const recorded = events.get(span) ?? {
    events: [],
    dropped: 0,
    limit: countLimit('OTEL_SPAN_EVENT_COUNT_LIMIT'),
  };
  events.delete(span);
  return recorded;
}
