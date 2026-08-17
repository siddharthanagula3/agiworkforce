import {
  getModelMetadataById,
  getRoutingSlotModel,
  getVideoAspectOptionsForModel,
  getVideoQualityOptionsForModel,
  isModelLive,
  modelsCatalog,
} from '@agiworkforce/types';
import { useChatViewStore, type MediaMode } from '@/stores/chat/chatViewStore';

const SLOT_FOR_MODE = {
  image: 'image_generation',
  video: 'video_generation',
} as const;

export type MediaKind = keyof typeof SLOT_FOR_MODE;

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

export function listMediaModels(kind: MediaKind): string[] {
  const ids = Object.values(modelsCatalog.models)
    .filter((model) => isExecutableMediaModel(kind, model.id))
    .map((model) => model.id);
  const slot = getRoutingSlotModel(SLOT_FOR_MODE[kind]);
  return ids.sort((a, b) => (a === slot ? -1 : b === slot ? 1 : a.localeCompare(b)));
}

export function defaultMediaModelId(kind: MediaKind): string | null {
  const modelId = getRoutingSlotModel(SLOT_FOR_MODE[kind]);
  return modelId && isExecutableMediaModel(kind, modelId) ? modelId : null;
}

export function resolveMediaModelId(
  kind: MediaKind,
  selections: MediaModelSelections = useChatViewStore.getState().selectedMediaModel,
): string | null {
  const chosen = selections[kind];
  if (chosen && isExecutableMediaModel(kind, chosen)) return chosen;
  return resolveSlotMediaModelId(kind);
}

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
  return modelId && isExecutableMediaModel(kind, modelId) ? modelId : null;
}

export interface VideoOutputSelection {
  aspectRatio: string;
  resolution: string;
}

export function resolveVideoOutputSelection(
  modelId: string | null | undefined,
  aspectRatio: string,
  resolution: string,
): VideoOutputSelection {
  const aspects = getVideoAspectOptionsForModel(modelId ?? undefined).map((option) => option.id);
  const effectiveAspect = aspects.includes(aspectRatio) ? aspectRatio : (aspects[0] ?? aspectRatio);
  const qualities = getVideoQualityOptionsForModel(modelId ?? undefined, effectiveAspect).map(
    (option) => option.id,
  );
  return {
    aspectRatio: effectiveAspect,
    resolution: qualities.includes(resolution) ? resolution : (qualities[0] ?? resolution),
  };
}

export function mediaModelIdForMode(mode: MediaMode): string | null {
  return mode === 'text' ? null : resolveMediaModelId(mode);
}

export function enterMediaMode(kind: MediaKind): boolean {
  if (!resolveMediaModelId(kind)) return false;
  useChatViewStore.getState().setMediaMode(kind);
  return true;
}

export function exitMediaMode(): void {
  if (useChatViewStore.getState().mediaMode === 'text') return;
  useChatViewStore.getState().setMediaMode('text');
}

export function getMediaMode(): MediaMode {
  return useChatViewStore.getState().mediaMode;
}
