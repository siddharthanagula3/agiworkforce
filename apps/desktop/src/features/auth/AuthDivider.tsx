import { AUTH_DIVIDER_CLASS, AUTH_DIVIDER_LABEL_CLASS } from './authStyles';

const DIVIDER_LABEL = 'or';

export function AuthDivider() {
  return (
    <div className={AUTH_DIVIDER_CLASS} aria-hidden="true">
      <span className="h-px flex-1 bg-rule" />
      <span className={AUTH_DIVIDER_LABEL_CLASS}>{DIVIDER_LABEL}</span>
      <span className="h-px flex-1 bg-rule" />
    </div>
  );
}
