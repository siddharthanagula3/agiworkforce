'use client';

import { useEffect, useRef } from 'react';

export function useServerDraftSync<S>(
  server: S | null | undefined,
  untouched: (acknowledged: S) => boolean,
  adopt: (server: S) => void,
): void {
  const latest = useRef({ untouched, adopt });
  const acknowledged = useRef<S | null>(null);

  useEffect(() => {
    latest.current = { untouched, adopt };
  });

  useEffect(() => {
    if (server === null || server === undefined) return;
    const previous = acknowledged.current;
    acknowledged.current = server;
    if (previous === null || latest.current.untouched(previous)) latest.current.adopt(server);
  }, [server]);
}
