jest.mock('../lib/mmkv', () => ({
  mmkvStorage: { getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn() },
  rehydrateWhenMmkvReady: jest.fn(),
  whenMmkvReady: jest.fn(),
  storage: { getString: jest.fn(), set: jest.fn(), delete: jest.fn() },
}));

import {
  CHAT_CODE_RUN_TOOL_NAME,
  MANAGED_OFFICE_FILE_TOOL_NAME,
  supportsManagedMediaImageEdit,
} from '@agiworkforce/cloud-contracts';
import { useChatViewStore } from '../stores/chat/chatViewStore';
import { settleRunningSteps } from '../stores/chat/conversationTurnState';
import { hasEditableImage, modelEditsImages } from '../stores/chat/imageEditSupport';
import { selectedSkillTools } from '../stores/chat/skillTurnOptions';
import {
  clearAnswerDrafts,
  hasAnswerDraftFor,
  writeAnswerDraft,
} from '../src/features/chat/components/answerDraftStore';
import { requireCatalogModel, requireMobileCloudModel } from '../test-utils/modelFixtures';
import type { ChatMessage } from '../types/chat';

const EDITING_IMAGE_MODEL = requireCatalogModel(
  (model) => model.modelType === 'image' && supportsManagedMediaImageEdit(model.imageApi),
  'image model that edits images',
).id;
const TEXT_MODEL = requireMobileCloudModel().id;

describe('the image or video choice after a request is sent', () => {
  it('goes back to text with the default image ratio and background', () => {
    useChatViewStore.setState({
      mediaMode: 'image',
      imageAspectRatio: '16:9',
      imageTransparentBackground: true,
    });

    useChatViewStore.getState().resetMediaChoice('image');

    expect(useChatViewStore.getState()).toMatchObject({
      mediaMode: 'text',
      imageAspectRatio: '1:1',
      imageTransparentBackground: false,
    });
  });

  it('goes back to text with the default video shape, quality and length', () => {
    useChatViewStore.setState({
      mediaMode: 'video',
      videoAspectRatio: '9:16',
      videoResolution: '1080p',
      videoDurationSecs: 8,
    });

    useChatViewStore.getState().resetMediaChoice('video');

    expect(useChatViewStore.getState()).toMatchObject({
      mediaMode: 'text',
      videoAspectRatio: '16:9',
      videoResolution: '720p',
      videoDurationSecs: null,
    });
  });
});

describe('steps of a turn that ended', () => {
  it('stop showing as running', () => {
    const message = {
      id: 'answer',
      role: 'assistant',
      content: 'Done.',
      createdAt: '2026-11-14T10:00:00.000Z',
      steps: [
        { id: 'one', icon: 'searching', message: 'Read the file', status: 'completed' },
        { id: 'two', icon: 'coding', message: 'Write the summary', status: 'running' },
      ],
    } as ChatMessage;

    expect(settleRunningSteps(message).steps?.map((step) => step.status)).toEqual([
      'completed',
      'failed',
    ]);
  });

  it('leave an answer with no running step untouched', () => {
    const message = {
      id: 'answer',
      role: 'assistant',
      content: 'Done.',
      createdAt: '2026-11-14T10:00:00.000Z',
    } as ChatMessage;

    expect(settleRunningSteps(message)).toBe(message);
  });
});

describe('unsaved edits on an answer', () => {
  afterEach(() => clearAnswerDrafts());

  it('are found by the answer they belong to and no other', () => {
    writeAnswerDraft('answer-1\u0000clarify\u0000card-1', { choice: 'b' });

    expect(hasAnswerDraftFor('answer-1')).toBe(true);
    expect(hasAnswerDraftFor('answer-10')).toBe(false);
    expect(hasAnswerDraftFor('answer')).toBe(false);
  });

  it('are gone once the drafts are cleared', () => {
    writeAnswerDraft('answer-1\u0000clarify\u0000card-1', { choice: 'b' });
    clearAnswerDrafts();

    expect(hasAnswerDraftFor('answer-1')).toBe(false);
  });
});

describe('the tools a chosen skill needs', () => {
  it('come from the skill it was picked with', () => {
    expect(
      selectedSkillTools({ name: 'deck-builder', requiredTools: [MANAGED_OFFICE_FILE_TOOL_NAME] }),
    ).toEqual({ officeCreation: true, codeExecution: false });
    expect(
      selectedSkillTools({ name: 'analyst', requiredTools: [CHAT_CODE_RUN_TOOL_NAME] }),
    ).toEqual({ officeCreation: false, codeExecution: true });
  });

  it('are none when the selection names no tools or is not a list of names', () => {
    expect(selectedSkillTools({ name: 'writer' })).toEqual({
      officeCreation: false,
      codeExecution: false,
    });
    expect(selectedSkillTools({ name: 'writer', requiredTools: 'execute_code' })).toEqual({
      officeCreation: false,
      codeExecution: false,
    });
    expect(selectedSkillTools(null)).toEqual({ officeCreation: false, codeExecution: false });
  });
});

describe('whether an image in the chat can be edited', () => {
  it('follows the edit support of the model that made it', () => {
    expect(modelEditsImages(EDITING_IMAGE_MODEL)).toBe(true);
    expect(modelEditsImages(TEXT_MODEL)).toBe(false);
    expect(modelEditsImages(undefined)).toBe(false);
  });

  it('needs at least one finished image from a model that edits images', () => {
    const image = (model: string, imageUrl?: string) =>
      ({
        id: `image-${model}`,
        role: 'assistant',
        content: 'Generated image',
        createdAt: '2026-11-14T10:00:00.000Z',
        type: 'image',
        model,
        ...(imageUrl ? { imageUrl } : {}),
      }) as ChatMessage;

    expect(hasEditableImage([image(TEXT_MODEL, '/api/files/a')])).toBe(false);
    expect(hasEditableImage([image(EDITING_IMAGE_MODEL)])).toBe(false);
    expect(hasEditableImage([image(EDITING_IMAGE_MODEL, '/api/files/b')])).toBe(true);
  });
});
