/**
 * Entering and leaving a media output mode.
 *
 * Image and video used to be boolean toggles in the [+] sheet sitting on top of
 * whatever text model was selected. That was misleading: the send path never
 * used the text model for media anyway — it re-routed to a media model behind
 * the user's back. Picking "Image" or "Video" now puts the composer into an
 * explicit mode that DISPLAYS the media model it will actually use.
 *
 * The media model is deliberately NOT written into `useModelStore`. That store
 * holds the user's chat-model choice and only accepts models that are
 * selectable in the picker; media output models are routing-slot models, so
 * `setModel` rejects them outright. Writing there would either
 * silently no-op (the first version of this did, and a test caught it) or, if
 * forced, strand the user on a model that cannot hold a conversation. Keeping
 * the chat selection intact is also what makes leaving a mode free.
 *
 * Model ids are never hardcoded here. `getRoutingSlotModel` reads the canonical
 * registry slot — the same resolution the server route performs
 * (`apps/web/app/api/media/{image,video}/generate/route.ts`).
 */

import {
  getModelMetadataById,
  getRoutingSlotModel,
  isModelLive,
  modelsCatalog,
} from '@agiworkforce/types';
import { useChatViewStore, type MediaMode } from '@/stores/chat/chatViewStore';

/** The registry slot backing each media mode. */
const SLOT_FOR_MODE = {
  image: 'image_generation',
  video: 'video_generation',
} as const;

export type MediaKind = keyof typeof SLOT_FOR_MODE;

/**
 * Media output routing is stricter than a broad capability flag. A chat or
 * reasoning model may accept video input and therefore advertise `videoGen`,
 * without implementing the video-generation endpoint. Only a live canonical
 * output model of the requested type is executable from this picker.
 */
function isExecutableMediaModel(kind: MediaKind, modelId: string): boolean {
  const model = getModelMetadataById(modelId);
  if (
    !model ||
    model.deprecated === true ||
    model.status === 'deprecated' ||
    model.modelType !== kind ||
    !isModelLive(model)
  ) {
    return false;
  }
  return kind === 'image'
    ? model.capabilities.imageGen === true
    : model.capabilities.videoGen === true;
}

type MediaModelSelections = Readonly<{ image?: string; video?: string }>;

/**
 * The catalog model that will actually serve this media kind, or null when the
 * registry has no capable model for the slot. Callers use null to hide the
 * option rather than offering a control that cannot produce anything.
 */
/**
 * Every catalog model that can serve this media kind, slot default first.
 *
 * The composer offers a choice here rather than pinning the slot model: the
 * catalog carries several image and video models at very different price
 * points, and picking one is a decision only the user can make.
 */
export function listMediaModels(kind: MediaKind): string[] {
  const ids = Object.values(modelsCatalog.models)
    .filter((model) => isExecutableMediaModel(kind, model.id))
    .map((model) => model.id);
  const slot = getRoutingSlotModel(SLOT_FOR_MODE[kind]);
  return ids.sort((a, b) => (a === slot ? -1 : b === slot ? 1 : a.localeCompare(b)));
}

/** The slot default for a kind, ignoring any user override. */
export function defaultMediaModelId(kind: MediaKind): string | null {
  const modelId = getRoutingSlotModel(SLOT_FOR_MODE[kind]);
  return modelId && isExecutableMediaModel(kind, modelId) ? modelId : null;
}

export function resolveMediaModelId(
  kind: MediaKind,
  selections: MediaModelSelections = useChatViewStore.getState().selectedMediaModel,
): string | null {
  // A user choice wins, but only while it is still a capable catalog model —
  // a registry edit that drops a model must not strand a stored preference.
  const chosen = selections[kind];
  if (chosen && isExecutableMediaModel(kind, chosen)) return chosen;
  return resolveSlotMediaModelId(kind);
}

/**
 * Remove stale persisted media choices after hydration or a catalog lifecycle
 * change. This is deliberately an explicit effect/action rather than part of
 * `resolveMediaModelId`: the resolver runs during render, where mutating a
 * Zustand store would create render-time update loops.
 */
export function clearInvalidMediaModelSelections(): boolean {
  const selected = useChatViewStore.getState().selectedMediaModel;
  let next: { image?: string; video?: string } | null = null;

  for (const kind of Object.keys(SLOT_FOR_MODE) as MediaKind[]) {
    const modelId = selected[kind];
    if (!modelId || isExecutableMediaModel(kind, modelId)) continue;
    next ??= { ...selected };
    delete next[kind];
  }

  if (!next) return false;
  useChatViewStore.setState({ selectedMediaModel: next });
  return true;
}

function resolveSlotMediaModelId(kind: MediaKind): string | null {
  const modelId = getRoutingSlotModel(SLOT_FOR_MODE[kind]);
  // Confirm the slot points to a live output model. A registry edit that
  // repoints it at a text/input model or a preview must disable the control,
  // not send a request to an endpoint that cannot execute it.
  return modelId && isExecutableMediaModel(kind, modelId) ? modelId : null;
}

/** The media model the composer should display, or null outside a media mode. */
export function mediaModelIdForMode(mode: MediaMode): string | null {
  return mode === 'text' ? null : resolveMediaModelId(mode);
}

/**
 * Switch the composer into image or video mode.
 *
 * Returns false when the registry has no capable model, leaving state untouched
 * so the caller can surface the reason instead of silently doing nothing.
 */
export function enterMediaMode(kind: MediaKind): boolean {
  if (!resolveMediaModelId(kind)) return false;
  useChatViewStore.getState().setMediaMode(kind);
  return true;
}

/** Leave media mode. The chat model was never changed, so nothing to restore. */
export function exitMediaMode(): void {
  if (useChatViewStore.getState().mediaMode === 'text') return;
  useChatViewStore.getState().setMediaMode('text');
}

/** Current media mode. Convenience for non-React call sites. */
export function getMediaMode(): MediaMode {
  return useChatViewStore.getState().mediaMode;
}
