export const AUTH_MARK_SIZE = 22;
export const AUTH_PROVIDER_ICON_SIZE = 20;
export const AUTH_ACTION_ICON_SIZE = 18;
export const AUTH_INLINE_ICON_SIZE = 14;

const CONTROL_SIZE = 'h-13 w-full rounded-full';
const CONTROL = `auth-control ${CONTROL_SIZE}`;
const SECONDARY_TEXT = 'text-base leading-normal text-text-secondary';
const SMALL_SECONDARY_TEXT = 'text-[0.9375rem] leading-normal text-text-secondary';
const TOUCH_TARGET = 'inline-flex min-h-11 items-center';

export const AUTH_PAGE_CLASS = 'relative flex min-h-svh w-full flex-col bg-surface-elevated px-6';
export const AUTH_SPLIT_PAGE_CLASS =
  'relative grid min-h-svh w-full grid-cols-1 grid-rows-[auto_1fr] bg-[var(--auth-scene-panel)] lg:grid-cols-[minmax(0,58fr)_minmax(30rem,42fr)] lg:grid-rows-1';
export const AUTH_FORM_PANEL_CLASS =
  'auth-form-panel flex flex-col rounded-t-[var(--corner-overlay)] bg-surface-elevated px-6 pt-8 sm:px-12 lg:min-h-svh lg:rounded-none lg:rounded-tl-[var(--corner-hero)] lg:px-16';
export const AUTH_BRAND_CLASS =
  'auth-inline mx-auto mb-5 inline-flex min-h-11 items-center justify-center gap-2 rounded-compact px-1 text-[1.0625rem] font-semibold tracking-[-0.01em] text-text-primary';
export const AUTH_COLUMN_CLASS =
  'mx-auto flex w-full max-w-[26rem] flex-1 flex-col pt-10 pb-10 sm:pt-16';
export const AUTH_SPLIT_COLUMN_CLASS = 'mx-auto flex w-full max-w-[26rem] flex-1 flex-col';
export const AUTH_HEADING_CLASS =
  'text-center text-[2rem] font-bold leading-tight tracking-[-0.02em] text-text-primary sm:text-[2.25rem]';
export const AUTH_BODY_CLASS = 'mt-7';
export const AUTH_TAIL_CLASS = 'mt-auto pt-6';
export const AUTH_LABEL_CLASS =
  'block text-[0.9375rem] font-medium leading-normal text-text-primary';
export const AUTH_FLOATING_LABEL_CLASS = 'auth-field-label';
export const AUTH_MUTED_LINE_CLASS =
  'text-center text-[1.0625rem] leading-relaxed text-text-secondary';
export const AUTH_ERROR_CLASS = 'mt-2 text-base leading-normal text-danger-text';
export const AUTH_HINT_CLASS = `mt-2 ${SMALL_SECONDARY_TEXT}`;
export const AUTH_FIELD_STACK_CLASS = 'mt-5';
export const AUTH_FIELD_AID_CLASS = 'mt-3 flex justify-end';
export const AUTH_CHECK_ROW_CLASS = `flex min-h-11 cursor-pointer items-start gap-3 ${SECONDARY_TEXT}`;
export const AUTH_CHECKBOX_CLASS = 'auth-checkbox mt-0.5 shrink-0 cursor-pointer';
export const AUTH_AGREEMENT_CLASS = `mt-4 ${SECONDARY_TEXT}`;
export const AUTH_AGE_CONFIRMATION_CLASS = 'mb-4';
const OPTIONAL_CHECK_ROW = `flex min-h-11 items-start gap-3 pt-2 pb-3 ${SECONDARY_TEXT}`;
export const AUTH_OPTIONAL_CHECK_ROW_CLASS = `${OPTIONAL_CHECK_ROW} cursor-pointer`;
export const AUTH_HELD_CHECK_ROW_CLASS = `${OPTIONAL_CHECK_ROW} cursor-not-allowed`;
export const AUTH_OPTIONAL_CHECK_NOTE_CLASS = `ms-8 pb-3 ${SECONDARY_TEXT}`;
export const AUTH_OPTIONAL_CONSENT_CLASS = '-mb-3 flex flex-col';
export const AUTH_NOTICE_CLASS = `mt-4 -mb-2 flex items-start gap-3 ${SECONDARY_TEXT}`;
export const AUTH_LINK_CLASS =
  'auth-inline rounded-compact text-accent-text underline underline-offset-4';
export const AUTH_STANDALONE_LINK_CLASS = `${AUTH_LINK_CLASS} ${TOUCH_TARGET}`;
export const AUTH_NOTICE_LINK_CLASS = `${AUTH_STANDALONE_LINK_CLASS} -mt-1.5 -mb-2.5 gap-1`;
export const AUTH_NOTICE_DETAIL_LINK_CLASS = `${AUTH_STANDALONE_LINK_CLASS} -my-2 self-start`;
export const AUTH_INPUT_CLASS =
  'auth-field h-13 w-full rounded-none border-0 border-b bg-transparent px-0 text-base text-text-primary placeholder:text-text-muted';
