/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Tests for AddToChatSheet component.
 *
 * Validates the local-mode "Add to Chat" bottom sheet:
 * 1. Attachment row (Camera, Photos in Local Mode; File only in Cloud)
 * 2. Session controls
 * 3. Hidden feature rows while feature flags are disabled
 * 4. Config links (Project, Choose style)
 */

import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

// ---------------------------------------------------------------------------
// Mocks — declared before imports
// ---------------------------------------------------------------------------

jest.mock('@gorhom/bottom-sheet', () => {
  const React = require('react');
  const { View } = require('react-native');

  const BottomSheet = React.forwardRef(
    ({ children }: { children: React.ReactNode }, _ref: React.Ref<unknown>) => (
      <View testID="bottom-sheet">{children}</View>
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

jest.mock('../src/features/cloud-bridge', () => {
  const { View } = require('react-native');
  return {
    InviteCodeModal: ({ open }: { open: boolean }) =>
      open ? <View testID="invite-code-modal" /> : null,
  };
});

// Mock the sub-sheet components imported by AddToChatSheet via relative paths.
// The component uses `import { StyleSelector } from './StyleSelector'` which
// resolves to `components/chat/StyleSelector` — we mock that path.
jest.mock('../src/features/chat/components/StyleSelector', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    StyleSelector: React.forwardRef((_props: unknown, _ref: React.Ref<unknown>) => (
      <View testID="style-selector" />
    )),
  };
});

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { AddToChatSheet } from '../src/features/chat/components/AddToChatSheet';
import { useChatStore } from '../stores/chatStore';
import { useChatCloudMessageStore } from '../stores/chat/chatCloudMessageStore';
import { useProjectStore } from '../src/features/projects/store';
import { useChatAppModeStore } from '../src/features/chat/store/appModeStore';
import { useModelStore } from '../src/features/model-picker/store';
import { useTierStore } from '../src/features/billing/store';
import { useChatViewStore } from '../stores/chat/chatViewStore';
import { listMediaModels } from '../src/features/chat/actions/mediaMode';
import { getModelMetadataById, isModelLive, modelsCatalog } from '@agiworkforce/types';
import { requireMobileCloudModel } from '../test-utils/modelFixtures';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

function resetStores() {
  useChatStore.setState({
    conversations: [],
    messages: {},
    chatMode: 'chat',
    chatStyle: 'normal',
    toolAccess: 'auto',
    workMode: 'chat',
    features: {
      webSearch: true,
      imageGen: true,
      health: false,
      codeExecution: false,
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AddToChatSheet', () => {
  beforeEach(() => {
    resetStores();
    mockWaitlistStoreState.joined = false;
    mockWaitlistStoreState.rank = undefined;
    jest.clearAllMocks();
  });

  // ---- Section 1: Attachment Row ----

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

  // ---- Section 2: Removed mode selector ----

  describe('mode selector', () => {
    it('does not render duplicate mode controls in Add to Chat', () => {
      const { queryByLabelText, queryByText } = renderSheet();

      expect(queryByLabelText('Chat mode, selected')).toBeNull();
      expect(queryByLabelText('Research mode')).toBeNull();
      expect(queryByLabelText('Create mode')).toBeNull();
      expect(queryByText('Chat (default)')).toBeNull();
    });

    // AGI Work moved out of this sheet to the drawer (founder 2026-08-06): it
    // is a session-wide stance, not a per-message attachment. The sheet must no
    // longer offer it at ANY tier — including the paid tiers that used to see a
    // working toggle here, which is the regression this guards.
    it('no longer offers AGI Work at a paid tier — the drawer owns it now', () => {
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

  // ---- Section 3: Feature Rows ----

  describe('feature toggles', () => {
    it('hides controls that live elsewhere or are disabled', () => {
      const { queryByText } = renderSheet();

      // Temporary chat lives in the chat header, not this sheet.
      expect(queryByText('Temporary chat')).toBeNull();
      // Search is ambient and capability-clamped at send time, so it is not a
      // per-turn switch in the + sheet. Image/Video are Cloud-only modes.
      expect(queryByText('Web search')).toBeNull();
      expect(queryByText('Image')).toBeNull();
      expect(queryByText('Video')).toBeNull();
      // AGI Work moved to the drawer (founder 2026-08-06) — it is a session
      // stance, not a per-message attachment.
      expect(queryByText('AGI Work')).toBeNull();
      // Code execution lives in Settings > Capabilities, matching Claude and
      // ChatGPT. A second switch here was a duplicate control for one flag.
      expect(queryByText('Run code')).toBeNull();
      // Still gated off in this build.
      expect(queryByText('Computer use')).toBeNull();
      expect(queryByText('Health')).toBeNull();
      expect(queryByText('Beta')).toBeNull();
      expect(queryByText(/Extended thinking/i)).toBeNull();
      expect(queryByText('Medium')).toBeNull();
    });

    // Image is a MODE, not a toggle: picking it switches the selected model to
    // the registry's image model (founder 2026-08-06). The row is labelled
    // "Image" and lives in the Create section.
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

    // Video is Max 15x / Enterprise only (`video_generation` in the billing
    // catalog), so a Pro account must not see it.
    it('hides Video below Max 15x', () => {
      useChatAppModeStore.setState({ appMode: 'cloud' });
      useTierStore.setState({ tier: 'pro', grantedCapabilities: ['canUseImages'] });

      const { queryByText } = renderSheet();

      expect(queryByText('Video')).toBeNull();
    });

    it('never offers Run code in the + sheet, even fully entitled in Cloud', () => {
      useChatAppModeStore.setState({ appMode: 'cloud' });
      useModelStore.setState({ selectedModel: SEARCH_CAPABLE_MODEL_ID });
      useTierStore.setState({
        tier: 'max',
        grantedCapabilities: ['canUseImages', 'canUseCloudExecution', 'canUseDeepResearch'],
        codeExecutionAvailable: true,
      } as never);

      const { queryByText } = renderSheet();

      expect(queryByText('Run code')).toBeNull();
    });

    it('shows the Video row on an entitled plan', () => {
      useChatAppModeStore.setState({ appMode: 'cloud' });
      useTierStore.setState({ tier: 'max_15x', grantedCapabilities: ['canUseImages'] });

      const { getByText } = renderSheet();

      expect(getByText('Video')).toBeTruthy();
    });

    it('updates the selected video-model row immediately after the user picks another model', () => {
      useChatAppModeStore.setState({ appMode: 'cloud' });
      useTierStore.setState({ tier: 'max_15x', grantedCapabilities: ['canUseImages'] });
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

  // ---- Section 4: Config Links ----

  describe('config links', () => {
    it('renders the local-safe config links', () => {
      const { getByText, queryByText } = renderSheet();

      expect(getByText('Project')).toBeTruthy();
      expect(getByText('Choose style')).toBeTruthy();
      expect(queryByText('Connectors')).toBeNull();
      expect(queryByText('Tool access')).toBeNull();
    });

    it('shows current values on config links', () => {
      const { getByText } = renderSheet();

      // Project defaults to "Choose"
      expect(getByText('Choose')).toBeTruthy();
      // Style defaults to "Normal"
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
