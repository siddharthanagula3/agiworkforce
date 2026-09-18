import { create } from 'zustand';
import {
  authorizeProfileRequest,
  liveSessionsOnProfile,
  profileIsLive,
  revokeProfileAndEndSessions,
  selectProfileForRequest,
  type BrowserPermissionProfile,
  type BrowserProfileCapability,
  type BrowserProfileDecision,
  type BrowserProfileScope,
  type BrowserProfileSession,
  type BrowserSessionKind,
} from '@agiworkforce/types';

export const PROFILE_ENDED_THIS_SESSION =
  'The browser permission profile this session ran under is no longer valid, so the session was ended.';

/**
 * The desktop app has no workspace switcher, so every profile it grants is a
 * personal one. Saying that here keeps `null` a scope rather than a wildcard.
 */
export function desktopViewerScope(userId: string | null | undefined): BrowserProfileScope | null {
  return userId ? { userId, workspaceId: null } : null;
}

export interface GrantProfileInput {
  readonly id: string;
  readonly label: string;
  readonly sites: readonly string[];
  readonly capabilities: readonly BrowserProfileCapability[];
  readonly expiresAtMs?: number | null;
  readonly nowMs?: number;
}

interface BrowserProfileState {
  profiles: readonly BrowserPermissionProfile[];
  sessions: readonly BrowserProfileSession[];
  grant: (viewer: BrowserProfileScope, input: GrantProfileInput) => BrowserPermissionProfile;
  bindSession: (session: BrowserProfileSession) => void;
  endSession: (sessionId: string, nowMs?: number) => void;
  revoke: (
    profileId: string,
    viewer: BrowserProfileScope,
    nowMs?: number,
  ) => readonly BrowserProfileSession[];
  reset: () => void;
}

export const useBrowserProfileStore = create<BrowserProfileState>((set, get) => ({
  profiles: [],
  sessions: [],

  grant: (viewer, input) => {
    const now = input.nowMs ?? Date.now();
    const profile: BrowserPermissionProfile = {
      id: input.id,
      label: input.label,
      userId: viewer.userId,
      workspaceId: viewer.workspaceId,
      sites: [...input.sites],
      capabilities: [...input.capabilities],
      createdAtMs: now,
      expiresAtMs: input.expiresAtMs ?? null,
      revokedAtMs: null,
    };
    set((state) => ({
      profiles: [...state.profiles.filter((held) => held.id !== profile.id), profile],
    }));
    return profile;
  },

  bindSession: (session) => {
    set((state) => ({
      sessions: [...state.sessions.filter((held) => held.sessionId !== session.sessionId), session],
    }));
  },

  endSession: (sessionId, nowMs) => {
    const ended = nowMs ?? Date.now();
    set((state) => ({
      sessions: state.sessions.map((session) =>
        session.sessionId === sessionId && session.endedAtMs === null
          ? { ...session, endedAtMs: ended }
          : session,
      ),
    }));
  },

  revoke: (profileId, viewer, nowMs) => {
    const now = nowMs ?? Date.now();
    const held = get().profiles.find(
      (profile) =>
        profile.id === profileId &&
        profile.userId === viewer.userId &&
        profile.workspaceId === viewer.workspaceId,
    );
    if (!held) return [];

    const effect = revokeProfileAndEndSessions(held, get().sessions, now);
    set((state) => ({
      profiles: state.profiles.map((profile) =>
        profile.id === effect.profile.id ? effect.profile : profile,
      ),
      sessions: effect.sessions,
    }));
    return effect.ended;
  },

  reset: () => set({ profiles: [], sessions: [] }),
}));

export interface ViewerProfileRequest {
  readonly url: string;
  readonly capability: BrowserProfileCapability;
  readonly profileId?: string | null;
  readonly nowMs?: number;
}

/**
 * The profile a viewer session runs under. A named profile is checked by name
 * so an expired or revoked one refuses in words instead of silently falling
 * through to a broader profile the person also holds.
 */
export function resolveViewerProfile(
  viewer: BrowserProfileScope,
  request: ViewerProfileRequest,
): BrowserProfileDecision {
  const { profiles } = useBrowserProfileStore.getState();
  const query = {
    url: request.url,
    capability: request.capability,
    nowMs: request.nowMs ?? Date.now(),
  };
  return request.profileId
    ? authorizeProfileRequest(profiles, request.profileId, viewer, query)
    : selectProfileForRequest(profiles, viewer, query);
}

export function startViewerSession(input: {
  readonly sessionId: string;
  readonly profileId: string;
  readonly kind: BrowserSessionKind;
  readonly nowMs?: number;
}): BrowserProfileSession {
  const session: BrowserProfileSession = {
    sessionId: input.sessionId,
    profileId: input.profileId,
    kind: input.kind,
    startedAtMs: input.nowMs ?? Date.now(),
    endedAtMs: null,
  };
  useBrowserProfileStore.getState().bindSession(session);
  return session;
}

/**
 * True while the profile a running session references is still a grant. The
 * viewer polls this rather than trusting the session it started, because an
 * expiry passes without anyone calling anything.
 */
export function sessionProfileStillHolds(sessionId: string, nowMs: number = Date.now()): boolean {
  const { profiles, sessions } = useBrowserProfileStore.getState();
  const session = sessions.find((held) => held.sessionId === sessionId);
  if (!session || session.endedAtMs !== null) return false;
  const profile = profiles.find((held) => held.id === session.profileId);
  return profile !== undefined && profileIsLive(profile, nowMs);
}

export function liveSessionsFor(profileId: string): readonly BrowserProfileSession[] {
  return liveSessionsOnProfile(useBrowserProfileStore.getState().sessions, profileId);
}
