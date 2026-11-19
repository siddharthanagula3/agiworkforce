import { getModelMetadataById, getModelsForTierAndSurface } from '@agiworkforce/types';
import { unreadableImagesNotice } from '@/src/features/chat/utils/unreadableImagesNotice';

const IMAGE = { mimeType: 'image/png' };

function textOnlyCloudModel() {
  const model = getModelsForTierAndSurface('max', 'mobile/cloud-chat').find(
    (candidate) => getModelMetadataById(candidate.id)?.capabilities.vision === false,
  );
  if (!model) throw new Error('Canonical catalog has no cloud chat model that cannot read images');
  return { id: model.id, name: getModelMetadataById(model.id)?.name ?? model.id };
}

describe('the hint under a composer holding pictures a model cannot read', () => {
  it('names the model that will answer instead, taken from the same routing the send uses', () => {
    const model = textOnlyCloudModel();

    const notice = unreadableImagesNotice({
      selectedModelId: model.id,
      selectedModelName: model.name,
      executionMode: 'cloud',
      subscriptionTier: 'max',
      message: 'what is in this picture?',
      attachments: [IMAGE],
    });

    expect(notice).toMatch(
      new RegExp(`^${model.name} cannot read images, so .+ will answer this message\\.$`),
    );
    expect(notice).not.toContain('Choose a model');
  });

  it('answers with a model other than the one chosen', () => {
    const model = textOnlyCloudModel();

    const notice = unreadableImagesNotice({
      selectedModelId: model.id,
      selectedModelName: model.name,
      executionMode: 'cloud',
      subscriptionTier: 'max',
      message: 'what is in this picture?',
      attachments: [IMAGE],
    });

    const answering = /so (.+) will answer/.exec(notice)?.[1];
    expect(answering).toBeTruthy();
    expect(answering).not.toBe(model.name);
  });

  it('says to choose another model or remove the pictures on this phone, where nothing reroutes', () => {
    const model = textOnlyCloudModel();

    expect(
      unreadableImagesNotice({
        selectedModelId: model.id,
        selectedModelName: model.name,
        executionMode: 'local',
        subscriptionTier: 'max',
        message: 'hi',
        attachments: [IMAGE],
      }),
    ).toBe(
      `${model.name} cannot read images. Choose a model that can, or remove the images before sending.`,
    );
  });

  it('falls back to the same advice when no model can be named', () => {
    expect(
      unreadableImagesNotice({
        selectedModelId: 'not-a-registered-model',
        selectedModelName: 'This model',
        executionMode: 'cloud',
        subscriptionTier: 'max',
        message: 'hi',
        attachments: [IMAGE],
      }),
    ).toBe(
      'This model cannot read images. Choose a model that can, or remove the images before sending.',
    );
  });
});
