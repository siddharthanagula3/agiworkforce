import { render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import type { ReactTestInstance } from 'react-test-renderer';
import { ModeToggle } from '../src/features/chat/components/ModeToggle';
import { TemporaryChatToggle } from '../src/features/chat/components/TemporaryChatToggle';
import { DrawerButton } from '../src/shared/components/DrawerButton';

const MINIMUM_TARGET = 44;

function slopEdges(hitSlop: unknown): { x: number; y: number } {
  if (typeof hitSlop === 'number') return { x: hitSlop * 2, y: hitSlop * 2 };
  if (hitSlop && typeof hitSlop === 'object') {
    const box = hitSlop as Record<string, number | undefined>;
    return {
      x: (box.left ?? 0) + (box.right ?? 0),
      y: (box.top ?? 0) + (box.bottom ?? 0),
    };
  }
  return { x: 0, y: 0 };
}

// Measures the touch box the way iOS does: the laid-out frame plus hitSlop.
// A control that only looks big enough because of the icon inside it fails.
function touchSize(node: ReactTestInstance): { width: number; height: number } {
  const rawStyle = node.props.style;
  const resolved = typeof rawStyle === 'function' ? rawStyle({ pressed: false }) : rawStyle;
  const style = StyleSheet.flatten(resolved) ?? {};
  const slop = slopEdges(node.props.hitSlop);
  const paddingY = (style.paddingVertical ?? style.padding ?? 0) * 2;
  const paddingX = (style.paddingHorizontal ?? style.padding ?? 0) * 2;
  const iconBox = 16;
  return {
    width: (style.width ?? style.minWidth ?? paddingX + iconBox) + slop.x,
    height: (style.height ?? style.minHeight ?? paddingY + iconBox) + slop.y,
  };
}

function expectMeetsMinimum(node: ReactTestInstance, name: string) {
  const { width, height } = touchSize(node);
  expect(`${name} width ${width}`).toBe(`${name} width ${Math.max(width, MINIMUM_TARGET)}`);
  expect(`${name} height ${height}`).toBe(`${name} height ${Math.max(height, MINIMUM_TARGET)}`);
}

describe('chat header touch targets', () => {
  it('gives the execution-mode toggle the same reachable target on both halves', () => {
    const { getByTestId } = render(
      <ModeToggle mode="local" compact onTapLocal={jest.fn()} onTapCloud={jest.fn()} />,
    );

    expectMeetsMinimum(getByTestId('chat.mode-toggle.local'), 'Local segment');
    expectMeetsMinimum(getByTestId('chat.mode-toggle.cloud'), 'Cloud segment');
  });

  it('gives the temporary-chat toggle a reachable target', () => {
    const { getByLabelText } = render(<TemporaryChatToggle />);
    expectMeetsMinimum(getByLabelText('Enable temporary chat'), 'Temporary chat toggle');
  });

  it('gives the drawer button a reachable target', () => {
    const { getByLabelText } = render(<DrawerButton onPress={jest.fn()} />);
    expectMeetsMinimum(getByLabelText('Open navigation drawer'), 'Drawer button');
  });
});
