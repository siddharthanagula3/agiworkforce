export type LocalModelRecoveryKind = 'switch' | 'open-models';

export interface LocalModelRecovery {
  kind: LocalModelRecoveryKind;
  modelId: string | null;
  label: string;
}

export interface LocalModelRecoveryInput {
  executionMode: 'local' | 'cloud';
  isNoLocalModelError: boolean;
  selectedModelId: string;
  installedModelIds: readonly string[];
  readySystemModelIds: readonly string[];
  displayNameFor: (modelId: string) => string | null;
}

// A send that fails because the active on-device model was never downloaded
// leaves Retry as the only control, and Retry fails the same way. Name the way
// out on the banner itself.
export function localModelRecovery(input: LocalModelRecoveryInput): LocalModelRecovery | null {
  if (input.executionMode !== 'local') return null;
  if (!input.isNoLocalModelError) return null;

  const ready = [...input.readySystemModelIds, ...input.installedModelIds].filter(
    (modelId) => modelId !== input.selectedModelId,
  );
  const alternative = ready[0];
  if (!alternative) return { kind: 'open-models', modelId: null, label: 'Open Models' };

  const name = input.displayNameFor(alternative);
  return {
    kind: 'switch',
    modelId: alternative,
    label: name ? `Use ${name}` : 'Use a ready model',
  };
}
