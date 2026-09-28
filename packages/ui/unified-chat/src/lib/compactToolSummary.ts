import { translateUi, translateUiPlural } from '@agiworkforce/ui';
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
  switch (bucket) {
    case 'command':
      return translateUiPlural('chat', 'counts.toolSummaryCommands', count, {
        one: 'ran a command',
        other: 'ran {{count}} commands',
      });
    case 'file write':
      return translateUiPlural('chat', 'counts.toolSummaryCreatedFiles', count, {
        one: 'created a file',
        other: 'created {{count}} files',
      });
    case 'file read':
      return translateUiPlural('chat', 'counts.toolSummaryReadFiles', count, {
        one: 'read a file',
        other: 'read {{count}} files',
      });
    case 'search':
      return translateUiPlural('chat', 'counts.stepSearches', count, {
        one: 'searched',
        other: 'searched {{count}} times',
      });
    case 'web request':
      return translateUiPlural('chat', 'counts.stepFetchedUrls', count, {
        one: 'fetched a URL',
        other: 'fetched {{count}} URLs',
      });
    case 'thinking':
      return translateUiPlural('chat', 'counts.stepReasoned', count, {
        one: 'reasoned',
        other: 'reasoned {{count}} times',
      });
    case 'tool':
      return translateUiPlural('chat', 'counts.stepUsedTools', count, {
        one: 'used a tool',
        other: 'used {{count}} tools',
      });
    default:
      return stepCount(count);
  }
}

function stepCount(count: number): string {
  return translateUiPlural('chat', 'counts.steps', count, {
    one: '{{count}} step',
    other: '{{count}} steps',
  });
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
    return workCount > 0
      ? stepCount(workCount)
      : translateUi('chat', 'toolSummary.thinking', 'Thinking');
  }

  const phrases = order.map((b) => phraseFor(b, counts[b]!));

  if (phrases.length === 1) return capitalise(phrases[0]!);
  if (phrases.length === 2) {
    return capitalise(
      translateUi('chat', 'toolSummary.pair', '{{first}} and {{second}}', {
        first: phrases[0],
        second: phrases[1],
      }),
    );
  }
  const last = phrases.pop()!;
  return capitalise(
    translateUi('chat', 'toolSummary.list', '{{items}}, and {{last}}', {
      items: phrases.join(', '),
      last,
    }),
  );
}

function capitalise(s: string): string {
  if (!s) return s;
  return s[0]!.toUpperCase() + s.slice(1);
}
