/* eslint-disable @typescript-eslint/no-require-imports */

import React from 'react';
import { render } from '@testing-library/react-native';
import type { AgentActivityState, AgentActivityToolEntry } from '@agiworkforce/client-runtime';

jest.mock('@/src/ui/theme', () => {
  const actual = jest.requireActual('@/src/ui/theme/tokens');
  return { ...actual, useThemeColors: () => actual.lightColors };
});

jest.mock('@/components/ui/Text', () => {
  const RN = require('react-native');
  const Text = (props: Record<string, unknown>) => <RN.Text {...props} />;
  Text.displayName = 'Text';
  return { Text };
});

jest.mock('lucide-react-native', () => {
  const RN = require('react-native');
  const icons = new Map<string, unknown>();
  return new Proxy(
    {},
    {
      get: (_target, name) => {
        if (name === '__esModule') return true;
        const key = String(name);
        if (!icons.has(key)) {
          const Icon = (props: Record<string, unknown>) => (
            <RN.View testID={`icon-${key}`} {...props} />
          );
          Icon.displayName = key;
          icons.set(key, Icon);
        }
        return icons.get(key);
      },
    },
  );
});

import {
  AgentActivityTimeline,
  activityToolIcon,
  screenStepAction,
} from '@/src/features/chat/components/AgentActivityTimeline';

function step(overrides: Partial<AgentActivityToolEntry>): AgentActivityToolEntry {
  return {
    kind: 'tool',
    id: 'tool:c1',
    toolCallId: 'c1',
    name: 'lookup',
    category: 'other',
    summary: 'Working on it',
    status: 'completed',
    startedAtMs: 1_000,
    completedAtMs: 1_500,
    ...overrides,
  };
}

function run(entries: AgentActivityToolEntry[]): AgentActivityState {
  return {
    schemaVersion: 1,
    sessionId: 's',
    turnId: 't',
    lastSequence: entries.length,
    status: 'completed',
    startedAtMs: 1_000,
    updatedAtMs: 2_000,
    completedAtMs: 2_000,
    entries,
  };
}

function iconName(entry: Partial<AgentActivityToolEntry>): string | undefined {
  return (activityToolIcon(step(entry)) as { displayName?: string }).displayName;
}

describe('activity step icons', () => {
  it('pick the icon from the step category, as web does', () => {
    expect(iconName({ name: 'lookup', category: 'web-search' })).toBe('Search');
    expect(iconName({ name: 'lookup', category: 'web-fetch' })).toBe('Globe');
    expect(iconName({ name: 'lookup', category: 'code-execution' })).toBe('Terminal');
    expect(iconName({ name: 'lookup', category: 'filesystem' })).toBe('Folder');
    expect(iconName({ name: 'lookup', category: 'connector' })).toBe('Plug');
    expect(iconName({ name: 'lookup', category: 'computer-use' })).toBe('MousePointerClick');
    expect(iconName({ name: 'lookup', category: 'skill' })).toBe('BookOpen');
  });

  it('fall back to the tool name when the category says nothing', () => {
    expect(iconName({ name: 'Grep', category: 'other' })).toBe('Search');
    expect(iconName({ name: 'Bash', category: 'memory' })).toBe('Terminal');
    expect(iconName({ name: 'lookup', category: 'other' })).toBe('Wrench');
  });
});

describe('a computer-use step', () => {
  it('says what it did from its own arguments, and on which device', () => {
    const click = step({
      name: 'device_click',
      category: 'computer-use',
      summary: 'Using the computer',
      input: { x: 120, y: 48, count: 2 },
      deviceStep: { deviceId: 'd1', deviceName: 'Studio Mac', expiresAtMs: 9_000 },
    });
    expect(screenStepAction(click)).toBe('Double-clicked at 120, 48');
    const view = render(
      <AgentActivityTimeline messageId="m1" defaultExpanded activity={run([click])} />,
    );
    expect(view.getByTestId('agent-activity.screen-step')).toBeTruthy();
    expect(view.getByText('Double-clicked at 120, 48 on Studio Mac')).toBeTruthy();
  });

  it('adds no action line to other steps or to unknown device tools', () => {
    expect(screenStepAction(step({ name: 'device_click', category: 'other' }))).toBeNull();
    expect(screenStepAction(step({ name: 'device_unknown', category: 'computer-use' }))).toBeNull();
    const view = render(
      <AgentActivityTimeline
        messageId="m2"
        defaultExpanded
        activity={run([step({ category: 'web-search' })])}
      />,
    );
    expect(view.queryByTestId('agent-activity.screen-step')).toBeNull();
  });
});
