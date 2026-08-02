import { describe, expect, it } from 'vitest';
import { ScheduledTaskExecutionCoordinator } from '../src/features/background/scheduled-task-authority';

describe('scheduled task execution authority', () => {
  it('rejects an alarm snapshot invalidated before paid work is admitted', () => {
    const coordinator = new ScheduledTaskExecutionCoordinator();
    const alarmGeneration = coordinator.generation('task-1');

    coordinator.invalidate('task-1');

    expect(coordinator.begin('task-1', alarmGeneration)).toBeNull();
  });

  it('aborts an admitted execution when an authorized mutation invalidates it', () => {
    const coordinator = new ScheduledTaskExecutionCoordinator();
    const lease = coordinator.begin('task-1', coordinator.generation('task-1'))!;

    coordinator.invalidate('task-1');

    expect(lease.controller.signal.aborted).toBe(true);
    expect(coordinator.isCurrent(lease)).toBe(false);
  });

  it('keeps an update blocked while old storage is still visible, then admits its new state', () => {
    const coordinator = new ScheduledTaskExecutionCoordinator();
    const generation = coordinator.invalidate('task-1');

    expect(coordinator.begin('task-1', generation)).toBeNull();
    expect(coordinator.activate('task-1', generation)).toBe(true);
    expect(coordinator.begin('task-1', generation)).not.toBeNull();
  });

  it('admits only one execution per task and does not let stale cleanup end its replacement', () => {
    const coordinator = new ScheduledTaskExecutionCoordinator();
    const first = coordinator.begin('task-1', 0)!;
    expect(coordinator.begin('task-1', 0)).toBeNull();

    coordinator.invalidate('task-1');
    coordinator.activate('task-1', 1);
    const replacement = coordinator.begin('task-1', 1)!;
    coordinator.end(first);

    expect(coordinator.isCurrent(replacement)).toBe(true);
  });
});
