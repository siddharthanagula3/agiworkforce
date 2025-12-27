export interface User {
  id: string;
  email: string;
  name?: string;
  avatar_url?: string;
}

export interface Subscription {
  id: string;
  user_id: string;
  status: 'active' | 'trialing' | 'past_due' | 'canceled' | 'incomplete';
  stripe_price_id: string;
  quantity: number;
  cancel_at_period_end: boolean;
  current_period_start: string;
  current_period_end: string;
  created: string;
  ended_at?: string;
  trial_start?: string;
  trial_end?: string;
}
