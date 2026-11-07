import { useLayoutEffect, useMemo } from 'react';

export function usePublicationView(artifactId: string | null, scope?: object) {
  const view = useMemo(() => ({ active: false, pending: false, revision: 0 }), [artifactId, scope]);
  useLayoutEffect(() => {
    view.active = true;
    return () => {
      view.active = false;
    };
  }, [view]);
  return view;
}
