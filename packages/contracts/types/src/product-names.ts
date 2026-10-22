export const PRODUCT_BRAND = 'AGI';

export const COMPANY_SITE_NAME = 'AGI Workforce';

export const PRODUCT_NAMES = {
  chat: 'AGI Chat',
  mobile: 'AGI Mobile',
  desktop: 'AGI Desktop',
  cli: 'AGI CLI',
  extension: 'AGI Extension',
  code: 'AGI Code',
  work: 'AGI Work',
} as const;

export type ProductKey = keyof typeof PRODUCT_NAMES;

export type ProductName = (typeof PRODUCT_NAMES)[ProductKey];
