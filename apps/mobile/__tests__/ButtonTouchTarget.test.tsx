import { render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import type { ReactTestInstance } from 'react-test-renderer';
import { Button } from '@/components/ui/Button';

const MINIMUM_TARGET = 44;
const SIZES = ['sm', 'md', 'lg'] as const;

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

function smallestTouchBox(node: ReactTestInstance): { width: number; height: number } {
  const style = StyleSheet.flatten(node.props.style) ?? {};
  const slop = slopEdges(node.props.hitSlop);
  return {
    width: (style.width ?? style.minWidth ?? 0) + slop.x,
    height: (style.height ?? style.minHeight ?? 0) + slop.y,
  };
}

describe('shared Button touch target', () => {
  it.each(SIZES)('reaches 44 by 44 points at size %s even with the shortest title', (size) => {
    const { getByLabelText } = render(<Button title="OK" size={size} onPress={jest.fn()} />);
    const { width, height } = smallestTouchBox(getByLabelText('OK'));

    expect(`${size} width ${width}`).toBe(`${size} width ${Math.max(width, MINIMUM_TARGET)}`);
    expect(`${size} height ${height}`).toBe(`${size} height ${Math.max(height, MINIMUM_TARGET)}`);
  });

  it('keeps a caller hit area that is larger than the minimum', () => {
    const { getByLabelText } = render(
      <Button title="OK" size="sm" hitSlop={12} onPress={jest.fn()} />,
    );

    expect(getByLabelText('OK').props.hitSlop).toBe(12);
  });
});
