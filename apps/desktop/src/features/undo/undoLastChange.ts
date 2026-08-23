import { toast } from 'sonner';

import { undoCanUndo, undoLast } from '../../api/undo';

export async function undoLastChange(taskId?: string): Promise<boolean> {
  try {
    if (!(await undoCanUndo(taskId))) {
      toast.info('Nothing to undo');
      return false;
    }

    const result = await undoLast(taskId);
    if (result.success) {
      toast.success(result.message);
    } else {
      toast.error(result.message);
    }
    return result.success;
  } catch {
    return false;
  }
}
