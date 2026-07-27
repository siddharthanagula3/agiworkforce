/**
 * Presentation helpers for the Cloud task list.
 *
 * Moved into @agiworkforce/unified-chat alongside TasksPage when that view was
 * shared with Desktop — the mapping is presentation, not a web concern. This
 * re-export keeps existing web importers and their tests pointing at one
 * implementation rather than a copy.
 */
export {
  workModeLabel,
  taskStateLabel,
  taskStateTone,
  isCancellableState,
  TASK_TONE_BADGE_CLASS,
} from '@agiworkforce/unified-chat';
export type { AgentTaskState, TaskStateTone } from '@agiworkforce/unified-chat';
