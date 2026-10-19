/**
 * One `data:` line per SSE event. Consecutive `data:` lines without a blank
 * line between them are ONE event whose data is the lines joined by "\n", so a
 * spec-compliant client would read two JSON objects glued together and drop
 * the event (and with it, e.g., the first tool call's id and name).
 */
export function sseDataFrames(events: readonly unknown[]): string {
  return events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join('');
}
