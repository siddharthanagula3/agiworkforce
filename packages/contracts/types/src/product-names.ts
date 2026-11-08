export const PRODUCT_BRAND = 'AGIWORKFORCE';

export const PRODUCT_COPYRIGHT_NAME = 'AGI';

export const COMPANY_SITE_NAME = 'AGI Workforce';

export const PRODUCT_NAMES = {
  chat: 'Chat',
  mobile: 'Mobile',
  desktop: 'Desktop',
  cli: 'CLI',
  extension: 'Extension',
  code: 'Code',
  work: 'Work',
} as const;

export type ProductKey = keyof typeof PRODUCT_NAMES;

export type ProductName = (typeof PRODUCT_NAMES)[ProductKey];
