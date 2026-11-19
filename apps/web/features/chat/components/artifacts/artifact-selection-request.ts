import { SUPPORTED_LANGUAGES } from '@agiworkforce/i18n/languages';
import {
  selectionActionsFor,
  type SelectionAction,
} from '@agiworkforce/unified-chat/artifact-selection-request';

export const SELECTION_ACTIONS: readonly SelectionAction[] =
  selectionActionsFor(SUPPORTED_LANGUAGES);

export function selectionActionById(id: string): SelectionAction | undefined {
  return SELECTION_ACTIONS.find((action) => action.id === id);
}
