import Svg, { Path } from 'react-native-svg';
import providerMarks from '@/assets/provider-marks.json';

const MARK_PATHS = new Map<string, string>(Object.entries(providerMarks.paths));

export function hasProviderMark(provider: string): boolean {
  return MARK_PATHS.has(provider);
}

export function ProviderMark({
  provider,
  size,
  color,
}: {
  provider: string;
  size: number;
  color: string;
}) {
  const path = MARK_PATHS.get(provider);
  if (!path) return null;
  return (
    <Svg
      testID={`provider-mark-${provider}`}
      width={size}
      height={size}
      viewBox={providerMarks.viewBox}
      accessibilityElementsHidden
      importantForAccessibility="no"
    >
      <Path d={path} fill={color} />
    </Svg>
  );
}
