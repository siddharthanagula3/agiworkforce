import { vi } from 'vitest';

// jsdom (pinned to 20.0.3 repo-wide, see root package.json pnpm.overrides)
// implements none of matchMedia, ResizeObserver, IntersectionObserver,
// Element.scrollIntoView, or DOMRect. Several ported primitives depend on
// these at mount time (sonner's Toaster reads matchMedia for system-theme
// detection; cmdk/input-otp/react-resizable-panels observe element size via
// ResizeObserver; cmdk scrolls the active item into view; embla-carousel
// uses IntersectionObserver + DOMRect for slide-visibility tracking) —
// without these, render() throws instead of exercising the component.
// matchMedia/ResizeObserver mock shapes match apps/desktop/src/test/setup.ts
// for consistency, plus the legacy addListener/removeListener pair that
// desktop's mock doesn't need (desktop has no next-themes provider) but this
// package does: next-themes' system-theme listener (exercised by
// ThemeToggle.test.tsx) calls the deprecated MediaQueryList.addListener API
// rather than addEventListener, which every real browser still implements
// for back-compat but jsdom's matchMedia stub does not.
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

globalThis.ResizeObserver = class ResizeObserver {
  constructor() {}
  disconnect() {}
  observe() {}
  unobserve() {}
} as unknown as typeof ResizeObserver;

globalThis.IntersectionObserver = class IntersectionObserver {
  constructor() {}
  disconnect() {}
  observe() {}
  takeRecords() {
    return [];
  }
  unobserve() {}
} as unknown as typeof IntersectionObserver;

if (!globalThis.DOMRect) {
  globalThis.DOMRect = class DOMRect {
    x = 0;
    y = 0;
    width = 0;
    height = 0;
    top = 0;
    right = 0;
    bottom = 0;
    left = 0;
    constructor(x = 0, y = 0, width = 0, height = 0) {
      this.x = x;
      this.y = y;
      this.width = width;
      this.height = height;
      this.top = y;
      this.left = x;
      this.right = x + width;
      this.bottom = y + height;
    }
    static fromRect(rect?: { x: number; y: number; width: number; height: number }) {
      return new DOMRect(rect?.x, rect?.y, rect?.width, rect?.height);
    }
    toJSON() {
      return { ...this };
    }
  } as unknown as typeof DOMRect;
}

if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = vi.fn();
}
