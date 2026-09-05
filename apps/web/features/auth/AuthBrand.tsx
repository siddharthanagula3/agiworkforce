import Link from 'next/link';
import { AgiMark } from '@shared/components/agi/AgiMark';

import { AUTH_BRAND_CLASS, AUTH_MARK_SIZE } from './authStyles';

const BRAND_NAME = 'AGI';
const HOME_HREF = '/';

export function AuthBrand() {
  return (
    <Link href={HOME_HREF} className={AUTH_BRAND_CLASS}>
      <AgiMark size={AUTH_MARK_SIZE} mono />
      <span>{BRAND_NAME}</span>
    </Link>
  );
}
