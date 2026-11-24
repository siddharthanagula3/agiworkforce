export const SCHEDULES_PATH = '/chat/schedules';
export const SCHEDULE_FOCUS_QUERY_PARAM = 'schedule';

export function scheduleFocusHref(scheduleId: string): string {
  const params = new URLSearchParams({ [SCHEDULE_FOCUS_QUERY_PARAM]: scheduleId });
  return `${SCHEDULES_PATH}?${params.toString()}`;
}
