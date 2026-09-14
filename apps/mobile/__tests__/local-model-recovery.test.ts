import { localModelRecovery } from '../src/features/chat/utils/localModelRecovery';
import { pickReadyLocalModelId } from '../src/features/model-picker/installStore';

const NAMES: Record<string, string> = {
  'apple-foundation-models': 'Apple Intelligence',
  'agi-standard': 'AGI Standard',
};
const displayNameFor = (id: string) => NAMES[id] ?? null;

describe('pickReadyLocalModelId', () => {
  it('replaces a local selection that was never downloaded with the ready system model', () => {
    expect(pickReadyLocalModelId('agi-standard', [], ['apple-foundation-models'])).toBe(
      'apple-foundation-models',
    );
  });

  it('leaves a selection that is already on the device alone', () => {
    expect(pickReadyLocalModelId('agi-standard', ['agi-standard'], [])).toBeNull();
    expect(
      pickReadyLocalModelId('apple-foundation-models', [], ['apple-foundation-models']),
    ).toBeNull();
  });

  it('does not move the user when nothing is ready', () => {
    expect(pickReadyLocalModelId('agi-standard', [], [])).toBeNull();
  });
});

describe('localModelRecovery', () => {
  const base = {
    executionMode: 'local' as const,
    isNoLocalModelError: true,
    selectedModelId: 'agi-standard',
    installedModelIds: [] as string[],
    readySystemModelIds: ['apple-foundation-models'],
    displayNameFor,
  };

  it('offers the ready model by name', () => {
    expect(localModelRecovery(base)).toEqual({
      kind: 'switch',
      modelId: 'apple-foundation-models',
      label: 'Use Apple Intelligence',
    });
  });

  it('offers the model library when nothing is ready', () => {
    expect(localModelRecovery({ ...base, readySystemModelIds: [] })).toEqual({
      kind: 'open-models',
      modelId: null,
      label: 'Open Models',
    });
  });

  it('stays out of the way for cloud sends and for other errors', () => {
    expect(localModelRecovery({ ...base, executionMode: 'cloud' })).toBeNull();
    expect(localModelRecovery({ ...base, isNoLocalModelError: false })).toBeNull();
  });
});
