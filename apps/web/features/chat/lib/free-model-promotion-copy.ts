const PROMOTION_DATE = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
});

export const FREE_MODEL_PROMOTION_FINE_PRINT = 'while promotional capacity lasts';
export const FREE_MODEL_PROMOTION_NOTICE_TITLE = 'Free model promotion';
export const FREE_MODEL_PROMOTION_DISMISS_LABEL = 'Dismiss the free model promotion notice';

export function freeModelPromotionEndsOn(endsAt: string): string {
  return PROMOTION_DATE.format(new Date(endsAt));
}

export function freeModelPromotionPickerLabel(endsAt: string): string {
  return `Free until ${freeModelPromotionEndsOn(endsAt)}`;
}

export function freeModelPromotionHeadline(modelName: string, endsAt: string): string {
  return `${modelName} free until ${freeModelPromotionEndsOn(endsAt)}`;
}

export function freeModelPromotionSearchSpentNotice(
  modelName: string,
  windowHours: number,
): string {
  return `Web search on ${modelName} has reached its limit for now and resets within ${windowHours} hours. You can keep chatting without it.`;
}
