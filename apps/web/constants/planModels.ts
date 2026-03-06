import type React from 'react';

// STUB FILE FOR WEB PORT COMPILATION
export const _stub = true;

export const LLM_MODELS: unknown[] = [];
export const PLAN_MODELS: unknown[] = [];

export const supabase = {} as any;

export type SubscriptionTier = 'free' | 'hobby' | 'pro' | 'max' | 'enterprise';

export interface PlanModel {
  id: string;
  name: string;
  tier: SubscriptionTier;
}

export const ThemeProvider = ({ children }: { children: React.ReactNode }) =>
  children as React.ReactElement;
export const useTheme = () => ({ theme: 'dark' as string, setTheme: (_t: string) => {} });
export const useThemeContext = () => ({ theme: 'dark' as string, setTheme: (_t: string) => {} });
