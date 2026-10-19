export const ASK_BEFORE_ACTING_KEY = 'agi_cu_ask_before_acting';

export interface ActionApprovalContext {
  alwaysAsk: boolean;
  askBeforeActing: boolean;
  allowedForTask: boolean;
  readsOnly: boolean;
  siteApproved: () => Promise<boolean>;
}

// Full access promises to act without asking on approved sites only; a page
// reached through a one-time grant or a navigation still asks.
export async function actionNeedsApproval(context: ActionApprovalContext): Promise<boolean> {
  if (context.alwaysAsk) return true;
  if (context.allowedForTask || context.readsOnly) return false;
  if (context.askBeforeActing) return true;
  return !(await context.siteApproved().catch(() => false));
}
