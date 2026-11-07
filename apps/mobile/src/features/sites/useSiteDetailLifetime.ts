import { useLayoutEffect, useReducer, useRef } from 'react';
import {
  captureCloudAccountEpoch,
  isCloudAccountEpochCurrent,
  subscribeCloudAccountEpochChange,
} from '@/src/features/auth/services/cloudAccountSession';
import { useAuthStore } from '@/src/features/auth/store';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import type { CloudFeatureAccess } from '@/src/shared/hooks/useCloudFeatureAccess';
import type { SiteRequestAuthority } from './service';

export interface SiteDetailLifetime {
  key: number;
  token: string;
  ready: boolean;
  ownerId: string | null;
  authority: SiteRequestAuthority;
  isCurrent: () => boolean;
  matchesEnvironment: () => boolean;
  retire: () => void;
  refresh: () => void;
}

export function useSiteDetailLifetime(
  token: string,
  access: CloudFeatureAccess,
): SiteDetailLifetime {
  const [, redraw] = useReducer((value: number) => value + 1, 0);
  const current = useRef<SiteDetailLifetime | null>(null);
  const sequence = useRef(0);
  const mounted = useRef(true);
  const previous = current.current;
  const account = captureCloudAccountEpoch();
  const auth = useAuthStore.getState();
  const mode = useChatAppModeStore.getState().appMode;
  if (
    !previous ||
    previous.authority.signal.aborted ||
    !previous.matchesEnvironment() ||
    previous.token !== token ||
    previous.ready !== access.ready ||
    previous.ownerId !== access.ownerId ||
    previous.authority.accountEpoch?.ownerId !== account?.ownerId ||
    previous.authority.accountEpoch?.epoch !== account?.epoch
  ) {
    previous?.retire();
    const controller = new AbortController();
    const view: SiteDetailLifetime = {
      key: ++sequence.current,
      token,
      ready: access.ready,
      ownerId: access.ownerId,
      authority: {
        accountEpoch: account,
        signal: controller.signal,
        assertCurrent: () => {
          if (!view.isCurrent()) {
            const error = new Error('This site view is no longer current.');
            error.name = 'AbortError';
            throw error;
          }
        },
      },
      matchesEnvironment: () => {
        const liveAccount = captureCloudAccountEpoch();
        const liveAuth = useAuthStore.getState();
        return (
          liveAccount?.ownerId === account?.ownerId &&
          liveAccount?.epoch === account?.epoch &&
          liveAuth.clerkUserId === auth.clerkUserId &&
          liveAuth.isClerkLoaded === auth.isClerkLoaded &&
          liveAuth.isClerkSignedIn === auth.isClerkSignedIn &&
          useChatAppModeStore.getState().appMode === mode
        );
      },
      isCurrent: () => {
        const auth = useAuthStore.getState();
        return (
          mounted.current &&
          current.current === view &&
          !controller.signal.aborted &&
          view.ready &&
          Boolean(token) &&
          useChatAppModeStore.getState().appMode === 'cloud' &&
          auth.isClerkLoaded &&
          auth.isClerkSignedIn &&
          auth.clerkUserId === view.ownerId &&
          account?.ownerId === view.ownerId &&
          isCloudAccountEpochCurrent(account)
        );
      },
      retire: () => controller.abort(),
      refresh: () => {
        if (!view.isCurrent()) return;
        view.retire();
        redraw();
      },
    };
    current.current = view;
  }

  useLayoutEffect(() => {
    mounted.current = true;
    if (current.current?.authority.signal.aborted) redraw();
    const retire = () => {
      current.current?.retire();
      redraw();
    };
    const unsubscribeAccount = subscribeCloudAccountEpochChange(retire);
    const unsubscribeMode = useChatAppModeStore.subscribe((next, prior) => {
      if (next.appMode !== prior.appMode) retire();
    });
    const unsubscribeAuth = useAuthStore.subscribe((next, prior) => {
      if (
        next.clerkUserId !== prior.clerkUserId ||
        next.isClerkLoaded !== prior.isClerkLoaded ||
        next.isClerkSignedIn !== prior.isClerkSignedIn
      )
        retire();
    });
    if (current.current && !current.current.matchesEnvironment()) retire();
    return () => {
      mounted.current = false;
      current.current?.retire();
      unsubscribeAccount();
      unsubscribeMode();
      unsubscribeAuth();
    };
  }, []);

  return current.current!;
}
