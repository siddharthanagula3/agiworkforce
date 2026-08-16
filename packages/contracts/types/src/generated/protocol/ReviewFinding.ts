import type { ReviewCodeLocation } from './ReviewCodeLocation';

export type ReviewFinding = {
  title: string;
  body: string;
  confidence_score: number;
  priority: number;
  code_location: ReviewCodeLocation;
};
