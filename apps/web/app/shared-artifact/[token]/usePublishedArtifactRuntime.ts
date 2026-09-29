'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ArtifactRuntimeConnector } from '@agiworkforce/cloud-contracts';
import type { ArtifactRuntimeHost } from '@/lib/artifact-sandbox';
import { useSession } from '@/lib/identity/client';
import {
  ArtifactRuntimeSignInRequiredError,
  callArtifactRuntime,
  describeArtifactRuntimeConnectors,
} from '@/features/chat/components/artifacts/artifactRuntimeClient';
import { toUserMessage } from '@/lib/user-error-message';

const CONSENT_DECLINED = 'You chose not to let this app use AI.';
const CONNECTORS_DECLINED = 'You chose not to let this app use your connected apps.';
const CONNECTORS_UNREAD = 'Your connected apps could not be listed for this app.';

interface StoredConsent {
  allowed: true;
  allowedTools: string[];
}

export interface ArtifactConsentRequest {
  connectorIds: string[];
  initialAllowedTools: string[] | null;
  connectors: ArtifactRuntimeConnector[] | null;
  error: string | null;
}

export interface ArtifactConsentAnswer {
  allowed: boolean;
  allowedTools: string[];
}

function consentKey(connectors: readonly string[]): string {
  return connectors.length === 0 ? 'ai' : `ai+${[...connectors].sort().join(',')}`;
}

