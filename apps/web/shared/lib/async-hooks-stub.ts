// Browser stub for node:async_hooks · AsyncLocalStorage is Node-only.
// Client components get a no-op implementation that always runs the callback
// synchronously without any async context isolation.
//
// BROWSER ONLY. `next.config.ts` maps this file under the Turbopack `browser`
// condition and nothing else; it must never be reachable from the server or
// edge compilation. There is no async isolation here — `_value` is one plain
// instance field, so the value is dropped at the first `await` and a single
// slot is shared by everything holding the instance. On a server that reuses a
// process across concurrent requests (Fluid Compute does) that is a
// cross-request read, not just a lost value. If you are tempted to add a
// `default:` condition for this alias, fix the importer instead.

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
