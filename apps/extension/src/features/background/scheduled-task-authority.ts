
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

  activate(taskId: string, generation: number): boolean {
    if (this.generation(taskId) !== generation) return false;
    this.blocked.delete(taskId);
    return true;
  }

  end(lease: ScheduledTaskExecutionLease): void {
    if (this.active.get(lease.taskId) === lease) this.active.delete(lease.taskId);
  }
}