function readConsent(scope: string, key: string): StoredConsent | null {
  try {
    const raw = window.localStorage.getItem(`agiworkforce-artifact-ai:${scope}:${key}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredConsent>;
    if (parsed.allowed !== true) return null;
    return {
      allowed: true,
      allowedTools: Array.isArray(parsed.allowedTools)
        ? parsed.allowedTools.filter((name): name is string => typeof name === 'string')
        : [],
    };
  } catch {
    return null;
  }
}

function storeConsent(scope: string, key: string, consent: StoredConsent): void {
  try {
    window.localStorage.setItem(
      `agiworkforce-artifact-ai:${scope}:${key}`,
      JSON.stringify(consent),
    );
  } catch {
    return;
  }
}

function forgetConsent(scope: string, key: string): void {
  try {
    window.localStorage.removeItem(`agiworkforce-artifact-ai:${scope}:${key}`);
  } catch {
    return;
  }
}

export interface PublishedArtifactRuntime {
  host: ArtifactRuntimeHost | undefined;
  signInNeeded: boolean;
  askingForAi: ArtifactConsentRequest | null;
  answerAiRequest: (answer: ArtifactConsentAnswer) => void;
  grantedConnectorSets: string[][];
  reviewConnectors: (connectorIds: readonly string[]) => void;
}

interface Waiter {
  key: string;
  connectorIds: string[];
  resolve: (consent: StoredConsent | null) => void;
}

export function usePublishedArtifactRuntime(token: string | undefined): PublishedArtifactRuntime {
  const { isLoaded, isSignedIn, userId } = useSession();
  const consentScope = token && userId ? `${userId}:${token}` : null;
  const [signInNeeded, setSignInNeeded] = useState(false);
  const [askingForAi, setAskingForAi] = useState<ArtifactConsentRequest | null>(null);
  const [grantedConnectorSets, setGrantedConnectorSets] = useState<string[][]>([]);
  const answersRef = useRef(new Map<string, StoredConsent | null>());
  const waitingRef = useRef<Waiter[]>([]);
  const askingKeyRef = useRef<string | null>(null);
  const signedOut = isLoaded && !isSignedIn;

  useEffect(() => {
    answersRef.current.clear();
    setGrantedConnectorSets([]);
  }, [consentScope]);

  const ask = useCallback(
    (connectorIds: string[]) => {
      const stored = consentScope ? readConsent(consentScope, consentKey(connectorIds)) : null;
      setAskingForAi({
        connectorIds,
        initialAllowedTools: stored?.allowedTools ?? null,
        connectors: null,
        error: null,
      });
      if (!token || connectorIds.length === 0) return;
      void describeArtifactRuntimeConnectors(token, connectorIds).then(
        (connectors) =>
          setAskingForAi((current) =>
            current && consentKey(current.connectorIds) === consentKey(connectorIds)
              ? { ...current, connectors }
              : current,
          ),
        (error: unknown) =>
          setAskingForAi((current) =>
            current && consentKey(current.connectorIds) === consentKey(connectorIds)
              ? { ...current, error: toUserMessage(error, CONNECTORS_UNREAD) }
              : current,
          ),
      );
    },
    [token, consentScope],
  );

  const rememberGranted = useCallback((connectorIds: readonly string[]) => {
    if (connectorIds.length === 0) return;
    setGrantedConnectorSets((current) =>
      current.some((set) => consentKey(set) === consentKey(connectorIds))
        ? current
        : [...current, [...connectorIds]],
    );
  }, []);

  const answerAiRequest = useCallback(
    (answer: ArtifactConsentAnswer) => {
      const key = askingKeyRef.current;
      if (key === null) return;
      const consent: StoredConsent | null = answer.allowed
        ? { allowed: true, allowedTools: [...answer.allowedTools] }
        : null;
      answersRef.current.set(key, consent);
      const settled = waitingRef.current.filter((waiter) => waiter.key === key);
      if (consentScope) {
        if (consent) storeConsent(consentScope, key, consent);
        else forgetConsent(consentScope, key);
      }
      if (consent) rememberGranted(settled[0]?.connectorIds ?? []);
      waitingRef.current = waitingRef.current.filter((waiter) => waiter.key !== key);
      const next = waitingRef.current[0];
      askingKeyRef.current = next ? next.key : null;
      if (next) ask(next.connectorIds);
      else setAskingForAi(null);
      for (const waiter of settled) waiter.resolve(consent);
    },
    [ask, rememberGranted, consentScope],
  );

  const consentFor = useCallback(
    (connectorIds: readonly string[], review: boolean): Promise<StoredConsent | null> => {
      const key = consentKey(connectorIds);
      if (!review) {
        const answered = answersRef.current.get(key);
        if (answered !== undefined) return Promise.resolve(answered);
        const stored = consentScope ? readConsent(consentScope, key) : null;
        if (stored) {
          answersRef.current.set(key, stored);
          rememberGranted(connectorIds);
          return Promise.resolve(stored);
        }
      }
      if (askingKeyRef.current === null) {
        askingKeyRef.current = key;
        ask([...connectorIds]);
      }
      return new Promise((resolve) => {
        waitingRef.current.push({ key, connectorIds: [...connectorIds], resolve });
      });
    },
    [ask, rememberGranted, consentScope],
  );

  const reviewConnectors = useCallback(
    (connectorIds: readonly string[]) => {
      void consentFor(connectorIds, true);
    },
    [consentFor],
  );

  const host = useMemo<ArtifactRuntimeHost | undefined>(() => {
    if (!token) return undefined;
    return {
      handle: async (request) => {
        if (signedOut) {
          setSignInNeeded(true);
          throw new ArtifactRuntimeSignInRequiredError();
        }
        let allowedTools: string[] = [];
        if (request.op === 'complete') {
          const consent = await consentFor(request.connectors, false);
          if (!consent) {
            throw new Error(request.connectors.length > 0 ? CONNECTORS_DECLINED : CONSENT_DECLINED);
          }
          allowedTools = consent.allowedTools;
        }
        try {
          return await callArtifactRuntime(token, request, { allowedTools });
        } catch (error) {
          if (error instanceof ArtifactRuntimeSignInRequiredError) setSignInNeeded(true);
          throw error;
        }
      },
    };
  }, [consentFor, token, signedOut]);

  return {
    host,
    signInNeeded,
    askingForAi,
    answerAiRequest,
    grantedConnectorSets,
    reviewConnectors,
  };
}
