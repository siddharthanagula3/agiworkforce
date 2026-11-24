import { Modal, StyleSheet } from 'react-native';
import type { ReactTestInstance } from 'react-test-renderer';

import { contentColumn, type ContentColumnKind } from '../src/shared/layout/contentColumn';

export function sitsInColumn(node: ReactTestInstance | null, kind: ContentColumnKind): boolean {
  const column = contentColumn(kind);
  for (let current = node; current && current.type !== Modal; current = current.parent) {
    const style = StyleSheet.flatten(current.props.style);
    if (style?.width === column.width && style.maxWidth === column.maxWidth) return true;
  }
  return false;
}

export function insetHasPanelBackground(node: ReactTestInstance, backgroundColor: string): boolean {
  let foundBottomInset = false;
  for (let current: ReactTestInstance | null = node; current; current = current.parent) {
    const edges = current.props.edges;
    foundBottomInset ||= Array.isArray(edges) && edges.includes('bottom');
    if (StyleSheet.flatten(current.props.style)?.backgroundColor === backgroundColor) {
      return foundBottomInset;
    }
  }
  return false;
}

export function insetAbove(node: ReactTestInstance | null): number | undefined {
  for (let current = node; current; current = current.parent) {
    const margin = StyleSheet.flatten(current.props.style)?.marginHorizontal;
    if (typeof margin === 'number') return margin;
  }
  return undefined;
}
