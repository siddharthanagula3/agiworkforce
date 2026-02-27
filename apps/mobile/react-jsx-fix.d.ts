/**
 * Fix for React 18 + @types/react@19 JSX incompatibility in monorepo.
 *
 * The desktop app uses React 19, so @types/react@19 gets hoisted to the
 * monorepo root pnpm store. Third-party packages in the mobile workspace
 * (lucide-react-native, react-native-safe-area-context, react-native-reanimated,
 * @shopify/flash-list, expo-router/drawer) resolve their @types/react peer from
 * the pnpm store, getting React 19 types. The mobile app code uses React 18 types.
 *
 * This causes two categories of TS2786 errors:
 *
 * Fix #1 — bigint/ReactNode incompatibility (ForwardRefExoticComponent + Animated.View):
 *   ReactNode@19 adds `bigint` to the union; ReactNode@18 does not.
 *   React 18.3.x's ReactNode escape hatch is:
 *     DO_NOT_USE_OR_YOU_WILL_BE_FIRED_EXPERIMENTAL_REACT_NODES[keyof ...]
 *   By adding a bigint-valued key to that interface, bigint becomes part of
 *   ReactNode@18, making ReactNode@18 ⊇ ReactNode@19 and resolving assignment errors.
 *
 * Fix #2 — refs/class-component incompatibility (FlashList):
 *   React 19 removed `refs` from Component. Class components compiled with React 19
 *   types don't declare `refs`. React 18's JSX.ElementClass extends Component<any>
 *   which requires `refs`. Making `refs` optional in the Component interface via
 *   declaration merging resolves the structural incompatibility.
 */
import 'react';

declare module 'react' {
  // Fix #1: Add bigint to ReactNode@18 to match ReactNode@19.
  // React 18.3.x defines ReactNode as:
  //   ... | DO_NOT_USE_OR_YOU_WILL_BE_FIRED_EXPERIMENTAL_REACT_NODES[keyof ...]
  // Adding a bigint-valued key makes bigint assignable to ReactNode@18.
  interface DO_NOT_USE_OR_YOU_WILL_BE_FIRED_EXPERIMENTAL_REACT_NODES {
    readonly __bigint_compat__: bigint;
  }

  // Fix #2: Make refs optional in Component to allow React 19 class components
  // (which don't declare refs) to be used in React 18 JSX contexts.
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface Component<P = {}, S = {}, SS = any> {
    refs?: { [key: string]: ReactInstance };
  }
}
