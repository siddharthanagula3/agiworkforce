import { MAX_DEVICE_STEP_OUTPUT_LENGTH } from '@agiworkforce/cloud-contracts';

const mockGetCalendars = jest.fn();
const mockGetEvents = jest.fn();

jest.mock('expo-calendar/legacy', () => ({
  EntityTypes: { EVENT: 'event' },
  EventStatus: { CANCELED: 'canceled' },
  Availability: { FREE: 'free', BUSY: 'busy' },
  getCalendarPermissionsAsync: async () => ({ granted: true, canAskAgain: true }),
  requestCalendarPermissionsAsync: async () => ({ granted: true, canAskAgain: true }),
  getCalendarsAsync: () => mockGetCalendars(),
  getEventsAsync: (...args: unknown[]) => mockGetEvents(...args),
}));

jest.mock('@/lib/deviceId', () => ({ getDeviceId: async () => 'this-phone' }));

import { runPhoneDeviceStep } from '../src/features/integrations/services/phoneDeviceSteps';

function availability(start: string, end: string) {
  return runPhoneDeviceStep({
    toolCallId: 'call-1',
    name: 'device_calendar_availability',
    deviceId: 'this-phone',
    input: { start, end },
  });
}

function separateEvents(count: number) {
  const first = new Date(2030, 0, 2, 0, 0).getTime();
  return Array.from({ length: count }, (_, index) => {
    const startMs = first + index * 2 * 60 * 60 * 1000;
    return {
      id: `event-${index}`,
      calendarId: 'cal',
      title: `Event ${index}`,
      startDate: new Date(startMs).toISOString(),
      endDate: new Date(startMs + 60 * 60 * 1000).toISOString(),
      status: 'confirmed',
      availability: 'busy',
    };
  });
}

beforeEach(() => {
  mockGetCalendars.mockResolvedValue([{ id: 'cal', title: 'Home' }]);
});

afterEach(() => {
  jest.clearAllMocks();
});

describe('phone calendar availability result size', () => {
  it('returns busy and free spans when they fit the device result contract', async () => {
    mockGetEvents.mockResolvedValue(separateEvents(3));

    const outcome = await availability('2030-01-02T00:00', '2030-01-03T00:00');

    expect(outcome.isError).toBe(false);
    expect(outcome.content.length).toBeLessThanOrEqual(MAX_DEVICE_STEP_OUTPUT_LENGTH);
    expect(JSON.parse(outcome.content).busy).toHaveLength(3);
  });

  it('reports a too-dense range as an error instead of an oversized success', async () => {
    mockGetEvents.mockResolvedValue(separateEvents(500));

    const outcome = await availability('2030-01-02T00:00', '2030-02-01T00:00');

    expect(outcome.isError).toBe(true);
    expect(outcome.content.length).toBeLessThanOrEqual(MAX_DEVICE_STEP_OUTPUT_LENGTH);
    expect(outcome.content).toContain('shorter range');
    expect(outcome.content).not.toContain('"busy"');
  });
});
