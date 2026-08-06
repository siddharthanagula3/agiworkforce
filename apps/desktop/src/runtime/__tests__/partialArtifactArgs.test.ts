import { describe, expect, it } from 'vitest';
import { PartialArtifactAccumulator, extractPartialArtifactArgs } from '../partialArtifactArgs';

const FULL_ARGS = JSON.stringify({
  artifact_type: 'React',
  title: 'Pricing "Table"',
  language: 'tsx',
  metadata: { nested: { deep: true }, list: [1, 2, 3] },
  version: 2,
  content: 'export function A() {\n  return <div>Hi \\ there</div>;\n}\né',
});

const PARSED = JSON.parse(FULL_ARGS) as {
  artifact_type: string;
  title: string;
  language: string;
  content: string;
};

/** Split a string into `count` roughly even chunks. */
function chunk(raw: string, count: number): string[] {
  const size = Math.max(1, Math.ceil(raw.length / count));
  const chunks: string[] = [];
  for (let i = 0; i < raw.length; i += size) chunks.push(raw.slice(i, i + size));
  return chunks;
}

describe('extractPartialArtifactArgs', () => {
  it('extracts every known field from a complete argument object', () => {
    const fields = extractPartialArtifactArgs(FULL_ARGS);
    expect(fields.artifactType).toBe('react');
    expect(fields.title).toBe(PARSED.title);
    expect(fields.language).toBe('tsx');
    expect(fields.content).toBe(PARSED.content);
    expect(fields.complete).toBe(true);
  });

  it('never throws and stays a prefix of the final value at every split point', () => {
    for (let cut = 0; cut <= FULL_ARGS.length; cut += 1) {
      const prefix = FULL_ARGS.slice(0, cut);
      const fields = extractPartialArtifactArgs(prefix);

      if (fields.title !== undefined) {
        expect(PARSED.title.startsWith(fields.title)).toBe(true);
      }
      if (fields.content !== undefined) {
        expect(PARSED.content.startsWith(fields.content)).toBe(true);
      }
      if (fields.artifactType !== undefined) {
        expect(PARSED.artifact_type.toLowerCase().startsWith(fields.artifactType)).toBe(true);
      }
      if (cut < FULL_ARGS.length) {
        expect(fields.complete).toBe(false);
      }
    }
  });

  it('surfaces the type and title long before the content finishes', () => {
    const contentStart = FULL_ARGS.indexOf('"content"');
    const fields = extractPartialArtifactArgs(FULL_ARGS.slice(0, contentStart));
    expect(fields.artifactType).toBe('react');
    expect(fields.title).toBe(PARSED.title);
    expect(fields.content).toBeUndefined();
    expect(fields.complete).toBe(false);
  });

  it('decodes escapes inside a still-open string value', () => {
    const partial = '{"content":"line1\\nline2\\t\\"quoted\\"';
    expect(extractPartialArtifactArgs(partial).content).toBe('line1\nline2\t"quoted"');
  });

  it('drops a half-arrived escape sequence instead of emitting garbage', () => {
    expect(extractPartialArtifactArgs('{"content":"ok\\').content).toBe('ok');
    expect(extractPartialArtifactArgs('{"content":"ok\\u00').content).toBe('ok');
    expect(extractPartialArtifactArgs('{"content":"ok\\u00e9').content).toBe('oké');
  });

  it('returns nothing usable for non-object or malformed input', () => {
    expect(extractPartialArtifactArgs('')).toEqual({ complete: false });
    expect(extractPartialArtifactArgs('not json')).toEqual({ complete: false });
    expect(extractPartialArtifactArgs('[1,2]')).toEqual({ complete: false });
    expect(extractPartialArtifactArgs('{"content"')).toEqual({ complete: false });
  });

  it('ignores unknown keys, nested containers, and scalars', () => {
    const fields = extractPartialArtifactArgs(
      '{"metadata":{"a":{"b":"}"}},"count":12,"flag":true,"title":"After"}',
    );
    expect(fields.title).toBe('After');
    expect(fields.complete).toBe(true);
  });
});

describe('PartialArtifactAccumulator', () => {
  it.each([1, 3, 7, 25, 200])('reconstructs the full args from %i chunks', (parts) => {
    const accumulator = new PartialArtifactAccumulator();
    const seen: (ReturnType<typeof extractPartialArtifactArgs> | null)[] = [];
    chunk(FULL_ARGS, parts).forEach((piece, index) => {
      const fields = accumulator.push(piece, index);
      expect(fields).not.toBeNull();
      seen.push(fields);
    });
    expect(accumulator.rawArguments).toBe(FULL_ARGS);
    const last = seen[seen.length - 1];
    expect(last).toBeDefined();
    expect(last?.content).toBe(PARSED.content);
    expect(last?.title).toBe(PARSED.title);
    expect(last?.complete).toBe(true);
  });

  it('grows the content monotonically across chunks', () => {
    const accumulator = new PartialArtifactAccumulator();
    let previous = '';
    chunk(FULL_ARGS, 40).forEach((piece, index) => {
      const fields = accumulator.push(piece, index);
      const next = fields?.content ?? '';
      expect(next.startsWith(previous)).toBe(true);
      previous = next;
    });
    expect(previous).toBe(PARSED.content);
  });

  it('latches desynced on a sequence gap and never recovers', () => {
    const accumulator = new PartialArtifactAccumulator();
    expect(accumulator.push('{"title":"A', 0)).not.toBeNull();
    expect(accumulator.push('BC"', 2)).toBeNull();
    expect(accumulator.isDesynced).toBe(true);
    // Even a correctly numbered follow-up stays refused.
    expect(accumulator.push('}', 1)).toBeNull();
    expect(accumulator.rawArguments).toBe('');
  });

  it('rejects a non-integer sequence number', () => {
    const accumulator = new PartialArtifactAccumulator();
    expect(accumulator.push('{', Number.NaN)).toBeNull();
    expect(accumulator.isDesynced).toBe(true);
  });
});
