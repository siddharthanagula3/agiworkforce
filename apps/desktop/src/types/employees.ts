/**
 * AI Employee Library Types
 * Defines all types for the employee marketplace and management system
 */

export type EmployeeRole =
  | 'SupportAgent'
  | 'SalesAgent'
  | 'Developer'
  | 'Operations'
  | 'Personal';

export interface AIEmployee {
  id: string;
  name: string;
  role: EmployeeRole;
  description: string;
  capabilities: string[];
  estimated_time_saved_per_run: number; // minutes
  estimated_cost_saved_per_run: number; // USD
  demo_workflow?: DemoWorkflow;
  required_integrations?: string[];
  is_verified: boolean;
  creator_id?: string;
  avg_rating: number;
  total_reviews: number;
  clone_count: number;
  is_hired?: boolean;
  monthly_price: number; // USD
  created_at: number;
  updated_at: number;
}

export interface DemoWorkflow {
  title: string;
  steps: DemoStep[];
  sample_input: string;
  expected_output: string;
  duration_seconds: number;
}

export interface DemoStep {
  action: string;
  description: string;
  duration_ms: number;
}

export interface DemoResult {
  employee_id: string;
  employee_name: string;
  time_saved_minutes: number;
  cost_saved_usd: number;
  quality_score: number;
  actions_taken: string[];
  sample_output: string;
  execution_time_ms: number;
  timestamp: number;
}

export interface EmployeeUsageStats {
  employee_id: string;
  user_id: string;
  total_runs: number;
  total_time_saved_minutes: number;
  total_cost_saved_usd: number;
  last_run_at?: number;
  hired_at: number;
}

export interface EmployeeSearchFilters {
  query?: string;
  role?: EmployeeRole | 'all';
  verified_only?: boolean;
  sort_by?: 'popular' | 'newest' | 'time_saved' | 'rating';
}
