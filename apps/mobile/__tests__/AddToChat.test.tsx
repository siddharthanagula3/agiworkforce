/* eslint-disable @typescript-eslint/no-require-imports */

import React from 'react';
import { act, fireEvent, render, waitFor, within } from '@testing-library/react-native';

const mockVideoSlot: { modelId: string | undefined } = { modelId: undefined };

jest.mock('@agiworkforce/types', () =>
  jest
    .requireActual('../test-utils/videoSlotMock')
    .withVideoGenerationSlot(
      jest.requireActual('@agiworkforce/types'),
      () => mockVideoSlot.modelId,
    ),
);

const mockFetchConnectorDirectory = jest.fn();
jest.mock('@/services/connectors', () => ({
  fetchConnectorDirectory: () => mockFetchConnectorDirectory(),
}));

jest.mock('@/src/features/library/libraryClient', () => ({ fetchLibraryPage: jest.fn() }));

jest.mock('@gorhom/bottom-sheet', () => {
  const React = require('react');
  const { View } = require('react-native');

  const BottomSheet = React.forwardRef(
    (
      { children, onChange }: { children: React.ReactNode; onChange: (index: number) => void },
      _ref: React.Ref<unknown>,
    ) => (
      <View testID="bottom-sheet" onChange={onChange}>
        {children}
      </View>
    ),
  );
  BottomSheet.displayName = 'BottomSheet';

  return {
    __esModule: true,
    default: BottomSheet,
    BottomSheetBackdrop: ({ children }: { children?: React.ReactNode }) => <View>{children}</View>,
    BottomSheetScrollView: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
  };
});

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'Light', Medium: 'Medium', Heavy: 'Heavy' },
}));

jest.mock('expo-router', () => ({
  ...jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock(),
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
}));

jest.mock('lucide-react-native', () => {
  const React = require('react');
  const { View } = require('react-native');
  const Icon = ({ testID, ...props }: Record<string, unknown>) => (
    <View testID={testID} {...props} />
  );
  return new Proxy(
    {},
    {
      get: (_target, name) => {
        if (name === '__esModule') return true;
        return (props: Record<string, unknown>) => (
          <Icon testID={`icon-${String(name)}`} {...props} />
        );
      },
    },
  );
});

