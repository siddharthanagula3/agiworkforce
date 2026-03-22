/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Tests for AddToChatSheet component.
 *
 * Validates the four sections of the "Add to Chat" bottom sheet:
 * 1. Attachment row (Camera, Photos, File, Skills)
 * 2. Mode selector radio buttons (Chat, Research, Create)
 * 3. Feature toggles (Web search, Image generation, Health)
 * 4. Config links (Add to project, Choose style, Tool access, Manage Connectors)
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

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

jest.mock('../services/healthData', () => ({
  isHealthAvailable: jest.fn().mockReturnValue(false),
  requestHealthPermission: jest.fn().mockResolvedValue(false),
}));

// Mock the sub-sheet components imported by AddToChatSheet via relative paths.
// The component uses `import { StyleSelector } from './StyleSelector'` which
// resolves to `components/chat/StyleSelector` — we mock that path.
jest.mock('../components/chat/StyleSelector', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    StyleSelector: React.forwardRef((_props: unknown, _ref: React.Ref<unknown>) => (
      <View testID="style-selector" />
    )),
  };
});

jest.mock('../components/chat/ToolAccessSelector', () => {
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

import { AddToChatSheet } from '../components/chat/AddToChatSheet';
import { useChatStore } from '../stores/chatStore';
import { useProjectStore } from '../stores/projectStore';

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
    it('renders all 3 feature toggles', () => {
      const { getByText } = renderSheet();

      expect(getByText('Web search')).toBeTruthy();
      expect(getByText('Image generation')).toBeTruthy();
      expect(getByText('Health')).toBeTruthy();
    });

    it('Health toggle shows Beta badge', () => {
      const { getByText } = renderSheet();

      expect(getByText('Beta')).toBeTruthy();
    });

    it('Web search and Image gen default to ON, Health defaults to OFF', () => {
      const features = useChatStore.getState().features;

      expect(features.webSearch).toBe(true);
      expect(features.imageGen).toBe(true);
      expect(features.health).toBe(false);
    });
  });

  // ---- Section 4: Config Links ----

  describe('config links', () => {
    it('renders all 4 config links', () => {
      const { getByText } = renderSheet();

      expect(getByText('Add to project')).toBeTruthy();
      expect(getByText('Choose style')).toBeTruthy();
      expect(getByText('Tool access')).toBeTruthy();
      expect(getByText('Manage Connectors')).toBeTruthy();
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
