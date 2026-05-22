const globalScope = globalThis;

class MobileEvent {
  constructor(type, eventInitDict = {}) {
    this.type = String(type);
    this.bubbles = Boolean(eventInitDict.bubbles);
    this.cancelable = Boolean(eventInitDict.cancelable);
    this.composed = Boolean(eventInitDict.composed);
    this.defaultPrevented = false;
    this.target = null;
    this.currentTarget = null;
    this.eventPhase = 0;
    this.timeStamp = Date.now();
  }

  preventDefault() {
    if (this.cancelable) {
      this.defaultPrevented = true;
    }
  }

  stopImmediatePropagation() {}

  stopPropagation() {}
}

class MobileEventTarget {
  constructor() {
    this.listeners = new Map();
  }

  addEventListener(type, callback) {
    if (callback == null) return;
    const key = String(type);
    const callbacks = this.listeners.get(key) ?? new Set();
    callbacks.add(callback);
    this.listeners.set(key, callbacks);
  }

  removeEventListener(type, callback) {
    if (callback == null) return;
    this.listeners.get(String(type))?.delete(callback);
  }

  dispatchEvent(event) {
    if (!event || typeof event.type !== 'string') {
      throw new TypeError('dispatchEvent expected an event with a string type');
    }

    event.target = event.target ?? this;
    event.currentTarget = this;

    for (const callback of this.listeners.get(event.type) ?? []) {
      if (typeof callback === 'function') {
        callback.call(this, event);
      } else if (callback && typeof callback.handleEvent === 'function') {
        callback.handleEvent(event);
      }
    }

    return !event.defaultPrevented;
  }
}

if (typeof globalScope.EventTarget === 'undefined') {
  globalScope.EventTarget = MobileEventTarget;
}

if (typeof globalScope.Event === 'undefined') {
  globalScope.Event = MobileEvent;
}
