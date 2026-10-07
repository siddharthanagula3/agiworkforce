export const AUTH_MARK_SIZE = 22;
export const AUTH_PROVIDER_ICON_SIZE = 20;

const CONTROL_SIZE = 'h-13 w-full rounded-full';
const CONTROL = `auth-control ${CONTROL_SIZE}`;
const PRIMARY_TEXT = 'text-[var(--text-primary)]';
const SECONDARY_TEXT = 'text-base leading-normal text-[var(--text-secondary)]';
const SMALL_SECONDARY_TEXT = 'text-[0.9375rem] leading-normal text-[var(--text-secondary)]';
const TOUCH_TARGET = 'inline-flex min-h-11 items-center';

export const AUTH_PAGE_CLASS =
  'relative grid h-full min-h-full w-full grid-cols-1 grid-rows-[auto_1fr] overflow-y-auto bg-[var(--auth-scene-panel)] md:grid-cols-[minmax(0,58fr)_minmax(30rem,42fr)] md:grid-rows-1 md:overflow-hidden';
export const AUTH_FORM_PANEL_CLASS =
  'auth-form-panel flex flex-col rounded-t-[var(--corner-overlay)] bg-[var(--surface-elevated)] px-6 pt-8 pb-8 sm:px-12 md:h-full md:overflow-y-auto md:rounded-none md:rounded-tl-[var(--corner-hero)] md:px-16';
export const AUTH_BRAND_CLASS = `auth-inline mx-auto mb-5 inline-flex min-h-11 items-center justify-center gap-2 px-1 text-[1.0625rem] font-semibold tracking-[-0.01em] ${PRIMARY_TEXT}`;
export const AUTH_COLUMN_CLASS = 'mx-auto flex w-full max-w-[26rem] flex-1 flex-col';
export const AUTH_HEADING_CLASS = `text-center text-[2rem] font-bold leading-tight tracking-[-0.02em] ${PRIMARY_TEXT} sm:text-[2.25rem]`;
export const AUTH_BODY_CLASS = 'mt-7';
export const AUTH_LABEL_CLASS = 'auth-field-label';
export const AUTH_MUTED_LINE_CLASS =
  'text-center text-[1.0625rem] leading-relaxed text-[var(--text-secondary)]';
export const AUTH_ERROR_CLASS = 'mt-2 text-base leading-normal text-danger-text';
export const AUTH_LINK_CLASS = 'auth-inline rounded text-accent-text underline underline-offset-4';
export const AUTH_INPUT_CLASS = `auth-field auth-field-float h-13 w-full rounded-none border-0 border-b bg-transparent px-0 text-base ${PRIMARY_TEXT}`;
export const AUTH_FIELD_TOGGLE_CLASS =
  'auth-inline absolute end-0 bottom-1.5 flex size-11 items-center justify-center rounded-full text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]';
export const AUTH_PRIMARY_BUTTON_CLASS = `${CONTROL} mt-6 inline-flex items-center justify-center gap-2 bg-[var(--auth-primary-fill)] text-base font-semibold text-[var(--auth-primary-on-fill)] transition-colors hover:bg-[var(--auth-primary-fill-hover)] disabled:cursor-not-allowed disabled:opacity-60`;
export const AUTH_PROVIDER_BUTTON_CLASS = `${CONTROL} relative inline-flex items-center justify-center gap-3 bg-[var(--auth-provider-fill)] px-4 text-base font-medium leading-snug ${PRIMARY_TEXT} transition-colors hover:bg-[var(--auth-provider-fill-hover)] disabled:cursor-not-allowed disabled:opacity-60`;
export const AUTH_PROVIDER_STACK_CLASS = 'flex flex-col gap-3';
export const AUTH_QUIET_BUTTON_CLASS = `auth-inline ${TOUCH_TARGET} rounded text-base text-accent-text underline-offset-4 transition-colors hover:underline disabled:opacity-50`;
export const AUTH_COUNTDOWN_CLASS = `${TOUCH_TARGET} rounded ${SECONDARY_TEXT}`;
export const AUTH_TAIL_CLASS = 'mt-auto pt-8';
export const AUTH_TAIL_RULE_CLASS = 'border-t border-[var(--rule)] pt-4';
export const AUTH_FOOTER_CLASS = `flex flex-wrap items-center justify-center gap-x-1 ${SMALL_SECONDARY_TEXT}`;
export const AUTH_FOOTER_BAR_CLASS = 'h-3.5 w-px bg-[var(--rule)]';
export const AUTH_PROVIDERS_AFTER_ACTION_CLASS = 'mt-4';
export const AUTH_FOOTER_LINK_CLASS = `auth-inline ${TOUCH_TARGET} rounded px-1 text-[0.9375rem] text-[var(--text-secondary)] underline-offset-4 hover:underline`;
export const AUTH_SWITCH_CLASS = `text-center ${SECONDARY_TEXT}`;
export const AUTH_QUIET_LINKS_CLASS = 'flex flex-col items-center';
export const AUTH_STEP_LINKS_CLASS = 'mt-2.5 flex flex-col items-center';
export const AUTH_DETAIL_ROW_CLASS = 'flex flex-wrap items-center justify-center gap-2';
export const AUTH_ASIDE_CLASS = `mt-2 text-center ${SMALL_SECONDARY_TEXT}`;
