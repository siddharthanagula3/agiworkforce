import React from 'react';
import { StyleSheet } from 'react-native';
import 'react-native-gesture-handler/jestSetup';
import { act, fireEvent, render, renderHook } from '@testing-library/react-native';
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';
import { EFFORT_LABEL, getModelReasoning, type Effort } from '@agiworkforce/types';
import { requireCatalogModel } from '@/test-utils/modelFixtures';
import {
  ComposerEffortButton,
  ComposerEffortPanel,
  useComposerEffort,
} from '@/src/features/chat/components/ComposerEffort';
import { effortGaugeAngle } from '@/src/features/model-picker/components/EffortGauge';
import { effortStepsForModel } from '@/src/features/model-picker/components/EffortSlider';
import { useThemeColors } from '@/src/ui/theme';
import { useAgentControlStore } from '@/stores/agentControlStore';
import { useSettingsStore } from '@/stores/settingsStore';

const ALL_EFFORTS = Object.keys(EFFORT_LABEL) as Effort[];

const effortModel = requireCatalogModel((model) => {
  const count = effortStepsForModel(model.id).length;
  return count > 2 && count < ALL_EFFORTS.length;
}, 'model that offers some but not all effort levels');
const plainModel = requireCatalogModel(
  (model) => effortStepsForModel(model.id).length === 0,
  'model with no effort levels',
);
const steps = effortStepsForModel(effortModel.id);
const lowest = steps[0]!;
const highest = steps[steps.length - 1]!;

function Composer({ modelId, conversationId }: { modelId: string; conversationId?: string }) {
  const effort = useComposerEffort(modelId, conversationId);
  const [open, setOpen] = React.useState(false);
  if (!effort.value) return null;
  return open ? (
    <ComposerEffortPanel
      steps={effort.steps}
      value={effort.value}
      onChange={effort.select}
      onDone={() => setOpen(false)}
    />
  ) : (
    <ComposerEffortButton effort={effort.value} onPress={() => setOpen(true)} />
  );
}

function needleTip(effort: Effort) {
  const { getByTestId, unmount } = render(
    <ComposerEffortButton effort={effort} onPress={() => {}} />,
  );
  const { x1, y1, x2, y2 } = getByTestId('chat.composer.effort-gauge-needle').props;
  unmount();
  return { dx: Number(x2) - Number(x1), dy: Number(y2) - Number(y1) };
}

