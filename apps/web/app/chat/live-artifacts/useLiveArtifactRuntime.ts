'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ArtifactRuntimeHost } from '@/lib/artifact-sandbox';
import type {
  ArtifactConsentAnswer,
  ArtifactConsentRequest,
} from '@/app/shared-artifact/[token]/usePublishedArtifactRuntime';
import { toUserMessage } from '@/lib/user-error-message';
import {
  completeLiveArtifactPrompt,
  describeLiveArtifactConnectors,
  readLiveArtifact,
  removeLiveArtifact,
  saveLiveArtifact,
  setLiveArtifactRefreshPolicy,
} from './live-artifact-client';
import type { LiveArtifact, LiveArtifactRefreshPolicy } from './live-artifact-contract';

export const LIVE_STORAGE_UNAVAILABLE =
  'Saved data works once this app is published. Publish it to use storage.';
export const LIVE_MANUAL_REFRESH =
  'This artifact refreshes only when you ask. Select Refresh data to load current data.';
const CONSENT_DECLINED = 'You chose not to let this app use AI.';
const CONNECTORS_DECLINED = 'You chose not to let this app use your connected apps.';
const CONNECTORS_UNREAD = 'Your connected apps could not be listed for this app.';
const CONTEXT_CHANGED = 'This artifact changed while the request was pending. Try again.';

interface RuntimeContext {
  artifactId: string;
  controller: AbortController;
  bindingReady: Promise<void>;
  aiAllowed: boolean;
  armed: boolean;
  queue: Promise<unknown>;
  pendingAnswer: ((answer: ArtifactConsentAnswer) => void) | null;
}

export interface LiveArtifactRuntime {
  host: ArtifactRuntimeHost | undefined;
  binding: LiveArtifact | null;
  asking: ArtifactConsentRequest | null;
  answer: (answer: ArtifactConsentAnswer) => void;
  refreshKey: number;
  refresh: () => void;
  setRefreshPolicy: (policy: LiveArtifactRefreshPolicy) => Promise<void>;
  stopLive: () => Promise<void>;
}

function covers(binding: LiveArtifact | null, connectors: readonly string[]): boolean {
  if (connectors.length === 0) return true;
  if (!binding) return false;
  return connectors.every((connector) => binding.connectors.includes(connector));
}

