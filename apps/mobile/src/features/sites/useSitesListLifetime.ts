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

interface SitesListRead {
  authority: SiteRequestAuthority;
  isCurrent: () => boolean;
}

export interface SitesListLifetime {
  ready: boolean;
  ownerId: string | null;
  isCurrent: () => boolean;
  matchesEnvironment: () => boolean;
  beginRead: () => SitesListRead | null;
  cancelRead: () => void;
  retire: () => void;
  retired: () => boolean;
}

export function useSitesListLifetime(access: CloudFeatureAccess): SitesListLifetime {
  const [, redraw] = useReducer((value: number) => value + 1, 0);
  const current = useRef<SitesListLifetime | null>(null);
  const mounted = useRef(true);
  const previous = current.current;
  if (
    !previous ||
    previous.retired() ||
    !previous.matchesEnvironment() ||
    previous.ready !== access.ready ||
    previous.ownerId !== access.ownerId
  ) {
    previous?.retire();
    const account = captureCloudAccountEpoch();
    const auth = useAuthStore.getState();
    const mode = useChatAppModeStore.getState().appMode;
    let retired = false;
    let activeRead: AbortController | null = null;
    const view: SitesListLifetime = {
      ready: access.ready,
      ownerId: access.ownerId,
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
        const liveAuth = useAuthStore.getState();
        return (
          mounted.current &&
          current.current === view &&
          !retired &&
          view.ready &&
          useChatAppModeStore.getState().appMode === 'cloud' &&
          liveAuth.isClerkLoaded &&
          liveAuth.isClerkSignedIn &&
          liveAuth.clerkUserId === view.ownerId &&
          account?.ownerId === view.ownerId &&
          isCloudAccountEpochCurrent(account)
        );
      },
      beginRead: () => {
        if (!view.isCurrent()) return null;
        view.cancelRead();
        const controller = new AbortController();
        activeRead = controller;
        const read: SitesListRead = {
          isCurrent: () =>
            view.isCurrent() && activeRead === controller && !controller.signal.aborted,
          authority: {
            accountEpoch: account,
            signal: controller.signal,
            assertCurrent: () => {
              if (!read.isCurrent()) {
                const error = new Error('This sites list request is no longer current.');
                error.name = 'AbortError';
                throw error;
              }
            },
          },
        };
        return read;
      },
      cancelRead: () => {
        activeRead?.abort();
        activeRead = null;
      },
      retire: () => {
        retired = true;
        view.cancelRead();
      },
      retired: () => retired,
    };
    current.current = view;
  }

  useLayoutEffect(() => {
    mounted.current = true;
    if (current.current?.retired()) redraw();
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
