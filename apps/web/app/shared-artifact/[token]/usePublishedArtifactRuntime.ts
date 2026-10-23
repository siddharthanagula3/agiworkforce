'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ArtifactRuntimeConnector } from '@agiworkforce/cloud-contracts';
import type { ArtifactRuntimeHost } from '@/lib/artifact-sandbox';
import { useSession } from '@/lib/identity/client';
import {
  ArtifactRuntimeSignInRequiredError,
  callArtifactRuntime,
  describeArtifactRuntimeConnectors,
} from '@/features/chat/components/artifacts/artifactRuntimeClient';
import { toUserMessage } from '@/lib/user-error-message';
import { ARTIFACT_AI_OFF_MESSAGE } from '@/lib/artifact-ai';

const CONSENT_DECLINED = 'You chose not to let this app use AI.';
const CONNECTORS_DECLINED = 'You chose not to let this app use your connected apps.';
const CONNECTORS_UNREAD = 'Your connected apps could not be listed for this app.';
const CONTEXT_CHANGED =
  'This app changed while the request was pending. Review the current app and try again.';
interface RuntimeContext {
  owner: object;
  controller: AbortController;
}

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

// Consent is kept per exact revision: republishing new code under the same
// link must ask again rather than inherit what the earlier code was allowed.
// Without the code to fingerprint, nothing is remembered and every call asks.
function useRevisionDigest(revision: string | undefined): string | null {
  const [digest, setDigest] = useState<{ source: string; value: string } | null>(null);
  useEffect(() => {
    const subtle = globalThis.crypto?.subtle;
    if (revision === undefined || !subtle) return undefined;
    const source = revision;
    let current = true;
    void subtle.digest('SHA-256', new TextEncoder().encode(source)).then(
      (buffer) => {
        if (!current) return;
        const value = Array.from(new Uint8Array(buffer), (byte) =>
          byte.toString(16).padStart(2, '0'),
        ).join('');
        setDigest({ source, value });
      },
      () => undefined,
    );
    return () => {
      current = false;
    };
  }, [revision]);
  return revision !== undefined && digest?.source === revision ? digest.value : null;
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
  context: RuntimeContext;
  key: string;
  connectorIds: string[];
  resolve: (consent: StoredConsent | null) => void;
}

