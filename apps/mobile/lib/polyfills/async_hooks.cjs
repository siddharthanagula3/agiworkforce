/* eslint-env node */
// React Native polyfill for node:async_hooks.
//
// The desktop/Tauri side uses AsyncLocalStorage in `@agiworkforce/runtime`'s
// agentContext to isolate per-command state across 1,483 Tauri commands. Mobile
// doesn't invoke that code path (no Tauri commands), but the runtime barrel
// re-exports the module so Metro pulls it. This stub gives Metro something
// resolvable; `getStore()` always returns undefined, matching the case where no
// context was established (which is always, on mobile).
//
// Resolved via apps/mobile/metro.config.js -> resolver.resolveRequest.

class AsyncLocalStorage {
  constructor() {
    this._store = undefined;
  }
  getStore() {
    return this._store;
  }
  run(store, callback, ...args) {
    const prev = this._store;
    this._store = store;
    try {
      return callback(...args);
    } finally {
      this._store = prev;
    }
  }
  enterWith(store) {
    this._store = store;
  }
  disable() {
    this._store = undefined;
  }
  exit(callback, ...args) {
    const prev = this._store;
    this._store = undefined;
    try {
      return callback(...args);
    } finally {
      this._store = prev;
    }
  }
}

module.exports = { AsyncLocalStorage };
