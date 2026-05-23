/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Tests for AddToChatSheet component.
 *
 * Validates the four sections of the "Add to Chat" bottom sheet:
 * 1. Attachment row (Camera, Photos, File, Skills)
 * 2. Mode selector radio buttons (Chat, Research, Create)
 * 3. Tool availability rows (cloud-gated + local Health)
 * 4. Config links (Add to project, Choose style, Tool access, Connectors)
 */

import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent, act } from '@testing-library/react-native';

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

jest.mock('../services/supabase', () => ({
  supabase: {
    auth: {
      getSession: jest.fn().mockResolvedValue({ data: { session: null } }),
    },
  },
}));

jest.mock('../services/api', () => ({
  api: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));

jest.mock('../services/streaming', () => ({
  streamChat: jest.fn(),
}));

jest.mock('../src/features/integrations/services/healthData', () => ({
  isHealthAvailable: jest.fn().mockReturnValue(false),
  requestHealthPermission: jest.fn().mockResolvedValue(false),
}));

const mockJoinWaitlist = jest.fn().mockResolvedValue({ rank: 0 });
const mockMarkWaitlistJoined = jest.fn();
const mockWaitlistStoreState = {
  joined: false,
  rank: undefined as number | undefined,
  markJoined: mockMarkWaitlistJoined,
};

jest.mock('../src/features/waitlist', () => {
  return {
    joinWaitlist: mockJoinWaitlist,
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

jest.mock('../src/features/chat/components/ToolAccessSelector', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    ToolAccessSelector: React.forwardRef((_props: unknown, _ref: React.Ref<unknown>) => (
      <View testID="tool-access-selector" />
    )),
  };
});

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { AddToChatSheet } from '../src/features/chat/components/AddToChatSheet';
import { useChatStore } from '../stores/chatStore';
import { useProjectStore } from '../src/features/projects/store';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resetStores() {
  useChatStore.setState({
    chatMode: 'chat',
    chatStyle: 'normal',
    toolAccess: 'auto',
    features: { webSearch: true, imageGen: true, health: false },
  });
  useProjectStore.setState({
    projects: [],
    activeProjectId: null,
  });
}

const defaultProps = {
  onCamera: jest.fn(),
  onPhotos: jest.fn(),
  onFile: jest.fn(),
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
    it('renders 4 attachment cards: Camera, Photos, File, Skills', () => {
      const { getByText } = renderSheet();

      expect(getByText('Camera')).toBeTruthy();
      expect(getByText('Photos')).toBeTruthy();
      expect(getByText('File')).toBeTruthy();
      expect(getByText('Skills')).toBeTruthy();
    });
  });

  // ---- Section 2: Mode Selector ----

  describe('mode selector', () => {
    it('renders 3 mode radio buttons', () => {
      const { getByLabelText } = renderSheet();

      expect(getByLabelText('Chat mode, selected')).toBeTruthy();
      expect(getByLabelText('Research mode')).toBeTruthy();
      expect(getByLabelText('Create mode')).toBeTruthy();
    });

    it('has Chat mode selected by default', () => {
      const { getByLabelText } = renderSheet();

      const chatRadio = getByLabelText('Chat mode, selected');
      expect(chatRadio.props.accessibilityState.selected).toBe(true);

      const researchRadio = getByLabelText('Research mode');
      expect(researchRadio.props.accessibilityState.selected).toBe(false);
    });

    it('tapping a mode changes the selection in the store', () => {
      const { getByLabelText } = renderSheet();

      fireEvent.press(getByLabelText('Research mode'));

      expect(useChatStore.getState().chatMode).toBe('research');
    });

    it('shows "(default)" label on Chat mode only', () => {
      const { getByText } = renderSheet();

      expect(getByText('Chat (default)')).toBeTruthy();
    });
  });

  // ---- Section 3: Feature Toggles ----

  describe('feature toggles', () => {
    it('renders local and cloud-gated tool rows', () => {
      const { getByText } = renderSheet();

      expect(getByText('Web search')).toBeTruthy();
      expect(getByText('Image generation')).toBeTruthy();
      expect(getByText('Computer use')).toBeTruthy();
      expect(getByText('Desktop required')).toBeTruthy();
      expect(getByText('Health')).toBeTruthy();
    });

    it('Health toggle shows Beta badge', () => {
      const { getByText } = renderSheet();

      expect(getByText('Beta')).toBeTruthy();
    });

    it('shows cloud rows as waitlist-gated instead of live switches', () => {
      const { getByLabelText, queryByLabelText } = renderSheet();

      expect(getByLabelText('Web search, Waitlist')).toBeTruthy();
      expect(getByLabelText('Image generation, Waitlist')).toBeTruthy();
      expect(queryByLabelText('Web search on')).toBeNull();
      expect(queryByLabelText('Image generation on')).toBeNull();
      expect(getByLabelText('Health off').props.value).toBe(false);
    });

    it('opens the waitlist instead of enabling cloud web search', () => {
      useChatStore.setState({
        features: { webSearch: false, imageGen: false, health: false },
      });

      const { getByLabelText, getByTestId } = renderSheet();

      fireEvent.press(getByLabelText('Web search, Waitlist'));

      expect(useChatStore.getState().features.webSearch).toBe(false);
      expect(getByTestId('invite-code-modal')).toBeTruthy();
    });

    it('keeps health disabled and alerts when Health data is unavailable', async () => {
      const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
      const { getByLabelText } = renderSheet();

      await act(async () => {
        fireEvent(getByLabelText('Health off'), 'valueChange', true);
      });

      expect(useChatStore.getState().features.health).toBe(false);
      expect(alertSpy).toHaveBeenCalledWith(
        'Health Not Available',
        expect.stringContaining('available on iOS only'),
        [{ text: 'OK' }],
      );
      alertSpy.mockRestore();
    });
  });

  // ---- Section 4: Config Links ----

  describe('config links', () => {
    it('renders all 4 config links', () => {
      const { getByText } = renderSheet();

      expect(getByText('Add to project')).toBeTruthy();
      expect(getByText('Choose style')).toBeTruthy();
      expect(getByText('Tool access')).toBeTruthy();
      expect(getByText('Connectors')).toBeTruthy();
    });

    it('shows current values on config links', () => {
      const { getByText } = renderSheet();

      // Project defaults to "None"
      expect(getByText('None')).toBeTruthy();
      // Style defaults to "Normal"
      expect(getByText('Normal')).toBeTruthy();
      // Tool access defaults to "Auto"
      expect(getByText('Auto')).toBeTruthy();
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
  });
});
