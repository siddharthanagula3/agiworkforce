import type { ReviewFinding } from './ReviewFinding';

export type ReviewOutputEvent = {
  findings: Array<ReviewFinding>;
  overall_correctness: string;
  overall_explanation: string;
  overall_confidence_score: number;
};
