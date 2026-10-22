export const AGI_WORK_LABEL = 'AGI Work';

export const WORK_HISTORY_LABEL = 'Work history';

export const WORK_HISTORY_ROUTE = '/tasks';

export const AGI_WORK_TITLE_SUFFIX = ` · ${AGI_WORK_LABEL}`;

export const AGI_WORK_AUTONOMY_NOTICE_BODY =
  'Some tools run without asking under your Tool Approvals setting. Destructive or unknown actions, saved Ask and Deny choices, and workspace restrictions still apply.';

export const AGI_WORK_AUTONOMY_NOTICE_ACTION = 'Review approvals';

export const AGI_WORK_AUTONOMY_NOTICE_DISMISS = 'Dismiss automatic approval notice';

export const AGI_WORK_FEEDBACK_LABEL = 'Work feedback';

export const TASK_DOCK_LABEL = 'Work';

export const TASK_DOCK_ARTIFACTS_LABEL = 'Artifacts';

export const TASK_DOCK_PANEL_LABEL = `${AGI_WORK_LABEL} session dock`;

export const TASK_DOCK_FALLBACK_TITLE = `${AGI_WORK_LABEL} session`;

export const TASK_DOCK_SOURCES_LABEL = 'Sources';

export const TASK_DOCK_OUTPUTS_LABEL = 'Outputs';

export const TASK_DOCK_PROGRESS_LABEL = 'Progress';

export const TASK_DOCK_PROGRESS_EMPTY = 'Steps appear here once the session plans its work';

export const TASK_DOCK_OUTPUTS_EMPTY = 'Files this session creates show up here to view and open.';

export const TASK_DOCK_CONTEXT_EMPTY = 'Tools and files this session uses show up here.';

export const DELIVERABLES_LABEL = 'Files this session produced';

/**
 * A plain chat is not an AGI Work session, and the dock in one must not claim
 * to be. Both leaders title the dock with the chat and hold two sections in it.
 */
export const CHAT_DOCK_PANEL_LABEL = 'Chat details';

export const CHAT_DOCK_FALLBACK_TITLE = 'This chat';

export const TASK_DOCK_CONTEXT_LABEL = 'Context';

export const TASK_DOCK_STEPS_LABEL = 'session steps';

export const TASK_DOCK_OPEN_ACTION = 'Open';

export const TASK_DOCK_DOWNLOAD_ACTION = 'Download';
