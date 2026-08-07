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
 * selectable in the picker; `veo-3.1` and `gemini-3.1-flash-image` are routing
 * SLOT models, so `setModel` rejects them outright. Writing there would either
 * silently no-op (the first version of this did, and a test caught it) or, if
 * forced, strand the user on a model that cannot hold a conversation. Keeping
 * the chat selection intact is also what makes leaving a mode free.
 *
 * Model ids are never hardcoded here. `getRoutingSlotModel` reads the canonical
 * registry slot — the same resolution the server route performs
 * (`apps/web/app/api/media/{image,video}/generate/route.ts`).
 */

import { getModelMetadataById, getRoutingSlotModel, modelsCatalog } from '@agiworkforce/types';
import { useChatViewStore, type MediaMode } from '@/stores/chat/chatViewStore';

/** The registry slot backing each media mode. */
const SLOT_FOR_MODE = {
  image: 'image_generation',
  video: 'video_generation',
} as const;

export type MediaKind = keyof typeof SLOT_FOR_MODE;

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
 * points (Veo 3.1 at $0.40/s vs Veo 3.1 Lite at $0.05/s), and picking one is a
 * decision only the user can make.
 */
export function listMediaModels(kind: MediaKind): string[] {
  const capability = kind === 'image' ? 'imageGen' : 'videoGen';
  const ids = Object.values(modelsCatalog.models)
    .filter((model) => model.capabilities?.[capability] === true)
    .map((model) => model.id);
  const slot = getRoutingSlotModel(SLOT_FOR_MODE[kind]);
  return ids.sort((a, b) => (a === slot ? -1 : b === slot ? 1 : a.localeCompare(b)));
}

/** The slot default for a kind, ignoring any user override. */
export function defaultMediaModelId(kind: MediaKind): string | null {
  const modelId = getRoutingSlotModel(SLOT_FOR_MODE[kind]);
  if (!modelId) return null;
  const metadata = getModelMetadataById(modelId);
  if (!metadata) return null;
  const capable =
    kind === 'image' ? metadata.capabilities.imageGen : metadata.capabilities.videoGen;
  return capable === true ? modelId : null;
}

export function resolveMediaModelId(kind: MediaKind): string | null {
  // A user choice wins, but only while it is still a capable catalog model —
  // a registry edit that drops a model must not strand a stored preference.
  const chosen = useChatViewStore.getState().selectedMediaModel[kind];
  if (chosen) {
    const meta = getModelMetadataById(chosen);
    const capable = kind === 'image' ? meta?.capabilities.imageGen : meta?.capabilities.videoGen;
    if (capable === true) return chosen;
  }
  return resolveSlotMediaModelId(kind);
}

function resolveSlotMediaModelId(kind: MediaKind): string | null {
  const modelId = getRoutingSlotModel(SLOT_FOR_MODE[kind]);
  if (!modelId) return null;
  const metadata = getModelMetadataById(modelId);
  if (!metadata) return null;
  // Confirm the slot's model actually declares the capability. A registry edit
  // that repoints a slot at a text model must disable the control, not send a
  // media request to something that cannot answer it.
  const capable =
    kind === 'image' ? metadata.capabilities.imageGen : metadata.capabilities.videoGen;
  return capable === true ? modelId : null;
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