export function usePublishedArtifactRuntime(
  token: string | undefined,
  revision?: string,
  aiEnabled = false,
): PublishedArtifactRuntime {
  const { isLoaded, isSignedIn, userId } = useSession();
  const revisionDigest = useRevisionDigest(revision);
  const consentScopeRef = useRef<string | null>(null);
  useLayoutEffect(() => {
    consentScopeRef.current =
      token && userId && revisionDigest ? `${userId}:${token}:${revisionDigest}` : null;
  }, [token, userId, revisionDigest]);
  const [signInNeeded, setSignInNeeded] = useState(false);
  const [askingForAi, setAskingForAi] = useState<ArtifactConsentRequest | null>(null);
  const [grantedConnectorSets, setGrantedConnectorSets] = useState<string[][]>([]);
  const answersRef = useRef(new Map<string, StoredConsent | null>());
  const waitingRef = useRef<Waiter[]>([]);
  const askingKeyRef = useRef<string | null>(null);
  const owner = useMemo(
    () => ({ token, userId, isLoaded, isSignedIn, revision }),
    [token, userId, isLoaded, isSignedIn, revision],
  );
  const contextRef = useRef<RuntimeContext | null>(null);
  const current = useCallback(() => {
    const context = contextRef.current;
    return context?.owner === owner && !context.controller.signal.aborted ? context : null;
  }, [owner]);

  useLayoutEffect(() => {
    const context: RuntimeContext = { owner, controller: new AbortController() };
    contextRef.current = context;
    answersRef.current.clear();
    askingKeyRef.current = null;
    setAskingForAi(null);
    setSignInNeeded(false);
    setGrantedConnectorSets([]);
    return () => {
      if (contextRef.current === context) contextRef.current = null;
      context.controller.abort();
      const retired = waitingRef.current.filter((waiter) => waiter.context === context);
      waitingRef.current = waitingRef.current.filter((waiter) => waiter.context !== context);
      for (const waiter of retired) waiter.resolve(null);
    };
  }, [owner]);

  const ask = useCallback(
    (connectorIds: string[]) => {
      const context = current();
      if (!context) return;
      const consentScope = consentScopeRef.current;
      const stored = consentScope ? readConsent(consentScope, consentKey(connectorIds)) : null;
      setAskingForAi({
        connectorIds,
        initialAllowedTools: stored?.allowedTools ?? null,
        connectors: null,
        error: null,
      });
      if (!token || connectorIds.length === 0) return;
      void describeArtifactRuntimeConnectors(token, connectorIds, context.controller.signal).then(
        (connectors) => {
          if (current() !== context) return;
          setAskingForAi((current) =>
            current && consentKey(current.connectorIds) === consentKey(connectorIds)
              ? { ...current, connectors }
              : current,
          );
        },
        (error: unknown) => {
          if (current() !== context) return;
          setAskingForAi((current) =>
            current && consentKey(current.connectorIds) === consentKey(connectorIds)
              ? { ...current, error: toUserMessage(error, CONNECTORS_UNREAD) }
              : current,
          );
        },
      );
    },
    [token, current],
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
      const context = current();
      if (!context) return;
      const key = askingKeyRef.current;
      if (key === null) return;
      const consent: StoredConsent | null = answer.allowed
        ? { allowed: true, allowedTools: [...answer.allowedTools] }
        : null;
      answersRef.current.set(key, consent);
      const settled = waitingRef.current.filter(
        (waiter) => waiter.key === key && waiter.context === context,
      );
      const consentScope = consentScopeRef.current;
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
    [ask, rememberGranted, current],
  );

  const consentFor = useCallback(
    (connectorIds: readonly string[], review: boolean): Promise<StoredConsent | null> => {
      const context = current();
      if (!context) return Promise.resolve(null);
      const key = consentKey(connectorIds);
      if (!review) {
        const answered = answersRef.current.get(key);
        if (answered !== undefined) return Promise.resolve(answered);
        const consentScope = consentScopeRef.current;
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
        waitingRef.current.push({ context, key, connectorIds: [...connectorIds], resolve });
      });
    },
    [ask, rememberGranted, current],
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
        const context = current();
        if (!context) throw new Error(CONTEXT_CHANGED);
        if (request.op === 'complete' && !aiEnabled) throw new Error(ARTIFACT_AI_OFF_MESSAGE);
        if (!isLoaded) throw new Error('Wait for your sign-in state before using this app.');
        if (!isSignedIn || !userId) {
          setSignInNeeded(true);
          throw new ArtifactRuntimeSignInRequiredError();
        }
        let allowedTools: string[] = [];
        if (request.op === 'complete') {
          const consent = await consentFor(request.connectors, false);
          if (current() !== context) throw new Error(CONTEXT_CHANGED);
          if (!consent) {
            throw new Error(request.connectors.length > 0 ? CONNECTORS_DECLINED : CONSENT_DECLINED);
          }
          allowedTools = consent.allowedTools;
        }
        try {
          if (current() !== context) throw new Error(CONTEXT_CHANGED);
          const value = await callArtifactRuntime(token, request, {
            allowedTools,
            signal: context.controller.signal,
          });
          if (current() !== context) throw new Error(CONTEXT_CHANGED);
          return value;
        } catch (error) {
          if (current() !== context) throw new Error(CONTEXT_CHANGED);
          if (error instanceof ArtifactRuntimeSignInRequiredError) setSignInNeeded(true);
          throw error;
        }
      },
    };
  }, [consentFor, token, isLoaded, isSignedIn, userId, current, aiEnabled]);

  return {
    host,
    signInNeeded,
    askingForAi,
    answerAiRequest,
    grantedConnectorSets,
    reviewConnectors,
  };
}
