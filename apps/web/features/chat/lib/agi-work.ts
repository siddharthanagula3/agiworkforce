export const AGI_WORK_LABEL = 'AGI Work';

export const AGI_WORK_TITLE_SUFFIX = ` · ${AGI_WORK_LABEL}`;

export const AGI_WORK_AUTONOMY_NOTICE_BODY =
  'Automatic approval is on. AGI runs on its own and pauses if anything looks unsafe, including when it uses your connectors.';

export const AGI_WORK_AUTONOMY_NOTICE_ACTION = 'Review approvals';

export const AGI_WORK_AUTONOMY_NOTICE_DISMISS = 'Dismiss automatic approval notice';

export const AGI_WORK_FEEDBACK_LABEL = 'Task feedback';

export const TASK_DOCK_LABEL = 'Task';

export const TASK_DOCK_ARTIFACTS_LABEL = 'Artifacts';

export const TASK_DOCK_PANEL_LABEL = `${AGI_WORK_LABEL} task dock`;

export const TASK_DOCK_FALLBACK_TITLE = `${AGI_WORK_LABEL} session`;

export const TASK_DOCK_SOURCES_LABEL = 'Sources';

export const TASK_DOCK_SOURCES_EMPTY = 'Pages the task reads appear here as it searches.';

export const TASK_DOCK_OUTPUTS_LABEL = 'Outputs';

/**
 * A plain chat is not an AGI Work session, and the dock in one must not claim
 * to be. Both leaders title the dock with the chat and hold two sections in it.
 */
export const CHAT_DOCK_PANEL_LABEL = 'Chat details';

export const CHAT_DOCK_FALLBACK_TITLE = 'This chat';

export const CHAT_DOCK_FILES_LABEL = 'In this chat';

export const CHAT_DOCK_FILES_EMPTY = 'Files created in this chat appear here';

export const TASK_DOCK_OUTPUTS_EMPTY = 'Files created during this task appear here';

export const TASK_DOCK_CONTEXT_LABEL = 'Context';

export const TASK_DOCK_CONTEXT_EMPTY = 'No connectors used yet';

export const TASK_DOCK_STEPS_LABEL = 'task steps';

export const TASK_DOCK_OPEN_ACTION = 'Open';

export const TASK_DOCK_DOWNLOAD_ACTION = 'Download';
