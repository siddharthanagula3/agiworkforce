export type SearchAllowance =
  | { status: 'available' | 'exhausted'; used: number; limit: number; windowDays: number }
  | { status: 'unknown'; limit: number; windowDays: number }
  | { status: 'paid' };
