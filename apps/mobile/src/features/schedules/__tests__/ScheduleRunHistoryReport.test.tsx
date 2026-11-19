import { fireEvent, render } from '@testing-library/react-native';
import type { ScheduleRun } from '../store';

const mockReportSheet = jest.fn();
let mockRuns: ScheduleRun[] = [];

jest.mock('lucide-react-native', () => {
  const icon = jest.fn().mockReturnValue(null);
  return new Proxy({}, { get: (_target, name) => (name === '__esModule' ? true : icon) });
});

jest.mock('@/src/features/chat/components/ReportFlagButton', () => ({
  ReportSheet: (props: Record<string, unknown>) => {
    mockReportSheet(props);
    return null;
  },
}));

jest.mock('../store', () => ({
  useScheduleStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      fetchRuns: jest.fn(),
      getRuns: () => mockRuns,
      runsLoadingBySchedule: {},
      runsErrorBySchedule: {},
      approvalPendingByRun: {},
      resolveRunApproval: jest.fn(),
    }),
}));

import { ScheduleRunHistory } from '../components/ScheduleRunHistory';

function run(overrides: Partial<ScheduleRun>): ScheduleRun {
  return {
    id: 'run-1',
    scheduleId: 'schedule-1',
    status: 'success',
    startedAt: '2026-11-14T10:00:00.000Z',
    completedAt: '2026-11-14T10:00:05.000Z',
    result: null,
    error: null,
    timingNote: null,
    ...overrides,
  };
}

describe('reporting what a scheduled run wrote', () => {
  beforeEach(() => mockReportSheet.mockClear());

  it('reports a run result, naming the run and its schedule', () => {
    mockRuns = [
      run({ id: 'run-1', result: 'Here is your morning briefing.' }),
      run({ id: 'run-2', status: 'failed', error: 'Timed out' }),
    ];
    const screen = render(<ScheduleRunHistory scheduleId="schedule-1" />);

    expect(screen.getAllByLabelText('Report this run')).toHaveLength(1);
    expect(screen.queryByTestId('schedule-run-report-run-2')).toBeNull();

    fireEvent.press(screen.getByTestId('schedule-run-report-run-1'));

    expect(mockReportSheet).toHaveBeenLastCalledWith(
      expect.objectContaining({
        visible: true,
        title: 'Report this run',
        target: {
          messageId: 'schedule-run:run-1',
          conversationId: 'schedule:schedule-1',
          contentExcerpt: 'Here is your morning briefing.',
          subject: { kind: 'schedule-run', id: 'run-1' },
        },
      }),
    );
  });
});
