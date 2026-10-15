import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrivacyMode } from '@agiworkforce/types';

import { openNotificationRoute } from '../../notifications/notificationRoutes';
import { useNotificationTargetStore } from '../../notifications/notificationTarget';
import {
  DEVICE_AUTOMATION_PANELS,
  isDeviceAutomationPanel,
  isPanelAvailable,
  type V3Panel,
} from '../shellPanels';

const MODES: PrivacyMode[] = ['local', 'byok', 'managed'];

function lastPanelOpened(): unknown {
  const events = vi
    .mocked(window.dispatchEvent)
    .mock.calls.map(([event]) => event)
    .filter((event): event is CustomEvent => event.type === 'desktop:navigate-panel');
  return events.at(-1)?.detail;
}

beforeEach(() => {
  vi.mocked(window.dispatchEvent).mockClear();
  useNotificationTargetStore.setState({ pending: null });
});

describe('shell panel availability', () => {
  it.each(MODES)('keeps every device automation panel open in %s mode', (mode) => {
    for (const panel of DEVICE_AUTOMATION_PANELS) {
      expect(isPanelAvailable(panel, mode), `${panel} in ${mode}`).toBe(true);
    }
  });

  it.each([
    ['a fired trigger', 'trigger:trigger-7', 'automation'],
    ['a scheduled run', 'schedule:job-3', 'scheduled'],
    ['a background agent', 'background-agent:agent-1', 'agent-tasks'],
    ['an agent notice with no one agent', 'agent-tasks:all', 'agent-tasks'],
  ])(
    'the notice for %s opens a panel the shell shows in every mode',
    async (_what, route, panel) => {
      expect(await openNotificationRoute(route)).toBe(true);

      const opened = lastPanelOpened();
      expect(opened).toBe(panel);
      expect(isDeviceAutomationPanel(opened)).toBe(true);
      for (const mode of MODES) {
        expect(isPanelAvailable(opened as V3Panel, mode), `${panel} in ${mode}`).toBe(true);
      }
    },
  );

  it('still keeps the panels that need Local mode or a signed-in account to their modes', () => {
    for (const panel of ['artifacts', 'code', 'design', 'research', 'record-skill'] as const) {
      expect(isPanelAvailable(panel, 'local')).toBe(true);
      expect(isPanelAvailable(panel, 'byok')).toBe(false);
      expect(isPanelAvailable(panel, 'managed')).toBe(false);
    }
    for (const panel of ['library', 'tasks'] as const) {
      expect(isPanelAvailable(panel, 'local')).toBe(false);
      expect(isPanelAvailable(panel, 'byok')).toBe(true);
      expect(isPanelAvailable(panel, 'managed')).toBe(true);
    }
    expect(isPanelAvailable('cloud-schedules', 'managed')).toBe(true);
    expect(isPanelAvailable('cloud-schedules', 'byok')).toBe(false);
    expect(isPanelAvailable('cloud-schedules', 'local')).toBe(false);
    for (const mode of MODES) {
      expect(isPanelAvailable('chat', mode)).toBe(true);
      expect(isPanelAvailable('projects', mode)).toBe(true);
    }
  });

  it('does not treat another panel name as a device automation panel', () => {
    for (const other of ['chat', 'tasks', 'cloud-schedules', 'constructor', null, 7]) {
      expect(isDeviceAutomationPanel(other)).toBe(false);
    }
  });
});
