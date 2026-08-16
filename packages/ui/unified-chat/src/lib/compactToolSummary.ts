
import type { ThinkingStep } from './types';

function bucketStep(type: ThinkingStep['type']): string {
  switch (type) {
    case 'script':
    case 'terminal':
      return 'command';
    case 'creating':
    case 'writing':
      return 'file write';
    case 'reading':
      return 'file read';
    case 'search':
      return 'search';
    case 'link':
      return 'web request';
    case 'thinking':
      return 'thinking';
    case 'tool':
      return 'tool';
    case 'done':
    case 'complete':
      return '__skip__';
    default:
      return 'step';
  }
}

function phraseFor(bucket: string, count: number): string {
  const n = count === 1;
  switch (bucket) {
    case 'command':
      return n ? 'ran a command' : `ran ${count} commands`;
    case 'file write':
      return n ? 'created a file' : `created ${count} files`;
    case 'file read':
      return n ? 'read a file' : `read ${count} files`;
    case 'search':
      return n ? 'searched' : `searched ${count} times`;
    case 'web request':
      return n ? 'fetched a URL' : `fetched ${count} URLs`;
    case 'thinking':
      return n ? 'reasoned' : `reasoned ${count} times`;
    case 'tool':
      return n ? 'used a tool' : `used ${count} tools`;
    default:
      return n ? `1 step` : `${count} steps`;
  }
}

/**
 * Build a compact single-line summary from a list of ThinkingSteps.
 *
 * @example
 *   buildCompactSummary(steps)
 *   // => "Ran 5 commands, created 2 files, read 3 files"
 */
export function buildCompactSummary(steps: ThinkingStep[]): string {
  const order: string[] = [];
  const counts: Record<string, number> = {};

  for (const step of steps) {
    const bucket = bucketStep(step.type);
    if (bucket === '__skip__') continue;
    if (!(bucket in counts)) {
      order.push(bucket);
      counts[bucket] = 0;
    }
    counts[bucket]!++;
  }

  if (order.length === 0) {
    const workCount = steps.filter((s) => s.type !== 'done' && s.type !== 'complete').length;
    return workCount > 0 ? `${workCount} step${workCount !== 1 ? 's' : ''}` : 'Thinking';
  }

  const phrases = order.map((b) => phraseFor(b, counts[b]!));

  if (phrases.length === 1) return capitalise(phrases[0]!);
  if (phrases.length === 2) return capitalise(`${phrases[0]} and ${phrases[1]}`);
  const last = phrases.pop()!;
  return capitalise(`${phrases.join(', ')}, and ${last}`);
}

function capitalise(s: string): string {
  if (!s) return s;
  return s[0]!.toUpperCase() + s.slice(1);
}
