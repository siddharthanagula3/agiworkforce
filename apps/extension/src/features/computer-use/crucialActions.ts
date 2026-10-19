import type { ActionApprovalRequirement, AlwaysAskReason } from './approvalPolicy';

export type CrucialActionCategory =
  'destructive' | 'money' | 'speaking_for_user' | 'secrets' | 'leaving_workspace';

const CRUCIAL_CATEGORY: Readonly<Record<AlwaysAskReason, CrucialActionCategory | null>> = {
  purchase: 'money',
  payment: 'money',
  publish: 'speaking_for_user',
  upload: 'speaking_for_user',
  authorization: 'speaking_for_user',
  terms: 'speaking_for_user',
  sensitive_input: 'secrets',
  authentication: 'secrets',
  permission_change: 'secrets',
  sensitive_site: 'secrets',
  download: 'leaving_workspace',
  selection: null,
  history_navigation: null,
  reload: null,
  tab_management: null,
  window_resize: null,
  site_tool: null,
  unidentified_input: null,
};

export function crucialActionCategory(
  requirement: ActionApprovalRequirement,
): CrucialActionCategory | null {
  if (!requirement.alwaysAsk || !requirement.reason) return null;
  return CRUCIAL_CATEGORY[requirement.reason];
}

export function isCrucialAction(requirement: ActionApprovalRequirement): boolean {
  return crucialActionCategory(requirement) !== null;
}
