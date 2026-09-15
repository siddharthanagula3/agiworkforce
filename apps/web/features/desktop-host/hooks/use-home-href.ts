'use client';

import { PRODUCT_HOME_PATH } from '../lib/deep-links';
import { useDesktopHost } from '../lib/host';

const SITE_HOME_PATH = '/';

/**
 * Where "go home" goes.
 *
 * The desktop shell holds the product and the sign-in flow and hands the rest
 * of the site to the browser. A not-found or error page inside the shell that
 * offered the marketing home would open a browser window and leave the shell
 * sitting on the error, so it offers the product instead.
 */
export function useHomeHref(): string {
  return useDesktopHost() ? PRODUCT_HOME_PATH : SITE_HOME_PATH;
}