describe('composer effort control', () => {
  beforeEach(() => {
    useAgentControlStore.setState({ byConversation: {}, byProject: {} });
    useSettingsStore.setState({ hapticsEnabled: false });
  });

  it('offers nothing for a model with no effort levels', () => {
    const { queryByTestId } = render(<Composer modelId={plainModel.id} />);

    expect(queryByTestId('chat.composer.effort')).toBeNull();
  });

  it('names the level the next message carries on the button', () => {
    useAgentControlStore.getState().setProjectDefault('__default__', { effort: highest });

    const { getByTestId } = render(<Composer modelId={effortModel.id} />);

    expect(getByTestId('chat.composer.effort').props.accessibilityLabel).toBe(
      `Reasoning effort: ${EFFORT_LABEL[highest]}`,
    );
  });

  it('lays the gauge needle flat to the left at the lowest level and flat to the right at the highest', () => {
    const first = needleTip(ALL_EFFORTS[0]!);
    const last = needleTip(ALL_EFFORTS[ALL_EFFORTS.length - 1]!);

    expect(first.dx).toBeLessThan(0);
    expect(first.dy).toBe(0);
    expect(last.dx).toBe(-first.dx);
    expect(last.dy).toBe(0);
  });

  it('turns the gauge needle by the same amount for each level, from 0 to 180 degrees', () => {
    const angles = ALL_EFFORTS.map(effortGaugeAngle);
    const step = 180 / (ALL_EFFORTS.length - 1);

    expect(angles).toEqual(ALL_EFFORTS.map((_, index) => index * step));
  });

  it('sweeps the gauge needle over the top, further right with each level', () => {
    const tips = ALL_EFFORTS.map(needleTip);

    for (const tip of tips.slice(1, -1)) {
      expect(tip.dy).toBeLessThan(0);
    }
    tips.slice(1).forEach((tip, index) => {
      expect(tip.dx).toBeGreaterThan(tips[index]!.dx);
    });
  });

  it("shows the model's own default when the saved level is one it does not offer", () => {
    const unsupported = ALL_EFFORTS.find((effort) => !steps.includes(effort))!;
    const modelDefault = getModelReasoning(effortModel.id).defaultEffort as Effort | undefined;
    const expected = modelDefault && steps.includes(modelDefault) ? modelDefault : lowest;
    useAgentControlStore.getState().setProjectDefault('__default__', { effort: unsupported });

    const { getByTestId } = render(<Composer modelId={effortModel.id} />);

    expect(getByTestId('chat.composer.effort').props.accessibilityLabel).toBe(
      `Reasoning effort: ${EFFORT_LABEL[expected]}`,
    );
  });

  it('opens the slider with the level name above it and saves a new level for new chats', () => {
    useAgentControlStore.getState().setProjectDefault('__default__', { effort: highest });
    const { getByTestId, getByLabelText } = render(<Composer modelId={effortModel.id} />);

    fireEvent.press(getByTestId('chat.composer.effort'));

    expect(getByTestId('chat.composer.effort-level').props.children).toBe(EFFORT_LABEL[highest]);
    expect(
      getByLabelText(`Reasoning effort ${EFFORT_LABEL[highest]}`).props.accessibilityState.selected,
    ).toBe(true);

    fireEvent.press(getByTestId(`chat.composer.effort-slider-${lowest}`));

    expect(getByTestId('chat.composer.effort-level').props.children).toBe(EFFORT_LABEL[lowest]);
    expect(useAgentControlStore.getState().byProject.__default__?.effort).toBe(lowest);
    expect(useAgentControlStore.getState().byConversation).toEqual({});
  });

  it('saves the level on the open conversation and leaves the default alone', () => {
    const { getByTestId } = render(
      <Composer modelId={effortModel.id} conversationId="conversation-1" />,
    );

    fireEvent.press(getByTestId('chat.composer.effort'));
    fireEvent.press(getByTestId(`chat.composer.effort-slider-${highest}`));

    expect(useAgentControlStore.getState().resolve('conversation-1', null).effort).toBe(highest);
    expect(useAgentControlStore.getState().byProject).toEqual({});
  });

  it('fills the track from the left edge up to the chosen level', () => {
    useAgentControlStore.getState().setProjectDefault('__default__', { effort: highest });
    const { getByTestId, queryByTestId } = render(<Composer modelId={effortModel.id} />);
    fireEvent.press(getByTestId('chat.composer.effort'));

    fireEvent(getByTestId('chat.composer.effort-slider-capsule'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 300, height: 36 } },
    });

    expect(getByTestId('chat.composer.effort-slider-fill')).toHaveStyle({ left: 4, width: 292 });
    expect(queryByTestId(`chat.composer.effort-slider-${highest}-dot`)).toBeNull();
    expect(getByTestId(`chat.composer.effort-slider-${lowest}-dot`)).toBeTruthy();

    fireEvent.press(getByTestId(`chat.composer.effort-slider-${lowest}`));

    expect(getByTestId('chat.composer.effort-slider-fill')).toHaveStyle({ left: 4, width: 28 });
  });

  it('draws the bar as tall as the tick circle beside it, with the handle inside the bar', () => {
    const { getByTestId } = render(<Composer modelId={effortModel.id} />);
    fireEvent.press(getByTestId('chat.composer.effort'));
    fireEvent(getByTestId('chat.composer.effort-slider-capsule'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 300, height: 36 } },
    });

    const heightOf = (testID: string) =>
      Number(StyleSheet.flatten(getByTestId(testID).props.style).height);
    const bar = heightOf('chat.composer.effort-slider-capsule');

    expect(bar).toBe(heightOf('chat.composer.effort-done-circle'));
    expect(heightOf('chat.composer.effort-slider-fill')).toBeLessThan(bar);
    expect(heightOf('chat.composer.effort-slider-touch')).toBeGreaterThanOrEqual(44);
  });

  it('keeps the levels the fill covers visible on it', () => {
    const { result } = renderHook(() => useThemeColors());
    useAgentControlStore.getState().setProjectDefault('__default__', { effort: highest });
    const { getByTestId } = render(<Composer modelId={effortModel.id} />);
    fireEvent.press(getByTestId('chat.composer.effort'));
    fireEvent(getByTestId('chat.composer.effort-slider-capsule'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 300, height: 36 } },
    });

    expect(getByTestId('chat.composer.effort-slider-fill')).toHaveStyle({
      backgroundColor: result.current.textPrimary,
    });
    expect(getByTestId(`chat.composer.effort-slider-${lowest}-dot`)).toHaveStyle({
      backgroundColor: result.current.surfaceBase,
    });

    fireEvent.press(getByTestId(`chat.composer.effort-slider-${lowest}`));

    expect(getByTestId(`chat.composer.effort-slider-${highest}-dot`)).toHaveStyle({
      backgroundColor: result.current.textMuted,
    });
  });

  it('follows a drag along the track to the nearest level', () => {
    useAgentControlStore.getState().setProjectDefault('__default__', { effort: lowest });
    const { getByTestId } = render(<Composer modelId={effortModel.id} />);
    fireEvent.press(getByTestId('chat.composer.effort'));
    fireEvent(getByTestId('chat.composer.effort-slider-capsule'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 300, height: 36 } },
    });

    act(() => {
      fireGestureHandler(getByGestureTestId('chat.composer.effort-slider-drag'), [
        { x: 20 },
        { x: 150 },
        { x: 295 },
        { x: 295 },
      ]);
    });

    expect(useAgentControlStore.getState().byProject.__default__?.effort).toBe(highest);
    expect(getByTestId('chat.composer.effort-level').props.children).toBe(EFFORT_LABEL[highest]);
  });

  it('closes on Done and returns to the button', () => {
    const { getByTestId, queryByTestId } = render(<Composer modelId={effortModel.id} />);

    fireEvent.press(getByTestId('chat.composer.effort'));
    fireEvent.press(getByTestId('chat.composer.effort-done'));

    expect(queryByTestId('chat.composer.effort-panel')).toBeNull();
    expect(getByTestId('chat.composer.effort')).toBeTruthy();
  });
});
