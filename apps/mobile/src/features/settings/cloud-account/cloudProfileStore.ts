import { create } from 'zustand';
import { parseMeResponse } from '@agiworkforce/cloud-contracts';
import { api } from '@/services/api';
import {
  captureCloudAccountEpoch,
  isCloudAccountEpochCurrent,
  type CloudAccountEpoch,
} from '@/src/features/auth/services/cloudAccountSession';

interface CloudProfileState {
  ownerId: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  loaded: boolean;
  loading: boolean;
  saving: boolean;
  error: string | null;
  load: (ownerId: string) => Promise<void>;
  save: (ownerId: string, displayName: string) => Promise<boolean>;
  setAvatar: (ownerId: string, avatarUrl: string) => void;
  reset: () => void;
}

function captureOwner(ownerId: string): CloudAccountEpoch | null {
  const account = captureCloudAccountEpoch();
  return account?.ownerId === ownerId ? account : null;
}

let requestGeneration = 0;
let avatarRevision = 0;

export const useCloudProfileStore = create<CloudProfileState>()((set, get) => ({
  ownerId: null,
  displayName: null,
  avatarUrl: null,
  loaded: false,
  loading: false,
  saving: false,
  error: null,

  load: async (ownerId) => {
    const account = captureOwner(ownerId);
    if (!account) return;
    if (get().ownerId === ownerId && get().saving) return;
    const generation = ++requestGeneration;
    const avatarAtStart = avatarRevision;
    set({
      ownerId,
      displayName: get().ownerId === ownerId ? get().displayName : null,
      avatarUrl: get().ownerId === ownerId ? get().avatarUrl : null,
      loaded: get().ownerId === ownerId && get().loaded,
      loading: true,
      saving: false,
      error: null,
    });
    try {
      const profile = parseMeResponse(await api.get<unknown>('/api/me?surface=mobile'));
      if (!isCloudAccountEpochCurrent(account) || generation !== requestGeneration) return;
      if (profile.id !== ownerId) throw new Error('Account identity mismatch');
      set({
        ownerId,
        displayName: profile.profile?.display_name ?? profile.name,
        avatarUrl: avatarAtStart === avatarRevision ? profile.avatar_url : get().avatarUrl,
        loaded: true,
        loading: false,
      });
    } catch {
      if (isCloudAccountEpochCurrent(account) && generation === requestGeneration) {
        set({ ownerId, loading: false, error: 'Could not load your account name.' });
      }
    }
  },

  save: async (ownerId, displayName) => {
    const account = captureOwner(ownerId);
    if (!account) return false;
    const name = displayName.trim();
    if (!name || name.length > 120 || get().saving) return false;
    const generation = ++requestGeneration;
    set({
      ownerId,
      displayName: get().ownerId === ownerId ? get().displayName : null,
      avatarUrl: get().ownerId === ownerId ? get().avatarUrl : null,
      loaded: get().ownerId === ownerId && get().loaded,
      loading: false,
      saving: true,
      error: null,
    });
    try {
      await api.patch('/api/me', { display_name: name });
      if (!isCloudAccountEpochCurrent(account) || generation !== requestGeneration) return false;
      set({ ownerId, displayName: name, saving: false });
      return true;
    } catch {
      if (isCloudAccountEpochCurrent(account) && generation === requestGeneration) {
        set({ ownerId, saving: false, error: 'Could not save your account name. Try again.' });
      }
      return false;
    }
  },

  setAvatar: (ownerId, avatarUrl) => {
    if (!captureOwner(ownerId)) return;
    avatarRevision += 1;
    set({ ownerId, avatarUrl, loaded: true });
  },

  reset: () => {
    requestGeneration += 1;
    avatarRevision += 1;
    set({
      ownerId: null,
      displayName: null,
      avatarUrl: null,
      loaded: false,
      loading: false,
      saving: false,
      error: null,
    });
  },
}));
