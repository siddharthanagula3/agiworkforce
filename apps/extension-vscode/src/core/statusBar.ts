import { modelDisplayLabel } from '../features/model-picker/modelConstants';

export function buildExtensionStatusBarText(model: string, mode: string): string {
  const name = modelDisplayLabel(model);
  return mode === 'auto' ? `$(hubot) AGI: ${name}` : `$(hubot) AGI: ${name} · ${mode}`;
}
