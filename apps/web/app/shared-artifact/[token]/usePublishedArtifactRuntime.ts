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

function consentStored(token: string): boolean {
  try {
    return window.sessionStorage.getItem(`${CONSENT_STORAGE_PREFIX}${token}`) === 'allowed';
  } catch {
    return false;
  }
}

function storeConsent(token: string): void {
  try {
    window.sessionStorage.setItem(`${CONSENT_STORAGE_PREFIX}${token}`, 'allowed');
  } catch {
    return;
  }
}

export interface PublishedArtifactRuntime {
  host: ArtifactRuntimeHost | undefined;
  signInNeeded: boolean;
  askingForAi: boolean;
  answerAiRequest: (allowed: boolean) => void;
}

export function usePublishedArtifactRuntime(token: string | undefined): PublishedArtifactRuntime {
  const { isLoaded, isSignedIn } = useSession();
  const [signInNeeded, setSignInNeeded] = useState(false);
  const [askingForAi, setAskingForAi] = useState(false);
  const consentRef = useRef<'unknown' | 'allowed' | 'declined'>('unknown');
  const waitingRef = useRef<Array<(allowed: boolean) => void>>([]);
  const signedOut = isLoaded && !isSignedIn;

  const answerAiRequest = useCallback(
    (allowed: boolean) => {
      consentRef.current = allowed ? 'allowed' : 'declined';
      if (allowed && token) storeConsent(token);
      setAskingForAi(false);
      for (const resolve of waitingRef.current.splice(0)) resolve(allowed);
    },
    [token],
  );

  const host = useMemo<ArtifactRuntimeHost | undefined>(() => {
    if (!token) return undefined;
    const aiAllowed = (): Promise<boolean> => {
      if (consentRef.current === 'allowed' || consentStored(token)) {
        consentRef.current = 'allowed';
        return Promise.resolve(true);
      }
      if (consentRef.current === 'declined') return Promise.resolve(false);
      setAskingForAi(true);
      return new Promise((resolve) => {
        waitingRef.current.push(resolve);
      });
    };
    return {
      handle: async (request) => {
        if (signedOut) {
          setSignInNeeded(true);
          throw new ArtifactRuntimeSignInRequiredError();
        }
        if (request.op === 'complete' && !(await aiAllowed())) throw new Error(CONSENT_DECLINED);
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