export function useLiveArtifactRuntime(artifactId: string | null): LiveArtifactRuntime {
  const [binding, setBinding] = useState<LiveArtifact | null>(null);
  const [asking, setAsking] = useState<ArtifactConsentRequest | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const bindingRef = useRef<LiveArtifact | null>(null);
  const contextRef = useRef<RuntimeContext | null>(null);

  const keepBinding = useCallback((next: LiveArtifact | null) => {
    bindingRef.current = next;
    setBinding(next);
  }, []);

  useEffect(() => {
    keepBinding(null);
    setAsking(null);
    if (!artifactId) {
      contextRef.current = null;
      return undefined;
    }
    const context: RuntimeContext = {
      artifactId,
      controller: new AbortController(),
      bindingReady: Promise.resolve(),
      aiAllowed: false,
      armed: false,
      queue: Promise.resolve(),
      pendingAnswer: null,
    };
    contextRef.current = context;
    context.bindingReady = readLiveArtifact(artifactId, context.controller.signal).then(
      (loaded) => {
        if (contextRef.current === context) keepBinding(loaded);
      },
      () => undefined,
    );
    return () => {
      context.controller.abort();
      context.pendingAnswer?.({ allowed: false, allowedTools: [] });
      context.pendingAnswer = null;
      if (contextRef.current === context) contextRef.current = null;
    };
  }, [artifactId, keepBinding]);

  const current = useCallback(
    (owner: RuntimeContext) => contextRef.current === owner && !owner.controller.signal.aborted,
    [],
  );

  const requestConsent = useCallback(
    (owner: RuntimeContext, connectorIds: string[]): Promise<ArtifactConsentAnswer> =>
      new Promise((resolve) => {
        owner.pendingAnswer = resolve;
        setAsking({
          connectorIds,
          initialAllowedTools: bindingRef.current?.allowedTools ?? null,
          connectors: null,
          error: null,
        });
        if (connectorIds.length === 0) return;
        describeLiveArtifactConnectors(
          owner.artifactId,
          connectorIds,
          owner.controller.signal,
        ).then(
          (connectors) => {
            if (!current(owner)) return;
            setAsking((shown) => (shown ? { ...shown, connectors } : shown));
          },
          (error: unknown) => {
            if (!current(owner)) return;
            setAsking((shown) =>
              shown ? { ...shown, error: toUserMessage(error, CONNECTORS_UNREAD) } : shown,
            );
          },
        );
      }),
    [current],
  );

  const ensureAllowed = useCallback(
    (owner: RuntimeContext, connectors: readonly string[]): Promise<void> => {
      const run = owner.queue.then(async () => {
        await owner.bindingReady;
        if (!current(owner)) throw new Error(CONTEXT_CHANGED);
        const bound = bindingRef.current;
        if (
          connectors.length === 0 ? Boolean(bound) || owner.aiAllowed : covers(bound, connectors)
        ) {
          return;
        }
        const connectorIds =
          connectors.length === 0
            ? []
            : [...new Set([...(bound?.connectors ?? []), ...connectors])];
        const answer = await requestConsent(owner, connectorIds);
        if (!current(owner)) throw new Error(CONTEXT_CHANGED);
        if (!answer.allowed) {
          throw new Error(connectorIds.length > 0 ? CONNECTORS_DECLINED : CONSENT_DECLINED);
        }
        if (connectorIds.length === 0) {
          owner.aiAllowed = true;
          return;
        }
        const saved = await saveLiveArtifact(owner.artifactId, {
          connectors: connectorIds,
          allowedTools: answer.allowedTools,
        });
        if (current(owner)) keepBinding(saved);
      });
      owner.queue = run.catch(() => undefined);
      return run;
    },
    [current, requestConsent, keepBinding],
  );

  const answer = useCallback((reply: ArtifactConsentAnswer) => {
    const owner = contextRef.current;
    const resolve = owner?.pendingAnswer;
    if (!owner || !resolve) return;
    owner.pendingAnswer = null;
    setAsking(null);
    resolve(reply);
  }, []);

  const host = useMemo<ArtifactRuntimeHost | undefined>(() => {
    if (!artifactId) return undefined;
    return {
      handle: async (request) => {
        const context = contextRef.current;
        if (!context || context.artifactId !== artifactId || !current(context)) {
          throw new Error(CONTEXT_CHANGED);
        }
        if (request.op !== 'complete') throw new Error(LIVE_STORAGE_UNAVAILABLE);
        await context.bindingReady;
        if (bindingRef.current?.refreshPolicy === 'manual' && !context.armed) {
          throw new Error(LIVE_MANUAL_REFRESH);
        }
        await ensureAllowed(context, request.connectors);
        if (!current(context)) throw new Error(CONTEXT_CHANGED);
        const text = await completeLiveArtifactPrompt(
          context.artifactId,
          { prompt: request.prompt, connectors: request.connectors },
          context.controller.signal,
        );
        if (!current(context)) throw new Error(CONTEXT_CHANGED);
        const bound = bindingRef.current;
        if (bound) keepBinding({ ...bound, lastRefreshedAt: new Date().toISOString() });
        return text;
      },
    };
  }, [artifactId, current, ensureAllowed, keepBinding]);

  const refresh = useCallback(() => {
    const owner = contextRef.current;
    if (owner) owner.armed = true;
    setRefreshKey((key) => key + 1);
  }, []);

  const setRefreshPolicy = useCallback(
    async (policy: LiveArtifactRefreshPolicy) => {
      const owner = contextRef.current;
      if (!owner) return;
      const updated = await setLiveArtifactRefreshPolicy(owner.artifactId, policy);
      if (current(owner)) keepBinding(updated);
    },
    [current, keepBinding],
  );

  const stopLive = useCallback(async () => {
    const owner = contextRef.current;
    if (!owner) return;
    await removeLiveArtifact(owner.artifactId);
    if (current(owner)) keepBinding(null);
  }, [current, keepBinding]);

  return {
    host,
    binding,
    asking,
    answer,
    refreshKey,
    refresh,
    setRefreshPolicy,
    stopLive,
  };
}
