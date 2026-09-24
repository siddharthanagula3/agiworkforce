import { describe, expect, it } from 'vitest';
import {
  RENDERER_RECOVERY_WINDOW_MS,
  planRendererRecovery,
  resumeUrlAfterFault,
  type RendererGoneReason,
} from '../runtime/rendererRecovery';

const FAULTY_REASONS: readonly RendererGoneReason[] = [
  'abnormal-exit',
  'killed',
  'crashed',
  'oom',
  'launch-failed',
  'integrity-failure',
];

describe('a renderer that died', () => {
  it('leaves a window that closed cleanly alone', () => {
    expect(planRendererRecovery({ kind: 'gone', reason: 'clean-exit' }, null, 1_000)).toMatchObject(
      {
        action: 'ignore',
      },
    );
  });

  it('reloads on the first fault, whatever killed it', () => {
    for (const reason of FAULTY_REASONS) {
      expect(planRendererRecovery({ kind: 'gone', reason }, null, 1_000).action).toBe('reload');
    }
  });

  it('names the cause it was given rather than one cause for everything', () => {
    expect(planRendererRecovery({ kind: 'gone', reason: 'oom' }, null, 0).cause).toBe(
      'out_of_memory',
    );
    expect(planRendererRecovery({ kind: 'gone', reason: 'killed' }, null, 0).cause).toBe('killed');
    expect(planRendererRecovery({ kind: 'unresponsive' }, null, 0).cause).toBe('unresponsive');
  });

  it('stops reloading and explains itself when it dies again straight away', () => {
    const plan = planRendererRecovery(
      { kind: 'gone', reason: 'crashed' },
      1_000,
      1_000 + RENDERER_RECOVERY_WINDOW_MS,
    );
    expect(plan.action).toBe('explain');
    expect(plan.reference).toBe('renderer-crashed');
  });

  it('reloads again once the window has held together for a while', () => {
    expect(
      planRendererRecovery(
        { kind: 'gone', reason: 'crashed' },
        1_000,
        1_001 + RENDERER_RECOVERY_WINDOW_MS,
      ).action,
    ).toBe('reload');
  });

  it('treats a window that stopped answering the same way', () => {
    expect(planRendererRecovery({ kind: 'unresponsive' }, null, 0).action).toBe('reload');
    expect(planRendererRecovery({ kind: 'unresponsive' }, 5, 10).action).toBe('explain');
  });
});

describe('where a recovered window opens', () => {
  const entry = 'https://agiworkforce.com/chat';

  it('returns to the conversation the reader was in', () => {
    expect(resumeUrlAfterFault('https://agiworkforce.com/chat/c_123?tab=files', entry)).toBe(
      'https://agiworkforce.com/chat/c_123?tab=files',
    );
  });

  it('opens the entry when the last page was not ours, or was a shell screen', () => {
    for (const current of [
      null,
      '',
      'https://example.com/elsewhere',
      'http://agiworkforce.com/chat',
      'data:text/html;charset=utf-8,%3Ch1%3Estopped%3C%2Fh1%3E',
      'not a url',
    ]) {
      expect(resumeUrlAfterFault(current, entry)).toBe(entry);
    }
  });
});