jest.mock('../lib/mmkv', () => ({
  storage: { getString: jest.fn(), set: jest.fn(), delete: jest.fn() },
  whenMmkvReady: jest.fn((cb) => cb()),
  rehydrateWhenMmkvReady: jest.fn((store, _name) => {
    if (store && store.persist && typeof store.persist.rehydrate === 'function')
      store.persist.rehydrate();
  }),
  mmkvStorage: {
    getItem: jest.fn().mockReturnValue(null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));

jest.mock('../services/authSession', () => ({
  getAuthToken: jest.fn(async () => null),
  getAuthHeaders: jest.fn(async () => ({})),
  refreshAuthSession: jest.fn(async () => false),
  clearAuthSession: jest.fn(async () => undefined),
  getCurrentUser: jest.fn(async () => null),
  getCurrentUserId: jest.fn(async () => null),
}));

jest.mock('../services/api', () => ({
  api: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));

jest.mock('../services/streaming', () => ({
  streamChat: jest.fn(),
}));

const mockWaitlistStoreState = {
  joined: false,
  rank: undefined as number | undefined,
};

jest.mock('../src/features/waitlist', () => {
  return {
    useWaitlistStore: (selector: (state: typeof mockWaitlistStoreState) => unknown) =>
      selector(mockWaitlistStoreState),
  };
});

jest.mock('../src/features/chat/components/StyleSelector', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    StyleSelector: React.forwardRef((_props: unknown, _ref: React.Ref<unknown>) => (
      <View testID="style-selector" />
    )),
  };
});

import { AddToChatSheet } from '../src/features/chat/components/AddToChatSheet';
import { useChatStore } from '../stores/chatStore';
import { useChatCloudMessageStore } from '../stores/chat/chatCloudMessageStore';
import { useProjectStore } from '../src/features/projects/store';
import { fetchLibraryPage } from '@/src/features/library/libraryClient';
import {
  activateCloudAccount,
  invalidateCloudAccount,
  __resetCloudAccountSessionForTests,
} from '@/src/features/auth/services/cloudAccountSession';
import { useChatAppModeStore } from '../src/features/chat/store/appModeStore';
import { useModelStore } from '../src/features/model-picker/store';
import { useTierStore } from '../src/features/billing/store';
import { useChatViewStore } from '../stores/chat/chatViewStore';
import * as Clipboard from 'expo-clipboard';
import { listMediaModels } from '../src/features/chat/actions/mediaMode';
import { getModelMetadataById, isModelLive, modelsCatalog } from '@agiworkforce/types';
import { ownerHandler } from '../test-utils/ownerProps';
import {
  SYNTHETIC_RETIRED_VIDEO_MODEL_ID,
  requireLiveVideoModelId,
  requireMobileCloudModel,
} from '../test-utils/modelFixtures';
import { FEATURES } from '../lib/v1FeatureFlags';

const SEARCH_CAPABLE_MODEL_ID = requireMobileCloudModel(
  (model) => getModelMetadataById(model.id)?.capabilities.search === true,
  'search-capable Mobile Cloud model',
).id;
const SEARCH_UNSUPPORTED_MODEL_ID = requireMobileCloudModel(
  (model) => getModelMetadataById(model.id)?.capabilities.search !== true,
  'Mobile Cloud model without search support',
).id;
const RESEARCH_CAPABLE_MODEL_ID = requireMobileCloudModel((model) => {
  const capabilities = getModelMetadataById(model.id)?.capabilities;
  return capabilities?.research === true && capabilities.search === true;
}, 'research-and-search-capable Mobile Cloud model').id;

const CODE_CAPABLE_MODEL_ID = requireMobileCloudModel(
  (model) => getModelMetadataById(model.id)?.capabilities.codeExecution === true,
  'code-execution-capable Mobile Cloud model',
).id;

function resetStores() {
  useChatStore.setState({
    conversations: [],
    messages: {},
    chatMode: 'chat',
    chatStyle: 'normal',
    workMode: 'chat',
    features: {
      webSearch: true,
      imageGen: true,
      health: false,
      codeExecution: true,
      research: false,
    },
  });
  useChatCloudMessageStore.setState({ conversations: [], messages: {} });
  useProjectStore.setState({
    projects: [],
    activeProjectId: null,
  });
  useChatAppModeStore.setState({ appMode: 'local' });
  useChatViewStore.setState({ mediaMode: 'text', selectedMediaModel: {} });
  useModelStore.setState({ selectedModel: SEARCH_CAPABLE_MODEL_ID });
  useTierStore.setState({
    tier: 'free',
    codeExecutionAvailable: false,
    genericWebSearchAvailable: false,
    grantedCapabilities: [],
  } as never);
}

const defaultProps = {
  destinationKey: 'new-chat',
  onCamera: jest.fn(),
  onPhotos: jest.fn(),
  onFile: jest.fn(),
  onOpenCloudAccess: jest.fn(),
  onOpenStyleSelector: jest.fn(),
  onOpenModelPicker: jest.fn(),
  onOpenProjectPicker: jest.fn(),
  onAttachFromLibrary: jest.fn(),
};

function renderSheet(overrides = {}) {
  return render(<AddToChatSheet {...defaultProps} {...overrides} />);
}

describe('AddToChatSheet', () => {
  it('reloads an open Library on destination changes and revokes old row callbacks', async () => {
    activateCloudAccount('picker-owner');
    useChatAppModeStore.setState({ appMode: 'cloud' });
    (fetchLibraryPage as jest.Mock)
      .mockResolvedValueOnce({
        assets: [
          {
            id: 'old',
            kind: 'document',
            fileName: 'old.pdf',
            uri: '/api/files/old',
            mimeType: 'application/pdf',
          },
        ],
        hasMore: false,
        nextOffset: null,
      })
      .mockImplementation(() => new Promise(() => {}));
    const onAttachFromLibrary = jest.fn();
    const view = renderSheet({ destinationKey: 'first', onAttachFromLibrary });
    fireEvent(view.getByTestId('bottom-sheet'), 'change', 0);
    const row = await view.findByLabelText('Attach old.pdf from Library');
    const stalePress = ownerHandler(row, 'onPress');
    view.rerender(
      <AddToChatSheet
        {...defaultProps}
        destinationKey="second"
        onAttachFromLibrary={onAttachFromLibrary}
      />,
    );
    expect(view.queryByLabelText('Attach old.pdf from Library')).toBeNull();
    act(() => stalePress());
    expect(onAttachFromLibrary).not.toHaveBeenCalled();
    expect(fetchLibraryPage).toHaveBeenCalledTimes(2);
    expect(fetchLibraryPage).toHaveBeenLastCalledWith({ limit: 12, kind: ['image', 'file'] });
  });

  it('does not restore a settled Library cache after an account transition', async () => {
    activateCloudAccount('picker-owner');
    useChatAppModeStore.setState({ appMode: 'cloud' });
    (fetchLibraryPage as jest.Mock)
      .mockResolvedValueOnce({
        assets: [
          {
            id: 'old',
            kind: 'document',
            fileName: 'private.pdf',
            uri: '/api/files/old',
            mimeType: 'application/pdf',
          },
        ],
        hasMore: false,
        nextOffset: null,
      })
      .mockImplementation(() => new Promise(() => {}));
    const view = renderSheet();
    fireEvent(view.getByTestId('bottom-sheet'), 'change', 0);
    await view.findByLabelText('Attach private.pdf from Library');
    act(() => {
      invalidateCloudAccount();
      useChatAppModeStore.setState({ appMode: 'local' });
    });
    act(() => {
      activateCloudAccount('next-owner');
      useChatAppModeStore.setState({ appMode: 'cloud' });
    });
    expect(view.queryByLabelText('Attach private.pdf from Library')).toBeNull();
    expect(fetchLibraryPage).toHaveBeenCalledTimes(2);
  });

  it('revokes a retained row callback when the same scope is reopened', async () => {
    activateCloudAccount('picker-owner');
    useChatAppModeStore.setState({ appMode: 'cloud' });
    (fetchLibraryPage as jest.Mock).mockResolvedValue({
      assets: [
        {
          id: 'old',
          kind: 'document',
          fileName: 'old.pdf',
          uri: '/api/files/old',
          mimeType: 'application/pdf',
        },
      ],
      hasMore: false,
      nextOffset: null,
    });
    const onAttachFromLibrary = jest.fn();
    const view = renderSheet({ onAttachFromLibrary });
    fireEvent(view.getByTestId('bottom-sheet'), 'change', 0);
    const stalePress = ownerHandler(
      await view.findByLabelText('Attach old.pdf from Library'),
      'onPress',
    );
    fireEvent(view.getByTestId('bottom-sheet'), 'change', -1);
    act(() => stalePress());
    expect(onAttachFromLibrary).not.toHaveBeenCalled();
    fireEvent(view.getByTestId('bottom-sheet'), 'change', 0);
    await waitFor(() => expect(fetchLibraryPage).toHaveBeenCalledTimes(2));
    await act(async () => {});
    act(() => stalePress());
    expect(onAttachFromLibrary).not.toHaveBeenCalled();
    fireEvent.press(view.getByLabelText('Attach old.pdf from Library'));
    expect(onAttachFromLibrary).toHaveBeenCalledTimes(1);
  });

  it.each(['success', 'error'])(
    'ignores a stale request %s after a newer destination loads',
    async (outcome) => {
      activateCloudAccount('picker-owner');
      useChatAppModeStore.setState({ appMode: 'cloud' });
      let resolveOld!: (value: unknown) => void;
      let rejectOld!: (reason: Error) => void;
      const oldPage = new Promise((resolve, reject) => {
        resolveOld = resolve;
        rejectOld = reject;
      });
      const page = (name: string) => ({
        assets: [
          {
            id: name,
            kind: 'document',
            fileName: name,
            uri: `/api/files/${name}`,
            mimeType: 'application/pdf',
          },
        ],
        hasMore: false,
        nextOffset: null,
      });
      (fetchLibraryPage as jest.Mock)
        .mockReturnValueOnce(oldPage)
        .mockResolvedValue(page('current.pdf'));
      const view = renderSheet({ destinationKey: 'first' });
      fireEvent(view.getByTestId('bottom-sheet'), 'change', 0);
      view.rerender(<AddToChatSheet {...defaultProps} destinationKey="second" />);
      await view.findByLabelText('Attach current.pdf from Library');
      await act(async () => {
        if (outcome === 'success') resolveOld(page('stale.pdf'));
        else rejectOld(new Error('stale request'));
      });
      expect(view.queryByLabelText('Attach stale.pdf from Library')).toBeNull();
      expect(view.queryByText('Your Library could not load.')).toBeNull();
      expect(view.getByLabelText('Attach current.pdf from Library')).toBeTruthy();
    },
  );

  beforeEach(() => {
    __resetCloudAccountSessionForTests();
    resetStores();
    mockVideoSlot.modelId = requireLiveVideoModelId();
    mockWaitlistStoreState.joined = false;
    mockWaitlistStoreState.rank = undefined;
    jest.clearAllMocks();
  });

  describe('attachment row', () => {
    it('renders an explicit close button', () => {
      const { getByLabelText } = renderSheet();

      expect(getByLabelText('Close Add to Chat')).toBeTruthy();
    });

    it('renders only locally supported attachment cards in Local Mode', () => {
      const { getByText, queryByText } = renderSheet();

      expect(getByText('Camera')).toBeTruthy();
      expect(getByText('Photos')).toBeTruthy();
      expect(queryByText('File')).toBeNull();
      expect(queryByText('Skills')).toBeNull();
    });

    it('reattaches a document from the active Local Library projection', () => {
      const onAttachFromLibrary = jest.fn();
      useChatStore.setState({
        conversations: [
          {
            id: 'local-chat',
            title: 'Launch planning',
            createdAt: '2026-07-30T10:00:00.000Z',
            updatedAt: '2026-07-30T10:05:00.000Z',
            messageCount: 1,
            pinned: false,
            executionMode: 'local',
          },
        ],
        messages: {
          'local-chat': [
            {
              id: 'message-1',
              conversationId: 'local-chat',
              role: 'user',
              content: 'Review this',
              createdAt: '2026-07-30T10:01:00.000Z',
              attachments: [
                {
                  url: 'file:///documents/launch-plan.pdf',
                  mimeType: 'application/pdf',
                  fileName: 'launch-plan.pdf',
                  fileSize: 2048,
                },
              ],
            },
          ],
        },
      });

      const { getByLabelText, getByText } = renderSheet({ onAttachFromLibrary });

      expect(getByText('Attach from Library')).toBeTruthy();
      fireEvent.press(getByLabelText('Attach launch-plan.pdf from Library'));
      expect(onAttachFromLibrary).toHaveBeenCalledWith(
        expect.objectContaining({
          uri: 'file:///documents/launch-plan.pdf',
          mimeType: 'application/pdf',
          fileName: 'launch-plan.pdf',
          fileSize: 2048,
        }),
      );
    });

    it('does not leak Cloud Library documents into Local mode', () => {
      useChatCloudMessageStore.setState({
        conversations: [
          {
            id: 'cloud-chat',
            title: 'Private Cloud chat',
            createdAt: '2026-07-30T10:00:00.000Z',
            updatedAt: '2026-07-30T10:05:00.000Z',
            messageCount: 1,
            pinned: false,
            executionMode: 'cloud',
          },
        ],
        messages: {
          'cloud-chat': [
            {
              id: 'message-cloud',
              conversationId: 'cloud-chat',
              role: 'user',
              content: 'Cloud only',
              createdAt: '2026-07-30T10:01:00.000Z',
              attachments: [
                {
                  url: '/api/files/cloud-only',
                  mimeType: 'application/pdf',
                  fileName: 'cloud-only.pdf',
                  assetId: 'cloud-only',
                },
              ],
            },
          ],
        },
      });

      const { queryByText } = renderSheet();

      expect(queryByText('cloud-only.pdf')).toBeNull();
    });
  });

  describe('mode selector', () => {
    it('does not render duplicate mode controls in Add to Chat', () => {
      const { queryByLabelText, queryByText } = renderSheet();

      expect(queryByLabelText('Chat mode, selected')).toBeNull();
      expect(queryByLabelText('Research mode')).toBeNull();
      expect(queryByLabelText('Create mode')).toBeNull();
      expect(queryByText('Chat (default)')).toBeNull();
    });

    it('offers Paste image when the clipboard holds one', async () => {
      (Clipboard.hasImageAsync as jest.Mock).mockResolvedValueOnce(true);
      const onPasteImage = jest.fn();
      const { findByText } = renderSheet({ onPasteImage });

      fireEvent.press(await findByText('Paste image'));
      expect(onPasteImage).toHaveBeenCalled();
    });

    it('offers Study and learn in Cloud mode', () => {
      useChatAppModeStore.setState({ appMode: 'cloud' });

      const { getByText } = renderSheet();

      expect(getByText('Study and learn')).toBeTruthy();
    });

    it('lets this chat turn web search and each connected app on or off', async () => {
      useChatAppModeStore.setState({ appMode: 'cloud' });
      useTierStore.setState({ grantedCapabilities: ['canUseWebSearch', 'canUseConnectors'] });
      mockFetchConnectorDirectory.mockResolvedValue({
        connectors: [
          {
            id: 'conn-1',
            connectorId: 'gmail',
            toolConnectorId: 'gmail',
            authType: 'oauth',
            connectedAt: '2026-10-01T00:00:00.000Z',
            updatedAt: '2026-10-01T00:00:00.000Z',
            source: 'oauth',
          },
        ],
        available: [],
        entries: [],
        policy: null,
      });
      useChatViewStore.setState({
        styleConversationId: 'chat-42',
        disabledConnectorIdsByConversation: {},
      });

      const { getByLabelText, findByLabelText } = renderSheet();

      fireEvent(getByLabelText('Web search on'), 'valueChange', false);
      expect(useChatViewStore.getState().features.webSearch).toBe(false);
      fireEvent(await findByLabelText('Gmail on'), 'valueChange', false);
      expect(useChatViewStore.getState().disabledConnectorIdsByConversation).toEqual({
        'chat-42': ['gmail'],
      });
    });

    it('no longer offers AGI Work at a paid tier, the drawer owns it now', () => {
      useChatAppModeStore.setState({ appMode: 'cloud' });
      useTierStore.setState({ tier: 'max' });

      const { queryByText, queryByLabelText } = renderSheet();

      expect(queryByText('AGI Work')).toBeNull();
      expect(queryByLabelText('AGI Work off')).toBeNull();
      expect(useChatStore.getState().workMode).toBe('chat');
    });

    it('does not advertise AGI Work to Free users', () => {
      useChatAppModeStore.setState({ appMode: 'cloud' });
      useTierStore.setState({ tier: 'free' });

      const { queryByText } = renderSheet();

      expect(queryByText('AGI Work')).toBeNull();
      expect(useChatStore.getState().workMode).toBe('chat');
    });
  });

  describe('feature toggles', () => {
    it('hides controls that live elsewhere or are disabled', () => {
      const { queryByText } = renderSheet();

      expect(queryByText('Temporary chat')).toBeNull();
      expect(queryByText('Web search')).toBeNull();
      expect(queryByText('Image')).toBeNull();
      expect(queryByText('Video')).toBeNull();
      expect(queryByText('AGI Work')).toBeNull();
      expect(queryByText('Run code')).toBeNull();
      expect(queryByText('Computer use')).toBeNull();
      expect(queryByText('Health')).toBeNull();
      expect(queryByText('Beta')).toBeNull();
      expect(queryByText(/Extended thinking/i)).toBeNull();
      expect(queryByText('Medium')).toBeNull();
    });

    it('shows the Image row in Cloud mode only', () => {
      useChatAppModeStore.setState({ appMode: 'cloud' });
      useTierStore.setState({ tier: 'pro', grantedCapabilities: ['canUseImages'] });
      const { getByText } = renderSheet();
      expect(getByText('Image')).toBeTruthy();
    });

    it('hides Image below Pro so the option cannot promise a denied request', () => {
      useChatAppModeStore.setState({ appMode: 'cloud' });
      useTierStore.setState({ tier: 'basic' });

      const { queryByText } = renderSheet();

      expect(queryByText('Image')).toBeNull();
    });

    it('hides Image when the server capability handshake denies it', () => {
      useChatAppModeStore.setState({ appMode: 'cloud' });
      useTierStore.setState({ tier: 'pro', grantedCapabilities: [] });

      const { queryByText } = renderSheet();

      expect(queryByText('Image')).toBeNull();
    });

    it('hides Video below Max 20x', () => {
      useChatAppModeStore.setState({ appMode: 'cloud' });
      useTierStore.setState({ tier: 'pro', grantedCapabilities: ['canUseImages'] });

      const { queryByText } = renderSheet();

      expect(queryByText('Video')).toBeNull();
    });

    it('gives each Output row its file-type icon, like every other row in the sheet', () => {
      const features = FEATURES as { codeExecution: boolean };
      const previous = features.codeExecution;
      features.codeExecution = true;
      useChatAppModeStore.setState({ appMode: 'cloud' });
      useModelStore.setState({ selectedModel: SEARCH_CAPABLE_MODEL_ID });
      useTierStore.setState({
        tier: 'max',
        grantedCapabilities: ['canUseImages', 'canUseCloudExecution'],
        codeExecutionAvailable: true,
      } as never);

      try {
        const { getByLabelText } = renderSheet({ offersOutputFormat: true });
        for (const [label, icon] of [
          ['Document', 'icon-FileText'],
          ['Presentation', 'icon-MonitorPlay'],
          ['Spreadsheet', 'icon-FileSpreadsheet'],
        ] as const) {
          expect(within(getByLabelText(label)).getByTestId(icon)).toBeTruthy();
        }
      } finally {
        features.codeExecution = previous;
      }
    });

    it('offers Run code per chat only while the Settings permission allows code execution', () => {
      useChatAppModeStore.setState({ appMode: 'cloud' });
      useModelStore.setState({ selectedModel: CODE_CAPABLE_MODEL_ID });
      useTierStore.setState({
        tier: 'max',
        grantedCapabilities: ['canUseCloudExecution'],
        codeExecutionAvailable: true,
      } as never);
      useChatViewStore.setState({ styleConversationId: 'chat-42', runCodeByConversation: {} });

      const permitted = renderSheet();
      expect(permitted.getByText('Run code')).toBeTruthy();
      fireEvent(permitted.getByLabelText('Run code off'), 'valueChange', true);
      expect(useChatViewStore.getState().runCodeByConversation).toEqual({ 'chat-42': true });
      permitted.unmount();

      useChatStore.setState({
        features: {
          webSearch: true,
          imageGen: true,
          health: false,
          codeExecution: false,
          research: false,
        },
      });
      const { queryByText } = renderSheet();
      expect(queryByText('Run code')).toBeNull();
    });

    it('shows the Video row on an entitled plan in a build with video generation', () => {
      const features = FEATURES as { videoGen: boolean };
      features.videoGen = true;
      useChatAppModeStore.setState({ appMode: 'cloud' });
      useTierStore.setState({
        tier: 'max_15x',
        grantedCapabilities: ['canUseImages', 'canUseVideoGeneration'],
      });

      try {
        const { getByText } = renderSheet();
        expect(getByText('Video')).toBeTruthy();
      } finally {
        features.videoGen = false;
      }
    });

    it('hides the Video row when the video slot has no live model and none was chosen', () => {
      const features = FEATURES as { videoGen: boolean };
      features.videoGen = true;
      mockVideoSlot.modelId = SYNTHETIC_RETIRED_VIDEO_MODEL_ID;
      useChatAppModeStore.setState({ appMode: 'cloud' });
      useTierStore.setState({
        tier: 'max_15x',
        grantedCapabilities: ['canUseImages', 'canUseVideoGeneration'],
      });

      try {
        const { queryByText } = renderSheet();
        expect(queryByText('Video')).toBeNull();
        expect(queryByText('Generate video in this chat')).toBeNull();
      } finally {
        features.videoGen = false;
      }
    });

    it('keeps the Video row when the user chose a live video model and the slot is retired', () => {
      const features = FEATURES as { videoGen: boolean };
      features.videoGen = true;
      mockVideoSlot.modelId = SYNTHETIC_RETIRED_VIDEO_MODEL_ID;
      useChatViewStore.setState({
        mediaMode: 'text',
        selectedMediaModel: { video: requireLiveVideoModelId() },
      });
      useChatAppModeStore.setState({ appMode: 'cloud' });
      useTierStore.setState({
        tier: 'max_15x',
        grantedCapabilities: ['canUseImages', 'canUseVideoGeneration'],
      });

      try {
        const { getByText } = renderSheet();
        expect(getByText('Video')).toBeTruthy();
      } finally {
        features.videoGen = false;
      }
    });

    it('hides the Video row in the store build even on an entitled plan', () => {
      useChatAppModeStore.setState({ appMode: 'cloud' });
      useTierStore.setState({
        tier: 'max_15x',
        grantedCapabilities: ['canUseImages', 'canUseVideoGeneration'],
      });

      const { queryByText } = renderSheet();

      expect(queryByText('Video')).toBeNull();
      expect(queryByText('Generate video in this chat')).toBeNull();
    });

    it('hides the Video row when only the image capability is granted', () => {
      useChatAppModeStore.setState({ appMode: 'cloud' });
      useTierStore.setState({ tier: 'max_15x', grantedCapabilities: ['canUseImages'] });

      const { queryByText } = renderSheet();

      expect(queryByText('Video')).toBeNull();
    });

    it('updates the selected video-model row immediately after the user picks another model', () => {
      useChatAppModeStore.setState({ appMode: 'cloud' });
      useTierStore.setState({
        tier: 'max_15x',
        grantedCapabilities: ['canUseImages', 'canUseVideoGeneration'],
      });
      useChatViewStore.setState({ mediaMode: 'video', selectedMediaModel: {} });
      const candidates = listMediaModels('video');
      expect(candidates.length).toBeGreaterThan(1);
      const first = getModelMetadataById(candidates[0]);
      const second = getModelMetadataById(candidates[1]);
      expect(first).not.toBeNull();
      expect(second).not.toBeNull();

      const { getByLabelText } = renderSheet();
      const firstRow = getByLabelText(new RegExp(`^${first!.name},.*selected$`));
      const secondRow = getByLabelText(new RegExp(`^${second!.name},`));
      expect(firstRow.props.accessibilityState.selected).toBe(true);
      expect(secondRow.props.accessibilityState.selected).toBe(false);

      fireEvent.press(secondRow);

      expect(getByLabelText(new RegExp(`^${first!.name},`)).props.accessibilityState.selected).toBe(
        false,
      );
      expect(
        getByLabelText(new RegExp(`^${second!.name},.*selected$`)).props.accessibilityState
          .selected,
      ).toBe(true);
    });

    it('clears a non-executable persisted media selection after render without an update loop', async () => {
      const nonLiveVideoModel = Object.values(modelsCatalog.models).find(
        (model) =>
          model.modelType === 'video' &&
          model.capabilities.videoGen === true &&
          !isModelLive(model),
      );
      expect(nonLiveVideoModel).toBeDefined();
      useChatViewStore.setState({
        mediaMode: 'video',
        selectedMediaModel: { video: nonLiveVideoModel!.id },
      });

      renderSheet();

      await waitFor(() => {
        expect(useChatViewStore.getState().selectedMediaModel.video).toBeUndefined();
      });
    });

    it('does not render a Web search toggle for an unsupported model', () => {
      useModelStore.setState({ selectedModel: SEARCH_UNSUPPORTED_MODEL_ID });
      const { queryByText } = renderSheet();

      expect(queryByText('Web search')).toBeNull();
      expect(queryByText('Image')).toBeNull();
    });

    it('keeps Web search out of the + sheet when a Cloud generic backend is available', () => {
      useChatAppModeStore.setState({ appMode: 'cloud' });
      useModelStore.setState({ selectedModel: SEARCH_UNSUPPORTED_MODEL_ID });
      useTierStore.setState({ genericWebSearchAvailable: true });

      const { queryByText } = renderSheet();

      expect(queryByText('Web search')).toBeNull();
    });

    it('hides the Deep research row by default (local mode, free tier, non-research model)', () => {
      const { queryByText } = renderSheet();
      expect(queryByText('Deep research')).toBeNull();
    });

    it('shows Deep research in Cloud for a research+search model on a paid plan', () => {
      useChatAppModeStore.setState({ appMode: 'cloud' });
      useModelStore.setState({ selectedModel: RESEARCH_CAPABLE_MODEL_ID });
      useTierStore.setState({
        tier: 'max',
        grantedCapabilities: ['canUseDeepResearch'],
      } as never);

      const { getByText } = renderSheet();
      expect(getByText('Deep research')).toBeTruthy();
    });

    it('hides Deep research for a free account even with a research-capable model', () => {
      useChatAppModeStore.setState({ appMode: 'cloud' });
      useModelStore.setState({ selectedModel: RESEARCH_CAPABLE_MODEL_ID });
      useTierStore.setState({ tier: 'free' });

      const { queryByText } = renderSheet();
      expect(queryByText('Deep research')).toBeNull();
    });

    it('hides Deep research when the server handshake denies it even on Pro', () => {
      useChatAppModeStore.setState({ appMode: 'cloud' });
      useModelStore.setState({ selectedModel: RESEARCH_CAPABLE_MODEL_ID });
      useTierStore.setState({ tier: 'pro', grantedCapabilities: [] } as never);

      const { queryByText } = renderSheet();

      expect(queryByText('Deep research')).toBeNull();
    });
  });

  describe('config links', () => {
    it('marks the tapped handoff row busy while the sheet closes', () => {
      const { getByText, queryByTestId, getByTestId } = renderSheet();

      expect(queryByTestId('config-link-pending-Model')).toBeNull();
      fireEvent.press(getByText('Project'));
      expect(getByTestId('config-link-pending-Project')).toBeTruthy();
      expect(queryByTestId('config-link-pending-Model')).toBeNull();
    });

    it('renders the local-safe config links', () => {
      const { getByText, queryByText } = renderSheet();

      expect(getByText('Project')).toBeTruthy();
      expect(getByText('Choose style')).toBeTruthy();
      expect(queryByText('Connectors')).toBeNull();
      expect(queryByText('Tool access')).toBeNull();
      expect(queryByText('Study and learn')).toBeNull();
    });

    it('shows current values on config links', () => {
      const { getByText } = renderSheet();

      expect(getByText('Choose')).toBeTruthy();
      expect(getByText('Normal')).toBeTruthy();
    });

    it('shows project name when a project is active', () => {
      useProjectStore.setState({
        projects: [
          {
            id: 'proj-1',
            name: 'My Project',
            description: 'Test',
            instructions: '',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
        activeProjectId: 'proj-1',
      });

      const { getByText } = renderSheet();

      expect(getByText('My Project')).toBeTruthy();
    });

    it('uses the Cloud project store without leaking a Local project name', () => {
      useProjectStore.setState({
        projects: [
          {
            id: 'proj-1',
            name: 'My Project',
            description: 'Test',
            instructions: '',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
        activeProjectId: 'proj-1',
      });
      useChatAppModeStore.setState({ appMode: 'cloud' });

      const { queryByText } = renderSheet();

      expect(queryByText('Project')).toBeTruthy();
      expect(queryByText('My Project')).toBeNull();
      expect(queryByText('Choose style')).toBeTruthy();
    });
  });
});
