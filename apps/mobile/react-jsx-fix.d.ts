/**
 * Fix for React 18 + @types/react@19 JSX incompatibility in monorepo.
 * The desktop app uses React 19, so @types/react@19 gets hoisted to
 * the monorepo root. This causes "cannot be used as a JSX component"
 * errors in the mobile app which uses React 18.
 *
 * This shim extends the JSX.IntrinsicElements type to accept bigint
 * (which React 19 added to ReactNode but React 18 doesn't have).
 */
import 'react';

declare module 'react' {
  // Extend ReactNode to include bigint (matches @types/react@19's definition)
  // eslint-disable-next-line @typescript-eslint/no-empty-interface
  interface DO_NOT_USE_OR_YOU_WILL_BE_FIRED_CALLBACK_REF_RETURN_VALUES {}
}
