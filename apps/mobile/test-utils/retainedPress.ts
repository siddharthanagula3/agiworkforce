import type { ReactTestInstance } from 'react-test-renderer';

function isPressHandler(value: unknown): value is () => void {
  return typeof value === 'function';
}

// fireEvent refuses detached nodes before the app lifetime guard can run.
export function retainedPress(element: ReactTestInstance): () => void {
  let current: ReactTestInstance | null = element;
  while (current) {
    const handler: unknown = current.props.onPress;
    if (isPressHandler(handler)) return handler;
    current = current.parent;
  }
  throw new Error('No press handler on the selected control');
}
