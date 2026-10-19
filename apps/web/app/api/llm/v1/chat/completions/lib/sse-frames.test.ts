import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ServerSentEventDecoder } from '@agiworkforce/client-runtime';

import { sseDataFrames } from './sse-frames';

describe('sseDataFrames', () => {
  it('writes one SSE event per wire event', () => {
    const decoder = new ServerSentEventDecoder();
    const events = decoder.push(
      sseDataFrames([{ choices: [{ delta: { content: '</thinking>' } }] }, { id: 2 }]),
    );
    expect(events.map((event) => JSON.parse(event.data) as unknown)).toEqual([
      { choices: [{ delta: { content: '</thinking>' } }] },
      { id: 2 },
    ]);
  });

  it('is the only way the completions stream joins several data lines', () => {
    const offenders = readdirSync(__dirname)
      .filter((file) => file.endsWith('.ts') && !file.endsWith('.test.ts'))
      .filter((file) =>
        /`data: \$\{JSON\.stringify\([^)]*\)\}`\)\s*\.join\('\\n'\)/u.test(
          readFileSync(join(__dirname, file), 'utf8'),
        ),
      );
    expect(offenders).toEqual([]);
  });
});
