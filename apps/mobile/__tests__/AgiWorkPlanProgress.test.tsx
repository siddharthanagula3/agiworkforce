import { ActivityIndicator } from 'react-native';
import { fireEvent, render, screen, within } from '@testing-library/react-native';
import { AgiWorkPlanReview } from '@/src/features/chat/components/AgiWorkPlanReview';
import type { AgiWorkPlanStep } from '@/src/features/chat/utils/agiWorkPlan';

jest.mock('lucide-react-native', () => {
  const RN = jest.requireActual<typeof import('react-native')>('react-native');
  return new Proxy(
    {},
    {
      get: (_target, name) =>
        function Icon() {
          return <RN.View testID={`icon:${String(name)}`} />;
        },
    },
  );
});

const STEPS: AgiWorkPlanStep[] = [
  { id: 's1', description: 'Collect the figures', status: 'completed' },
  { id: 's2', description: 'Draft the summary', status: 'completed' },
  { id: 's3', description: 'Build the chart', status: 'in_progress' },
  { id: 's4', description: 'Check the totals', status: 'pending' },
  { id: 's5', description: 'Send the file', status: 'pending' },
];

function show(
  steps: readonly AgiWorkPlanStep[],
  options: { runFinished?: boolean; onDecision?: jest.Mock } = {},
) {
  return render(
    <AgiWorkPlanReview
      steps={steps}
      awaitingApproval={false}
      runFinished={options.runFinished ?? false}
      busy={false}
      onDecision={options.onDecision ?? jest.fn()}
    />,
  );
}

describe('the plan under an answer while its run is going', () => {
  it('lists every step read only, numbered, with its status as the accessibility value', () => {
    show(STEPS);

    expect(screen.getByText('Plan · 2 of 5 done')).toBeOnTheScreen();
    const expected = ['Done', 'Done', 'In progress', 'Not started', 'Not started'];
    expected.forEach((status, index) => {
      const row = screen.getByTestId(`agiwork-plan-step-${index}`);
      expect(row.props.accessibilityLabel).toBe(`${index + 1}. ${STEPS[index]!.description}`);
      expect(row.props.accessibilityValue).toEqual({ text: status });
    });
    expect(screen.queryByRole('button', { name: 'Remove this step' })).toBeNull();
    expect(screen.queryByTestId('agiwork-plan-start')).toBeNull();
    expect(screen.queryByTestId('agiwork-plan-retry')).toBeNull();
  });

  it('draws a hollow circle, a spinner, a check, a red cross and a stop square by status', () => {
    show([
      { id: 's1', description: 'First', status: 'pending' },
      { id: 's2', description: 'Second', status: 'in_progress' },
      { id: 's3', description: 'Third', status: 'completed' },
      { id: 's4', description: 'Fourth', status: 'failed' },
      { id: 's5', description: 'Fifth', status: 'cancelled' },
    ]);

    const glyph = (index: number) => within(screen.getByTestId(`agiwork-plan-step-${index}`));
    expect(glyph(0).getByTestId('icon:Circle')).toBeOnTheScreen();
    expect(glyph(1).UNSAFE_getByType(ActivityIndicator)).toBeTruthy();
    expect(glyph(2).getByTestId('icon:Check')).toBeOnTheScreen();
    expect(glyph(3).getByTestId('icon:X')).toBeOnTheScreen();
    expect(glyph(4).getByTestId('icon:Square')).toBeOnTheScreen();
  });

  it('counts only finished steps and reports a failed or stopped step with its own value', () => {
    show([
      { id: 's1', description: 'First', status: 'completed' },
      { id: 's2', description: 'Second', status: 'failed' },
      { id: 's3', description: 'Third', status: 'cancelled' },
    ]);

    expect(screen.getByText('Plan · 1 of 3 done')).toBeOnTheScreen();
    expect(screen.getByTestId('agiwork-plan-step-1').props.accessibilityValue).toEqual({
      text: 'Failed',
    });
    expect(screen.getByTestId('agiwork-plan-step-2').props.accessibilityValue).toEqual({
      text: 'Stopped',
    });
  });

  it('collapses and expands from its header', () => {
    show(STEPS);
    const header = screen.getByRole('button', { name: 'Plan · 2 of 5 done' });
    expect(header.props.accessibilityState).toMatchObject({ expanded: true });

    fireEvent.press(header);
    expect(screen.queryByTestId('agiwork-plan-step-0')).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Plan · 2 of 5 done' }).props.accessibilityState,
    ).toMatchObject({ expanded: false });

    fireEvent.press(screen.getByRole('button', { name: 'Plan · 2 of 5 done' }));
    expect(screen.getByTestId('agiwork-plan-step-0')).toBeOnTheScreen();
  });

  it('starts collapsed once the run has finished, and folds up when it finishes', () => {
    const view = show(STEPS);
    expect(screen.getByTestId('agiwork-plan-step-0')).toBeOnTheScreen();

    view.rerender(
      <AgiWorkPlanReview
        steps={STEPS}
        awaitingApproval={false}
        runFinished
        busy={false}
        onDecision={jest.fn()}
      />,
    );
    expect(screen.queryByTestId('agiwork-plan-step-0')).toBeNull();
    expect(screen.getByText('Plan · 2 of 5 done')).toBeOnTheScreen();
  });

  it('shows a step still in progress as stopped once its run has ended, and offers a retry', () => {
    const onDecision = jest.fn();
    show(STEPS, { runFinished: true, onDecision });

    fireEvent.press(screen.getByRole('button', { name: 'Plan · 2 of 5 done' }));

    const row = screen.getByTestId('agiwork-plan-step-2');
    expect(row.props.accessibilityValue).toEqual({ text: 'Stopped' });
    expect(within(row).getByTestId('icon:Square')).toBeOnTheScreen();
    expect(screen.UNSAFE_queryByType(ActivityIndicator)).toBeNull();

    fireEvent.press(screen.getByRole('button', { name: 'Retry from this step' }));
    expect(onDecision).toHaveBeenCalledWith({ kind: 'retry', fromIndex: 2 });
  });

  it('keeps Retry from this step under the list when the run ends on a failed step', () => {
    const onDecision = jest.fn();
    show(
      [
        { id: 's1', description: 'First', status: 'completed' },
        { id: 's2', description: 'Second', status: 'failed' },
      ],
      { runFinished: true, onDecision },
    );

    fireEvent.press(screen.getByRole('button', { name: 'Retry from this step' }));

    expect(onDecision).toHaveBeenCalledWith({ kind: 'retry', fromIndex: 1 });
  });

  it('renders nothing for an empty plan', () => {
    show([]);

    expect(screen.queryByTestId('agiwork-plan-run')).toBeNull();
    expect(screen.queryByText(/Plan ·/)).toBeNull();
  });
});
