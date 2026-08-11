import { getCapabilities, getSystemModelForTier1Runtime } from '@agiworkforce/local-llm';
import {
  getInstalledModel,
  listInstalledModels,
  markInstalledModelUsed,
} from '../../../storage/installedModels';
import {
  DEFAULT_LOCAL_MODEL_ID,
  getAutoModeById,
  getSelectableModelById,
  isAutoMode,
  isSelectableModelId,
  LOCAL_MODEL_LIST,
  type ModelDef,
} from './service';

export interface LocalModelRef {
  modelId: string;
  modelPath?: string;
  displayName: string;
  installed: boolean;
}

function isSystemModel(model: ModelDef): boolean {
  return model.surface === 'local' && (model.fileSizeBytes ?? 0) <= 0;
}

function modelSupportsActiveSystemRuntime(model: ModelDef, runtime: string | null): boolean {
  if (runtime !== 'foundation_models' && runtime !== 'aicore') return false;
  return getSystemModelForTier1Runtime(runtime)?.id === model.id;
}

function firstModelMatching(predicate: (model: ModelDef) => boolean): ModelDef | undefined {
  return LOCAL_MODEL_LIST.find(predicate);
}

async function resolveAutoModelId(
  profile: 'economy' | 'balanced' | 'premium',
  installedIds: Set<string>,
): Promise<string> {
  const caps = await getCapabilities().catch(() => null);
  const activeSystemModel = LOCAL_MODEL_LIST.find(
    (model) =>
      isSystemModel(model) && modelSupportsActiveSystemRuntime(model, caps?.tier1Runtime ?? null),
  );
  const defaultModel = getSelectableModelById(DEFAULT_LOCAL_MODEL_ID);
  const installedDefault =
    defaultModel && installedIds.has(defaultModel.id) ? defaultModel : undefined;
  const installedAny = LOCAL_MODEL_LIST.find((model) => installedIds.has(model.id));

  if (profile === 'economy') {
    const lite = firstModelMatching((model) => model.tier === 'economy');
    if (lite && installedIds.has(lite.id)) return lite.id;
    if (installedDefault) return installedDefault.id;
    if (activeSystemModel) return activeSystemModel.id;
    return lite?.id ?? defaultModel?.id ?? DEFAULT_LOCAL_MODEL_ID;
  }

  if (profile === 'premium') {
    const vision = firstModelMatching((model) => model.supportsVision && !isSystemModel(model));
    if (vision && installedIds.has(vision.id)) return vision.id;
    if (activeSystemModel?.supportsVision) return activeSystemModel.id;
    if (installedDefault) return installedDefault.id;
    if (installedAny) return installedAny.id;
    return vision?.id ?? defaultModel?.id ?? DEFAULT_LOCAL_MODEL_ID;
  }

  if (installedDefault) return installedDefault.id;
  if (activeSystemModel) return activeSystemModel.id;
  if (installedAny) return installedAny.id;
  return defaultModel?.id ?? DEFAULT_LOCAL_MODEL_ID;
}

export async function resolveLocalModelRef(requestedModelId: string): Promise<LocalModelRef> {
  const installed = await listInstalledModels().catch(() => []);
  const installedIds = new Set(installed.map((model) => model.id));
  const autoMode = getAutoModeById(requestedModelId);
  const modelId = autoMode
    ? await resolveAutoModelId(autoMode.tier, installedIds)
    : requestedModelId;

  if (!isAutoMode(requestedModelId) && !isSelectableModelId(modelId)) {
    throw new Error(
      `Model "${modelId}" is not selectable for local chat. Choose an on-device local model first.`,
    );
  }

  const model = getSelectableModelById(modelId) ?? getSelectableModelById(DEFAULT_LOCAL_MODEL_ID);
  if (!model) {
    throw new Error('No local model is configured for this device.');
  }

  if (isSystemModel(model)) {
    const caps = await getCapabilities().catch(() => null);
    if (modelSupportsActiveSystemRuntime(model, caps?.tier1Runtime ?? null)) {
      return {
        modelId: model.id,
        displayName: model.name,
        installed: false,
      };
    }
    throw new Error(`${model.name} is not available on this device yet.`);
  }

  const installedModel =
    installed.find((entry) => entry.id === model.id) ??
    (await getInstalledModel(model.id).catch(() => null));

  if (installedModel?.local_path) {
    return {
      modelId: model.id,
      modelPath: installedModel.local_path,
      displayName: model.name,
      installed: true,
    };
  }

  if (installedModel?.format === 'pte') {
    return {
      modelId: model.id,
      displayName: model.name,
      installed: true,
    };
  }

  throw new Error(
    `${model.name} is selected, but it is not downloaded yet. Open Models and download it before chatting locally.`,
  );
}

export async function markLocalModelRefUsed(ref: LocalModelRef): Promise<void> {
  if (ref.installed) {
    await markInstalledModelUsed(ref.modelId);
  }
}
