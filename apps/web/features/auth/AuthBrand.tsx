'use client';

import Link from 'next/link';
import { AgiMark } from '@shared/components/agi/AgiMark';
import { usePageHref } from '@shared/components/layout/EmbeddedPage';

import { AUTH_BRAND_CLASS, AUTH_MARK_SIZE } from './authStyles';

const BRAND_NAME = 'AGI';
const HOME_HREF = '/';

export function AuthBrand() {
  const href = usePageHref(HOME_HREF);
  const brand = (
    <>
      <AgiMark size={AUTH_MARK_SIZE} mono />
      <span>{BRAND_NAME}</span>
    </>
  );
  if (href === null) return <span className={AUTH_BRAND_CLASS}>{brand}</span>;
  return (
    <Link href={href} className={AUTH_BRAND_CLASS}>
      {brand}
    </Link>
  );
}
