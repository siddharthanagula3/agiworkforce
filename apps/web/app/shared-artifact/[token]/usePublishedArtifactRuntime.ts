'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import type { ArtifactRuntimeHost } from '@/lib/artifact-sandbox';
import { useSession } from '@/lib/identity/client';
import {
  ArtifactRuntimeSignInRequiredError,
  callArtifactRuntime,
} from '@/features/chat/components/artifacts/artifactRuntimeClient';

const CONSENT_STORAGE_PREFIX = 'agiworkforce-artifact-ai:';
const CONSENT_DECLINED = 'You chose not to let this app use AI.';
const CONNECTORS_DECLINED = 'You chose not to let this app use your connected apps.';

function consentKey(connectors: readonly string[]): string {
  return connectors.length === 0 ? 'ai' : `ai+${[...connectors].sort().join(',')}`;
}

function consentStored(token: string, key: string): boolean {
  try {
    return window.sessionStorage.getItem(`${CONSENT_STORAGE_PREFIX}${token}:${key}`) === 'allowed';
  } catch {
    return false;
  }
}

function storeConsent(token: string, key: string): void {
  try {
    window.sessionStorage.setItem(`${CONSENT_STORAGE_PREFIX}${token}:${key}`, 'allowed');
  } catch {
    return;
  }
}

export interface PublishedArtifactRuntime {
  host: ArtifactRuntimeHost | undefined;
  signInNeeded: boolean;
  askingForAi: { connectors: string[] } | null;
  answerAiRequest: (allowed: boolean) => void;
}

export function usePublishedArtifactRuntime(token: string | undefined): PublishedArtifactRuntime {
  const { isLoaded, isSignedIn } = useSession();
  const [signInNeeded, setSignInNeeded] = useState(false);
  const [askingForAi, setAskingForAi] = useState<{ connectors: string[] } | null>(null);
  const answersRef = useRef(new Map<string, boolean>());
  const waitingRef = useRef<
    { key: string; connectors: string[]; resolve: (allowed: boolean) => void }[]
  >([]);
  const askingKeyRef = useRef<string | null>(null);
  const signedOut = isLoaded && !isSignedIn;

  const answerAiRequest = useCallback(
    (allowed: boolean) => {
      const key = askingKeyRef.current;
      if (key === null) return;
      answersRef.current.set(key, allowed);
      if (allowed && token) storeConsent(token, key);
      const settled = waitingRef.current.filter((waiter) => waiter.key === key);
      waitingRef.current = waitingRef.current.filter((waiter) => waiter.key !== key);
      const next = waitingRef.current[0];
      askingKeyRef.current = next ? next.key : null;
      setAskingForAi(next ? { connectors: next.connectors } : null);
      for (const waiter of settled) waiter.resolve(allowed);
    },
    [token],
  );

  const host = useMemo<ArtifactRuntimeHost | undefined>(() => {
    if (!token) return undefined;
    const aiAllowed = (connectors: readonly string[]): Promise<boolean> => {
      const key = consentKey(connectors);
      const answered = answersRef.current.get(key);
      if (answered !== undefined) return Promise.resolve(answered);
      if (consentStored(token, key)) {
        answersRef.current.set(key, true);
        return Promise.resolve(true);
      }
      if (askingKeyRef.current === null) {
        askingKeyRef.current = key;
        setAskingForAi({ connectors: [...connectors] });
      }
      return new Promise((resolve) => {
        waitingRef.current.push({ key, connectors: [...connectors], resolve });
      });
    };
    return {
      handle: async (request) => {
        if (signedOut) {
          setSignInNeeded(true);
          throw new ArtifactRuntimeSignInRequiredError();
        }
        if (request.op === 'complete' && !(await aiAllowed(request.connectors))) {
          throw new Error(request.connectors.length > 0 ? CONNECTORS_DECLINED : CONSENT_DECLINED);
        }
        try {
          return await callArtifactRuntime(token, request);
        } catch (error) {
          if (error instanceof ArtifactRuntimeSignInRequiredError) setSignInNeeded(true);
          throw error;
        }
      },
    };
  }, [token, signedOut]);

  return { host, signInNeeded, askingForAi, answerAiRequest };
}
