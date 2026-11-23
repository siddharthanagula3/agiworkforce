export const ASK_BEFORE_ACTING_KEY = 'agi_cu_ask_before_acting';

export type BrowserPermissionMode = 'ask' | 'auto' | 'full' | 'yolo';

export const DEFAULT_BROWSER_PERMISSION_MODE: BrowserPermissionMode = 'auto';

const AUTO_STORED_VALUE = 'auto';

// The key predates Auto: true meant Ask first and false meant Full access, so
// those stored values keep their meaning and anything else is the Auto default.
export function readBrowserPermissionMode(stored: unknown): BrowserPermissionMode {
  if (stored === 'always-approve') return 'yolo';
  if (stored === true) return 'ask';
  if (stored === false) return 'full';
  return DEFAULT_BROWSER_PERMISSION_MODE;
}

export function browserPermissionModeToStored(mode: BrowserPermissionMode): boolean | string {
  if (mode === 'yolo') return 'always-approve';
  if (mode === 'ask') return true;
  if (mode === 'full') return false;
  return AUTO_STORED_VALUE;
}

export interface ActionApprovalContext {
  alwaysAsk: boolean;
  crucial: boolean;
  mode: BrowserPermissionMode;
  allowedForTask: boolean;
  readsOnly: boolean;
  siteApproved: () => Promise<boolean>;
}

// Full access promises to act without asking on approved sites only; a page
// reached through a one-time grant or a navigation still asks. Auto acts on the
// sites this task was given and stops only for a crucial action.
export async function actionNeedsApproval(context: ActionApprovalContext): Promise<boolean> {
  if (context.mode === 'yolo') {
    return context.alwaysAsk || !(await context.siteApproved().catch(() => false));
  }
  if (context.alwaysAsk && (context.mode !== 'auto' || context.crucial)) return true;
  if (context.allowedForTask || context.readsOnly) return false;
  if (context.mode === 'ask') return true;
  if (context.mode === 'auto') return false;
  return !(await context.siteApproved().catch(() => false));
}

export function unattendedComposerTask(text: string): string | undefined {
  const command = /^(?:-yolo|--always-approve)(?:\s+|$)/u.exec(text.trimStart());
  return command ? text.trimStart().slice(command[0].length).trim() : undefined;
}
