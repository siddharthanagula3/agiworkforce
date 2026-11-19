import { Config } from '../platform/config';
import {
  modelDisplayLabel,
  normalizeSelectableConfiguredModelId,
} from '../features/model-picker/modelConstants';

export const LOCAL_MODEL_SELECTED_CODE = 'LOCAL_MODEL_SELECTED';

export type CloudUtilityModel =
  { route: 'cloud'; model: string } | { route: 'local'; model: string };

/**
 * The model a cloud editor utility would run on. A default the AGI Cloud
 * picker does not offer is a Local model, and a Local choice is never swapped
 * for a cloud route behind the user's back.
 */
export function cloudUtilityModel(): CloudUtilityModel {
  const configured = Config.model();
  const cloud = normalizeSelectableConfiguredModelId(configured);
  return cloud === null ? { route: 'local', model: configured } : { route: 'cloud', model: cloud };
}

export function localModelNotRunningMessage(model: string): string {
  return `${modelDisplayLabel(model)} is not an AGI Cloud model and no running Local model has that name, so nothing was sent. Start that Local model and try again, or choose another model.`;
}

export class LocalModelSelectedError extends Error {
  readonly code = LOCAL_MODEL_SELECTED_CODE;

  constructor(
    readonly model: string,
    feature = 'This command',
  ) {
    const label = modelDisplayLabel(model);
    super(
      `${feature} runs only on AGI Cloud, and your default model, ${label}, is a Local model, so nothing was sent. Choose an AGI Cloud model to use it, or ask in the chat, which runs on ${label}.`,
    );
    this.name = 'LocalModelSelectedError';
  }
}
