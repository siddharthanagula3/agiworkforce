import { expect, afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import * as matchers from '@testing-library/jest-dom/matchers';
import React from 'react';

// Extend Vitest's expect with jest-dom matchers
expect.extend(matchers);

// Cleanup after each test
afterEach(() => {
  cleanup();
});

// Polyfill pointer capture APIs not implemented in jsdom.
// Required by Radix UI components (Toast, Dialog, etc.) that call
// target.hasPointerCapture() / setPointerCapture() on pointer events.
if (typeof HTMLElement !== 'undefined') {
  if (!HTMLElement.prototype.hasPointerCapture) {
    HTMLElement.prototype.hasPointerCapture = () => false;
  }
  if (!HTMLElement.prototype.setPointerCapture) {
    HTMLElement.prototype.setPointerCapture = () => {};
  }
  if (!HTMLElement.prototype.releasePointerCapture) {
    HTMLElement.prototype.releasePointerCapture = () => {};
  }
}

// Mock environment variables
process.env['NEXT_PUBLIC_SUPABASE_URL'] = 'https://test.supabase.co';
process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY'] = 'test-anon-key';
process.env['SUPABASE_SERVICE_ROLE_KEY'] = 'test-service-role-key';
process.env['STRIPE_SECRET_KEY'] = 'sk_test_key';
process.env['STRIPE_WEBHOOK_SECRET'] = 'whsec_test_secret';

// Mock Next.js headers
vi.mock('next/headers', () => ({
  cookies: vi.fn(() => ({
    get: vi.fn(() => ({ value: 'test-cookie' })),
    getAll: vi.fn(() => []),
    set: vi.fn(),
    delete: vi.fn(),
  })),
}));

// Mock server-only module
vi.mock('server-only', () => ({}));

// Mock @webcontainer/api — not installed; tests that use CodeExecutionService
// rely on the service's internal graceful fallback
vi.mock('@webcontainer/api', () => ({
  WebContainer: {
    boot: vi.fn().mockRejectedValue(new Error('WebContainer not available in test environment')),
  },
}));

// Mock CSRF validation in API routes - skip CSRF token validation in tests
// (Individual CSRF tests will test the real implementation)
vi.mock('@/lib/csrf', async () => {
  const actual = await vi.importActual<typeof import('@/lib/csrf')>('@/lib/csrf');
  return {
    ...actual,
    requireCsrfToken: vi.fn().mockResolvedValue(null),
  };
});

// ---------------------------------------------------------------------------
// Mock framer-motion / motion-dom / motion to prevent CSS parsing errors in jsdom.
//
// Root cause: motion-dom v12 calls HTMLVisualElement.renderHTML which sets CSS
// transform values via jsdom's cssstyle parser. cssstyle's `parse()` function
// chokes on motion-dom's computed transform strings, throwing:
//   TypeError: Cannot read properties of undefined (reading 'split')
//     at parse cssstyle/lib/properties.js:211:17
//     at HTMLVisualElement.renderHTML motion-dom/.../render.mjs:6:27
//
// The fix is two-fold:
//   1. vitest.config.ts sets `css: false` to skip CSS processing entirely.
//   2. These mocks replace motion components with plain DOM elements and stub
//      all hooks, so motion-dom's render pipeline is never invoked.
//
// All three import paths are mocked because framer-motion v12 re-exports
// through the `motion` and `motion-dom` packages:
//   - `framer-motion` — the primary import used across the codebase
//   - `motion/react` — the modern import path (framer-motion v12+)
//   - `motion-dom` — the internal CSS/DOM rendering engine
// ---------------------------------------------------------------------------

function makeMotionComponent(tag: string) {
  return React.forwardRef(({ children, ...props }: any, ref: any) => {
    // Strip framer-motion-specific props that are invalid on native DOM elements
    const {
      initial: _initial,
      animate: _animate,
      exit: _exit,
      variants: _variants,
      transition: _transition,
      whileHover: _whileHover,
      whileTap: _whileTap,
      whileFocus: _whileFocus,
      whileInView: _whileInView,
      viewport: _viewport,
      layout: _layout,
      layoutId: _layoutId,
      drag: _drag,
      dragConstraints: _dragConstraints,
      onDragStart: _onDragStart,
      onDragEnd: _onDragEnd,
      onAnimationStart: _onAnimationStart,
      onAnimationComplete: _onAnimationComplete,
      ...domProps
    } = props;
    return React.createElement(tag, { ref, ...domProps }, children);
  });
}

const motionMock = {
  motion: {
    div: makeMotionComponent('div'),
    span: makeMotionComponent('span'),
    button: makeMotionComponent('button'),
    section: makeMotionComponent('section'),
    article: makeMotionComponent('article'),
    header: makeMotionComponent('header'),
    footer: makeMotionComponent('footer'),
    nav: makeMotionComponent('nav'),
    main: makeMotionComponent('main'),
    aside: makeMotionComponent('aside'),
    p: makeMotionComponent('p'),
    a: makeMotionComponent('a'),
    li: makeMotionComponent('li'),
    ul: makeMotionComponent('ul'),
    ol: makeMotionComponent('ol'),
    h1: makeMotionComponent('h1'),
    h2: makeMotionComponent('h2'),
    h3: makeMotionComponent('h3'),
    h4: makeMotionComponent('h4'),
    h5: makeMotionComponent('h5'),
    h6: makeMotionComponent('h6'),
    img: makeMotionComponent('img'),
    svg: makeMotionComponent('svg'),
    circle: makeMotionComponent('circle'),
    path: makeMotionComponent('path'),
    input: makeMotionComponent('input'),
    textarea: makeMotionComponent('textarea'),
    form: makeMotionComponent('form'),
    label: makeMotionComponent('label'),
    table: makeMotionComponent('table'),
    tr: makeMotionComponent('tr'),
    td: makeMotionComponent('td'),
    th: makeMotionComponent('th'),
  },
  AnimatePresence: ({ children }: any) => children,
  useAnimation: () => ({
    start: vi.fn(),
    stop: vi.fn(),
    set: vi.fn(),
  }),
  useInView: () => false,
  useMotionValue: (initial: any) => ({
    get: () => initial,
    set: vi.fn(),
    onChange: vi.fn(),
  }),
  useSpring: (value: any) => value,
  useTransform: (_value: any, _input: any, output: any) =>
    Array.isArray(output) ? output[0] : output,
  useDragControls: () => ({ start: vi.fn() }),
  useReducedMotion: () => false,
  useScroll: () => ({
    scrollX: { get: () => 0, set: vi.fn(), onChange: vi.fn() },
    scrollY: { get: () => 0, set: vi.fn(), onChange: vi.fn() },
    scrollXProgress: { get: () => 0, set: vi.fn(), onChange: vi.fn() },
    scrollYProgress: { get: () => 0, set: vi.fn(), onChange: vi.fn() },
  }),
  useVelocity: () => ({ get: () => 0, set: vi.fn(), onChange: vi.fn() }),
  m: {},
};

// Primary import path — used by all existing code
vi.mock('framer-motion', () => motionMock);

// Modern import path (framer-motion v12+). Some libraries or future code
// may import from 'motion/react' instead of 'framer-motion'.
vi.mock('motion/react', () => motionMock);

// Stub motion-dom to prevent its CSS rendering pipeline from executing.
// This is the internal package that causes the cssstyle TypeError.
vi.mock('motion-dom', () => ({
  animate: vi.fn(),
  scroll: vi.fn(),
  inView: vi.fn(),
  resize: vi.fn(),
  spring: vi.fn(),
  stagger: vi.fn(),
  timeline: vi.fn(),
  anticipate: vi.fn(),
  backIn: vi.fn(),
  backInOut: vi.fn(),
  backOut: vi.fn(),
  circIn: vi.fn(),
  circInOut: vi.fn(),
  circOut: vi.fn(),
  easeIn: vi.fn(),
  easeInOut: vi.fn(),
  easeOut: vi.fn(),
}));
