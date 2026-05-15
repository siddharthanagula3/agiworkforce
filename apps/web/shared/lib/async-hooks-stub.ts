// Browser stub for node:async_hooks — AsyncLocalStorage is Node-only.
// Client components get a no-op implementation that always runs the callback
// synchronously without any async context isolation.

export class AsyncLocalStorage<T> {
  private _value: T | undefined;

  run<R>(value: T, callback: (...args: unknown[]) => R, ...args: unknown[]): R {
    const prev = this._value;
    this._value = value;
    try {
      return callback(...args);
    } finally {
      this._value = prev;
    }
  }

  getStore(): T | undefined {
    return this._value;
  }

  enterWith(value: T): void {
    this._value = value;
  }

  disable(): void {}
}

export class AsyncResource {
  constructor(_type: string) {}
  runInAsyncScope<R>(fn: () => R): R {
    return fn();
  }
}

export function executionAsyncId(): number {
  return 1;
}

export function triggerAsyncId(): number {
  return 0;
}
