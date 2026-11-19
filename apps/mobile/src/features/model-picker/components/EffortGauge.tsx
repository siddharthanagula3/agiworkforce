import Svg, { Line, Path } from 'react-native-svg';
import type { Effort } from '@agiworkforce/types';
import { EFFORT_STEP_ORDER } from './EffortSlider';

const VIEW_BOX = '0 0 24 24';
const DIAL_ARC = 'M3.34 19a10 10 0 1 1 17.32 0';
const PIVOT_X = 12;
const PIVOT_Y = 14;
const NEEDLE_LENGTH = 6;
const STROKE_WIDTH = 2;
const NEEDLE_SWEEP_DEGREES = 180;
const COORDINATE_PRECISION = 100;

export function effortGaugeAngle(effort: Effort): number {
  const highestIndex = EFFORT_STEP_ORDER.length - 1;
  return (EFFORT_STEP_ORDER.indexOf(effort) / highestIndex) * NEEDLE_SWEEP_DEGREES;
}

function roundCoordinate(value: number): number {
  return Math.round(value * COORDINATE_PRECISION) / COORDINATE_PRECISION;
}

interface EffortGaugeProps {
  effort: Effort;
  size: number;
  color: string;
  testID?: string;
}

export function EffortGauge({ effort, size, color, testID }: EffortGaugeProps) {
  const radians = (effortGaugeAngle(effort) * Math.PI) / 180;
  const stroke = {
    stroke: color,
    strokeWidth: STROKE_WIDTH,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    fill: 'none',
  } as const;
  return (
    <Svg width={size} height={size} viewBox={VIEW_BOX} fill="none">
      <Path d={DIAL_ARC} {...stroke} />
      <Line
        testID={testID ? `${testID}-needle` : undefined}
        x1={PIVOT_X}
        y1={PIVOT_Y}
        x2={roundCoordinate(PIVOT_X - NEEDLE_LENGTH * Math.cos(radians))}
        y2={roundCoordinate(PIVOT_Y - NEEDLE_LENGTH * Math.sin(radians))}
        {...stroke}
      />
    </Svg>
  );
}
