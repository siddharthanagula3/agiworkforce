/**
 * In-memory authority for one MV3 service-worker lifetime.
 *
 * Chrome alarms and task mutations can interleave across awaits. An alarm
 * therefore snapshots a task generation before loading storage, then admits
 * work only if that generation is still current. Authorized update/delete
 * mutations invalidate the generation before committing storage and abort any
 * execution that already acquired the lease.
 *
 * The generation does not need to survive a worker restart: promises and stale
 * task snapshots do not survive one either. Server work that does survive is
 * governed separately by the durable scheduled-run cancellation journal.
 */

export interface ScheduledTaskExecutionLease {
  taskId: string;
  generation: number;
  controller: AbortController;
}

export class ScheduledTaskExecutionCoordinator {
  private readonly generations = new Map<string, number>();
  private readonly active = new Map<string, ScheduledTaskExecutionLease>();
  private readonly blocked = new Set<string>();

  generation(taskId: string): number {
    return this.generations.get(taskId) ?? 0;
  }

  begin(taskId: string, expectedGeneration: number): ScheduledTaskExecutionLease | null {
    if (
      this.generation(taskId) !== expectedGeneration ||
      this.blocked.has(taskId) ||
      this.active.has(taskId)
    ) {
      return null;
    }
    const lease: ScheduledTaskExecutionLease = {
      taskId,
      generation: expectedGeneration,
      controller: new AbortController(),
    };
    this.active.set(taskId, lease);
    return lease;
  }

  isCurrent(lease: ScheduledTaskExecutionLease): boolean {
    return (
      this.active.get(lease.taskId) === lease &&
      this.generation(lease.taskId) === lease.generation &&
      !lease.controller.signal.aborted
    );
  }

  invalidate(taskId: string): number {
    const generation = this.generation(taskId) + 1;
    this.generations.set(taskId, generation);
    this.blocked.add(taskId);
    const lease = this.active.get(taskId);
    if (lease) {
      lease.controller.abort();
      this.active.delete(taskId);
    }
    return generation;
  }

  /** Re-open an updated task only after its new storage/alarm state committed. */
  activate(taskId: string, generation: number): boolean {
    if (this.generation(taskId) !== generation) return false;
    this.blocked.delete(taskId);
    return true;
  }

  end(lease: ScheduledTaskExecutionLease): void {
    if (this.active.get(lease.taskId) === lease) this.active.delete(lease.taskId);
  }
}
