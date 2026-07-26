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
import { fireEvent, render } from '@testing-library/react-native';

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
import { useProjectStore } from '../src/features/projects/store';
import { useChatAppModeStore } from '../src/features/chat/store/appModeStore';
import { useModelStore } from '../src/features/model-picker/store';
import { useTierStore } from '../src/features/billing/store';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Representative Cloud-capable default used by the capability-gated rows.
const SEARCH_CAPABLE_MODEL_ID = 'claude-haiku-4.5';

function resetStores() {
  useChatStore.setState({
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
  useProjectStore.setState({
    projects: [],
    activeProjectId: null,
  });
  useChatAppModeStore.setState({ appMode: 'local' });
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

    it('shows a real AGI Work toggle for paid Cloud chats', () => {
      useChatAppModeStore.setState({ appMode: 'cloud' });
      useTierStore.setState({ tier: 'max' });

      const { getByLabelText } = renderSheet();
      fireEvent(getByLabelText('AGI Work off'), 'valueChange', true);

      expect(useChatStore.getState().workMode).toBe('agiwork');
    });

    it('does not advertise AGI Work to Free users', () => {
      useChatAppModeStore.setState({ appMode: 'cloud' });
      useTierStore.setState({ tier: 'free' });

      const { queryByText } = renderSheet();

      expect(queryByText('AGI Work')).toBeNull();
      expect(useChatStore.getState().workMode).toBe('chat');
    });

    it('does not show AGI Work to Basic users because the server requires Pro', () => {
      useChatAppModeStore.setState({ appMode: 'cloud' });
      useTierStore.setState({ tier: 'basic' });

      const { queryByText } = renderSheet();

      expect(queryByText('AGI Work')).toBeNull();
    });
  });

  // ---- Section 3: Feature Rows ----

  describe('feature toggles', () => {
    it('shows the enabled tool rows and hides the disabled ones', () => {
      const { getByText, queryByText } = renderSheet();

      expect(getByText('Temporary chat')).toBeTruthy();
      // Search is ambient and capability-clamped at send time, so it is not a
      // per-turn switch in the + sheet. Image generation is Cloud-only.
      expect(queryByText('Web search')).toBeNull();
      expect(queryByText('Image generation')).toBeNull();
      // Still gated off in this build.
      expect(queryByText('Computer use')).toBeNull();
      expect(queryByText('Health')).toBeNull();
      expect(queryByText('Beta')).toBeNull();
      expect(queryByText(/Extended thinking/i)).toBeNull();
      expect(queryByText('Medium')).toBeNull();
    });

    it('shows the Image generation row in Cloud mode only', () => {
      useChatAppModeStore.setState({ appMode: 'cloud' });
      useTierStore.setState({ tier: 'pro', grantedCapabilities: ['canUseImages'] });
      const { getByText } = renderSheet();
      expect(getByText('Image generation')).toBeTruthy();
    });

    it('hides Image generation below Pro so the toggle cannot promise a denied request', () => {
      useChatAppModeStore.setState({ appMode: 'cloud' });
      useTierStore.setState({ tier: 'basic' });

      const { queryByText } = renderSheet();

      expect(queryByText('Image generation')).toBeNull();
    });

    it('hides Image generation when the server capability handshake denies it', () => {
      useChatAppModeStore.setState({ appMode: 'cloud' });
      useTierStore.setState({ tier: 'pro', grantedCapabilities: [] });

      const { queryByText } = renderSheet();

      expect(queryByText('Image generation')).toBeNull();
    });

    it('does not render a Web search toggle for an unsupported model', () => {
      useModelStore.setState({ selectedModel: 'deepseek-v4-flash' });
      const { queryByText } = renderSheet();

      expect(queryByText('Web search')).toBeNull();
      expect(queryByText('Image generation')).toBeNull();
    });

    it('keeps Web search out of the + sheet when a Cloud generic backend is available', () => {
      useChatAppModeStore.setState({ appMode: 'cloud' });
      useModelStore.setState({ selectedModel: 'qwen-3.7-plus' });
      useTierStore.setState({ genericWebSearchAvailable: true });

      const { queryByText } = renderSheet();

      expect(queryByText('Web search')).toBeNull();
    });

    it('hides the Deep research row by default (local mode, free tier, non-research model)', () => {
      const { queryByText } = renderSheet();
      expect(queryByText('Deep research')).toBeNull();
    });

    it('shows Deep research in Cloud for a research+search model on a paid plan', () => {
      // claude-opus-5 has capabilities.research: true AND search: true.
      useChatAppModeStore.setState({ appMode: 'cloud' });
      useModelStore.setState({ selectedModel: 'claude-opus-5' });
      useTierStore.setState({
        tier: 'max',
        grantedCapabilities: ['canUseDeepResearch'],
      } as never);

      const { getByText } = renderSheet();
      expect(getByText('Deep research')).toBeTruthy();
    });

    it('hides Deep research for a free account even with a research-capable model', () => {
      useChatAppModeStore.setState({ appMode: 'cloud' });
      useModelStore.setState({ selectedModel: 'claude-opus-5' });
      useTierStore.setState({ tier: 'free' });

      const { queryByText } = renderSheet();
      expect(queryByText('Deep research')).toBeNull();
    });

    it('hides Deep research when the server handshake denies it even on Pro', () => {
      useChatAppModeStore.setState({ appMode: 'cloud' });
      useModelStore.setState({ selectedModel: 'claude-opus-5' });
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

    it('does not show local project config while in Cloud mode', () => {
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

      expect(queryByText('Project')).toBeNull();
      expect(queryByText('My Project')).toBeNull();
      expect(queryByText('Choose style')).toBeTruthy();
    });
  });
});