export const AUTH_FLOATING_INPUT_CLASS = `${AUTH_INPUT_CLASS} auth-field-float`;
export const AUTH_PRIMARY_BUTTON_CLASS = `${CONTROL} mt-6 inline-flex items-center justify-center gap-2 bg-[var(--auth-primary-fill)] text-base font-semibold text-[var(--auth-primary-on-fill)] transition-colors hover:bg-[var(--auth-primary-fill-hover)] disabled:cursor-not-allowed disabled:opacity-60`;
export const AUTH_PROVIDER_BUTTON_CLASS = `${CONTROL} relative inline-flex items-center justify-center gap-3 bg-[var(--auth-provider-fill)] px-4 text-base font-medium leading-snug text-text-primary transition-colors hover:bg-[var(--auth-provider-fill-hover)] disabled:cursor-not-allowed disabled:opacity-60`;
export const AUTH_PROVIDER_LABEL_CLASS = 'text-center';
export const AUTH_PROVIDER_STACK_CLASS = 'flex flex-col gap-3';
export const AUTH_PROVIDERS_AFTER_ACTION_CLASS = 'mt-4';
const DIVIDER = 'flex items-center gap-4';
export const AUTH_DIVIDER_CLASS = `my-5 ${DIVIDER}`;
export const AUTH_DIVIDER_ABOVE_FIELD_CLASS = `mt-5 ${DIVIDER}`;
export const AUTH_DIVIDER_LABEL_CLASS = SMALL_SECONDARY_TEXT;
export const AUTH_RULE_CLASS = 'h-px w-full bg-rule';
export const AUTH_SWITCH_CLASS = `mt-1.5 text-center ${SECONDARY_TEXT}`;
export const AUTH_QUIET_BUTTON_CLASS = `auth-inline ${TOUCH_TARGET} rounded-compact text-base text-accent-text underline-offset-4 transition-colors hover:underline disabled:opacity-50`;
export const AUTH_BESIDE_TEXT_BUTTON_CLASS = `${AUTH_QUIET_BUTTON_CLASS} -my-2.5`;
export const AUTH_COUNTDOWN_CLASS = `${TOUCH_TARGET} rounded-compact text-base text-text-secondary`;
export const AUTH_FOOTER_CLASS =
  '-mb-3 flex flex-wrap items-center justify-center gap-x-1 text-sm leading-normal text-text-secondary';
export const AUTH_FOOTER_BAR_CLASS = 'h-3.5 w-px bg-rule';
export const AUTH_FOOTER_LINK_CLASS =
  'auth-inline rounded-compact text-text-secondary underline-offset-4 hover:underline';
export const AUTH_FOOTER_NAV_LINK_CLASS = `${AUTH_FOOTER_LINK_CLASS} ${TOUCH_TARGET} px-2`;
export const AUTH_FIELD_AID_LINK_CLASS = `${AUTH_FOOTER_LINK_CLASS} ${TOUCH_TARGET} -my-2.5 text-base leading-normal underline`;
export const AUTH_DISCLOSURE_CLASS =
  'mt-5 flex flex-col gap-1 rounded-xl bg-surface-elevated p-4 text-base leading-normal text-text-secondary';
export const AUTH_DISCLOSURE_TITLE_CLASS = 'font-semibold text-text-primary';
export const AUTH_CHECK_NOTE_CLASS = `ms-8 mt-1 pb-3 ${SMALL_SECONDARY_TEXT}`;
export const AUTH_OPTIONAL_ROW_CLASS = 'flex items-start justify-between gap-3';
export const AUTH_OPTIONAL_TAG_CLASS = `shrink-0 pt-2.5 ${SMALL_SECONDARY_TEXT}`;
export const AUTH_POLICY_LINKS_CLASS = `mt-1 flex flex-wrap items-center justify-center gap-x-2 ${SMALL_SECONDARY_TEXT}`;
export const AUTH_STEP_LINKS_CLASS = 'mt-2.5 flex flex-col items-center';
export const AUTH_STATUS_CLASS = `text-center ${SMALL_SECONDARY_TEXT}`;
export const AUTH_STATUS_SPOKEN_CLASS = `mt-3 ${AUTH_STATUS_CLASS}`;
export const AUTH_BADGE_CLASS =
  'absolute -top-3 end-4 whitespace-nowrap rounded-full border border-rule bg-surface-elevated px-2 py-0.5 text-sm font-medium leading-normal text-text-secondary';
export const AUTH_DETAIL_ROW_CLASS = 'flex flex-wrap items-center justify-center gap-x-2 gap-y-1';
