import { memo, type ComponentType } from 'react';

function shallowEqual<P extends object>(a: P, b: P): boolean {
  const keys = Object.keys(a) as (keyof P)[];
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every((key) => Object.is(a[key], b[key]));
}

export function memoWhenClosed<P extends { open: boolean }>(
  Component: ComponentType<P>,
): ComponentType<P> {
  return memo(Component, (prev, next) => {
    if (!prev.open && !next.open) return true;
    return shallowEqual(prev, next);
  });
}
