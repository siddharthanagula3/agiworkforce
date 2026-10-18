'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Spinner } from '@agiworkforce/ui';
import { SITE_URL } from '@/lib/seo/site';
import { SURFACE_STATUS } from '@/lib/surface-status';

const INSTALL_COMMAND = `curl -fsSL ${SITE_URL}/install.sh | bash`;

const RELEASE_PUBLISHED_LABEL = 'Signed release published';

type ReleaseState =
  | { state: 'loading' }
  | { state: 'published'; version: string }
  | { state: 'unpublished' }
  | { state: 'error' };

interface CliReleaseLookup {
  release: ReleaseState;
  checkRelease: (signal?: AbortSignal) => Promise<void>;
}

const CliReleaseContext = createContext<CliReleaseLookup | null>(null);

function publishedVersion(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;
  const version = (value as Record<string, unknown>)['version'];
  return typeof version === 'string' && version.trim() !== '' ? version : null;
}

function useCliRelease(): CliReleaseLookup {
  const lookup = useContext(CliReleaseContext);
  if (!lookup) throw new Error('The CLI release lookup needs a CliReleaseProvider above it.');
  return lookup;
}

export function CliReleaseProvider({ children }: { children: ReactNode }) {
  const [release, setRelease] = useState<ReleaseState>({ state: 'loading' });
  const requestId = useRef(0);

  const checkRelease = useCallback(async (signal?: AbortSignal) => {
    const currentRequest = ++requestId.current;
    setRelease({ state: 'loading' });
    try {
      const response = await fetch('/api/releases/cli/latest', { cache: 'no-store', signal });
      if (currentRequest !== requestId.current) return;
      if (response.status === 404) {
        setRelease({ state: 'unpublished' });
        return;
      }
      if (!response.ok) throw new Error(`CLI release lookup failed with ${response.status}`);
      const version = publishedVersion(await response.json());
      if (currentRequest !== requestId.current) return;
      if (!version) throw new Error('CLI release lookup named no version');
      setRelease({ state: 'published', version });
    } catch {
      if (signal?.aborted || currentRequest !== requestId.current) return;
      setRelease({ state: 'error' });
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void checkRelease(controller.signal);
    return () => controller.abort();
  }, [checkRelease]);

  const lookup = useMemo(() => ({ release, checkRelease }), [release, checkRelease]);

  return <CliReleaseContext.Provider value={lookup}>{children}</CliReleaseContext.Provider>;
}

export function CliReleaseStatus() {
  const { release } = useCliRelease();
  return <>{release.state === 'published' ? RELEASE_PUBLISHED_LABEL : SURFACE_STATUS.cli}</>;
}

export function CliInstallCommand() {
  const { release, checkRelease } = useCliRelease();

  if (release.state === 'loading') {
    return <Spinner size="sm" aria-label="Checking for a signed CLI release" aria-busy="true" />;
  }

  if (release.state === 'published') {
    return (
      <div className="agi-terminal">
        <div className="agi-terminal-bar">
          agi {release.version} · macOS, Linux, and Windows through Git Bash or WSL
        </div>
        <pre className="agi-terminal-pre">
          <span className="agi-terminal-prompt">$ </span>
          {INSTALL_COMMAND}
        </pre>
      </div>
    );
  }

  if (release.state === 'unpublished') {
    return (
      <p className="agi-fl-section-lede" role="status">
        No signed release is published yet, so there is no install command to run. It appears here
        as soon as the first one is.
      </p>
    );
  }

  const failed = release.state === 'error';
  if (!failed) return null;

  return (
    <div role="status">
      <p className="agi-fl-section-lede">We could not check the CLI release channel.</p>
      <button
        type="button"
        className="agi-fl-cta agi-fl-cta--secondary"
        onClick={() => void checkRelease()}
      >
        Check again
      </button>
    </div>
  );
}
