import { EMBEDDED_PAGE_PARAM, hasEmbeddedPageMarker } from '@agiworkforce/types';

export type HelpSearchParams = Record<string, string | string[] | undefined>;

export function hasPhoneMarker(params: HelpSearchParams | undefined): boolean {
  const marker = params?.[EMBEDDED_PAGE_PARAM];
  return hasEmbeddedPageMarker(
    new URLSearchParams([marker ?? []].flat().map((value) => [EMBEDDED_PAGE_PARAM, value])),
  );
}

export async function openedFromPhone(
  searchParams: Promise<HelpSearchParams> | undefined,
): Promise<boolean> {
  return hasPhoneMarker(await searchParams);
}
