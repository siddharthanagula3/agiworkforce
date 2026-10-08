import { Spinner } from '@agiworkforce/ui';

import { AUTH_STATUS_CLASS } from './authStyles';

export function AuthProgress({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center gap-4 py-4" role="status" aria-live="polite">
      <Spinner size="lg" aria-hidden="true" />
      <p className={AUTH_STATUS_CLASS}>{label}</p>
    </div>
  );
}
