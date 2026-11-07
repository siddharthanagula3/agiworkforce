'use client';

import { useCallback, useLayoutEffect, useRef } from 'react';
import { useSessionSnapshot } from '@/lib/identity/useSessionSnapshot';
import {
  observePreferenceOwner,
  type PreferenceOwner,
} from '@/app/settings/_lib/preferences-client';

export function usePreferenceOwner(): PreferenceOwner | null {
  const capture = useSessionSnapshot();
  return observePreferenceOwner(capture());
}

export function usePreferenceView(owner: PreferenceOwner | null) {
  const rendered = useRef(owner);
  rendered.current = owner;
  const lifetime = useRef<object | null>(null);
  useLayoutEffect(() => {
    const generation = {};
    lifetime.current = generation;
    return () => {
      if (lifetime.current === generation) lifetime.current = null;
    };
  }, [owner]);
  return useCallback(() => {
    const generation = lifetime.current;
    return () =>
      generation !== null &&
      lifetime.current === generation &&
      rendered.current === owner &&
      owner?.isCurrent() === true;
  }, [owner]);
}
