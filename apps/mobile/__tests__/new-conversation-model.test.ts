import { requireAutoMode, requireMobileCloudModel } from '../test-utils/modelFixtures';
import {
  DEFAULT_LOCAL_MODEL_ID,
  getDefaultCloudModelIdForTier,
} from '@/src/features/model-picker/service';
import { resolveNewConversationModel } from '@/src/features/chat/utils/newConversationModel';

const cloudModel = requireMobileCloudModel().id;
const base = {
  subscriptionTier: 'pro',
  installedModelIds: [] as string[],
  readySystemModelIds: [] as string[],
  defaultLocalModelDownloading: false,
};

describe('new conversation model selection', () => {
  it('keeps a Cloud selection out of a Local voice or chat session', () => {
    expect(resolveNewConversationModel({ ...base, selectedModel: cloudModel, mode: 'local' })).toBe(
      DEFAULT_LOCAL_MODEL_ID,
    );
  });

  it('keeps a Local selection out of a Cloud voice or chat session', () => {
    expect(
      resolveNewConversationModel({
        ...base,
        selectedModel: DEFAULT_LOCAL_MODEL_ID,
        mode: 'cloud',
      }),
    ).toBe(getDefaultCloudModelIdForTier('pro'));
  });

  it('retains a boundary-neutral Auto selection in either execution mode', () => {
    const autoMode = requireAutoMode().id;
    expect(resolveNewConversationModel({ ...base, selectedModel: autoMode, mode: 'local' })).toBe(
      autoMode,
    );
    expect(resolveNewConversationModel({ ...base, selectedModel: autoMode, mode: 'cloud' })).toBe(
      autoMode,
    );
  });
});
