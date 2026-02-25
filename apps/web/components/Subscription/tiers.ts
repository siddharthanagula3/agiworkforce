export type PlanTier = 'free' | 'hobby' | 'pro' | 'max' | 'enterprise';

export const TIER_RANK: Record<PlanTier, number> = {
  free: 0,
  hobby: 1,
  pro: 2,
  max: 3,
  enterprise: 4,
};

export const TIER_LABEL: Record<PlanTier, string> = {
  free: 'Free',
  hobby: 'Hobby',
  pro: 'Pro',
  max: 'Max',
  enterprise: 'Enterprise',
};
