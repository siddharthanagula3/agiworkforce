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

jest.mock('@/src/ui/theme', () => {
  const actual = jest.requireActual('@/src/ui/theme/tokens');
  return {
    ...actual,
    useThemeColors: () => actual.colors,
  };
});

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

const FIXTURE_LOCAL_MODEL_LABEL = 'Fixture Local Model';
const FIXTURE_BYOK_MODEL_LABEL = 'Fixture BYOK Model';

describe('Mobile SendPreview snapshots', () => {
  it('locks the Local turn rendered tree', () => {
    const presentation = summarizeSendPreview({
      providerMode: 'Local',
      modelLabel: FIXTURE_LOCAL_MODEL_LABEL,
      messageBody: 'hi',
    });
    const { toJSON } = render(<SendPreview presentation={presentation} />);
    expect(toJSON()).toMatchSnapshot();
  });

  it('locks the Cloud invite rendered tree for legacy direct-provider input', () => {
    const presentation = summarizeSendPreview({
      providerMode: 'DirectByok',
      destinationHost: 'api.anthropic.com',
      modelLabel: FIXTURE_BYOK_MODEL_LABEL,
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
