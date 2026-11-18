import { AGE_SETTING_LABEL } from '@/src/features/settings/ageSettingValue';

export const PARENTAL_CONTROLS_ROUTE = '/(app)/settings/parental-controls';

export const PARENTAL_CONTROLS_TITLE = 'Parental Controls';

export const AGE_ENTRY_PARAMS = { entry: 'age' } as const;

export function parentalControlsTitle(entry: string | string[] | undefined): string {
  return entry === AGE_ENTRY_PARAMS.entry ? AGE_SETTING_LABEL : PARENTAL_CONTROLS_TITLE;
}
