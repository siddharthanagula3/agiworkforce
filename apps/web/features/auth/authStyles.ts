export const AUTH_MARK_SIZE = 18;
export const AUTH_PROVIDER_ICON_SIZE = 18;

const CONTROL_SIZE = 'h-13 w-full rounded-full';
const CONTROL = `auth-control ${CONTROL_SIZE}`;
const HAIRLINE = 'border border-rule bg-transparent';

export const AUTH_PAGE_CLASS = 'relative flex min-h-svh w-full flex-col bg-surface-elevated px-6';
export const AUTH_BRAND_CLASS =
  'auth-inline absolute left-6 top-6 inline-flex items-center gap-2 text-base font-semibold tracking-[-0.01em] text-text-primary';
export const AUTH_COLUMN_CLASS = 'mx-auto flex w-full max-w-[21.25rem] flex-col pt-30 pb-16';
export const AUTH_HEADING_CLASS =
  'text-center text-[2rem] font-bold leading-tight tracking-[-0.01em] text-text-primary';
export const AUTH_BODY_CLASS = 'mt-8';
export const AUTH_LABEL_CLASS = 'block text-center text-sm font-medium text-text-primary';
export const AUTH_MUTED_LINE_CLASS = 'text-base text-text-muted';
export const AUTH_ERROR_CLASS = 'mt-2 text-center text-sm text-danger-text';
export const AUTH_LINK_CLASS =
  'auth-inline rounded text-accent-text underline-offset-4 hover:underline';
export const AUTH_INPUT_CLASS = `auth-field ${CONTROL_SIZE} ${HAIRLINE} px-5 text-center text-base text-text-primary placeholder:text-text-muted`;
export const AUTH_PRIMARY_BUTTON_CLASS = `${CONTROL} mt-8 inline-flex items-center justify-center gap-2 bg-action-primary text-base font-medium text-action-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50`;
export const AUTH_PROVIDER_BUTTON_CLASS = `${CONTROL} ${HAIRLINE} inline-flex items-center justify-center gap-2 text-base text-text-primary transition-colors hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50`;
export const AUTH_PROVIDER_STACK_CLASS = 'flex flex-col gap-3';
export const AUTH_DIVIDER_CLASS = 'my-6 flex items-center gap-3';
export const AUTH_DIVIDER_LABEL_CLASS =
  'text-[0.8125rem] font-semibold uppercase tracking-wide text-text-muted';
export const AUTH_SWITCH_CLASS = 'mt-6.5 text-center text-base text-text-muted';
export const AUTH_QUIET_BUTTON_CLASS =
  'auth-inline rounded text-base text-accent-text underline-offset-4 hover:underline disabled:opacity-50';
export const AUTH_COUNTDOWN_CLASS = 'rounded text-base text-text-muted';
export const AUTH_FOOTER_CLASS =
  'mt-18 flex items-center justify-center gap-3 text-sm text-text-muted';
export const AUTH_FOOTER_LINK_CLASS =
  'auth-inline rounded text-text-muted underline-offset-4 hover:underline';
export const AUTH_CHECKBOX_CLASS = 'mt-1 size-4 shrink-0 rounded-sm border-rule accent-accent-fill';
export const AUTH_CHECKBOX_ROW_CLASS = 'mt-4 flex items-start gap-2.5 text-sm text-text-primary';
export const AUTH_STEP_LINKS_CLASS = 'mt-6 flex flex-col items-center gap-3';
export const AUTH_DETAIL_ROW_CLASS = 'flex flex-wrap items-center justify-center gap-2';
