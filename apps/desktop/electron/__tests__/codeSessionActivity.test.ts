import { it, expect, vi } from 'vitest';
import { createCodeSessionActivity } from '../runtime/codeSessionActivity';

it('does not report an SSH or revoked root and rechecks consent after reading the title', async () => {
  let allowed = false;
  let finish!: (title: string | null) => void;
  const title = vi.fn(
    () =>
      new Promise<string | null>((resolve) => {
        finish = resolve;
      }),
  );
  const report = vi.fn(async () => undefined);
  const handle = createCodeSessionActivity({
    sessionTitle: title,
    report,
    remoteControlActive: () => true,
    mayReportRoot: () => allowed,
  });
  const event = {
    type: 'turn-finished',
    threadId: 'thread',
    turnId: 'turn',
    outcome: 'completed',
    response: '',
    failure: null,
    inputTokens: 0,
    outputTokens: 0,
  } as const;
  await handle('ssh-root', event);
  expect(title).not.toHaveBeenCalled();
  expect(report).not.toHaveBeenCalled();
  allowed = true;
  const pending = handle('root', event);
  allowed = false;
  finish('private title');
  await pending;
  expect(report).not.toHaveBeenCalled();
});
