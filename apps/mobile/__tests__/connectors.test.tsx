/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Tests for Connectors page components.
 *
 * Validates:
 * - ConnectorItem renders name and description
 * - Connected state shows toggle switch
 * - Available state shows "Connect" button
 * - Toggle fires onToggle callback
 * - Connect fires onConnect callback
 * - connectorData has 11 connectors across 4 categories
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

// ---------------------------------------------------------------------------
// Mocks — declared before imports
// ---------------------------------------------------------------------------

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  selectionAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'Light', Medium: 'Medium', Heavy: 'Heavy' },
}));

jest.mock('lucide-react-native', () => {
  const React = require('react');
  const { View } = require('react-native');
  return new Proxy(
    {},
    {
      get: (_target, name) => {
        if (name === '__esModule') return true;
        return (props: Record<string, unknown>) => (
          <View testID={`icon-${String(name)}`} {...props} />
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

jest.mock('../stores/settingsStore', () => ({
  useSettingsStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ hapticsEnabled: false }),
}));

jest.mock('../lib/theme', () => ({
  colors: {
    teal: '#14b8a6',
    textMuted: '#888',
  },
}));

// Mock the ui/switch component to be testable
jest.mock('../components/ui/switch', () => {
  const React = require('react');
  const { Pressable, Text } = require('react-native');
  return {
    Switch: ({ value, onValueChange }: { value: boolean; onValueChange: (v: boolean) => void }) => (
      <Pressable
        onPress={() => onValueChange(!value)}
        testID="toggle-switch"
        accessibilityRole="switch"
        accessibilityState={{ checked: value }}
      >
        <Text>{value ? 'ON' : 'OFF'}</Text>
      </Pressable>
    ),
  };
});

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { ConnectorItem } from '../components/connectors/ConnectorItem';
import {
  CONNECTORS,
  CONNECTOR_CATEGORIES,
  CONNECTOR_META,
} from '../components/connectors/connectorData';

// ---------------------------------------------------------------------------
// Tests — ConnectorItem
// ---------------------------------------------------------------------------

describe('ConnectorItem', () => {
  const defaultProps = {
    id: 'github',
    name: 'GitHub',
    description: 'Search and manage your GitHub repositories',
    isConnected: false,
    isEnabled: false,
    onToggle: jest.fn(),
    onConnect: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ---- Rendering ----

  describe('rendering', () => {
    it('renders the connector name', () => {
      const { getByText } = render(<ConnectorItem {...defaultProps} />);

      expect(getByText('GitHub')).toBeTruthy();
    });

    it('renders the connector description', () => {
      const { getByText } = render(<ConnectorItem {...defaultProps} />);

      expect(getByText('Search and manage your GitHub repositories')).toBeTruthy();
    });
  });

  // ---- Connected state ----

  describe('connected state', () => {
    it('shows toggle switch when connected', () => {
      const { getByTestId } = render(
        <ConnectorItem {...defaultProps} isConnected={true} isEnabled={true} />,
      );

      expect(getByTestId('toggle-switch')).toBeTruthy();
    });

    it('does not show "Connect" button when connected', () => {
      const { queryByText } = render(
        <ConnectorItem {...defaultProps} isConnected={true} isEnabled={true} />,
      );

      expect(queryByText('Connect')).toBeNull();
    });

    it('fires onToggle with id and new value when toggle is pressed', () => {
      const onToggle = jest.fn();
      const { getByTestId } = render(
        <ConnectorItem {...defaultProps} isConnected={true} isEnabled={true} onToggle={onToggle} />,
      );

      fireEvent.press(getByTestId('toggle-switch'));

      expect(onToggle).toHaveBeenCalledWith('github', false);
    });
  });

  // ---- Available (not connected) state ----

  describe('available state', () => {
    it('shows "Connect" button when not connected', () => {
      const { getByText } = render(<ConnectorItem {...defaultProps} isConnected={false} />);

      expect(getByText('Connect')).toBeTruthy();
    });

    it('does not show toggle switch when not connected', () => {
      const { queryByTestId } = render(<ConnectorItem {...defaultProps} isConnected={false} />);

      expect(queryByTestId('toggle-switch')).toBeNull();
    });

    it('fires onConnect with id when Connect button is pressed', () => {
      const onConnect = jest.fn();
      const { getByText } = render(
        <ConnectorItem {...defaultProps} isConnected={false} onConnect={onConnect} />,
      );

      fireEvent.press(getByText('Connect'));

      expect(onConnect).toHaveBeenCalledWith('github');
    });
  });

  // ---- Different connectors ----

  describe('different connectors', () => {
    it('renders correctly for a connector without meta (fallback icon)', () => {
      const { getByText } = render(
        <ConnectorItem
          {...defaultProps}
          id="unknown-connector"
          name="Custom Service"
          description="A custom integration"
        />,
      );

      expect(getByText('Custom Service')).toBeTruthy();
      expect(getByText('A custom integration')).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------
// Tests — connectorData
// ---------------------------------------------------------------------------

describe('connectorData', () => {
  it('has 11 connectors total', () => {
    expect(CONNECTORS).toHaveLength(11);
  });

  it('has 4 categories', () => {
    expect(CONNECTOR_CATEGORIES).toHaveLength(4);
  });

  it('categories cover cloud, productivity, communication, email', () => {
    const categoryKeys = CONNECTOR_CATEGORIES.map((c) => c.key);

    expect(categoryKeys).toContain('cloud');
    expect(categoryKeys).toContain('productivity');
    expect(categoryKeys).toContain('communication');
    expect(categoryKeys).toContain('email');
  });

  it('has 3 cloud connectors', () => {
    const cloud = CONNECTORS.filter((c) => c.category === 'cloud');
    expect(cloud).toHaveLength(3);
  });

  it('has 4 productivity connectors', () => {
    const productivity = CONNECTORS.filter((c) => c.category === 'productivity');
    expect(productivity).toHaveLength(4);
  });

  it('has 2 communication connectors', () => {
    const communication = CONNECTORS.filter((c) => c.category === 'communication');
    expect(communication).toHaveLength(2);
  });

  it('has 2 email connectors', () => {
    const email = CONNECTORS.filter((c) => c.category === 'email');
    expect(email).toHaveLength(2);
  });

  it('every connector has a unique id', () => {
    const ids = CONNECTORS.map((c) => c.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it('every connector has a name and description', () => {
    for (const connector of CONNECTORS) {
      expect(connector.name.length).toBeGreaterThan(0);
      expect(connector.description.length).toBeGreaterThan(0);
    }
  });

  it('has CONNECTOR_META entries for all 11 connectors', () => {
    const metaKeys = Object.keys(CONNECTOR_META);
    expect(metaKeys).toHaveLength(11);

    for (const connector of CONNECTORS) {
      expect(CONNECTOR_META[connector.id]).toBeDefined();
    }
  });
});
