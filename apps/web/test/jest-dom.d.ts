// Global type augmentation for @testing-library/jest-dom matchers on Vitest's
// Assertion interface. Without this triple-slash reference the runtime import
// at test/setup.ts:7 (`@testing-library/jest-dom/vitest`) extends `expect` at
// runtime but does NOT propagate the type augmentation to test files compiled
// in isolation by tsc.
//
// This file ships with the existing tsconfig include glob (`**/*.ts`) so it
// loads automatically for every test compilation.
/// <reference types="@testing-library/jest-dom" />
