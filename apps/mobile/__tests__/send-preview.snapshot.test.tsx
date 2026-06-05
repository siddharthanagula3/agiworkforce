/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Mobile SendPreview snapshot tests.
 *
 * Locks the RN-native SendPreview rendered tree across Local / Cloud invite /
 * Managed variants. Mirrors the unified-chat snapshot pattern so any
 * future layout drift fires a diff. Structural visual-verification —
 * not pixel parity.
 *
 * Round-10 autonomous suite-transformation slice, 2026-05-21.
 */

import React from 'react';
import { render } from '@testing-library/react-native';
import { summarizeSendPreview } from '@agiworkforce/types';

jest.mock('@/src/ui/theme', () => ({
  colors: {
    textPrimary: '#fff',
    textSecondary: '#aaa',
    textMuted: '#777',
    border: '#333',
    surfaceElevated: '#1a1a1a',
    surfaceOverlay: '#0e0e0e',
    agentSuccess: '#10b981',
    agentError: '#ef4444',
    agentWarning: '#f59e0b',
  },
}));

jest.mock('@/components/ui/text', () => {
  const RN = require('react-native');
  const Text = (props: Record<string, unknown>) => <RN.Text {...props} />;
  Text.displayName = 'Text';
  return { Text };
});

jest.mock('lucide-react-native', () => {
  const RN = require('react-native');
  const factory = (name: string) => (props: Record<string, unknown>) => (
    <RN.View testID={`icon-${name}`} {...props} />
  );
  return {
    ChevronDown: factory('chevron-down'),
    ChevronUp: factory('chevron-up'),
    Cloud: factory('cloud'),
    HardDrive: factory('hard-drive'),
    Lock: factory('lock'),
  };
});

import { SendPreview } from '@/src/features/chat/components/SendPreview';

describe('Mobile SendPreview snapshots', () => {
  it('locks the Local turn rendered tree', () => {
    const presentation = summarizeSendPreview({
      providerMode: 'Local',
      modelLabel: 'Llama 3.2 8B',
      messageBody: 'hi',
    });
    const { toJSON } = render(<SendPreview presentation={presentation} />);
    expect(toJSON()).toMatchSnapshot();
  });

  it('locks the Cloud invite rendered tree for legacy direct-provider input', () => {
    const presentation = summarizeSendPreview({
      providerMode: 'DirectByok',
      destinationHost: 'api.anthropic.com',
      modelLabel: 'Claude Sonnet 4.6',
    });
    const { toJSON } = render(<SendPreview presentation={presentation} />);
    expect(toJSON()).toMatchSnapshot();
  });

  it('locks the Managed turn rendered tree', () => {
    const presentation = summarizeSendPreview({
      providerMode: 'ManagedGateway',
      destinationHost: 'gateway.agiworkforce.com',
      modelLabel: 'AGI Pro',
    });
    const { toJSON } = render(<SendPreview presentation={presentation} />);
    expect(toJSON()).toMatchSnapshot();
  });
});
