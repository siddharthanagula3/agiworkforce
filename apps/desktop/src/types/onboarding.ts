/**
 * Onboarding Types
 * Defines all types for the instant demo and onboarding experience
 */

export type UserRole =
  | 'founder'
  | 'developer'
  | 'operations'
  | 'sales_marketing'
  | 'designer'
  | 'personal';

export interface RoleOption {
  id: UserRole;
  title: string;
  icon: string;
  description: string;
  perfectFor: string;
  recommendedEmployees: string[];
}

export interface OnboardingDemo {
  id: string;
  title: string;
  description: string;
  roleId: UserRole;
  estimatedTimeSeconds: number;
  valueSavedMinutes: number;
  valueSavedUsd: number;
  employeeId: string;
  employeeName: string;
  isPopular?: boolean;
  steps: DemoStep[];
}

export interface DemoStep {
  id: string;
  action: string;
  description: string;
  durationMs: number;
}

export interface DemoProgress {
  currentStep: number;
  totalSteps: number;
  currentAction: string;
  completed: boolean;
  timeElapsedMs: number;
}

export interface DemoResult {
  employeeId: string;
  employeeName: string;
  taskDescription: string;
  inputSummary: string;
  outputSummary: string;
  actionsTaken: string[];
  timeSavedMinutes: number;
  costSavedUsd: number;
  qualityScore: number;
  completionTimeSeconds: number;
}

export interface OnboardingSettings {
  llmProvider: 'ollama' | 'openai' | 'anthropic' | 'google';
  notificationsEnabled: boolean;
  autoApproveEnabled: boolean;
}

export interface OnboardingState {
  currentStep: number;
  totalSteps: number;
  selectedRole: UserRole | null;
  selectedDemo: string | null;
  demoRunning: boolean;
  demoProgress: DemoProgress | null;
  demoResult: DemoResult | null;
  onboardingComplete: boolean;
  settings: OnboardingSettings;
  startTime: number;
  timeToValueSeconds: number;
}
