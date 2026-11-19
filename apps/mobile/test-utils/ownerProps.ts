interface InstanceWithProps {
  props: Record<string, unknown>;
  parent: InstanceWithProps | null;
}

type OwnerHandlerName = 'onPress' | 'onPressIn' | 'onPressOut' | 'onValueChange' | 'onChangeText';

export function ownerHandler(
  element: InstanceWithProps,
  name: OwnerHandlerName,
): (...args: unknown[]) => unknown {
  for (let node: InstanceWithProps | null = element; node; node = node.parent) {
    const handler = node.props[name];
    if (typeof handler === 'function') return handler as (...args: unknown[]) => unknown;
  }
  throw new Error(`No ${name} handler on the element or any ancestor`);
}
