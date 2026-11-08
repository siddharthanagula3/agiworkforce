import { useLayoutEffect, useMemo } from 'react';
import {
  isPublicationLeaseCurrent,
  usePublishedSitesStore,
} from '@features/sites/stores/published-sites-store';

export function usePublicationView(artifactId: string | null, scope?: object) {
  const lease = usePublishedSitesStore((state) => state.lease);
  const view = useMemo(() => {
    let mounted = false;
    return {
      artifactId,
      scope,
      get active() {
        return mounted && isPublicationLeaseCurrent(lease);
      },
      set active(value: boolean) {
        mounted = value;
      },
      pending: false,
      revision: 0,
    };
  }, [artifactId, scope, lease]);
  useLayoutEffect(() => {
    view.active = true;
    return () => {
      view.active = false;
    };
  }, [view]);
  return view;
}
