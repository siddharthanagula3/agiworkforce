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

// Mock framer-motion to prevent CSS parsing errors in jsdom.
// motion-dom tries to parse CSS transforms which fails in jsdom's cssstyle parser.
// This mock provides no-op motion components that render normally without animation.
// Covers all element types used across the codebase (div, span, button, section,
// article, header, p, li, img, circle, path).
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
      ...domProps
    } = props;
    return React.createElement(tag, { ref, ...domProps }, children);
  });
}

vi.mock('framer-motion', () => ({
  motion: {
    div: makeMotionComponent('div'),
    span: makeMotionComponent('span'),
    button: makeMotionComponent('button'),
    section: makeMotionComponent('section'),
    article: makeMotionComponent('article'),
    header: makeMotionComponent('header'),
    p: makeMotionComponent('p'),
    li: makeMotionComponent('li'),
    ul: makeMotionComponent('ul'),
    h1: makeMotionComponent('h1'),
    h2: makeMotionComponent('h2'),
    h3: makeMotionComponent('h3'),
    img: makeMotionComponent('img'),
    svg: makeMotionComponent('svg'),
    circle: makeMotionComponent('circle'),
    path: makeMotionComponent('path'),
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
}));
