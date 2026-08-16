import type { GranularApprovalConfig } from './GranularApprovalConfig';

export type AskForApproval =
  | 'untrusted'
  | 'on-failure'
  | 'on-request'
  | { granular: GranularApprovalConfig }
  | 'never';
