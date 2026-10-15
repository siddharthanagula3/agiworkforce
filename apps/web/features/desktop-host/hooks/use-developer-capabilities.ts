'use client';

import { useEffect, useState } from 'react';
import {
  developerRuntimeCapabilities,
  type DeveloperRuntimeCapability,
} from '@agiworkforce/local-runtime-contract';
import { useDesktopHost } from '../lib/host';
import { readDeveloperRuntimeStatus } from '../lib/runtime-client';

const NONE: ReadonlySet<DeveloperRuntimeCapability> = new Set();

/**
 * The coding-session features the shell running this page handles. Empty in a
 * browser, until the shell answers, and from a shell too old to report them.
 * The shell reports none until a CLI has started and said what it serves, so a
 * caller that knows one has started passes a new `refreshKey`.
 */
export function useDeveloperCapabilities(
  refreshKey?: unknown,
): ReadonlySet<DeveloperRuntimeCapability> {
  const host = useDesktopHost();
  const [capabilities, setCapabilities] = useState(NONE);

  useEffect(() => {
    if (host === null) return undefined;
    let cancelled = false;
    readDeveloperRuntimeStatus()
      .then((status) => {
        if (!cancelled) setCapabilities(developerRuntimeCapabilities(status));
      })
      .catch(() => {
        if (!cancelled) setCapabilities(NONE);
      });
    return () => {
      cancelled = true;
    };
  }, [host, refreshKey]);

  return capabilities;
}
