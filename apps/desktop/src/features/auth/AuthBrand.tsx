import { AgiMark } from '@agiworkforce/ui';

import { AUTH_BRAND_CLASS, AUTH_MARK_SIZE } from './authStyles';

const BRAND_NAME = 'AGI';

export function AuthBrand() {
  return (
    <span className={AUTH_BRAND_CLASS}>
      <AgiMark size={AUTH_MARK_SIZE} mono />
      <span>{BRAND_NAME}</span>
    </span>
  );
}
