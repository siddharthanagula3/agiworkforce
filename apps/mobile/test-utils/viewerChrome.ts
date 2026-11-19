import { StyleSheet, type ViewStyle } from 'react-native';
import type { ReactTestInstance } from 'react-test-renderer';

function edgeLength(value: ViewStyle[keyof ViewStyle]): number {
  return typeof value === 'number' ? value : 0;
}

function topSpacing(style: ViewStyle): number {
  const padding = style.paddingTop ?? style.paddingVertical ?? style.padding;
  const margin = style.marginTop ?? style.marginVertical ?? style.margin;
  return edgeLength(padding) + edgeLength(margin) + edgeLength(style.top);
}

/** Space laid out above a control by the host views around it, as a native layout would add it. */
export function spaceAbove(control: ReactTestInstance): number {
  let total = 0;
  let current = control.parent;
  while (current) {
    if (typeof current.type === 'string') {
      total += topSpacing((StyleSheet.flatten(current.props.style) ?? {}) as ViewStyle);
    }
    current = current.parent;
  }
  return total;
}

export function tapTarget(control: ReactTestInstance): { width: number; height: number } {
  const style = (StyleSheet.flatten(control.props.style) ?? {}) as ViewStyle;
  return {
    width: Math.max(edgeLength(style.width), edgeLength(style.minWidth)),
    height: Math.max(edgeLength(style.height), edgeLength(style.minHeight)),
  };
}
