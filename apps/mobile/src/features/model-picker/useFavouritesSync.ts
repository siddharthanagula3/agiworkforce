import { AppState, type AppStateStatus } from 'react-native';
import { normalizeModelId } from '@agiworkforce/types';

import { fetchPreferenceNamespace, patchPreferenceNamespace } from '@/services/preferences';
import { useAuthStore } from '@/src/features/auth/store';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';

export const MODEL_PICKER_PREFERENCES_NAMESPACE = 'model-picker';
export const FAVOURITE_MODEL_IDS_KEY = 'favouriteModelIds';

export type FavouriteChanges = Record<string, boolean>;

export interface FavouritesSyncFields {
  favorites: string[];
  favoriteChanges: FavouriteChanges;
  favoritesSyncedAccountId: string | null;
}

export interface FavouritesSyncTarget {
  getState: () => FavouritesSyncFields;
  setState: (patch: Partial<FavouritesSyncFields>) => void;
  subscribe: (
    listener: (state: FavouritesSyncFields, prev: FavouritesSyncFields) => void,
  ) => () => void;
  hasHydrated: () => boolean;
  onFinishHydration: (listener: () => void) => () => void;
  isAccountModelId: (modelId: string) => boolean;
  isSelectable: (modelId: string) => boolean;
}

function unique(ids: readonly string[]): string[] {
  return Array.from(new Set(ids));
}

function sameList(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

export function readAccountFavourites(stored: unknown): string[] {
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return [];
  const raw = (stored as Record<string, unknown>)[FAVOURITE_MODEL_IDS_KEY];
  if (!Array.isArray(raw)) return [];
  return unique(
    raw
      .filter((id): id is string => typeof id === 'string' && id.length > 0)
      .map((id) => normalizeModelId(id) ?? id),
  );
}

export function applyFavouriteChanges(
  accountList: readonly string[],
  changes: FavouriteChanges,
): string[] {
  const kept = accountList.filter((id) => changes[id] !== false);
  const added = Object.entries(changes)
    .filter(([, isFavourite]) => isFavourite)
    .map(([id]) => id);
  return unique([...kept, ...added]);
}

function activeAccountId(target: FavouritesSyncTarget): string | null {
  if (!target.hasHydrated()) return null;
  if (useChatAppModeStore.getState().appMode !== 'cloud') return null;
  const { isClerkSignedIn, clerkUserId } = useAuthStore.getState();
  return isClerkSignedIn && clerkUserId ? clerkUserId : null;
}

export function startFavouritesSync(target: FavouritesSyncTarget): () => void {
  let accountId: string | null = null;
  let generation = 0;
  let accountFavourites: string[] | null = null;
  let pushing = false;
  let pushQueued = false;
  let stopped = false;
  const cleanups: Array<() => void> = [];

  const isVisible = (id: string) => target.isAccountModelId(id) && target.isSelectable(id);

  const showAccountList = (list: readonly string[]) => {
    const deviceOnly = target.getState().favorites.filter((id) => !target.isAccountModelId(id));
    return unique([...deviceOnly, ...list.filter(isVisible)]);
  };

  const push = async (): Promise<void> => {
    if (pushing) {
      pushQueued = true;
      return;
    }
    pushing = true;
    try {
      do {
        pushQueued = false;
        const account = accountId;
        const pushGeneration = generation;
        if (!account || accountFavourites === null) return;
        const changes = target.getState().favoriteChanges;
        const list = applyFavouriteChanges(accountFavourites, changes);
        if (sameList(list, accountFavourites)) {
          target.setState({ favoriteChanges: {}, favoritesSyncedAccountId: account });
          continue;
        }
        try {
          await patchPreferenceNamespace(MODEL_PICKER_PREFERENCES_NAMESPACE, {
            [FAVOURITE_MODEL_IDS_KEY]: list,
          });
        } catch (error) {
          console.warn('[modelFavourites] Saving favourites to the account failed:', error);
          return;
        }
        if (stopped || pushGeneration !== generation) return;
        accountFavourites = list;
        const latest = target.getState().favoriteChanges;
        const remaining = Object.fromEntries(
          Object.entries(latest).filter(([id, isFavourite]) => changes[id] !== isFavourite),
        );
        target.setState({ favoriteChanges: remaining, favoritesSyncedAccountId: account });
        if (Object.keys(remaining).length > 0) pushQueued = true;
      } while (pushQueued);
    } finally {
      pushing = false;
    }
  };

  const pull = async (): Promise<void> => {
    const account = accountId;
    const pullGeneration = generation;
    if (!account) return;
    let remote: string[];
    try {
      remote = readAccountFavourites(
        await fetchPreferenceNamespace(MODEL_PICKER_PREFERENCES_NAMESPACE),
      );
    } catch (error) {
      console.warn('[modelFavourites] Loading favourites from the account failed:', error);
      return;
    }
    if (stopped || pullGeneration !== generation) return;

    const state = target.getState();
    let changes: FavouriteChanges;
    if (state.favoritesSyncedAccountId === null) {
      changes = {
        ...Object.fromEntries(state.favorites.filter(isVisible).map((id) => [id, true])),
        ...state.favoriteChanges,
      };
    } else if (state.favoritesSyncedAccountId === account) {
      changes = state.favoriteChanges;
    } else {
      changes = {};
    }

    accountFavourites = remote;
    target.setState({
      favorites: showAccountList(applyFavouriteChanges(remote, changes)),
      favoriteChanges: changes,
      favoritesSyncedAccountId: account,
    });
    await push();
  };

  const evaluate = () => {
    if (stopped) return;
    const next = activeAccountId(target);
    if (next === accountId) return;
    accountId = next;
    generation += 1;
    accountFavourites = null;
    if (next) void pull();
  };

  const attach = () => {
    if (stopped) return;
    cleanups.push(useAuthStore.subscribe(evaluate));
    cleanups.push(useChatAppModeStore.subscribe(evaluate));
    cleanups.push(target.onFinishHydration(evaluate));
    cleanups.push(
      target.subscribe((state, prev) => {
        if (state.favoriteChanges === prev.favoriteChanges) return;
        if (Object.keys(state.favoriteChanges).length === 0) return;
        if (!accountId || accountFavourites === null) return;
        void push();
      }),
    );
    const appStateSubscription = AppState.addEventListener('change', (status: AppStateStatus) => {
      if (status !== 'active' || !accountId || pushing) return;
      void pull();
    });
    cleanups.push(() => appStateSubscription.remove());
    evaluate();
  };

  // The auth and app-mode stores import modules that import the model store,
  // so subscribing while the model store module is still evaluating can reach
  // them half-initialised.
  void Promise.resolve().then(attach);

  return () => {
    stopped = true;
    generation += 1;
    cleanups.splice(0).forEach((cleanup) => cleanup());
  };
}
