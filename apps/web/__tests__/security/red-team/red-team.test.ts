import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { RED_TEAM_CATEGORIES, RED_TEAM_CORPUS, type RedTeamCategory } from './corpus';
import { CATEGORY_DEFENCES, runRedTeamCase } from './harness';

/**
 * The standing adversarial harness. Every case in the corpus is replayed against
 * the production function that must refuse it, on every run of the security
 * tier, so a defence cannot be weakened without a red row.
 *
 * The coverage assertions below are the part that keeps it standing rather than
 * decorative: a category with no case, or a case with no category defence, fails
 * here instead of silently reducing what is probed.
 */

describe('red-team corpus coverage', () => {
  it('probes every attack class the product exposes', () => {
    const covered = new Set(RED_TEAM_CORPUS.map((entry) => entry.category));
    const uncovered = RED_TEAM_CATEGORIES.filter((category) => !covered.has(category));
    expect(uncovered).toEqual([]);
  });

  it('names a production defence for every attack class', () => {
    for (const category of RED_TEAM_CATEGORIES) {
      expect(CATEGORY_DEFENCES[category as RedTeamCategory]).toBeTruthy();
    }
  });

  it('gives every case a unique id and a stated intent', () => {
    const ids = RED_TEAM_CORPUS.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const entry of RED_TEAM_CORPUS) {
      expect(entry.intent.length, entry.id).toBeGreaterThan(20);
    }
  });
});

describe.each(RED_TEAM_CATEGORIES)('%s', (category) => {
  const cases = RED_TEAM_CORPUS.filter((entry) => entry.category === category);

  it.each(cases.map((entry) => [entry.id, entry] as const))('%s is refused', async (_id, entry) => {
    const verdict = await runRedTeamCase(entry);
    expect(
      verdict.refused,
      `${entry.id} (${entry.intent}) got through ${verdict.defence}: ${verdict.detail}`,
    ).toBe(true);
  });
});

/**
 * The harness has to be able to fail. A corpus whose every case is refused
 * proves nothing on its own: it is equally consistent with a runner that returns
 * `refused: true` unconditionally. These are the controls, benign inputs whose
 * verdict must be the opposite one.
 */
describe('the harness distinguishes an attack from ordinary use', () => {
  it('does not report a plain tool description as poisoned', async () => {
    const verdict = await runRedTeamCase({
      id: 'CONTROL-TP',
      category: 'tool-poisoning',
      intent: 'An ordinary description of what a tool does, with no directive in it.',
      description: 'Returns the weather forecast for a city over the next seven days.',
    });
    expect(verdict.refused).toBe(false);
  });

  it('offers a device step the user actually granted', async () => {
    const verdict = await runRedTeamCase({
      id: 'CONTROL-RC',
      category: 'remote-control',
      intent: 'A granted read capability with a granted folder does offer the read step.',
      granted: ['filesystem.read'],
      roots: 1,
      withheld: 'device_read_file',
    });
    expect(verdict.refused).toBe(false);
  });

  it('leaves text with no secret in it alone', async () => {
    const verdict = await runRedTeamCase({
      id: 'CONTROL-EX',
      category: 'exfiltration',
      intent: 'An ordinary paragraph that carries no credential of any shape.',
      content: 'The deployment finished at 14:02 and the health check answered on the first try.',
    });
    expect(verdict.refused).toBe(false);
  });

  it('classifies a genuinely read-only command as safe', async () => {
    const verdict = await runRedTeamCase({
      id: 'CONTROL-AC',
      category: 'agent-command',
      intent: 'A read-only listing command that needs no approval to run.',
      command: 'ls -la src',
    });
    expect(verdict.refused).toBe(false);
  });
});
