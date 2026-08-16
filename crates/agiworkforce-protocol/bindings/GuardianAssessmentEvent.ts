import type { GuardianAssessmentAction } from './GuardianAssessmentAction';
import type { GuardianAssessmentDecisionSource } from './GuardianAssessmentDecisionSource';
import type { GuardianAssessmentStatus } from './GuardianAssessmentStatus';
import type { GuardianRiskLevel } from './GuardianRiskLevel';
import type { GuardianUserAuthorization } from './GuardianUserAuthorization';

export type GuardianAssessmentEvent = {
  id: string;
  target_item_id?: string;
  turn_id: string;
  status: GuardianAssessmentStatus;
  risk_level?: GuardianRiskLevel;
  user_authorization?: GuardianUserAuthorization;
  rationale?: string;
  decision_source?: GuardianAssessmentDecisionSource;
  action: GuardianAssessmentAction;
};
